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
  catalog = {
    cards: JSON.parse($("startup-card-data")?.textContent || "[]"),
    source: "snapshot",
  },
  game = null,
  owned = new Set(),
  ownedCounts = new Map(),
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
const saving = new Set();
let pageSize = 20;
let aipriFamily = "おねがい",
  headerImageKey = "";
const startupProbabilityRoute = location.hash.match(
  /^#probabilities-(aikatsu|onegai|himitsu)$/,
)?.[1];
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
  $("auth-result-album-id").hidden = true;
  $("auth-result-retention").hidden = true;
  $("auth-result-icon").textContent = ok ? "✓" : "!";
  $("auth-result-next").textContent =
    ok && session ? "アルバムを開く" : "ログイン画面へ";
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
  for (const s of [
    "auth",
    "auth-result",
    "selection",
    "collection",
    "probabilities",
  ])
    $(s).hidden = s !== id;
  $("nav").hidden = !session;
  $("menu-toggle").hidden = !session;
  closeMenu();
  updateHeader();
}
let albumIdentity = "";
let signupReservation = null;
let signupStep = "id";
let signupBusy = false;
try {
  localStorage.removeItem("card-album-id-reservation");
} catch {}
window.addEventListener("pagehide", () => {
  signupReservation = null;
  try {
    localStorage.removeItem("card-album-id-reservation");
  } catch {}
  $("signup-password").value = $("signup-password-confirm").value = "";
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && mode === "signup") renderSignupStep("id");
});
function authMode(m) {
  if (m === "signup" && mode !== "signup") {
    signupReservation = null;
    signupStep = "id";
    try {
      localStorage.removeItem("card-album-id-reservation");
    } catch {}
    $("signup-password").value = $("signup-password-confirm").value = "";
    $("nickname").value = "";
    $("nickname-privacy-ack").checked = false;
  }
  mode = m;
  for (const id of ["nickname", "email", "password"]) {
    $(id + "-error").hidden = true;
    $(id).removeAttribute("aria-invalid");
  }
  $("auth-form").hidden = m !== "login";
  $("signup-flow").hidden = m !== "signup";
  $("login-tab").classList.toggle("active", m === "login");
  $("signup-tab").classList.toggle("active", m === "signup");
  $("login-identifier-label").textContent = "アルバムID";
  $("email").type = "text";
  $("email").placeholder = "アルバムID";
  $("email").autocapitalize = "none";
  $("auth-message").textContent = "";
  updateLoginIdentifier();
  resetPasswordVisibility();
  if (m === "signup") renderSignupStep(signupStep);
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
  ownedCounts = new Map();
  if (!uid) return;
  let all = [],
    offset = 0;
  try {
    while (true) {
      const { data, error } = await db
        .from("card_ownership")
        .select("card_id,quantity")
        .eq("user_id", uid)
        .order("card_id")
        .range(offset, offset + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    if (generation !== loadGeneration || uid !== session?.user.id) return;
    ownedCounts = new Map(all.map((r) => [r.card_id, Number(r.quantity) || 1]));
    owned = new Set(ownedCounts.keys());
    ownershipReady = true;
  } catch (e) {
    if (generation === loadGeneration)
      toast(
        "所持データを読み込めません。Supabaseの設定・SQLを確認してください。",
      );
  }
  if (game) render();
}
// セッションを維持して再訪した場合も利用を記録します。
let lastActivityTouch = 0;
async function recordAccountVisit() {
  if (
    !session ||
    !db ||
    document.hidden ||
    Date.now() - lastActivityTouch < 60000
  )
    return;
  lastActivityTouch = Date.now();
  try {
    const { error } = await db.rpc("card_album_touch_activity");
    if (error) lastActivityTouch = 0;
  } catch {
    lastActivityTouch = 0;
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) recordAccountVisit();
});
setInterval(recordAccountVisit, 3600000);

async function authChanged(event, next) {
  const previous = session?.user.id;
  session = next;
  updateHeader();
  if (selected) updateModalOwnership();
  if (event === "PASSWORD_RECOVERY") {
    recovering = true;
    $("auth-form").hidden = true;
    $("password-form").hidden = false;
    screen("auth");
    return;
  }
  if (!session) {
    lastActivityTouch = 0;
    loadGeneration++;
    owned = new Set();
    ownedCounts = new Map();
    ownershipReady = false;
    game = null;
    albumIdentity = "";
    $("account-album-id").textContent = "";
    $("album-id-dialog").close();
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
  recordAccountVisit();
  if (previous !== session.user.id) {
    $("account").textContent = nickname() + " のアルバム";
    loadAlbumIdentity().catch(() => {});
    if (!callbackPending && !authResultShowing) screen("selection");
    await loadOwnership();
    await loadPersonalMetadata();
    if (catalogFallback) await fetchCatalog();
  }
}
let initialCatalogPromise;
function loadInitialCatalog() {
  if (initialCatalogPromise) return initialCatalogPromise;
  initialCatalogPromise = (async () => {
    try {
      const response = await fetch(
        new URL("assets/catalog.json?v=20261011-ui-contact", siteBase),
      );
      if (!response.ok) throw Error("初期データを読み込めません");
      catalogFallback = await response.json();
      if (catalog.source !== "live") {
        catalog = {
          ...catalogFallback,
          cards: catalogFallback.cards.map((c) => ({ ...c })),
          source: "snapshot",
        };
        applyPersonalMetadata();
        art();
        if (game) {
          fillFilters();
          render();
        }
      }
    } catch (error) {
      console.warn("初期カードの読み込み", error.message);
    }
  })();
  return initialCatalogPromise;
}
async function fetchCatalog() {
  if (catalogLoading) return;
  catalogLoading = true;
  updateSyncIndicator();
  try {
    if (!catalogFallback) {
      const r = await fetch(
        new URL("assets/catalog.json?v=20261011-ui-contact", siteBase),
      );
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
      .select("cycle_started_at,cycle_finished_at,updated_at")
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
      errors: readError
        ? [
            "カード情報を取得できませんでした。時間をおいて再読み込みしてください。",
          ]
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
    poll = setTimeout(fetchCatalog, window.APP_CONFIG.refreshMs || 86400000);
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
    if (c.game === "aipri") {
      const serial = String(c.code || "")
        .normalize("NFKC")
        .trim()
        .toUpperCase();
      if (serial.endsWith("P")) c.rarity = "パラレル";
      else if (serial.includes("M")) c.rarity = "ミラクル";
    }
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
    if (!$(g + "-art").childElementCount)
      $(g + "-art").innerHTML = catalog.cards
        .filter((c) => c.game === g)
        .slice(0, 2)
        .map(
          (c) => `<img src="${esc(c.front)}" alt="${esc(c.name || c.code)}">`,
        )
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
  setLatestSeries();
  $("filter-panel").open = false;
  $("series-progress").hidden = true;
  $("progress-details").setAttribute("aria-expanded", "false");
  $("progress-details").innerHTML =
    '<span class="progress-chevron" aria-hidden="true"></span>';
  $("progress-details").setAttribute("aria-label", "弾ごとの取得率を表示");
  fillFilters();
  render();
  history.replaceState(null, "", "#" + g);
}
function albumCards() {
  return catalog.cards.filter(
    (c) => c.game === game && (game !== "aipri" || c.family === aipriFamily),
  );
}
function seriesRank(label) {
  const text = String(label).normalize("NFKC");
  const number = text.match(/(\d+)\s*(?:だん|弾)/);
  return number
    ? (text.includes("リング") ? 1000000 : 0) + Number(number[1])
    : -1;
}
function setLatestSeries() {
  const series = [...new Set(albumCards().flatMap((c) => values(c.series)))];
  const latest = series
    .filter((s) => seriesRank(s) >= 0)
    .sort((a, b) => seriesRank(b) - seriesRank(a))[0];
  if (latest) filters.series = latest;
}
function renderFamilyTabs() {
  document.querySelectorAll("[data-family]").forEach((button) => {
    const family = button.dataset.family;
    const candidates = catalog.cards.filter(
      (c) => c.game === "aipri" && c.family === family && c.front,
    );
    const preferred =
      candidates.find(
        (c) => c.code === (family === "おねがい" ? "OA4-001" : "APR6-001"),
      ) || candidates[0];
    button.innerHTML = `${preferred ? `<img src="${esc(preferred.front)}" alt="" loading="lazy">` : ""}<span><strong>${family === "おねがい" ? "おねがいアイプリ" : "ひみつのアイプリ"}</strong></span>`;
  });
}
function renderSeriesProgress() {
  const all = albumCards();
  const series = [...new Set(all.flatMap((c) => values(c.series)))].sort(
    (a, b) =>
      seriesRank(b) - seriesRank(a) ||
      a.localeCompare(b, "ja", { numeric: true }),
  );
  $("series-progress").innerHTML = series
    .map((label) => {
      const cards = all.filter((c) => values(c.series).includes(label));
      const got = cards.filter((c) => owned.has(c.id)).length;
      const rate = cards.length ? (got / cards.length) * 100 : 0;
      return `<div class="progress-card progress-card-small"><div><span>${esc(label)}</span><strong>${ownershipReady ? rate.toFixed(1) + "%" : "—"}</strong></div><div class="progress-track"><span style="width:${ownershipReady ? rate : 0}%"></span></div><p>${ownershipReady ? `持っている ${got}枚 ／ 持っていない ${cards.length - got}枚` : "所持データを読み込み中"}</p></div>`;
    })
    .join("");
}
function fillFilters() {
  for (const card of catalog.cards)
    if (card.game === "aipri") card.rarity = displayRarity(card);
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
  renderFamilyTabs();
  $("filters").innerHTML = fields[game]
    .filter(([key]) => key !== "family")
    .map(([key, label]) => {
      const opts = [...new Set(cards.flatMap((c) => values(c[key])))].sort(
        (a, b) => {
          if (game === "aikatsu" && key === "rarity") {
            const order = ["ER", "PR", "R", "N"];
            return (
              (order.includes(a) ? order.indexOf(a) : 99) -
                (order.includes(b) ? order.indexOf(b) : 99) ||
              a.localeCompare(b, "ja")
            );
          }
          return key === "series"
            ? seriesRank(b) - seriesRank(a) ||
                a.localeCompare(b, "ja", { numeric: true })
            : a.localeCompare(b, "ja", { numeric: true });
        },
      );
      if (filters[key] && !opts.includes(filters[key])) delete filters[key];
      return `<label><span class="filter-label">${label}<button type="button" class="filter-clear" data-clear-filter="${key}" aria-label="${label}の絞り込みを解除">解除</button></span><select data-filter="${key}"><option value="">すべて</option>${opts.map((v) => `<option value="${esc(v)}" ${filters[key] === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
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
  setLatestSeries();
  fillFilters();
  render();
}
function normalizeCardCode(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[-‐‑‒–—―−\s]/g, "");
}
function filtered(includeOwnership = true) {
  const q = $("query").value.normalize("NFKC").toLowerCase().trim();
  const compactQuery = normalizeCardCode(q);
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
          .includes(q) ||
        (compactQuery && normalizeCardCode(c.code).includes(compactQuery))) &&
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
function renderActiveFilters() {
  const active = Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => ({
      key,
      label: fields[game].find(([field]) => field === key)?.[1] || key,
      value,
    }));
  const query = $("query").value.trim();
  if (query) active.push({ key: "query", label: "検索", value: query });
  $("active-filters").innerHTML = active.length
    ? `<span class="active-filters-label">適用中</span>${active.map(({ key, label, value }) => `<button type="button" class="filter-chip" data-remove-condition="${esc(key)}" aria-label="${esc(label + "：" + value)}を解除"><span>${esc(label)}：<strong>${esc(value)}</strong></span><span class="filter-chip-close" aria-hidden="true">×</span></button>`).join("")}`
    : '<span class="no-active-filters">絞り込みなし</span>';
}
function getPageSize(count) {
  return pageSize === "all" ? Math.max(1, count) : pageSize;
}
function renderPageNumbers(total) {
  const compact =
    window.matchMedia?.("(max-width: 760px)").matches ||
    window.innerWidth <= 760;
  const viewport =
    $("page-numbers")?.parentElement?.clientWidth ||
    Math.min(window.innerWidth - 32, 1100);
  const maxSlots = compact
    ? Math.max(3, Math.min(9, Math.floor((viewport - 100) / 34)))
    : 9;
  let candidates;
  if (total <= maxSlots)
    candidates = Array.from({ length: total }, (_, i) => i + 1);
  else {
    const count = Math.max(1, maxSlots - 4);
    const start = Math.max(
      2,
      Math.min(page - Math.floor(count / 2), total - count),
    );
    candidates = [
      ...new Set([
        1,
        ...Array.from({ length: count }, (_, i) => start + i),
        total,
      ]),
    ].sort((a, b) => a - b);
    if (page <= 2 && maxSlots >= 6)
      candidates = [...new Set([1, 2, ...candidates, total - 1, total])].sort(
        (a, b) => a - b,
      );
  }
  let previous = 0;
  $("prev").textContent = compact ? "前へ" : "前のページ";
  $("next").textContent = compact ? "次へ" : "次のページ";
  $("page-numbers").innerHTML = candidates
    .map((n) => {
      const gap =
        previous && n - previous > 1
          ? '<span class="page-gap" aria-hidden="true">…</span>'
          : "";
      previous = n;
      return `${gap}<button type="button" data-page="${n}" ${n === page ? 'aria-current="page"' : ""} aria-label="${n}ページ目">${n}</button>`;
    })
    .join("");
}
function render() {
  if (!game) return;
  renderActiveFilters();
  const all = albumCards(),
    got = all.filter((c) => owned.has(c.id)).length,
    rate = all.length ? (got / all.length) * 100 : 0,
    list = filtered(),
    base = filtered(false),
    baseGot = base.filter((c) => owned.has(c.id)).length;
  $("filter-summary").textContent =
    Object.values(filters).filter(Boolean).length +
    ($("query").value.trim() ? 1 : 0)
      ? `適用中 ${Object.values(filters).filter(Boolean).length + ($("query").value.trim() ? 1 : 0)}件`
      : "";
  document
    .querySelectorAll("[data-clear-filter]")
    .forEach((b) => (b.disabled = !filters[b.dataset.clearFilter]));
  $("clear-query").disabled = !$("query").value;
  if (!$("series-progress").hidden) renderSeriesProgress();
  $("total").textContent = `全${all.length}枚`;
  $("percent").textContent = ownershipReady ? rate.toFixed(1) + "%" : "—";
  $("progress-bar").style.width = (ownershipReady ? rate : 0) + "%";
  $("progress-count").textContent = ownershipReady
    ? `持っている ${got}枚 ／ 持っていない ${all.length - got}枚`
    : "所持データを読み込み中（設定が必要な場合は同梱の手順をご確認ください）";
  $("result-count").textContent = `見つかったカード ${list.length}枚`;
  $("filtered-rate").innerHTML = ownershipReady
    ? `<span class="rate-caption">絞り込み内の取得率</span><strong>${base.length ? ((baseGot / base.length) * 100).toFixed(1) : "0.0"}%</strong><span class="rate-fraction">${baseGot} / ${base.length}枚</span>`
    : "";
  document
    .querySelector(".owned-tabs")
    .style.setProperty(
      "--owned-index",
      String(["all", "yes", "no"].indexOf(ownershipFilter)),
    );
  document.querySelectorAll("[data-owned]").forEach((b) => {
    b.classList.toggle("active", b.dataset.owned === ownershipFilter);
    b.setAttribute("aria-pressed", String(b.dataset.owned === ownershipFilter));
    b.disabled = !ownershipReady;
  });
  const size = getPageSize(list.length);
  const pageCount = Math.max(1, Math.ceil(list.length / size));
  page = Math.min(page, pageCount);
  $("page-size").value = String(pageSize);
  renderPageNumbers(pageCount);
  $("cards").innerHTML = list
    .slice((page - 1) * size, page * size)
    .map(
      (c) =>
        `<article class="card ${owned.has(c.id) ? "owned" : ""}">${incompleteCard(c) ? '<span class="incomplete-badge" role="img" aria-label="未取得のカード情報があります" title="未取得のカード情報があります">!</span>' : ""}${owned.has(c.id) ? `<span class="owned-badge">所持 ${quantityOf(c.id)}枚</span>` : ""}<button class="card-trigger" data-detail="${esc(c.id)}" aria-label="${esc(name(c))}の詳細"><span class="card-image-frame"><img data-card-image src="${esc(c.front)}" loading="lazy" decoding="async" alt="${esc(name(c))}"></span><span class="code">${esc(c.code)}</span><span class="card-meta"><span>${esc(c.character || "")}</span><span class="pill">${esc(displayRarity(c))}</span></span>${c.game === "aikatsu" && c.variant === "パラレル" ? '<span class="parallel-tag">パラレル</span>' : ""}<span class="card-name">${esc(name(c))}</span>${game === "aipri" ? `<span class="card-song">♪ ${esc(c.songs?.join(" ／ ") || "曲名未取得")}</span>` : ""}</button><button class="ownership-button" data-toggle="${esc(c.id)}" aria-pressed="${owned.has(c.id)}" ${!ownershipReady || saving.has(c.id) ? "disabled" : ""}>${saving.has(c.id) ? "保存中…" : owned.has(c.id) ? "✓ 持っている" : "＋ 持っていない"}</button></article>`,
    )
    .join("");
  $("empty").hidden = list.length > 0;
  $("prev").disabled = page === 1;
  $("next").disabled = page * size >= list.length;
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
  if (!$("probabilities").hidden) renderProbabilities();
  scheduleOCR();
}
function quantityOf(id) {
  return owned.has(id) ? ownedCounts.get(id) || 1 : 0;
}
async function saveQuantity(id, delta, clear = false) {
  if (!session || !ownershipReady || saving.has(id)) return;
  const uid = session.user.id;
  saving.add(id);
  render();
  if (selected) updateModalOwnership();
  try {
    const result = await db.rpc(
      clear ? "card_album_clear_quantity" : "card_album_change_quantity",
      clear ? { p_card_id: id } : { p_card_id: id, p_delta: delta },
    );
    if (result.error) throw result.error;
    if (session?.user.id !== uid) return;
    const count = Number(result.data);
    if (!Number.isInteger(count) || count < 0)
      throw Error("所持数の応答を確認できませんでした");
    if (count) {
      owned.add(id);
      ownedCounts.set(id, count);
    } else {
      owned.delete(id);
      ownedCounts.delete(id);
    }
    toast(
      count ? `所持数を${count}枚に更新しました` : "所持登録を解除しました",
    );
  } catch (error) {
    toast("保存できませんでした。" + translatedError(error));
  } finally {
    saving.delete(id);
    render();
    if (selected) updateModalOwnership();
  }
}
async function toggle(id) {
  return saveQuantity(id, 1, owned.has(id));
}
let detailCardIds = [];
function openDetail(id, trigger, navigating = false) {
  if (!navigating) {
    const candidates = trigger?.closest("#auth-art")
      ? [
          ...document.querySelectorAll(
            ".marquee-group:first-child [data-detail]",
          ),
        ].map((b) => b.dataset.detail)
      : game
        ? filtered().map((c) => c.id)
        : catalog.cards.map((c) => c.id);
    detailCardIds = [...new Set(candidates)];
    if (!detailCardIds.includes(id)) detailCardIds = [id];
  }
  selected = catalog.cards.find((c) => c.id === id);
  if (!selected) return;
  if (!navigating) lastFocus = trigger;
  side = 0;
  const c = selected;
  $("modal-code").textContent = c.code;
  $("modal-name").textContent = name(c);
  $("modal-rarity").textContent = displayRarity(c);
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
  updateDetailNavigation();
  if (!$("detail").open) $("detail").showModal();
  document.body.style.overflow = "hidden";
}
function updateDetailNavigation() {
  document.querySelector(".detail-navigation").hidden =
    !session || !$("auth").hidden;
  const index = detailCardIds.indexOf(selected?.id);
  $("card-prev").disabled = index <= 0;
  $("card-next").disabled = index < 0 || index >= detailCardIds.length - 1;
}
function moveDetail(delta) {
  const id = detailCardIds[detailCardIds.indexOf(selected?.id) + delta];
  if (id) openDetail(id, lastFocus, true);
}
$("card-prev").onclick = () => moveDetail(-1);
$("card-next").onclick = () => moveDetail(1);
function showSide() {
  const c = selected;
  const url = side ? c.back : c.front;
  $("modal-image").hidden = !url;
  $("image-failure").hidden = !!url;
  $("image-failure").textContent = url
    ? "画像を読み込めませんでした。"
    : "裏面画像は未登録です。";
  $("modal-image").src = url || "";
  $("modal-image").alt = `${name(c)} ${side ? "裏面" : "表面"}`;
  $("side-label").textContent = side ? "裏面" : "表面";
  $("flip-prev").disabled = $("flip-next").disabled = !c.back;
}
function updateModalOwnership() {
  if (!selected) return;
  $("modal-owned").hidden = !session;
  $("quantity-controls").hidden = !session || !owned.has(selected.id);
  $("quantity-value").textContent = quantityOf(selected.id) + "枚";
  $("quantity-minus").disabled = !ownershipReady || saving.has(selected.id);
  $("quantity-plus").disabled =
    !ownershipReady ||
    saving.has(selected.id) ||
    quantityOf(selected.id) >= 1000000;
  $("modal-owned").textContent = saving.has(selected.id)
    ? "保存中…"
    : owned.has(selected.id)
      ? "✓ 持っている"
      : "＋ 持っていない";
  $("modal-owned").classList.toggle("is-owned", owned.has(selected.id));
  $("modal-owned").setAttribute("aria-pressed", String(owned.has(selected.id)));
  $("modal-owned").disabled = !ownershipReady || saving.has(selected.id);
}
async function init() {
  const initialCards = loadInitialCatalog();
  buildMarquee();
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
    await initialCards;
    await fetchCatalog();
    if (session && startupProbabilityRoute) {
      chooseGame(startupProbabilityRoute === "aikatsu" ? "aikatsu" : "aipri");
      if (startupProbabilityRoute !== "aikatsu")
        chooseFamily(
          startupProbabilityRoute === "onegai" ? "おねがい" : "ひみつ",
        );
      openProbabilities();
    }
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
function validAlbumID(value) {
  const id = value.normalize("NFKC").trim().toUpperCase();
  return (
    /^(?:[A-HJ-NP-Z0-9]{8}|[A-HJ-NP-Z0-9]{12})$/.test(id) &&
    [...new Set(id)].every((c) => [...id].filter((x) => x === c).length <= 3)
  );
}
function validateAuthForm() {
  const identifier = $("email").value.trim();
  const isEmail = identifier.includes("@");
  const emailError = !identifier
    ? "アルバムIDを入力してください。"
    : isEmail
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)
        ? ""
        : "メールアドレスの形式を確認してください。"
      : !validAlbumID(identifier)
        ? "アルバムIDを確認してください。"
        : "";
  const passwordError = !$("password").value
    ? "パスワードを入力してください。"
    : $("password").value.length < 8
      ? "パスワードは8文字以上で入力してください。"
      : "";
  for (const [id, message] of [
    ["email", emailError],
    ["password", passwordError],
  ]) {
    $(id + "-error").textContent = message;
    $(id + "-error").hidden = !message;
    $(id).setAttribute("aria-invalid", String(!!message));
  }
  if (emailError || passwordError) {
    $(emailError ? "email" : "password").focus();
    return false;
  }
  return true;
}
for (const id of ["nickname", "email", "password"])
  $(id).addEventListener("input", () => {
    $(id + "-error").hidden = true;
    $(id).removeAttribute("aria-invalid");
  });
async function albumAuth(body) {
  const { data, error } = await db.functions.invoke("album-auth", { body });
  if (error) {
    let message =
      "認証できませんでした。album-authの登録と設定を確認してください。";
    try {
      message = (await error.context.clone().json()).error || message;
    } catch {}
    throw Error(message);
  }
  if (!data || data.error) throw Error(data?.error || "認証できませんでした。");
  return data;
}
async function applyAlbumSession(result) {
  const { error } = await db.auth.setSession(result.session);
  if (error) throw error;
  albumIdentity = result.album_id;
  $("account-album-id").textContent = "アルバムID：" + albumIdentity;
}
$("auth-form").onsubmit = async (event) => {
  event.preventDefault();
  if (!db || !validateAuthForm()) return;
  $("auth-submit").disabled = true;
  try {
    const result = await albumAuth({
      action: $("email").value.includes("@") ? "legacy" : "login",
      album_id: $("email").value.normalize("NFKC").trim().toUpperCase(),
      email: $("email").value.trim(),
      password: $("password").value,
    });
    await applyAlbumSession(result);
    $("password").value = "";
  } catch (error) {
    $("auth-message").textContent = error.message;
  } finally {
    $("auth-submit").disabled = false;
  }
};
function updateLoginIdentifier() {
  const isEmail = $("email").value.includes("@");
  $("forgot").hidden = mode !== "login";
  $("resend").hidden = mode !== "login" || !isEmail || !pendingSignupEmail;
}
$("email").addEventListener("input", updateLoginIdentifier);
function renderSignupStep(step) {
  resetPasswordVisibility();
  signupStep = step;
  $("signup-id-step").hidden = step !== "id";
  $("signup-password-form").hidden = step !== "password";
  $("signup-nickname-form").hidden = step !== "nickname";
  document
    .querySelectorAll("[data-signup-marker]")
    .forEach((el) =>
      el.classList.toggle("active", el.dataset.signupMarker === step),
    );
  $("issue-album-id").hidden = !!signupReservation;
  $("signup-password-start").hidden = !signupReservation;
  $("issued-id-panel").hidden = !signupReservation;
  $("issued-album-id").textContent = signupReservation?.album_id || "";
  $("signup-password-start").disabled = !signupReservation || signupBusy;
  document
    .querySelectorAll(".signup-id-reference")
    .forEach(
      (el) =>
        (el.textContent = "アルバムID：" + (signupReservation?.album_id || "")),
    );
  $("signup-message").textContent = "";
}
async function copyAlbumID(id) {
  if (!id) return;
  try {
    await navigator.clipboard.writeText(id);
    toast("アルバムIDをコピーしました");
  } catch {
    toast("コピーできませんでした。表示されたIDを保存してください。");
  }
}
$("issue-album-id").onclick = async () => {
  if (!db || signupBusy) return;
  signupBusy = true;
  $("issue-album-id").disabled = true;
  try {
    signupReservation = await albumAuth({ action: "reserve" });

    renderSignupStep("id");
  } catch (error) {
    $("signup-message").textContent = error.message;
  } finally {
    signupBusy = false;
    $("issue-album-id").disabled = false;
    $("signup-password-start").disabled = !signupReservation;
  }
};
$("album-id-copy").onclick = () => copyAlbumID(signupReservation?.album_id);
$("signup-password-start").onclick = () => {
  if (signupReservation) renderSignupStep("password");
};
$("signup-back-id").onclick = () => renderSignupStep("id");

$("signup-password-form").onsubmit = (event) => {
  event.preventDefault();
  const password = $("signup-password").value,
    confirm = $("signup-password-confirm").value;
  const error =
    password.length < 8 || password.length > 128
      ? "パスワードを8〜128文字で入力してください。"
      : password !== confirm
        ? "パスワードが一致していません。"
        : "";
  $("signup-password-error").textContent = error;
  $("signup-password-error").hidden = !error;
  if (!error) renderSignupStep("nickname");
};
$("signup-nickname-form").onsubmit = async (event) => {
  event.preventDefault();
  if (!db || signupBusy || !signupReservation) return;
  const nick = $("nickname").value.trim();
  const error =
    !nick || nick.length > 20
      ? "ニックネームを1〜20文字で入力してください。"
      : /@|https?:\/\/|(?:\d[\s-]*){7,}/i.test(nick) ||
          !$("nickname-privacy-ack").checked
        ? "個人情報を含まないことを確認してください。"
        : "";
  $("nickname-error").textContent = error;
  $("nickname-error").hidden = !error;
  if (error) return;
  signupBusy = true;
  $("album-create").disabled = true;
  authResultShowing = true;
  try {
    const result = await albumAuth({
      action: "create",
      album_id: signupReservation.album_id,
      reservation_token: signupReservation.reservation_token,
      password: $("signup-password").value,
      nickname: nick,
      personal_info_ack: true,
    });
    await applyAlbumSession(result);
    signupReservation = null;
    try {
      localStorage.removeItem("card-album-id-reservation");
    } catch {}
    $("signup-password").value = $("signup-password-confirm").value = "";
    authResult(
      true,
      "アルバムIDを保存してください。\n保存したIDとパスワードでログインできます。",
    );
    $("auth-result-title").textContent = nick + "のアルバムを作成しました！";
    $("auth-result-album-id").textContent = result.album_id;
    $("auth-result-album-id").hidden = false;
    $("auth-result-retention").hidden = false;
    $("auth-result-next").textContent = "アルバムを開く";
  } catch (error) {
    authResultShowing = false;
    $("signup-message").textContent = error.message;
  } finally {
    signupBusy = false;
    $("album-create").disabled = false;
  }
};
async function loadAlbumIdentity() {
  const uid = session?.user.id;
  if (!uid) return;
  const { data, error } = await db.rpc("card_album_my_id");
  if (uid !== session?.user.id) return;
  if (error) {
    $("account-id-message").textContent =
      "アルバムIDの設定を確認できませんでした。時間をおいて再度お試しください。";
    return;
  }
  albumIdentity = data;
  $("account-id-value").textContent = data;
  $("account-album-id").textContent = "アルバムID：" + data;
}
$("album-id-open").onclick = async () => {
  if (!session) return;
  closeMenu();
  $("account-id-message").textContent = "";
  await loadAlbumIdentity();
  $("album-id-dialog").showModal();
};
$("album-id-close").onclick = () => $("album-id-dialog").close();
$("account-id-copy").onclick = () => copyAlbumID(albumIdentity);
$("forgot").onclick = async () => {
  if (!db) return;
  const email = $("email").value.trim();
  if (!email.includes("@")) {
    $("id-password-help").showModal();
    return;
  }
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirect("recovery"),
  });
  $("auth-message").textContent = error
    ? translatedError(error)
    : "パスワード再設定メールを送信しました。";
};
$("id-password-help-close").onclick = () => $("id-password-help").close();
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
let accountActionBusy = false;
function setAccountBusy(busy) {
  accountActionBusy = busy;
  for (const button of $("logout-dialog").querySelectorAll("button"))
    button.disabled = busy;
  $("account-delete-word").disabled = busy;
  if (!busy)
    $("account-delete-confirm").disabled =
      $("account-delete-word").value.trim() !== "削除";
}
function accountDeleteView(show) {
  $("logout-normal").hidden = show;
  $("account-delete-panel").hidden = !show;
  $("logout-title").textContent = show
    ? "アカウント情報を削除"
    : "ログアウトしますか？";
  $("account-action-message").textContent = "";
  $("account-delete-word").value = "";
  $("account-delete-confirm").disabled = true;
  if (show) $("account-delete-word").focus();
}
$("logout").onclick = () => {
  if (!session || accountActionBusy) return;
  closeMenu();
  setAccountBusy(false);
  accountDeleteView(false);
  $("logout-account").textContent =
    session.user.user_metadata?.nickname || session.user.email || "";
  $("logout-dialog").showModal();
};
for (const id of ["logout-close"])
  $(id).onclick = () => {
    if (!accountActionBusy) $("logout-dialog").close();
  };
$("logout-dialog").addEventListener("cancel", (event) => {
  if (accountActionBusy) event.preventDefault();
});
$("account-delete-open").onclick = () => accountDeleteView(true);
$("account-delete-back").onclick = () => accountDeleteView(false);
$("account-delete-word").oninput = () => {
  $("account-delete-confirm").disabled =
    accountActionBusy || $("account-delete-word").value.trim() !== "削除";
};
$("logout-confirm").onclick = async () => {
  if (accountActionBusy) return;
  setAccountBusy(true);
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;
    $("logout-dialog").close();
    await authChanged("SIGNED_OUT", null);
  } catch (error) {
    $("account-action-message").textContent = translatedError(error);
  } finally {
    setAccountBusy(false);
  }
};
$("account-delete-confirm").onclick = async () => {
  if (
    accountActionBusy ||
    !session ||
    $("account-delete-word").value.trim() !== "削除"
  )
    return;
  setAccountBusy(true);
  $("account-action-message").textContent = "アカウントを削除しています…";
  try {
    const { data, error } = await db.functions.invoke("account-delete", {
      body: { confirmation: "DELETE_MY_ACCOUNT" },
    });
    if (error || !data?.deleted)
      throw Error(
        "削除できませんでした。account-delete の登録・設定を確認してください。",
      );
    await db.auth.signOut({ scope: "local" });
    $("logout-dialog").close();
    await authChanged("SIGNED_OUT", null);
    toast("アカウントを削除しました");
  } catch (error) {
    $("account-action-message").textContent = translatedError(error);
  } finally {
    setAccountBusy(false);
  }
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
$("filters").onclick = (e) => {
  const button = e.target.closest("[data-clear-filter]");
  if (!button) return;
  delete filters[button.dataset.clearFilter];
  page = 1;
  fillFilters();
  render();
};
$("active-filters").onclick = (event) => {
  const button = event.target.closest("[data-remove-condition]");
  if (!button) return;
  const key = button.dataset.removeCondition;
  if (key === "query") $("query").value = "";
  else if (key === "ownership") ownershipFilter = "all";
  else delete filters[key];
  page = 1;
  fillFilters();
  render();
};
$("clear-query").onclick = () => {
  $("query").value = "";
  page = 1;
  render();
};
$("progress-details").onclick = () => {
  const expanded = $("series-progress").hidden;
  $("series-progress").hidden = !expanded;
  $("progress-details").setAttribute("aria-expanded", String(expanded));
  $("progress-details").innerHTML =
    '<span class="progress-chevron" aria-hidden="true"></span>';
  $("progress-details").setAttribute(
    "aria-label",
    expanded ? "弾ごとの取得率を閉じる" : "弾ごとの取得率を表示",
  );
  if (expanded) renderSeriesProgress();
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
$("cards").addEventListener(
  "load",
  (event) => {
    const image = event.target;
    if (!image.matches?.("img[data-card-image]")) return;
    const id = image.closest("[data-detail]")?.dataset.detail;
    const card = catalog.cards.find((c) => c.id === id);
    image.parentElement.classList.toggle(
      "landscape",
      card?.game === "aikatsu" && image.naturalWidth > image.naturalHeight,
    );
  },
  true,
);
$("cards").onclick = (e) => {
  const detail = e.target.closest("[data-detail]"),
    toggleButton = e.target.closest("[data-toggle]");
  if (detail) openDetail(detail.dataset.detail, detail);
  if (toggleButton) toggle(toggleButton.dataset.toggle);
};
$("page-size").onchange = () => {
  const value = $("page-size").value;
  if (!["20", "50", "100", "all"].includes(value)) return;
  pageSize = value === "all" ? "all" : Number(value);
  page = 1;
  render();
};
$("page-numbers").onclick = (event) => {
  const button = event.target.closest("[data-page]");
  if (!button) return;
  page = Number(button.dataset.page);
  render();
  $("cards").scrollIntoView({ block: "start" });
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
  const probabilitiesOpen = !$("probabilities").hidden;
  $("probability-open").hidden = !session || !game || probabilitiesOpen;
  $("probability-back").hidden = !session || !game || !probabilitiesOpen;
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
  if (/@|https?:\/\/|(?:\d[\s-]*){7,}/i.test(value)) {
    $("nickname-message").textContent =
      "個人情報を含まないニックネームにしてください。";
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
    loadAlbumIdentity().catch(() => {});
    $("nickname-dialog").close();
    toast("ニックネームを保存しました");
  } catch (e) {
    $("nickname-message").textContent = translatedError(e);
  } finally {
    $("nickname-save").disabled = false;
  }
};

$("resend").hidden = !pendingSignupEmail;

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
  return c.game === "aikatsu"
    ? (!c.name && !!c.front) || (!c.character && !!c.back)
    : !c.songs?.length && !!c.back;
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
  const visibleCards = filtered();
  const size = getPageSize(visibleCards.length);
  const candidates = visibleCards
    .slice((page - 1) * size, page * size)
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
  const imageSide =
    c.game === "aikatsu" && part !== "character" ? "front" : "back";
  if (!c[imageSide]) return false;
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
    side: imageSide,
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
  } else if (!c.songs?.length && c.back)
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
const marqueePending = new Map();
let marqueeBootstrapped = false;
let marqueeTimer;
function isOfficialMarqueeCard(card) {
  if (!card?.front || !card.source) return false;
  // アイプリの追加サインカードは一覧に残し、ログインの紹介には使わない。
  if (
    card.game === "aipri" &&
    (/P$/i.test(card.code || "") ||
      card.parallel === true ||
      card.variant === "パラレル" ||
      /サイン|パラレル/.test(card.rarity || ""))
  )
    return false;
  if (
    card.manual === true ||
    card.unofficial === true ||
    /非公式|推測|ネット上|追加収集/.test(card.metadataSource || "")
  )
    return false;
  try {
    const front = new URL(card.front),
      source = new URL(card.source);
    if (front.protocol !== "https:" || source.protocol !== "https:")
      return false;
    if (card.game === "aikatsu")
      return (
        front.hostname === "dcd.aikatsu.com" &&
        source.hostname === "dcd.aikatsu.com" &&
        front.pathname.startsWith("/encore/") &&
        source.pathname.startsWith("/encore/cardlist")
      );
    if (card.game === "aipri")
      return (
        front.hostname === "aipri.jp" &&
        source.hostname === "aipri.jp" &&
        /^\/(?:himitsu\/)?card\//.test(front.pathname) &&
        /^\/(?:himitsu\/)?card\//.test(source.pathname)
      );
  } catch {
    return false;
  }
  return false;
}
function nextMarqueeCard(group) {
  const available = catalog.cards.filter(
    (c) => c.game === group && isOfficialMarqueeCard(c),
  );
  if (!available.length) return null;
  if (
    marqueePools[group].length !== available.length ||
    marqueePools[group].some((c) => !available.some((a) => a.id === c.id)) ||
    marqueePositions[group] >= marqueePools[group].length
  ) {
    marqueePools[group] = shuffleCards(available);
    marqueePositions[group] = 0;
  }
  const candidate = marqueePools[group][marqueePositions[group]++];
  const current = catalog.cards.find((c) => c.id === candidate.id);
  return current && isOfficialMarqueeCard(current) ? current : null;
}
function marqueePair(index) {
  return [...$("auth-art").querySelectorAll(".marquee-group")]
    .map((group) => group.children[index])
    .filter(Boolean);
}
function marqueeOutside(pair) {
  const bounds = $("auth-art").getBoundingClientRect();
  if (!bounds.width || pair.length !== 2) return false;
  return pair.every((button) => {
    const box = button.getBoundingClientRect();
    return box.right <= bounds.left || box.left >= bounds.right;
  });
}
function commitMarqueeCard(index, entry) {
  if (
    !entry.ready ||
    !isOfficialMarqueeCard(
      catalog.cards.find((c) => c.id === entry.card.id) || entry.card,
    ) ||
    marqueePaused ||
    $("detail").open ||
    $("auth").hidden ||
    document.hidden
  )
    return false;
  const pair = marqueePair(index);
  if (!marqueeOutside(pair)) return false;
  for (const button of pair) {
    button.dataset.preview = entry.card.id;
    button.setAttribute(
      "aria-label",
      (entry.card.name || entry.card.code) + "の詳細",
    );
    const image = button.querySelector("img");
    prepareMarqueeImage(image, entry.card);
    image
      .closest(".marquee-image-frame")
      .classList.toggle(
        "landscape",
        entry.card.game === "aikatsu" &&
          entry.image.naturalWidth > entry.image.naturalHeight,
      );
    const isLandscape =
      entry.card.game === "aikatsu" &&
      entry.image.naturalWidth > entry.image.naturalHeight;
    const frame = image.closest(".marquee-image-frame");
    const width = isLandscape
      ? entry.image.naturalHeight
      : entry.image.naturalWidth;
    const height = isLandscape
      ? entry.image.naturalWidth
      : entry.image.naturalHeight;
    if (width && height) {
      frame.style.aspectRatio = width + " / " + height;
      frame.style.setProperty("--image-ratio", String(height / width));
    }
    image.src = entry.image.src;
    image.alt = entry.card.name || entry.card.code;
    image.removeAttribute("fetchpriority");
  }
  // このカードが画面に現れてから外へ流れるまで、再交換しない。
  marqueePending.set(index, { shown: false });
  return true;
}
function pumpMarquee() {
  if (
    !catalogFallback ||
    marqueePaused ||
    $("detail").open ||
    $("auth").hidden ||
    document.hidden
  )
    return;
  const groups = $("auth-art").querySelectorAll(".marquee-group");
  if (groups.length !== 2) return;
  let loading = [...marqueePending.values()].filter(
    (entry) => entry.image && !entry.ready,
  ).length;
  for (let index = 0; index < groups[0].children.length; index++) {
    const pair = marqueePair(index);
    let entry = marqueePending.get(index);
    if (entry && !entry.card) {
      if (!marqueeOutside(pair)) entry.shown = true;
      if (entry.shown && marqueeOutside(pair)) {
        marqueePending.delete(index);
        entry = null;
      } else continue;
    }
    if (entry) {
      commitMarqueeCard(index, entry);
      continue;
    }
    if (loading >= 6 || !marqueeOutside(pair)) continue;
    const primary = index % 2 ? "aipri" : "aikatsu";
    let card =
      nextMarqueeCard(primary) ||
      nextMarqueeCard(primary === "aipri" ? "aikatsu" : "aipri");
    if (!card) continue;
    if (pair[0].dataset.preview === card.id)
      card = nextMarqueeCard(card.game) || card;
    const image = new Image();
    entry = { card, image, ready: false };
    marqueePending.set(index, entry);
    loading++;
    image.onload = async () => {
      try {
        if (image.decode) await image.decode();
      } catch {}
      if (marqueePending.get(index) !== entry) return;
      entry.ready = true;
      commitMarqueeCard(index, entry);
    };
    image.onerror = () => {
      if (marqueePending.get(index) === entry) marqueePending.delete(index);
    };
    image.src = card.front;
  }
}
function prepareMarqueeImage(image, card) {
  let frame = image.closest(".marquee-image-frame");
  if (!frame) {
    frame = document.createElement("span");
    frame.className = "marquee-image-frame";
    image.replaceWith(frame);
    frame.append(image);
  }
  const landscape =
    card?.game === "aikatsu" && image.naturalWidth > image.naturalHeight;
  frame.classList.toggle("landscape", landscape);
  if (image.naturalWidth && image.naturalHeight) {
    const width = landscape ? image.naturalHeight : image.naturalWidth;
    const height = landscape ? image.naturalWidth : image.naturalHeight;
    frame.style.aspectRatio = width + " / " + height;
    frame.style.setProperty("--image-ratio", String(height / width));
  }
}
$("auth-art").addEventListener(
  "load",
  (event) => {
    const image = event.target;
    if (!image.matches?.(".marquee-card img")) return;
    const card = catalog.cards.find(
      (c) => c.id === image.closest(".marquee-card").dataset.preview,
    );
    prepareMarqueeImage(image, card);
  },
  true,
);
function buildMarquee() {
  const groups = $("auth-art").querySelectorAll(".marquee-group");
  if (groups.length !== 2) return;
  if (!marqueeBootstrapped) {
    const cards = shuffleCards([...groups[0].children]);
    groups[0].replaceChildren(...cards);
    groups[1].replaceChildren(
      ...cards.map((button) => {
        const clone = button.cloneNode(true);
        clone.tabIndex = -1;
        return clone;
      }),
    );
    marqueeBootstrapped = true;
    marqueeTimer = setInterval(pumpMarquee, 500);
  }
  $("auth-art")
    .querySelectorAll(".marquee-card img")
    .forEach((image) => {
      const card = catalog.cards.find(
        (c) => c.id === image.closest(".marquee-card").dataset.preview,
      );
      prepareMarqueeImage(image, card);
    });
  // 読み込み完了時点から、画像を先読みして画面外のカードを交換する。
  pumpMarquee();
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
      closeMenu();
      $("info-dialog").classList.toggle(
        "help-dialog",
        button.dataset.info === "help",
      );
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

function regularSeries(card) {
  if (
    /^(?:EP|P)-/i.test(card.code || "") ||
    /\/(?:special|promo)(?:[/.?]|$)/i.test(card.source || "")
  )
    return [];
  return values(card.series).filter(
    (label) =>
      seriesRank(label) >= 0 &&
      !/special|スペシャル|プロモ|promo|グミ|ミルフィ|メモリアル/i.test(label),
  );
}
function rarityOrder(rare) {
  const order =
    game === "aikatsu"
      ? ["ER", "PR", "R", "N", "パラレル"]
      : ["パラレル", "ミラクル", "★4", "★3", "★2", "★1"];
  return order.includes(rare) ? order.indexOf(rare) : 99;
}
function displayRarity(c) {
  if (c.game === "aipri") {
    const code = String(c.code || "")
      .normalize("NFKC")
      .trim()
      .toUpperCase();
    if (code.endsWith("P")) return "パラレル";
    if (code.includes("M")) return "ミラクル";
  }
  return c.rarity || "記載なし";
}
function incompleteCard(c) {
  return (
    !c.name ||
    !c.character ||
    displayRarity(c) === "記載なし" ||
    (c.game === "aipri" && !c.songs?.length)
  );
}
function probabilitySummary(cards) {
  const counts = new Map([["パラレル", 0]]);
  for (const card of cards) {
    const parallel =
      card.parallel === true ||
      card.variant === "パラレル" ||
      card.rarity === "パラレル" ||
      (card.game === "aipri" && /P$/i.test(card.code || "")) ||
      /(^|:)parallel:/.test(card.id || "");
    const rarity = parallel
      ? "パラレル"
      : displayRarity(card) === "記載なし"
        ? "未分類"
        : displayRarity(card);
    counts.set(rarity, (counts.get(rarity) || 0) + quantityOf(card.id));
  }
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return {
    total,
    rows: [...counts]
      .sort(
        ([a], [b]) =>
          rarityOrder(a) - rarityOrder(b) || a.localeCompare(b, "ja"),
      )
      .map(([rarity, count]) => ({
        rarity,
        count,
        rate: total ? (count / total) * 100 : 0,
      })),
  };
}
function rarityColor(rarity) {
  return (
    {
      ER: "#ef88b1",
      PR: "#efb96f",
      R: "#74c2d3",
      N: "#a3b9c9",
      パラレル: "#b393e7",
      ミラクル: "#e2ba51",
      "★4": "#78bcec",
      "★3": "#80c79d",
      "★2": "#f49a86",
      "★1": "#a8b8c5",
    }[rarity] || "#b7bbc1"
  );
}
function probabilityMarkup(summary) {
  const label = summary.total
    ? summary.rows
        .map((row) => `${row.rarity} ${row.rate.toFixed(1)}%`)
        .join("、")
    : "所持枚数が未登録です";
  return `<div class="distribution-bar" role="img" aria-label="${esc(label)}">${summary.rows.map((row) => `<span class="distribution-segment" style="width:${row.rate}%;background:${rarityColor(row.rarity)}" title="${esc(row.rarity)} ${row.rate.toFixed(1)}%"><span class="segment-label">${row.count ? esc(row.rarity === "パラレル" ? "☆" : row.rarity === "ミラクル" ? "M" : row.rarity) : ""}</span></span>`).join("")}</div><table class="probability-table"><thead><tr><th scope="col">レアリティ</th><th scope="col">所持数</th><th scope="col">割合</th></tr></thead><tbody>${summary.rows.map((row) => `<tr><th scope="row"><span class="rarity-dot" style="background:${rarityColor(row.rarity)}" aria-hidden="true"></span>${esc(row.rarity)}</th><td>${row.count.toLocaleString("ja-JP")}枚</td><td>${summary.total ? row.rate.toFixed(1) + "%" : "—"}</td></tr>`).join("")}</tbody></table>`;
}
function renderProbabilities() {
  if (!session || !game) return;
  const cards = albumCards().filter((card) => regularSeries(card).length);
  const series = [...new Set(cards.flatMap(regularSeries))].sort(
    (a, b) =>
      seriesRank(b) - seriesRank(a) ||
      a.localeCompare(b, "ja", { numeric: true }),
  );
  const current = $("probability-series").value;
  $("probability-series").innerHTML = series
    .map((label) => `<option value="${esc(label)}">${esc(label)}</option>`)
    .join("");
  if (series.includes(current)) $("probability-series").value = current;
  const label = $("probability-series").value;
  const overall = probabilitySummary(cards);
  const detail = probabilitySummary(
    cards.filter((card) => regularSeries(card).includes(label)),
  );
  $("probability-title").textContent =
    (game === "aikatsu"
      ? "アイカツ！アンコール"
      : aipriFamily === "おねがい"
        ? "おねがいアイプリ"
        : "ひみつのアイプリ") + "の確率確認";
  $("probability-overall").innerHTML = probabilityMarkup(overall);
  $("probability-detail-cards").innerHTML = probabilityMarkup(detail);
  $("probability-total").textContent = ownershipReady
    ? `集計した所持数 ${overall.total.toLocaleString("ja-JP")}枚`
    : "所持データを読み込み中";
  $("probability-detail-total").textContent = ownershipReady
    ? `${label || "対象の弾数なし"} · 所持数 ${detail.total.toLocaleString("ja-JP")}枚`
    : "所持データを読み込み中";
  const showCost = $("show-cost").checked && ownershipReady;
  $("probability-overall-cost").hidden = $("probability-detail-cost").hidden =
    !showCost;
  $("probability-overall-cost").textContent =
    `シリーズ総合の利用金額目安 ${(overall.total * 100).toLocaleString("ja-JP")}円`;
  $("probability-detail-cost").textContent =
    `選択した弾の利用金額目安 ${(detail.total * 100).toLocaleString("ja-JP")}円`;
}
function openProbabilities() {
  if (!session || !game) return;
  closeMenu();
  $("show-cost").checked = false;
  $("probability-series").value = "";
  screen("probabilities");
  renderProbabilities();
  history.replaceState(
    null,
    "",
    "#probabilities-" +
      (game === "aikatsu"
        ? "aikatsu"
        : aipriFamily === "おねがい"
          ? "onegai"
          : "himitsu"),
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("probability-open").onclick = openProbabilities;
$("probability-back").onclick = () => {
  screen("collection");
  render();
  history.replaceState(null, "", "#" + game);
};
$("probability-series").onchange = renderProbabilities;
$("show-cost").onchange = renderProbabilities;
$("quantity-plus").onclick = () => selected && saveQuantity(selected.id, 1);
$("quantity-minus").onclick = () => selected && saveQuantity(selected.id, -1);
document.addEventListener("click", (event) => {
  const button = event.target.closest("dialog button");
  if (!button || button.disabled) return;
  button.classList.remove("tap-feedback");
  void button.offsetWidth;
  button.classList.add("tap-feedback");
  setTimeout(() => button.classList.remove("tap-feedback"), 220);
});
window.matchMedia?.("(max-width: 760px)").addEventListener?.("change", () => {
  if (game) render();
});
function passwordEyeIcon(visible) {
  const slash = visible ? '<path d="m3 3 18 18" />' : "";
  return (
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>' +
    slash +
    "</svg>"
  );
}
function resetPasswordVisibility() {
  document.querySelectorAll(".password-visibility").forEach((button) => {
    const input = $(button.getAttribute("aria-controls"));
    input.type = "password";
    button.innerHTML = passwordEyeIcon(false);
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "パスワードを表示");
  });
}
for (const input of document.querySelectorAll('input[type="password"]')) {
  const wrapper = document.createElement("span");
  wrapper.className = "password-input-wrap";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(input);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "password-visibility";
  button.innerHTML = passwordEyeIcon(false);
  button.setAttribute("aria-controls", input.id);
  button.setAttribute("aria-label", "パスワードを表示");
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("pointerdown", (e) => e.preventDefault());
  button.addEventListener("click", (e) => {
    e.preventDefault();
    const start = input.selectionStart,
      end = input.selectionEnd;
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.innerHTML = passwordEyeIcon(reveal);
    button.setAttribute("aria-pressed", String(reveal));
    button.setAttribute(
      "aria-label",
      reveal ? "パスワードを隠す" : "パスワードを表示",
    );
    input.focus({ preventScroll: true });
    if (start !== null && end !== null) input.setSelectionRange(start, end);
  });
  wrapper.append(button);
}
authMode("login");
init();
