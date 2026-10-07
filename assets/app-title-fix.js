const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let db,
  session,
  catalog = { cards: [] },
  game = null,
  owned = new Set(),
  ownershipReady = false,
  mode = "login",
  filters = {},
  ownershipFilter = "all",
  page = 1,
  selected = null,
  side = 0,
  lastFocus = null,
  loadGeneration = 0,
  toastTimer,
  poll;
let pendingSignupEmail = "";
try {
  const saved = JSON.parse(
    localStorage.getItem("card-album-pending-signup") || "null",
  );
  if (
    saved &&
    Date.now() - saved.at < 86400000 &&
    typeof saved.email === "string"
  )
    pendingSignupEmail = saved.email;
} catch {}
function clearPendingSignup() {
  pendingSignupEmail = "";
  try {
    localStorage.removeItem("card-album-pending-signup");
  } catch {}
  $("resend").hidden = true;
}
const adminOverrides = new Map();
let marqueePaused = false;
const saving = new Set(),
  SIZE = 30;
let aipriFamily = "おねがい",
  headerImageKey = "";
const callbackQuery = new URLSearchParams(location.search),
  callbackHash = new URLSearchParams(location.hash.slice(1));
const callbackType = callbackHash.get("type") || callbackQuery.get("type");
const callbackError =
  callbackHash.get("error_description") ||
  callbackQuery.get("error_description") ||
  callbackHash.get("error") ||
  callbackQuery.get("error");
const callbackPayload =
  callbackHash.has("access_token") ||
  callbackQuery.has("code") ||
  callbackQuery.has("token_hash");
const confirmationCallback =
  callbackType !== "recovery" &&
  (callbackType === "signup" ||
    callbackType === "email" ||
    (callbackQuery.get("auth") === "confirm" && callbackPayload));
let callbackPending = !!callbackError || confirmationCallback,
  authResultShowing = false;
function authRedirect(kind) {
  const u = new URL(siteBase);
  u.searchParams.set("auth", kind);
  return u.href;
}
function clearAuthURL() {
  const u = new URL(location.href);
  for (const k of [
    "auth",
    "code",
    "token_hash",
    "type",
    "error",
    "error_code",
    "error_description",
  ])
    u.searchParams.delete(k);
  u.hash = "";
  history.replaceState(null, "", u.pathname + u.search);
}
function authResult(ok, message) {
  if (ok) clearPendingSignup();
  callbackPending = false;
  authResultShowing = true;
  clearAuthURL();
  $("auth-result-title").textContent = ok
    ? "登録できました"
    : "メールを確認できませんでした";
  $("auth-result-text").textContent = message;
  $("auth-result-icon").textContent = ok ? "✓" : "!";
  $("auth-result-next").textContent =
    ok && session ? "アルバムを選ぶ" : "ログイン画面へ";
  screen("auth-result");
}
const siteBase = new URL("./", location.href),
  personalMetadata = new Map();
let catalogLoading = false,
  catalogFallback = null,
  metadataGeneration = 0,
  ocrWorker = null,
  ocrRunning = false,
  recovering = false;
const ocrAttempted = new Set();
const fields = {
  aikatsu: [
    ["series", "弾数"],
    ["type", "タイプ"],
    ["rarity", "レアリティ"],
    ["category", "カテゴリ"],
    ["brand", "ブランド"],
    ["character", "キャラクター"],
    ["variant", "カードの種類"],
  ],
  aipri: [
    ["family", "ひみつ・おねがい"],
    ["series", "弾数"],
    ["character", "キャラクター"],
    ["rarity", "レアリティ"],
    ["songs", "遊べる曲"],
  ],
};
const values = (v) => (Array.isArray(v) ? v : v ? [v] : []);
function toast(s) {
  $("toast").textContent = s;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3500);
}
function screen(id) {
  for (const s of ["auth", "auth-result", "selection", "collection"])
    $(s).hidden = s !== id;
  $("nav").hidden = !session;
  $("menu-toggle").hidden = !session;
  closeMenu();
  updateHeader();
}
function authMode(m) {
  mode = m;
  $("nickname-field").hidden = m !== "signup";
  $("nickname").required = m === "signup";
  $("login-tab").classList.toggle("active", m === "login");
  $("signup-tab").classList.toggle("active", m === "signup");
  $("auth-submit").textContent = m === "login" ? "ログイン" : "新規登録";
  $("password").autocomplete =
    m === "login" ? "current-password" : "new-password";
  $("auth-message").textContent = "";
  $("forgot").hidden = m !== "login";
  $("resend").hidden = !pendingSignupEmail;
}
function translatedError(e) {
  const m = e.message || String(e);
  if (/Invalid login credentials/i.test(m))
    return "メールアドレスまたはパスワードが正しくありません。";
  if (/Email not confirmed/i.test(m))
    return "確認メールのリンクを開いてからログインしてください。";
  if (/rate limit|too many/i.test(m))
    return "しばらく時間をおいてからお試しください。";
  if (/fetch|network/i.test(m))
    return "接続できませんでした。通信状態を確認してください。";
  return m;
}
async function loadOwnership() {
  const generation = ++loadGeneration,
    uid = session?.user.id;
  ownershipReady = false;
  owned = new Set();
  if (!uid) return;
  let all = [],
    offset = 0;
  try {
    while (true) {
      const { data, error } = await db
        .from("card_ownership")
        .select("card_id")
        .eq("user_id", uid)
        .order("card_id")
        .range(offset, offset + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    if (generation !== loadGeneration || uid !== session?.user.id) return;
    owned = new Set(all.map((r) => r.card_id));
    ownershipReady = true;
  } catch (e) {
    if (generation === loadGeneration)
      toast(
        "所持データを読み込めません。Supabaseの設定・SQLを確認してください。",
      );
  }
  if (game) render();
}
async function authChanged(event, next) {
  const previous = session?.user.id;
  session = next;
  updateHeader();
  if (event === "PASSWORD_RECOVERY") {
    recovering = true;
    $("auth-form").hidden = true;
    $("password-form").hidden = false;
    screen("auth");
    return;
  }
  if (!session) {
    loadGeneration++;
    owned = new Set();
    ownershipReady = false;
    game = null;
    personalMetadata.clear();
    metadataGeneration++;
    ocrAttempted.clear();
    recovering = false;
    if (catalogFallback)
      catalog = {
        ...catalogFallback,
        cards: catalogFallback.cards.map((c) => ({ ...c })),
      };
    if (!callbackPending && !authResultShowing) screen("auth");
    return;
  }
  if (recovering) return;
  if (previous !== session.user.id) {
    $("account").textContent = nickname() + " のアルバム";
    if (!callbackPending && !authResultShowing) screen("selection");
    await loadOwnership();
    await loadPersonalMetadata();
    if (catalogFallback) await fetchCatalog();
  }
}
async function fetchCatalog() {
  if (catalogLoading) return;
  catalogLoading = true;
  updateSyncIndicator();
  try {
    if (!catalogFallback) {
      const r = await fetch(new URL("assets/catalog.json", siteBase));
      if (!r.ok) throw Error("初期データを読み込めません");
      catalogFallback = await r.json();
    }
    const map = new Map(catalogFallback.cards.map((c) => [c.id, { ...c }]));
    let offset = 0,
      live = false,
      readError = null,
      latest = null;
    while (true) {
      const result = await db
        .from("card_catalog")
        .select("card,updated_at")
        .order("id")
        .range(offset, offset + 499);
      if (result.error) {
        readError = result.error;
        break;
      }
      live ||= result.data.length > 0;
      for (const row of result.data) {
        map.set(row.card.id, row.card);
        if (!latest || row.updated_at > latest) latest = row.updated_at;
      }
      if (result.data.length < 500) break;
      offset += 500;
    }
    const state = await db
      .from("card_sync_state")
      .select("cycle_started_at,cycle_finished_at,updated_at,last_error")
      .eq("id", 1)
      .maybeSingle();
    const st = state.data;
    if (!live && !readError)
      readError = Error("カードの初期登録SQLを実行してください。");
    catalog = {
      cards: [...map.values()].map((c) => ({
        ...c,
        variant:
          c.game === "aikatsu"
            ? c.variant || (c.parallel ? "パラレル" : "通常")
            : c.variant,
      })),
      updatedAt: st?.cycle_finished_at || latest || catalogFallback.updatedAt,
      errors:
        readError || state.error
          ? ["Supabaseのカード取得設定を確認してください。"]
          : st?.last_error
            ? [st.last_error]
            : [],
      sync: {
        running: !!(st?.cycle_started_at && !st.cycle_finished_at),
        stage: "公式カード情報を更新中",
      },
      source: live ? "live" : "snapshot",
    };
    await loadAdminOverrides();
    applyPersonalMetadata();
    art();
    if (game) {
      fillFilters();
      render();
    }
  } catch (e) {
    if (catalogFallback) {
      catalog = {
        ...catalogFallback,
        cards: catalogFallback.cards.map((c) => ({
          ...c,
          variant: c.game === "aikatsu" ? c.variant || "通常" : c.variant,
        })),
        source: "snapshot",
        errors: [e.message],
      };
      applyPersonalMetadata();
      art();
      if (game) {
        fillFilters();
        render();
      }
    } else
      $("auth-message").textContent =
        "カード情報を読み込めません。公開URLから開いてください。";
  } finally {
    catalogLoading = false;
    if (game) render();
    updateSyncIndicator();
    clearTimeout(poll);
    poll = setTimeout(fetchCatalog, window.APP_CONFIG.refreshMs || 300000);
  }
}
function applyPersonalMetadata() {
  for (const c of catalog.cards) {
    const patch = personalMetadata.get(c.id);
    if (patch) {
      if (patch.name) c.name = patch.name;
      if (patch.character) c.character = patch.character;
      if (Array.isArray(patch.songs) && patch.songs.length)
        c.songs = patch.songs;
      c.metadataSource = patch.metadataSource || "画像文字読み取り（未確認）";
    }
    const forced = adminOverrides.get(c.id);
    if (forced) Object.assign(c, forced);
  }
}
async function loadPersonalMetadata() {
  const uid = session?.user.id,
    generation = ++metadataGeneration;
  personalMetadata.clear();
  if (!uid) return;
  let offset = 0;
  while (true) {
    const { data, error } = await db
      .from("card_metadata_notes")
      .select("card_id,patch")
      .eq("user_id", uid)
      .order("card_id")
      .range(offset, offset + 499);
    if (error || generation !== metadataGeneration || uid !== session?.user.id)
      return;
    data.forEach((r) => personalMetadata.set(r.card_id, r.patch));
    if (data.length < 500) break;
    offset += 500;
  }
  applyPersonalMetadata();
  if (game) {
    fillFilters();
    render();
  }
}
async function loadAdminOverrides() {
  let offset = 0;
  const next = new Map();
  while (true) {
    const { data, error } = await db
      .from("card_catalog_overrides")
      .select("card_id,patch")
      .order("card_id")
      .range(offset, offset + 499);
    if (error) return;
    data.forEach((r) => next.set(r.card_id, r.patch));
    if (data.length < 500) break;
    offset += 500;
  }
  adminOverrides.clear();
  next.forEach((v, k) => adminOverrides.set(k, v));
}
function art() {
  updateHeader();
  for (const g of ["aikatsu", "aipri"])
    $(g + "-art").innerHTML = catalog.cards
      .filter((c) => c.game === g)
      .slice(0, 2)
      .map((c) => `<img src="${esc(c.front)}" alt="${esc(c.name || c.code)}">`)
      .join("");
  buildMarquee();
}
function chooseGame(g) {
  if (!session) return;
  closeMenu();
  game = g;
  filters = {};
  ownershipFilter = "all";
  page = 1;
  $("query").value = "";
  document.body.classList.toggle("game-aipri", g === "aipri");
  $("aipri-families").hidden = g !== "aipri";
  updateHeader();
  screen("collection");
  fillFilters();
  render();
  history.replaceState(null, "", "#" + g);
}
function albumCards() {
  return catalog.cards.filter(
    (c) => c.game === game && (game !== "aipri" || c.family === aipriFamily),
  );
}
function fillFilters() {
  const cards = albumCards();
  $("game-title").textContent =
    game === "aikatsu"
      ? "アイカツ！アンコール"
      : aipriFamily === "おねがい"
        ? "おねがいアイプリ"
        : "ひみつのアイプリ";
  document.querySelectorAll("[data-family]").forEach((b) => {
    b.classList.toggle("active", b.dataset.family === aipriFamily);
    b.setAttribute("aria-pressed", String(b.dataset.family === aipriFamily));
  });
  $("filters").innerHTML = fields[game]
    .filter(([key]) => key !== "family")
    .map(([key, label]) => {
      const opts = [...new Set(cards.flatMap((c) => values(c[key])))].sort(
        (a, b) => a.localeCompare(b, "ja", { numeric: true }),
      );
      if (filters[key] && !opts.includes(filters[key])) delete filters[key];
      return `<label>${label}<select data-filter="${key}"><option value="">すべて</option>${opts.map((v) => `<option value="${esc(v)}" ${filters[key] === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
    })
    .join("");
}
function chooseFamily(f) {
  if (!["おねがい", "ひみつ"].includes(f)) return;
  aipriFamily = f;
  updateHeader();
  filters = {};
  ownershipFilter = "all";
  page = 1;
  $("query").value = "";
  fillFilters();
  render();
}
function filtered(includeOwnership = true) {
  const q = $("query").value.normalize("NFKC").toLowerCase().trim();
  return albumCards().filter(
    (c) =>
      (!q ||
        [
          c.name,
          c.code,
          c.rarity,
          c.character,
          ...values(c.brand),
          ...values(c.songs),
        ]
          .join(" ")
          .normalize("NFKC")
          .toLowerCase()
          .includes(q)) &&
      Object.entries(filters).every(
        ([k, v]) => !v || values(c[k]).includes(v),
      ) &&
      (!includeOwnership ||
        ownershipFilter === "all" ||
        (ownershipFilter === "yes" ? owned.has(c.id) : !owned.has(c.id))),
  );
}
function name(c) {
  return c.name || "カード名未取得";
}
function render() {
  if (!game) return;
  const all = albumCards(),
    got = all.filter((c) => owned.has(c.id)).length,
    rate = all.length ? (got / all.length) * 100 : 0,
    list = filtered(),
    base = filtered(false),
    baseGot = base.filter((c) => owned.has(c.id)).length;
  $("total").textContent = `全${all.length}枚`;
  $("percent").textContent = ownershipReady ? rate.toFixed(1) + "%" : "—";
  $("progress-bar").style.width = (ownershipReady ? rate : 0) + "%";
  $("progress-count").textContent = ownershipReady
    ? `持っている ${got}枚 ／ 持っていない ${all.length - got}枚`
    : "所持データを読み込み中（設定が必要な場合は同梱の手順をご確認ください）";
  $("result-count").textContent = `見つかったカード ${list.length}枚`;
  $("filtered-rate").textContent = ownershipReady
    ? `絞り込み内 ${baseGot}/${base.length}枚 · ${base.length ? ((baseGot / base.length) * 100).toFixed(1) : "0.0"}%`
    : "";
  document.querySelectorAll("[data-owned]").forEach((b) => {
    b.classList.toggle("active", b.dataset.owned === ownershipFilter);
    b.disabled = !ownershipReady;
  });
  page = Math.min(page, Math.max(1, Math.ceil(list.length / SIZE)));
  $("cards").innerHTML = list
    .slice((page - 1) * SIZE, page * SIZE)
    .map(
      (c) =>
        `<article class="card ${owned.has(c.id) ? "owned" : ""}"><button class="card-trigger" data-detail="${esc(c.id)}" aria-label="${esc(name(c))}の詳細"><img src="${esc(c.front)}" loading="lazy" decoding="async" alt="${esc(name(c))}"><span class="code">${esc(c.code)}</span><span class="card-meta"><span>${esc(c.character || "")}</span><span class="pill">${esc(c.rarity || "記載なし")}</span></span>${c.game === "aikatsu" && c.variant === "パラレル" ? '<span class="parallel-tag">パラレル</span>' : ""}<span class="card-name">${esc(name(c))}</span>${game === "aipri" ? `<span class="card-song">♪ ${esc(c.songs?.join(" ／ ") || "曲名未取得")}</span>` : ""}</button><button class="ownership-button" data-toggle="${esc(c.id)}" ${!ownershipReady || saving.has(c.id) ? "disabled" : ""}>${saving.has(c.id) ? "保存中…" : owned.has(c.id) ? "✓ 持っている" : "＋ 持っていない"}</button></article>`,
    )
    .join("");
  $("empty").hidden = list.length > 0;
  $("prev").disabled = page === 1;
  $("next").disabled = page * SIZE >= list.length;
  $("page-info").textContent =
    `${page} / ${Math.max(1, Math.ceil(list.length / SIZE))}`;
  updateSyncIndicator();
  $("sync-status").textContent = catalogLoading
    ? "カード情報を確認中"
    : catalog.sync?.running
      ? `${catalog.sync.stage}…`
      : catalog.updatedAt
        ? `カード情報の確認：${new Date(catalog.updatedAt).toLocaleString("ja-JP")}`
        : "公式ページから取得中…";
  const missing = all.some(
      (c) => !c.name || (game === "aipri" && !c.songs?.length),
    ),
    errors = catalog.errors?.length;
  $("data-warning").hidden = !missing && !errors;
  $("data-warning").textContent = errors
    ? catalog.errors[0]
    : "画像内のカード名・曲名に未取得の項目があります。新しいカードの文字読み取り結果は詳細で確認できます。";
  if (selected) updateModalOwnership();
  scheduleOCR();
}
async function toggle(id) {
  if (!session || !ownershipReady || saving.has(id)) return;
  const uid = session.user.id,
    previous = owned.has(id);
  saving.add(id);
  render();
  try {
    const result = previous
      ? await db
          .from("card_ownership")
          .delete()
          .eq("user_id", uid)
          .eq("card_id", id)
      : await db
          .from("card_ownership")
          .upsert(
            { user_id: uid, card_id: id },
            { onConflict: "user_id,card_id", ignoreDuplicates: true },
          );
    if (result.error) throw result.error;
    if (session?.user.id === uid) {
      previous ? owned.delete(id) : owned.add(id);
      toast(previous ? "所持登録を解除しました" : "所持カードに登録しました");
    }
  } catch (e) {
    toast("保存できませんでした。" + translatedError(e));
  } finally {
    saving.delete(id);
    render();
  }
}
function openDetail(id, trigger) {
  selected = catalog.cards.find((c) => c.id === id);
  if (!selected) return;
  lastFocus = trigger;
  side = 0;
  const c = selected;
  $("modal-code").textContent = c.code;
  $("modal-name").textContent = name(c);
  $("modal-rarity").textContent = c.rarity || "記載なし";
  $("modal-fields").innerHTML = fields[c.game]
    .map(
      ([k, label]) =>
        `<dt>${label}</dt><dd>${esc(values(c[k]).join(" ／ ") || "未取得")}</dd>`,
    )
    .join("");
  $("metadata-note").hidden = true;
  $("modal-source").href = c.source;
  showSide();
  updateModalOwnership();
  $("detail").showModal();
  document.body.style.overflow = "hidden";
}
function showSide() {
  const c = selected;
  const url = side ? c.back : c.front;
  $("modal-image").hidden = !url;
  $("image-failure").hidden = !!url;
  $("image-failure").textContent = url
    ? "画像を読み込めませんでした。"
    : "裏面画像は公式ページに掲載されていません。";
  $("modal-image").src = url || "";
  $("modal-image").alt = `${name(c)} ${side ? "裏面" : "表面"}`;
  $("side-label").textContent = side ? "裏面" : "表面";
  $("flip-prev").disabled = $("flip-next").disabled = !c.back;
}
function updateModalOwnership() {
  if (!selected) return;
  $("modal-owned").textContent = saving.has(selected.id)
    ? "保存中…"
    : owned.has(selected.id)
      ? "✓ 持っている（登録を解除）"
      : "＋ 持っているカードに登録";
  $("modal-owned").disabled = !ownershipReady || saving.has(selected.id);
}
async function init() {
  try {
    const c = window.APP_CONFIG;
    db = window.supabase.createClient(c.supabaseUrl, c.supabaseKey, {
      auth: { detectSessionInUrl: true, flowType: "implicit" },
    });
    db.auth.onAuthStateChange((event, s) =>
      setTimeout(() => authChanged(event, s), 0),
    );
    if (callbackError) {
      authResult(
        false,
        /expired|otp_expired|invalid/i.test(callbackError)
          ? "確認リンクの有効期限が切れているか、すでに使用されています。確認済みの場合はログインしてください。未確認の場合は確認メールを再送してください。"
          : "確認リンクを利用できませんでした。ログイン画面から確認メールを再送してください。",
      );
    }
    if (callbackQuery.has("token_hash") && !callbackError) {
      const type = callbackType;
      if (!["signup", "email", "recovery"].includes(type))
        throw Error("確認リンクの種類が正しくありません");
      const verified = await db.auth.verifyOtp({
        token_hash: callbackQuery.get("token_hash"),
        type,
      });
      if (verified.error) throw verified.error;
    }
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    await authChanged("INITIAL_SESSION", data.session);
    if (!callbackError && confirmationCallback) {
      const checked = await db.auth.getUser();
      if (checked.error) throw checked.error;
      if (!checked.data.user?.email_confirmed_at)
        throw Error("メールの確認が完了していません");
      authResult(
        true,
        "メールアドレスの確認が完了しました。カードアルバムを使い始められます。",
      );
    }
    await fetchCatalog();
  } catch (e) {
    if (confirmationCallback || callbackError)
      authResult(
        false,
        "確認を完了できませんでした。" +
          translatedError(e) +
          " ログインできない場合は確認メールを再送してください。",
      );
    else
      $("auth-message").textContent =
        "初期化できませんでした。" + translatedError(e);
  }
}
$("auth-result-next").onclick = () => {
  authResultShowing = false;
  if (session) screen("selection");
  else {
    authMode("login");
    screen("auth");
  }
};
document
  .querySelectorAll("[data-family]")
  .forEach((b) => (b.onclick = () => chooseFamily(b.dataset.family)));
$("resend").onclick = async () => {
  const email = pendingSignupEmail;
  if (!email) {
    $("auth-message").textContent =
      "新規登録手続きをしてから再送してください。";
    return;
  }
  if (!db) return;
  const { error } = await db.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: authRedirect("confirm") },
  });
  $("auth-message").textContent = error
    ? translatedError(error)
    : "確認メールを再送しました。最新のメール内のリンクを開いてください。";
};
$("login-tab").onclick = () => authMode("login");
$("signup-tab").onclick = () => authMode("signup");
$("auth-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!db) return;
  const email = $("email").value.trim(),
    password = $("password").value;
  $("auth-submit").disabled = true;
  try {
    if (
      mode === "signup" &&
      (!$("nickname").value.trim() || $("nickname").value.trim().length > 20)
    )
      throw Error("ニックネームを1〜20文字で入力してください。");
    const r =
      mode === "login"
        ? await db.auth.signInWithPassword({ email, password })
        : await db.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: authRedirect("confirm"),
              data: { nickname: $("nickname").value.trim() },
            },
          });
    if (r.error) throw r.error;
    if (mode === "signup" && r.data.session)
      authResult(
        true,
        "登録が完了しました。カードアルバムを使い始められます。",
      );
    if (mode === "signup" && !r.data.session) {
      pendingSignupEmail = email;
      try {
        localStorage.setItem(
          "card-album-pending-signup",
          JSON.stringify({ email, at: Date.now() }),
        );
      } catch {}
      $("resend").hidden = false;
      $("auth-message").textContent =
        "確認メールを送信しました。メール内のリンクを開いて登録を完了してください。";
    }
    $("password").value = "";
  } catch (e) {
    $("auth-message").textContent = translatedError(e);
  } finally {
    $("auth-submit").disabled = false;
  }
};
$("forgot").onclick = async () => {
  if (!db) return;
  const email = $("email").value.trim();
  if (!email) {
    $("auth-message").textContent = "メールアドレスを入力してください。";
    return;
  }
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirect("recovery"),
  });
  $("auth-message").textContent = error
    ? translatedError(error)
    : "パスワード再設定メールを送信しました。";
};
$("password-form").onsubmit = async (e) => {
  e.preventDefault();
  const { error } = await db.auth.updateUser({
    password: $("new-password").value,
  });
  if (error) {
    $("auth-message").textContent = translatedError(error);
    return;
  }
  recovering = false;
  $("password-form").hidden = true;
  $("auth-form").hidden = false;
  $("new-password").value = "";
  if (!callbackPending && !authResultShowing) screen("selection");
  await loadOwnership();
  await loadPersonalMetadata();
  toast("パスワードを変更しました");
};
$("logout").onclick = async () => {
  const { error } = await db.auth.signOut();
  if (error) toast(translatedError(error));
  else authChanged("SIGNED_OUT", null);
};
document
  .querySelectorAll("[data-game]")
  .forEach((b) => (b.onclick = () => chooseGame(b.dataset.game)));
$("filters").onchange = (e) => {
  if (e.target.dataset.filter) {
    filters[e.target.dataset.filter] = e.target.value;
    page = 1;
    render();
  }
};
$("query").oninput = () => {
  page = 1;
  render();
};
document.querySelectorAll("[data-owned]").forEach(
  (b) =>
    (b.onclick = () => {
      ownershipFilter = b.dataset.owned;
      page = 1;
      render();
    }),
);
$("reset").onclick = () => {
  filters = {};
  ownershipFilter = "all";
  $("query").value = "";
  page = 1;
  fillFilters();
  render();
};
$("cards").onclick = (e) => {
  const detail = e.target.closest("[data-detail]"),
    toggleButton = e.target.closest("[data-toggle]");
  if (detail) openDetail(detail.dataset.detail, detail);
  if (toggleButton) toggle(toggleButton.dataset.toggle);
};
$("prev").onclick = () => {
  page--;
  render();
  $("cards").scrollIntoView({ block: "start" });
};
$("next").onclick = () => {
  page++;
  render();
  $("cards").scrollIntoView({ block: "start" });
};
$("close").onclick = () => $("detail").close();
$("detail").onclose = () => {
  document.body.style.overflow = "";
  selected = null;
  lastFocus?.focus({ preventScroll: true });
  if (lastFocus?.closest("#auth-art")) setMarqueePaused(false);
};
$("detail").onclick = (e) => {
  if (e.target === $("detail")) {
    const r = $("detail").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $("detail").close();
  }
};
for (const id of ["flip-prev", "flip-next"])
  $(id).onclick = () => {
    side = 1 - side;
    showSide();
  };
$("detail").onkeydown = (e) => {
  if (["ArrowLeft", "ArrowRight"].includes(e.key) && selected?.back) {
    e.preventDefault();
    side = 1 - side;
    showSide();
  }
};
$("modal-image").onerror = () => {
  $("modal-image").hidden = true;
  $("image-failure").hidden = false;
};
$("modal-owned").onclick = () => selected && toggle(selected.id);
window.addEventListener("focus", () => {
  if (session) loadOwnership();
});

function nickname() {
  const n = session?.user.user_metadata?.nickname;
  return typeof n === "string" && n.trim() ? n.trim().slice(0, 20) : "あなた";
}
function closeMenu() {
  $("nav").classList.remove("open");
  $("menu-toggle").setAttribute("aria-expanded", "false");
  $("menu-toggle").setAttribute("aria-label", "メニューを開く");
}
function updateHeader() {
  $("header-title").textContent = session
    ? nickname() + "のアルバム"
    : "カードアルバム";
  const selectedGame = game || "aikatsu";
  $("game-switch").classList.toggle("is-aipri", selectedGame === "aipri");
  document
    .querySelectorAll("#game-switch [data-game]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.game === selectedGame)),
    );
  const candidates = catalog.cards.filter(
    (c) =>
      (!game || c.game === game) &&
      (game !== "aipri" || c.family === aipriFamily) &&
      c.front,
  );
  const key = (game || "welcome") + ":" + (game === "aipri" ? aipriFamily : "");
  if (
    candidates.length &&
    (headerImageKey !== key || $("header-card").hidden)
  ) {
    const card = candidates[Math.floor(Math.random() * candidates.length)];
    $("header-card").src = card.front;
    $("header-card").hidden = false;
    headerImageKey = key;
  }
}
function updateSyncIndicator() {
  const busy = catalogLoading || !!catalog.sync?.running;
  $("sync-indicator").classList.toggle("is-updating", busy);
  $("sync-indicator").setAttribute("aria-busy", String(busy));
  document.querySelector(".sync-spinner").hidden = !busy;
  if (catalogLoading) $("sync-status").textContent = "カード情報を確認中";
}
$("menu-toggle").onclick = () => {
  const open = $("nav").classList.toggle("open");
  $("menu-toggle").setAttribute("aria-expanded", String(open));
  $("menu-toggle").setAttribute(
    "aria-label",
    open ? "メニューを閉じる" : "メニューを開く",
  );
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("header")) closeMenu();
});
$("header-card").onerror = () => {
  $("header-card").hidden = true;
};
$("edit-nickname").onclick = () => {
  closeMenu();
  $("profile-nickname").value = session?.user.user_metadata?.nickname || "";
  $("nickname-message").textContent = "";
  $("nickname-dialog").showModal();
};
$("nickname-top-close").onclick = () => $("nickname-dialog").close();
$("nickname-cancel").onclick = () => $("nickname-dialog").close();
$("nickname-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!session || !db) return;
  const value = $("profile-nickname").value.trim();
  if (!value || value.length > 20) {
    $("nickname-message").textContent = "1〜20文字で入力してください。";
    return;
  }
  $("nickname-save").disabled = true;
  try {
    const { data, error } = await db.auth.updateUser({
      data: { nickname: value },
    });
    if (error) throw error;
    session = { ...session, user: data.user };
    updateHeader();
    $("account").textContent = nickname() + " のアルバム";
    $("nickname-dialog").close();
    toast("ニックネームを保存しました");
  } catch (e) {
    $("nickname-message").textContent = translatedError(e);
  } finally {
    $("nickname-save").disabled = false;
  }
};

$("resend").hidden = !pendingSignupEmail;
init();

async function getOCRWorker() {
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(
        "assets/vendor/tesseract/tesseract.min.js",
        siteBase,
      ).href;
      script.onload = resolve;
      script.onerror = () => reject(Error("文字読み取りを読み込めません"));
      document.head.appendChild(script);
    });
  }
  ocrWorker = await window.Tesseract.createWorker(["jpn", "eng"], 1, {
    workerPath: new URL("assets/vendor/tesseract/worker.min.js", siteBase).href,
    corePath: new URL(
      "assets/vendor/tesseract/tesseract-core-lstm.wasm.js",
      siteBase,
    ).href,
    langPath: new URL("assets/vendor/tessdata/", siteBase).href,
    logger: () => {},
  });
  return ocrWorker;
}
function needsOCR(c) {
  return c.game === "aikatsu" ? !c.name || !c.character : !c.songs?.length;
}
function scheduleOCR() {
  if (
    ocrRunning ||
    !window.APP_CONFIG.browserOCR ||
    !session ||
    !game ||
    catalog.source !== "live"
  )
    return;
  const candidates = filtered()
    .slice((page - 1) * SIZE, page * SIZE)
    .filter(
      (c) => needsOCR(c) && !ocrAttempted.has(session.user.id + ":" + c.id),
    )
    .slice(0, 3);
  if (!candidates.length) return;
  ocrRunning = true;
  const uid = session.user.id;
  setTimeout(async () => {
    let successful = false;
    try {
      for (const c of candidates) {
        if (uid !== session?.user.id) break;
        ocrAttempted.add(uid + ":" + c.id);
        successful = (await readMetadata(c, uid)) || successful;
      }
    } catch (e) {
      console.warn("文字読み取りを実行できませんでした", e.message);
    } finally {
      ocrRunning = false;
      if (successful && uid === session?.user.id) {
        applyPersonalMetadata();
        fillFilters();
        render();
        if (selected) {
          const fresh = catalog.cards.find((c) => c.id === selected.id);
          if (fresh) {
            selected = fresh;
            $("modal-name").textContent = name(fresh);
            $("metadata-note").hidden = true;
            $("modal-fields").innerHTML = fields[game]
              .map(
                ([k, l]) =>
                  `<dt>${l}</dt><dd>${esc(values(fresh[k]).join(" ／ ") || "未取得")}</dd>`,
              )
              .join("");
          }
        }
      }
    }
  }, 0);
}
async function readMetadataPart(c, uid, part) {
  const { data, error } = await db.auth.getSession();
  if (error || !data.session || data.session.user.id !== uid) return false;
  const endpoint = new URL(
    window.APP_CONFIG.supabaseUrl +
      "/functions/v1/" +
      window.APP_CONFIG.syncFunction,
  );
  endpoint.search = new URLSearchParams({
    action: "image",
    card_id: c.id,
    side: c.game === "aikatsu" && part !== "character" ? "front" : "back",
  }).toString();
  const result = await fetch(endpoint, {
    headers: {
      apikey: window.APP_CONFIG.supabaseKey,
      Authorization: "Bearer " + data.session.access_token,
    },
  });
  if (!result.ok) return false;
  const image = await createImageBitmap(await result.blob());
  const w = image.width,
    h = image.height;
  const crop =
    c.game === "aikatsu"
      ? part === "character"
        ? w > h
          ? { x: 0.22, y: 0.865, w: 0.28, h: 0.095 }
          : c.rarity === "ER"
            ? { x: 0.23, y: 0.02, w: 0.34, h: 0.065 }
            : { x: 0.67, y: 0.031, w: 0.28, h: 0.054 }
        : { x: 0.18, y: 0.875, w: 0.57, h: 0.1 }
      : { x: 0.65, y: 0.4, w: 0.33, h: 0.075 };
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = Math.max(
    50,
    Math.round((1200 * (h * crop.h)) / (w * crop.w)),
  );
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    image,
    Math.round(w * crop.x),
    Math.round(h * crop.y),
    Math.round(w * crop.w),
    Math.round(h * crop.h),
    0,
    0,
    canvas.width,
    canvas.height,
  );
  image.close();
  const worker = await getOCRWorker();
  const { data: ocr } = await worker.recognize(canvas);
  if (ocr.confidence < 55 || uid !== session?.user.id) return false;
  const lines = ocr.text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  let patch = {
    ...(personalMetadata.get(c.id) || {}),
    metadataSource: "画像文字読み取り（未確認）",
  };
  if (c.game === "aikatsu" && part === "character") {
    const character = extractCharacter(ocr.text);
    if (!character) return false;
    patch.character = character;
  } else if (c.game === "aikatsu") {
    const text = lines.find(
      (x) => /[ァ-ヶー]{4}/.test(x) && !/(アイカツ|ポイント|ブランド)/.test(x),
    );
    if (!text) return false;
    patch.name = text.replace(/\s/g, "").slice(0, 150);
  } else {
    const text = lines.find(
      (x) => x.length >= 4 && !/(あそべる|きょく|ライブ|にん)/.test(x),
    );
    if (!text) return false;
    patch.songs = [text.slice(0, 150)];
  }
  const saved = await db.from("card_metadata_notes").upsert(
    {
      user_id: uid,
      card_id: c.id,
      patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,card_id" },
  );
  if (saved.error) return false;
  if (uid === session?.user.id) personalMetadata.set(c.id, patch);
  return true;
}

const knownAikatsuCharacters = [
  "星宮いちご",
  "大空あかり",
  "姫石らき",
  "音城ノエル",
  "姫乃みえる",
  "ハナ",
  "霧矢あおい",
  "真未夢メエ",
  "橋本環奈",
  "紫吹蘭",
  "凛堂たいむ",
  "和央パリン",
];
function extractCharacter(text) {
  const lines = text
    .normalize("NFKC")
    .split("\n")
    .map((s) => s.replace(/[^一-龠々ぁ-んァ-ヶー]/g, ""));
  return (
    knownAikatsuCharacters.find((name) =>
      lines.some((line) => line.includes(name)),
    ) || null
  );
}
async function readMetadata(c, uid) {
  let changed = false;
  if (c.game === "aikatsu") {
    if (!c.name) changed = (await readMetadataPart(c, uid, "name")) || changed;
    if (!c.character && c.back)
      changed = (await readMetadataPart(c, uid, "character")) || changed;
  } else if (!c.songs?.length)
    changed = (await readMetadataPart(c, uid, "songs")) || changed;
  return changed;
}
function shuffleCards(cards) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const marqueePools = { aikatsu: [], aipri: [] };
const marqueePositions = { aikatsu: 0, aipri: 0 };
function buildMarquee() {
  if (!catalog.cards.length) return;
  const sample = [];
  for (const group of ["aikatsu", "aipri"]) {
    const available = catalog.cards.filter((c) => c.game === group && c.front);
    if (marqueePools[group].length !== available.length) {
      marqueePools[group] = shuffleCards(available);
      marqueePositions[group] = 0;
    }
    const byId = new Map(available.map((c) => [c.id, c]));
    marqueePools[group] = marqueePools[group].map((c) => byId.get(c.id) || c);
    if (!available.length) continue;
    const take = catalog.cards.some((c) => c.game !== group && c.front)
      ? 10
      : 20;
    for (let i = 0; i < take; i++) {
      if (marqueePositions[group] >= available.length) {
        marqueePools[group] = shuffleCards(available);
        marqueePositions[group] = 0;
      }
      sample.push(marqueePools[group][marqueePositions[group]++]);
    }
  }
  const row = shuffleCards(sample)
    .map(
      (c) =>
        `<button class="marquee-card" data-preview="${esc(c.id)}" aria-label="${esc(c.name || c.code)}の詳細"><img src="${esc(c.front)}" alt="${esc(c.name || c.code)}" loading="lazy"></button>`,
    )
    .join("");
  $("auth-art").innerHTML =
    `<div class="marquee-track"><div class="marquee-group">${row}</div><div class="marquee-group" aria-hidden="true">${row.replace(/<button /g, '<button tabindex="-1" ')}</div></div>`;
  setMarqueePaused(marqueePaused);
  $("auth-art").querySelector(".marquee-track").onanimationiteration = () => {
    if (!marqueePaused) buildMarquee();
  };
}
function setMarqueePaused(paused) {
  marqueePaused = paused;
  $("auth-art").classList.toggle("paused", paused);
}
$("auth-art").onclick = (e) => {
  const button = e.target.closest("[data-preview]");
  if (!button) return;
  setMarqueePaused(true);
  openDetail(button.dataset.preview, button);
};
$("auth-art").addEventListener("focusin", () => setMarqueePaused(true));
$("auth-art").addEventListener("focusout", () => {
  if (!$("detail").open) setMarqueePaused(false);
});
$("legal-close").onclick = () => $("info-dialog").close();
document.querySelectorAll("[data-info]").forEach(
  (button) =>
    (button.onclick = () => {
      const info = window.SITE_INFO[button.dataset.info];
      $("info-title").textContent = info.title;
      $("info-body").innerHTML = info.body;
      for (const contact of $("info-body").querySelectorAll("[data-contact]")) {
        const link = document.createElement("a");
        link.href = new URL("contact/", siteBase).href;
        link.textContent = "お問い合わせフォームへ";
        contact.replaceChildren(link);
      }
      $("info-dialog").showModal();
    }),
);
