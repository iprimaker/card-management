const albumSessionStorage = (() => {
  const project = new URL(window.APP_CONFIG.supabaseUrl).hostname.split(".")[0];
  const baseKey = `sb-${project}-auth-token`;
  const preferenceKey = `${baseKey}-remember`;
  const memory = new Map();
  function read(area, key) {
    try {
      return window[area].getItem(key);
    } catch {
      return memory.get(`${area}:${key}`) ?? null;
    }
  }
  function write(area, key, value) {
    memory.set(`${area}:${key}`, value);
    try {
      window[area].setItem(key, value);
    } catch {}
  }
  function remove(area, key) {
    memory.delete(`${area}:${key}`);
    try {
      window[area].removeItem(key);
    } catch {}
  }
  function remembered() {
    const tabChoice = read("sessionStorage", preferenceKey);
    if (tabChoice !== null) return tabChoice !== "false";

    if (read("localStorage", baseKey)) return true;
    return read("localStorage", preferenceKey) !== "false";
  }
  function choose(value) {
    write("sessionStorage", preferenceKey, String(value));
    write("localStorage", preferenceKey, String(value));
  }
  function options(remember = remembered()) {
    const area = remember ? "localStorage" : "sessionStorage";

    const storageKey = remember ? baseKey : `${baseKey}-private-${crypto.randomUUID()}`;
    const savedKey = remember ? baseKey : `${baseKey}-session`;
    const mapKey = (key) => savedKey + key.slice(storageKey.length);
    return {
      persistSession: true,
      autoRefreshToken: true,
      storageKey,
      storage: {
        getItem: (key) => read(area, mapKey(key)),
        setItem: (key, value) => write(area, mapKey(key), value),
        removeItem: (key) => remove(area, mapKey(key)),
      },
    };
  }
  return { remembered, choose, options };
})();

const revealStates = new WeakMap();
function resetReveal(element, hidden) {
  const state = revealStates.get(element);
  state?.animation?.cancel();
  revealStates.delete(element);
  element.hidden = hidden;
  if (state) {
    element.style.overflow = state.overflow;
    element.style.boxSizing = state.boxSizing;
  }
}
function animateReveal(element, expanded, completed) {
  const previous = revealStates.get(element);
  const fromHeight = previous?.animation
    ? element.getBoundingClientRect().height
    : expanded
      ? 0
      : element.getBoundingClientRect().height;
  const fromOpacity = previous?.animation
    ? getComputedStyle(element).opacity
    : expanded
      ? "0"
      : "1";
  previous?.animation?.cancel();
  element.hidden = false;
  const overflow = previous?.overflow ?? element.style.overflow;
  const boxSizing = previous?.boxSizing ?? element.style.boxSizing;
  const state = { expanded, animation: null, overflow, boxSizing };
  revealStates.set(element, state);
  const finish = () => {
    if (revealStates.get(element) !== state) return;
    state.animation?.cancel();
    state.animation = null;
    element.hidden = !expanded;
    element.style.overflow = overflow;
    element.style.boxSizing = boxSizing;
    completed?.();
  };
  if (!element.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }
  const fullHeight = element.getBoundingClientRect().height;
  element.style.overflow = "hidden";
  element.style.boxSizing = "border-box";
  try {
    state.animation = element.animate(
      [
        { height: fromHeight + "px", opacity: fromOpacity },
        { height: (expanded ? fullHeight : 0) + "px", opacity: expanded ? "1" : "0" },
      ],
      { duration: 220, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" },
    );
    state.animation.onfinish = finish;
  } catch {
    finish();
  }
}

const coordinateStylesheetURL = new URL(
  "../css/aikatsu-coordinates.css?v=20261012-coordinate-display",
  document.currentScript?.src || location.href,
).href;
let coordinatePanel = null;
let coordinateSeries = "all";
let coordinateRenderKey = "";
let coordinateExcludeSingle = false;
let coordinateAPOrder = false;
let coordinateCollectionFilter = "all";
let backToTopButton = null;

function ensureCoordinateStyles() {
  if (document.getElementById("coordinate-stylesheet")) return;
  const link = document.createElement("link");
  link.id = "coordinate-stylesheet";
  link.rel = "stylesheet";
  link.href = coordinateStylesheetURL;
  document.head.append(link);
}

function syncBackToTop() {
  ensureCoordinateStyles();
  if (!backToTopButton) {
    backToTopButton = document.createElement("button");
    backToTopButton.id = "album-back-to-top";
    backToTopButton.type = "button";
    backToTopButton.className = "album-back-to-top";
    backToTopButton.setAttribute("aria-label", "ページ上部に戻る");
    backToTopButton.title = "ページ上部に戻る";
    backToTopButton.innerHTML = '<span aria-hidden="true">↑</span>';
    backToTopButton.hidden = true;
    backToTopButton.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
    document.body.append(backToTopButton);
    let scheduled = false;
    window.addEventListener(
      "scroll",
      () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          syncBackToTop();
        });
      },
      { passive: true },
    );
  }
  const visibleAlbum = document.querySelector(
    "#collection:not([hidden]), #probabilities:not([hidden]), #verse:not([hidden])",
  );
  const hidden = !visibleAlbum || window.scrollY < 320;

  if (backToTopButton.hidden !== hidden) backToTopButton.hidden = hidden;
}

function isSingleFullCoordinate(group) {
  return (
    group.total === 1 &&
    group.members.length === 1 &&
    values(group.members[0]?.category).includes("フルコーデ")
  );
}

function cardAP(card) {
  const ap = card?.ap;
  return typeof ap === "number" && Number.isInteger(ap) && ap >= 0 ? ap : null;
}

function coordinateGroups(cards, ownership, ready, series = "all") {
  const byID = new Map(cards.map((card) => [card.id, card]));
  const definitions = new Map();
  for (const card of cards) {
    for (const definition of values(card.coordinateDefinitions)) {
      if (
        !definition ||
        typeof definition.id !== "string" ||
        !Array.isArray(definition.cardIds) ||
        definition.cardIds.length > 4
      )
        continue;
      definitions.set(definition.id, definition);
    }
  }
  return [...definitions.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((definition) => series === "all" || values(definition.series).includes(series))
    .map((definition) => {
      const ids = [...new Set(definition.cardIds)].slice(0, 4);
      const members = ids.map((id) => byID.get(id) || null);
      const missing = values(definition.missingParts).slice(0, 4 - ids.length);
      const total = ids.length + missing.length;
      const got = ready ? ids.filter((id) => ownership.has(id)).length : 0;
      const complete = ready && total > 0 && got === total && members.every(Boolean);
      const allAPKnown = missing.length === 0 && members.every((card) => cardAP(card) !== null);
      const ap = allAPKnown ? members.reduce((sum, card) => sum + cardAP(card), 0) : null;
      const acquiredAP = ready
        ? members.reduce(
            (sum, card) => sum + (card && ownership.has(card.id) ? cardAP(card) || 0 : 0),
            0,
          )
        : null;
      return { ...definition, members, missing, total, got, complete, ap, acquiredAP };
    });
}

function mountCoordinatePanel() {
  if (coordinatePanel?.isConnected) return coordinatePanel;
  const collection = $("collection");
  if (!collection) return null;
  ensureCoordinateStyles();
  coordinatePanel = document.createElement("details");
  coordinateRenderKey = "";
  coordinatePanel.id = "coordinate-panel";
  coordinatePanel.className = "coordinate-panel";
  coordinatePanel.innerHTML = `
    <summary><span class="coordinate-summary-title">コーデ収集状況</span>
      <span id="coordinate-summary-count" class="coordinate-summary-count"></span>
      <span class="coordinate-chevron" aria-hidden="true"></span></summary>
    <div class="coordinate-body">
      <div class="coordinate-toolbar"><label for="coordinate-series">弾数</label>
        <select id="coordinate-series" aria-label="コーデの弾数"><option value="all">すべて</option></select>
        <span id="coordinate-visible-count" role="status"></span></div>
      <div class="coordinate-options"><button id="coordinate-exclude-single" type="button" aria-pressed="false">1枚フルコーデを除く</button><button id="coordinate-ap-order" type="button" aria-pressed="false">APの高い順</button><button id="coordinate-complete-only" type="button" aria-pressed="false">完成コーデのみ</button><button id="coordinate-one-away" type="button" aria-pressed="false">あと1枚で完成</button></div>
      <div id="coordinate-list" class="coordinate-list"></div>
      <p id="coordinate-empty" class="coordinate-empty" hidden>該当するコーデがありません。</p>
      <p class="coordinate-footnote">合計APは各カード1枚分の合計です。ゲーム内のボーナスは含みません。</p>
    </div>`;
  const anchor = $("filter-panel");
  if (anchor) anchor.before(coordinatePanel);
  else collection.append(coordinatePanel);
  coordinatePanel.querySelector("summary").addEventListener("click", (event) => {
    event.preventDefault();
    const body = coordinatePanel.querySelector(".coordinate-body");
    const expanded = !(revealStates.get(body)?.expanded ?? coordinatePanel.open);
    if (expanded) {
      coordinatePanel.open = true;
      renderCoordinates();
    }
    animateReveal(body, expanded, () => {
      if (!expanded) coordinatePanel.open = false;
      body.hidden = false;
    });
  });
  coordinatePanel.addEventListener("toggle", () => {
    if (coordinatePanel.open) renderCoordinates();
  });
  $("coordinate-series").addEventListener("change", () => {
    coordinateSeries = $("coordinate-series").value;
    renderCoordinates();
  });
  $("coordinate-list").addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-coordinate-card]");
    if (trigger) openDetail(trigger.dataset.coordinateCard, trigger);
  });
  $("coordinate-list").addEventListener(
    "load",
    (event) => {
      const image = event.target;
      if (!image.matches?.(".coordinate-card-image img")) return;
      image.parentElement.classList.toggle(
        "is-landscape",
        image.naturalWidth > image.naturalHeight,
      );
    },
    true,
  );
  $("coordinate-exclude-single").addEventListener("click", () => {
    coordinateExcludeSingle = !coordinateExcludeSingle;
    renderCoordinates();
  });
  $("coordinate-ap-order").onclick = () => {
    coordinateAPOrder = !coordinateAPOrder;
    renderCoordinates();
  };
  $("coordinate-complete-only").onclick = () => {
    coordinateCollectionFilter = coordinateCollectionFilter === "complete" ? "all" : "complete";
    renderCoordinates();
  };
  $("coordinate-one-away").onclick = () => {
    coordinateCollectionFilter = coordinateCollectionFilter === "one-away" ? "all" : "one-away";
    renderCoordinates();
  };
  return coordinatePanel;
}

function renderCoordinates() {
  syncBackToTop();
  if (game !== "aikatsu") {
    if (coordinatePanel) coordinatePanel.hidden = true;
    return;
  }
  const panel = mountCoordinatePanel();
  if (!panel) return;
  panel.hidden = false;
  const cards = catalog.cards.filter((card) => card.game === "aikatsu");
  const all = coordinateGroups(cards, owned, ownershipReady);
  const eligible = all.filter(
    (group) => !coordinateExcludeSingle || !isSingleFullCoordinate(group),
  );
  $("coordinate-summary-count").textContent = ownershipReady
    ? `収集済 ${eligible.filter((group) => group.complete).length} ／ 未収集 ${eligible.filter((group) => !group.complete).length}`
    : "所持データを確認中";
  if (!panel.open) return;
  const labels = [...new Set(all.flatMap((group) => values(group.series)))].sort((a, b) =>
    seriesRank(a) < 0
      ? seriesRank(b) < 0
        ? a.localeCompare(b, "ja")
        : 1
      : seriesRank(b) < 0
        ? -1
        : seriesRank(a) - seriesRank(b),
  );
  if (coordinateSeries !== "all" && !labels.includes(coordinateSeries)) coordinateSeries = "all";
  const select = $("coordinate-series");
  const optionsKey = JSON.stringify(labels);
  if (select.dataset.optionsKey !== optionsKey) {
    select.innerHTML =
      '<option value="all">すべて</option>' +
      labels.map((label) => `<option value="${esc(label)}">${esc(label)}</option>`).join("");
    select.dataset.optionsKey = optionsKey;
  }
  select.value = coordinateSeries;
  $("coordinate-exclude-single").setAttribute("aria-pressed", String(coordinateExcludeSingle));
  $("coordinate-ap-order").setAttribute("aria-pressed", String(coordinateAPOrder));
  $("coordinate-complete-only").setAttribute(
    "aria-pressed",
    String(coordinateCollectionFilter === "complete"),
  );
  $("coordinate-one-away").setAttribute(
    "aria-pressed",
    String(coordinateCollectionFilter === "one-away"),
  );
  $("coordinate-complete-only").disabled = $("coordinate-one-away").disabled = !ownershipReady;
  const groups = eligible.filter(
    (group) =>
      (coordinateSeries === "all" || values(group.series).includes(coordinateSeries)) &&
      (coordinateCollectionFilter === "all" ||
        (ownershipReady &&
          (coordinateCollectionFilter === "complete"
            ? group.complete
            : group.total - group.got === 1 &&
              group.members.every(Boolean) &&
              !group.missing.length))),
  );
  if (coordinateAPOrder)
    groups.sort(
      (a, b) =>
        (a.ap === null) - (b.ap === null) || (b.ap ?? 0) - (a.ap ?? 0) || a.id.localeCompare(b.id),
    );
  $("coordinate-visible-count").textContent = `${groups.length}コーデ`;
  $("coordinate-empty").hidden = groups.length > 0;
  const key = JSON.stringify([
    ownershipReady,
    coordinateSeries,
    coordinateExcludeSingle,
    coordinateAPOrder,
    coordinateCollectionFilter,
    groups.map((group) => [
      group.id,
      group.name,
      group.got,
      group.complete,
      group.ap,
      group.missing,
      group.members.map((card) =>
        card ? [card.id, card.name, card.front, card.ap, owned.has(card.id)] : null,
      ),
    ]),
  ]);
  if (key === coordinateRenderKey) return;
  coordinateRenderKey = key;
  $("coordinate-list").innerHTML = groups
    .map(
      (group, groupIndex) => `
    <article class="coordinate-group ${group.complete ? "is-complete" : ""}">
      <div class="coordinate-heading"><h3>${esc(group.name)}</h3>
        <span class="coordinate-completion">${ownershipReady ? `${group.got} / ${group.total}` : "—"}${group.complete ? " 揃いました" : ""}</span></div>
      <div class="coordinate-ap"><span>合計AP</span><strong>${group.ap === null ? "未確認" : group.ap.toLocaleString("ja-JP") + " AP"}</strong></div>
      <div class="coordinate-cards" style="--coordinate-count:${Math.max(1, group.total)}">
        ${group.members
          .map((card, index) =>
            card
              ? `
          <button type="button" class="coordinate-card ${ownershipReady && owned.has(card.id) ? "is-owned" : "is-missing"}"
            data-coordinate-card="${esc(card.id)}" aria-label="${esc(name(card))}：${ownershipReady ? (owned.has(card.id) ? "持っている" : "持っていない") : "所持状況未確認"}。詳細を開く">
            <span class="coordinate-card-image"><img src="${esc(card.front)}" alt="${esc(name(card))}" loading="${groupIndex < 6 ? "eager" : "lazy"}" decoding="async"></span>
          </button>`
              : "",
          )
          .join("")}
        
      </div>
    </article>`,
    )
    .join("");
}

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
    cards: [],
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

const favoriteStylesheet = document.createElement("link");
favoriteStylesheet.rel = "stylesheet";
favoriteStylesheet.href = new URL(
  "../css/favorites.css?v=20261017-mobile-modal-navigation",
  document.currentScript?.src || location.href,
).href;
document.head.append(favoriteStylesheet);
let favorites = new Set();
let favoritesReady = false;
let favoriteFilter = false;
let duplicateFilter = false;
let favoritesGeneration = 0;
let favoritesMutation = 0;
let favoritesCheckedAt = 0;
let favoritesLoadedUser = null;
let favoritesRequest = null;
const favoriteSaving = new Set();
const favoriteStar =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z"/></svg>';
const emptyMessage = $("empty");
if (emptyMessage) {
  emptyMessage.innerHTML = `<strong>見つかりませんでした</strong><span>条件を変えて探してみてください</span>`;
}
let lastManualCatalogRefreshAt = 0;
const catalogRefreshButton = document.createElement("button");
catalogRefreshButton.id = "sync-status";
catalogRefreshButton.type = "button";
catalogRefreshButton.className = "catalog-update-text";
catalogRefreshButton.setAttribute("aria-label", "カード情報を更新する");
$("sync-status").replaceWith(catalogRefreshButton);
catalogRefreshButton.onclick = async () => {
  if (!session || !db || catalogLoading || maintenanceActive) return;
  if (lastManualCatalogRefreshAt && Date.now() - lastManualCatalogRefreshAt < 10000) {
    toast("少し待ってから更新してください");
    return;
  }
  lastManualCatalogRefreshAt = Date.now();
  const uid = session.user.id;
  const succeeded = await fetchCatalog(true);
  if (session?.user.id === uid)
    toast(
      succeeded
        ? "最新のカード情報を確認しました"
        : "カード情報を取得できませんでした。時間をおいてお試しください",
    );
};
function resetFavorites() {
  favoritesGeneration++;
  favoritesMutation++;
  favorites = new Set();
  favoritesReady = false;
  favoriteFilter = duplicateFilter = false;
  window.CARD_TRADE?.clear("card");
  favoritesCheckedAt = 0;
  favoritesLoadedUser = null;
  favoritesRequest = null;
  favoriteSaving.clear();
  updateModalFavorite();
}
function favoriteButton(card) {
  const active = favoritesReady && favorites.has(card.id);
  const label = active ? "お気に入りを解除" : "お気に入りに登録";
  return `<button type="button" class="favorite-button ${active ? "is-favorite" : ""}" data-favorite="${esc(card.id)}" aria-label="${esc(name(card) + "：" + label)}" aria-pressed="${active}" title="${label}" ${!session || !favoritesReady ? "disabled" : ""}>${favoriteStar}</button>`;
}
function favoriteFilterMarkup() {
  return `<label class="favorite-filter"><span class="filter-label">お気に入り<button type="button" class="filter-clear" data-clear-favorites aria-label="お気に入りの絞り込みを解除" ${favoriteFilter ? "" : "disabled"}>解除</button></span><select id="favorite-filter" data-favorite-filter ${favoritesReady ? "" : "disabled"}><option value="all" ${favoriteFilter ? "" : "selected"}>すべて</option><option value="only" ${favoriteFilter ? "selected" : ""}>☆ お気に入りのみ</option></select></label>`;
}
function duplicateFilterMarkup() {
  return `<label class="duplicate-filter"><span class="filter-label">重複<button type="button" class="filter-clear" data-clear-duplicates aria-label="重複の絞り込みを解除" ${duplicateFilter ? "" : "disabled"}>解除</button></span><select id="duplicate-filter" data-duplicate-filter ${ownershipReady ? "" : "disabled"}><option value="all" ${duplicateFilter ? "" : "selected"}>すべて</option><option value="only" ${duplicateFilter ? "selected" : ""}>重複あり</option></select></label>`;
}
function syncDuplicateFilter() {
  const input = $("duplicate-filter"),
    clear = document.querySelector("[data-clear-duplicates]");
  if (input) {
    input.value = duplicateFilter ? "only" : "all";
    input.disabled = !ownershipReady;
  }
  if (clear) clear.disabled = !duplicateFilter;
}
function syncFavoriteFilter() {
  const input = $("favorite-filter");
  if (input) {
    input.disabled = !favoritesReady;
    input.value = favoriteFilter ? "only" : "all";
  }
  const clear = document.querySelector("[data-clear-favorites]");
  if (clear) clear.disabled = !favoriteFilter;
}
function updateModalFavorite() {
  let button = $("modal-favorite");
  if (!button && $("modal-owned")) {
    button = document.createElement("button");
    button.id = "modal-favorite";
    button.type = "button";
    button.className = "modal-favorite";
    button.hidden = true;
    $("modal-owned").before(button);
    button.onclick = () => {
      if (selected) saveFavorite(selected.id);
    };
  }
  if (!button) return;
  const active = selected && favoritesReady && favorites.has(selected.id);
  button.hidden = !session || !selected || !$("auth").hidden;
  button.disabled = !favoritesReady;
  button.setAttribute("aria-disabled", String(favoriteSaving.has(selected?.id)));
  button.classList.toggle("is-favorite", !!active);
  button.setAttribute("aria-pressed", String(!!active));
  button.innerHTML =
    favoriteStar + `<span>${active ? "お気に入り登録済み" : "お気に入りに登録"}</span>`;
}
function loadFavorites(force = false) {
  const uid = session?.user.id;
  if (!uid || !db) return Promise.resolve();
  if (favoritesRequest?.uid === uid) return favoritesRequest.promise;
  if (
    !force &&
    (favoriteSaving.size ||
      (favoritesReady && favoritesLoadedUser === uid && Date.now() - favoritesCheckedAt < 300000))
  )
    return Promise.resolve();
  const request = { uid, promise: null };
  const generation = favoritesGeneration;
  const mutation = favoritesMutation;
  request.promise = (async () => {
    try {
      const rows = [];
      let offset = 0;
      while (true) {
        const result = await db
          .from("card_favorites")
          .select("card_id")
          .eq("user_id", uid)
          .order("card_id")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        rows.push(...result.data);
        if (result.data.length < 1000) break;
        offset += 1000;
      }
      if (
        generation !== favoritesGeneration ||
        mutation !== favoritesMutation ||
        uid !== session?.user.id
      )
        return;
      favorites = new Set(rows.map((row) => row.card_id));
      favoritesReady = true;
      favoritesLoadedUser = uid;
      favoritesCheckedAt = Date.now();
    } catch (error) {
      if (generation !== favoritesGeneration || uid !== session?.user.id) return;
      toast("お気に入りを読み込めません。お気に入り用SQLの導入・通信状態を確認してください。");
    } finally {
      if (favoritesRequest === request) favoritesRequest = null;
      if (generation === favoritesGeneration && uid === session?.user.id) {
        syncFavoriteFilter();
        syncDuplicateFilter();
        updateModalFavorite();
        if (game) render();
      }
    }
  })();
  favoritesRequest = request;
  return request.promise;
}
function refreshFavoriteUI(id) {
  for (const button of document.querySelectorAll("[data-favorite]")) {
    if (button.dataset.favorite !== id) continue;
    const active = favorites.has(id);
    const label = active ? "お気に入りを解除" : "お気に入りに登録";
    const card = catalog.cards.find((card) => card.id === id);
    button.classList.toggle("is-favorite", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", (card ? name(card) + "：" : "") + label);
    button.title = label;
    button.disabled = !session || !favoritesReady;
    button.setAttribute("aria-disabled", String(favoriteSaving.has(id)));
  }
  updateModalFavorite();

  if (favoriteFilter && game) render();
}
async function saveFavorite(id) {
  if (!session || !favoritesReady || favoriteSaving.has(id) || maintenanceActive) return;
  const uid = session.user.id;
  const generation = favoritesGeneration;
  const wasEnabled = favorites.has(id);
  const enabled = !wasEnabled;
  favoritesMutation++;
  favoriteSaving.add(id);
  if (enabled) favorites.add(id);
  else favorites.delete(id);
  refreshFavoriteUI(id);
  try {
    const result = await db.rpc("card_album_set_favorite", { p_card_id: id, p_enabled: enabled });
    if (generation !== favoritesGeneration || uid !== session?.user.id) return;
    if (result.error) throw result.error;
    if (result.data !== enabled) throw Error("Unexpected favorite state");
    favoritesCheckedAt = Date.now();
  } catch {
    if (generation !== favoritesGeneration || uid !== session?.user.id) return;
    if (wasEnabled) favorites.add(id);
    else favorites.delete(id);
    refreshFavoriteUI(id);
    toast("失敗しました", "error");

    try {
      const check = await db
        .from("card_favorites")
        .select("card_id")
        .eq("user_id", uid)
        .eq("card_id", id)
        .maybeSingle();
      if (!check.error && generation === favoritesGeneration && uid === session?.user.id) {
        if (check.data) favorites.add(id);
        else favorites.delete(id);
      }
    } catch {}
  } finally {
    if (generation === favoritesGeneration && uid === session?.user.id) {
      favoritesMutation++;
      favoriteSaving.delete(id);
      refreshFavoriteUI(id);
    }
  }
}

let pendingSignupEmail = "";
try {
  const saved = JSON.parse(localStorage.getItem("card-album-pending-signup") || "null");
  if (saved && Date.now() - saved.at < 86400000 && typeof saved.email === "string")
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
  callbackHash.has("access_token") || callbackQuery.has("code") || callbackQuery.has("token_hash");
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
$("auth-result-retention").innerHTML = `
  <span class="signup-notice-item"><strong>アルバムID・パスワードを大切に保管</strong><span>パスワードを忘れた場合、再設定やアカウントの復旧はできません。アルバムIDとパスワードは、安全な場所に保存してください。</span></span>
  <span class="signup-notice-item"><strong>2か月間ご利用がない場合</strong><span>2か月間ログイン・利用がないと、アカウントと所持記録が自動削除されます。削除されたIDは再利用できません。</span></span>
`;
function authResult(ok, message) {
  if (ok) clearPendingSignup();
  callbackPending = false;
  authResultShowing = true;
  clearAuthURL();
  $("auth-result-title").textContent = ok ? "登録できました" : "メールを確認できませんでした";
  $("auth-result-text").textContent = message;
  $("auth-result-album-id").hidden = true;
  $("auth-result-retention").hidden = true;
  $("auth-result-icon").textContent = ok ? "✓" : "!";
  $("auth-result-next").textContent = ok && session ? "アルバムを開く" : "ログイン画面へ";
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
function toast(s, kind = "normal") {
  $("toast").classList.toggle("is-error", kind === "error");
  $("toast").textContent = s;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3500);
}
function randomizeAuthTheme() {
  document.body.classList.toggle("game-aipri", crypto.getRandomValues(new Uint8Array(1))[0] < 128);
}
function screen(id) {
  if (maintenanceActive) id = "auth";
  if (id === "auth" && $("auth").hidden) randomizeAuthTheme();
  for (const s of [
    "auth",
    "auth-result",
    "selection",
    "collection",
    "probabilities",
    "verse",
    "trade-page",
  ]) {
    const panel = $(s);
    if (panel) panel.hidden = s !== id;
  }
  if (id !== "verse") window.CARD_VERSE?.leave();
  $("nav").hidden = !session;
  $("menu-toggle").hidden = !session;
  closeMenu();
  updateHeader();
  syncBackToTop();
  if (id === "selection") loadAlbumNews();
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
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
  if (/Email not confirmed/i.test(m)) return "確認メールのリンクを開いてからログインしてください。";
  if (/rate limit|too many/i.test(m)) return "しばらく時間をおいてからお試しください。";
  if (/fetch|network/i.test(m)) return "接続できませんでした。通信状態を確認してください。";
  return m;
}
let ownershipRequest = null;
let ownershipCheckedAt = 0,
  ownershipLoadedUser = null;
function loadOwnership(force = false) {
  const uid = session?.user.id;
  if (saving.size) return Promise.resolve();
  if (ownershipRequest?.uid === uid) return ownershipRequest.promise;
  if (
    !force &&
    ownershipReady &&
    ownershipLoadedUser === uid &&
    Date.now() - ownershipCheckedAt < 300000
  )
    return Promise.resolve();
  const request = { uid, promise: null };
  request.promise = readOwnership()
    .then(() => {
      if (uid === session?.user.id && ownershipReady) {
        ownershipLoadedUser = uid;
        ownershipCheckedAt = Date.now();
      }
    })
    .finally(() => {
      if (ownershipRequest === request) ownershipRequest = null;
    });
  ownershipRequest = request;
  return request.promise;
}
async function readOwnership() {
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
      toast("所持データを読み込めません。Supabaseの設定・SQLを確認してください。");
  }
  if (game) render();
}

let accountPresencePending = Promise.resolve(),
  accountPresenceLoggingOut = false,
  accountPresenceSent = 0;
function recordAccountPresence(logout = false) {
  if (
    !db ||
    !session ||
    (!logout &&
      (document.hidden || accountPresenceLoggingOut || Date.now() - accountPresenceSent < 40000))
  )
    return Promise.resolve();
  const client = db,
    uid = session.user.id;
  accountPresenceSent = Date.now();
  accountPresencePending = accountPresencePending
    .catch(() => {})
    .then(async () => {
      if (db !== client || session?.user.id !== uid || (!logout && accountPresenceLoggingOut))
        return;
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 4000);
      try {
        let request = client.rpc("card_account_presence_touch", { p_logout: logout, p_all: true });
        if (typeof request.abortSignal === "function")
          request = request.abortSignal(controller.signal);
        const result = await request;
        if (result.error) accountPresenceSent = 0;
      } catch {
        accountPresenceSent = 0;
      } finally {
        clearTimeout(timer);
      }
    });
  return accountPresencePending;
}
async function recordConfirmedLogout(previous, all = true) {
  if (!previous?.access_token) return;
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(
      new URL("/rest/v1/rpc/card_account_presence_touch", window.APP_CONFIG.supabaseUrl).href,
      {
        method: "POST",
        headers: {
          apikey: window.APP_CONFIG.supabaseKey,
          Authorization: "Bearer " + previous.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_logout: true, p_all: all }),
        signal: controller.signal,
        cache: "no-store",
      },
    );
  } catch {
  } finally {
    clearTimeout(timer);
  }
}
setInterval(() => recordAccountPresence(), 45000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) recordAccountPresence();
});
window.addEventListener("online", () => recordAccountPresence());
let lastActivityTouch = 0;
async function recordAccountVisit() {
  if (!session || !db || document.hidden || Date.now() - lastActivityTouch < 3600000) return;
  lastActivityTouch = Date.now();
  try {
    const { error } = await db.rpc("card_album_touch_activity");
    if (error) lastActivityTouch = 0;
  } catch {
    lastActivityTouch = 0;
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    window.CARD_MAINTENANCE?.check().catch(() => {});
    recordAccountVisit();
    if (db && Date.now() - catalogCheckedAt >= (window.APP_CONFIG.refreshMs || 86400000))
      fetchCatalog();
  }
});

async function authChanged(event, next) {
  if (maintenanceActive) next = null;
  const previous = session?.user.id;
  session = next;
  if (previous !== session?.user.id) accountPresenceSent = 0;
  if (next) {
    accountPresenceLoggingOut = false;
    recordAccountPresence();
  }
  if (previous !== session?.user.id) {
    resetFavorites();
    saving.clear();
    window.CARD_VERSE?.reset();
  }
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
    ownershipCheckedAt = 0;
    ownershipLoadedUser = null;
    loadGeneration++;
    owned = new Set();
    ownedCounts = new Map();
    ownershipReady = false;
    game = null;
    albumIdentity = "";
    $("account-album-id").textContent = "";
    $("account-id-value").textContent = "";
    $("account-id-message").textContent = "";
    personalMetadata.clear();
    metadataGeneration++;
    ocrAttempted.clear();
    recovering = false;
    const publicCards = window.PUBLIC_CATALOG_CACHE?.peek();
    const fallback = publicCards?.cards.length ? publicCards : catalogFallback;
    if (fallback) {
      catalog = {
        ...fallback,
        cards: fallback.cards.map((c) => ({ ...c })),
        source: publicCards?.cards.length ? "live" : "snapshot",
      };
      applyPersonalMetadata();
      art();
    }
    if (!callbackPending && !authResultShowing) screen("auth");
    return;
  }
  if (recovering) return;
  recordAccountVisit();
  if (previous !== session.user.id) {
    $("account").textContent = "";
    loadAlbumIdentity().catch(() => {});
    if (!callbackPending && !authResultShowing) screen("selection");
    await Promise.all([loadOwnership(), loadPersonalMetadata(), loadFavorites()]);
    if (session?.user.id !== next.user.id) return;
    if (catalogFallback) await fetchCatalog();
  }
}
let initialCatalogPromise;
function loadInitialCatalog() {
  if (initialCatalogPromise) return initialCatalogPromise;
  const saved = window.PUBLIC_CATALOG_CACHE?.peek();
  if (saved?.cards.length) {
    catalogFallback = saved;
    catalog = { cards: saved.cards.map((c) => ({ ...c })), source: "live", errors: [] };
    adminOverrides.clear();
    saved.overrides.forEach((r) => adminOverrides.set(r.card_id, r.patch));
    applyPersonalMetadata();
    art();
  }
  initialCatalogPromise = Promise.resolve();
  return initialCatalogPromise;
}
let catalogCheckedAt = 0;
async function fetchCatalog(force = false) {
  if (!db || catalogLoading || (!force && Date.now() - catalogCheckedAt < 60000) || document.hidden)
    return false;
  if (force) window.PUBLIC_CATALOG_CACHE.invalidate();
  catalogLoading = true;
  updateSyncIndicator();
  try {
    const data = await window.PUBLIC_CATALOG_CACHE.load(db);
    catalogCheckedAt = Date.now();
    catalogFallback = data;
    adminOverrides.clear();
    data.overrides.forEach((r) => adminOverrides.set(r.card_id, r.patch));
    catalog = {
      cards: data.cards.map((c) => ({ ...c })),
      source: "live",
      errors: [],
      updatedAt: data.state.updated_at,
      sync: { running: false },
    };
    applyPersonalMetadata();
    art();
    if (game) {
      fillFilters();
      render();
    }
    if (!data.cards.length)
      $("auth-message").textContent =
        "カード情報を読み込めませんでした。時間をおいて再度お試しください。";
    return true;
  } catch (e) {
    catalog.errors = [e.message];
    $("auth-message").textContent = e.message;
    return false;
  } finally {
    catalogLoading = false;
    if (game) render();
    updateSyncIndicator();
    clearTimeout(poll);
    poll = null;
  }
}
function applyPersonalMetadata() {
  for (const c of catalog.cards) {
    const patch = personalMetadata.get(c.id);
    if (patch) {
      if (patch.name) c.name = patch.name;
      if (patch.character) c.character = patch.character;
      if (Array.isArray(patch.songs) && patch.songs.length) c.songs = patch.songs;
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
      else if (/^(?:AP(?:R)?\d+|OA\d+)M-\d+/.test(serial)) c.rarity = "ミラクル";
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
    if (error || generation !== metadataGeneration || uid !== session?.user.id) return;
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
function normalizeAlbumArt() {
  for (const root of document.querySelectorAll("#selection .album-images")) {
    for (const image of root.querySelectorAll("img")) {
      if (image.parentElement.classList.contains("album-card-frame")) continue;
      const frame = document.createElement("span");
      frame.className = "album-card-frame";
      image.before(frame);
      frame.append(image);
      const orient = () =>
        frame.classList.toggle("is-landscape", image.naturalWidth > image.naturalHeight);
      image.addEventListener("load", orient);
      if (image.complete && image.naturalWidth) orient();
    }
  }
}
function art() {
  updateHeader();
  for (const g of ["aikatsu", "aipri"]) {
    const available = catalog.cards.filter((c) => c.game === g && isOfficialMarqueeCard(c));
    let picks = available.slice(0, 2);
    if (g === "aikatsu") {
      const preferred = window.CARD_STARTUP_PREVIEW?.preferredAikatsu || [
        "aikatsu:E1-01_PR",
        "aikatsu:E1-83_N",
      ];
      picks = ["いちご", "パリン"]
        .map((character, index) => {
          const pool = available.filter((c) => (c.character || "").includes(character));
          return pool.find((c) => c.id === preferred[index]) || pool[0];
        })
        .filter(Boolean);
    }
    if (g === "aipri") {
      const preferred = window.CARD_STARTUP_PREVIEW?.preferredAipri || [
        "aipri:OA4-001",
        "aipri:OA4-005",
      ];
      picks = ["いのり", "ナナ"]
        .map((character, index) => {
          const pool = available.filter(
            (c) =>
              c.family === "おねがい" &&
              c.character === character &&
              /[★☆]\s*[4４]|4つ星/.test(c.rarity || ""),
          );
          return (
            pool.find((c) => c.id === preferred[index]) ||
            pool.sort((a, b) =>
              String(b.code).localeCompare(String(a.code), "en", { numeric: true }),
            )[0]
          );
        })
        .filter(Boolean);
    }
    if (!picks.length) continue;
    const root = $(g + "-art");
    if (root.dataset.cards === picks.map((c) => c.id + "|" + c.front).join(",")) continue;
    root.dataset.cards = picks.map((c) => c.id + "|" + c.front).join(",");
    root.innerHTML = picks
      .map(
        (c) =>
          `<img src="${esc(c.front)}" alt="${esc(c.name || c.code)}（${esc(c.character || c.code)}）" loading="eager" decoding="async">`,
      )
      .join("");
  }
  normalizeAlbumArt();
  buildMarquee();
}

function chooseGame(g) {
  if (!session) return;
  closeMenu();
  game = g;
  filters = {};
  ownershipFilter = "all";
  favoriteFilter = duplicateFilter = false;
  window.CARD_TRADE?.clear("card");
  page = 1;
  $("query").value = "";
  document.body.classList.toggle("game-aipri", g === "aipri");
  $("aipri-families").hidden = g !== "aipri";
  updateHeader();
  screen("collection");
  setLatestSeries();
  resetReveal($("filter-panel").querySelector(".filter-content"), false);
  $("filter-panel").open = false;
  resetReveal($("series-progress"), true);
  $("progress-details").setAttribute("aria-expanded", "false");
  $("progress-details").innerHTML = '<span class="progress-chevron" aria-hidden="true"></span>';
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
  return number ? (text.includes("リング") ? 1000000 : 0) + Number(number[1]) : -1;
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
      candidates.find((c) => c.code === (family === "おねがい" ? "OA4-001" : "APR6-001")) ||
      candidates[0];
    const imageURL = preferred?.front || "";
    const tabKey = family + "|" + imageURL;
    if (button.dataset.imageKey === tabKey) return;
    button.dataset.imageKey = tabKey;
    button.innerHTML = `${imageURL ? `<span class="family-card-image" aria-hidden="true"><img src="${esc(imageURL)}" alt="" loading="eager" decoding="async"></span>` : ""}<span class="family-card-label"><strong>${family === "おねがい" ? "おねがいアイプリ" : "ひみつのアイプリ"}</strong></span>`;
  });
}
function renderSeriesProgress() {
  const all = albumCards();
  const series = [...new Set(all.flatMap((c) => values(c.series)))].sort(
    (a, b) => seriesRank(b) - seriesRank(a) || a.localeCompare(b, "ja", { numeric: true }),
  );
  $("series-progress").innerHTML = series
    .map((label) => {
      const cards = all.filter((c) => values(c.series).includes(label));
      const got = cards.filter((c) => owned.has(c.id)).length;
      const rate = cards.length ? (got / cards.length) * 100 : 0;
      return `<div class="progress-card progress-card-small"><div><span>${esc(label)}</span><strong>${ownershipReady ? rate.toFixed(1) + "%" : "—"}</strong></div><div class="progress-track"><span style="width:${ownershipReady ? rate : 0}%"></span></div><p>${ownershipReady ? `取得済 ${got}枚 ／ 未取得 ${cards.length - got}枚` : "所持データを読み込み中"}</p></div>`;
    })
    .join("");
}
function fillFilters() {
  for (const card of catalog.cards) if (card.game === "aipri") card.rarity = displayRarity(card);
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
  $("filters").innerHTML =
    fields[game]
      .filter(([key]) => key !== "family")
      .map(([key, label]) => {
        const opts = [...new Set(cards.flatMap((c) => values(c[key])))].sort((a, b) => {
          if (game === "aikatsu" && key === "rarity") {
            const order = ["ER", "PR", "R", "N"];
            return (
              (order.includes(a) ? order.indexOf(a) : 99) -
                (order.includes(b) ? order.indexOf(b) : 99) || a.localeCompare(b, "ja")
            );
          }
          return key === "series"
            ? seriesRank(b) - seriesRank(a) || a.localeCompare(b, "ja", { numeric: true })
            : a.localeCompare(b, "ja", { numeric: true });
        });
        if (filters[key] && !opts.includes(filters[key])) delete filters[key];
        return `<label><span class="filter-label">${label}<button type="button" class="filter-clear" data-clear-filter="${key}" aria-label="${label}の絞り込みを解除">解除</button></span><select data-filter="${key}"><option value="">すべて</option>${opts.map((v) => `<option value="${esc(v)}" ${filters[key] === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
      })
      .join("") +
    favoriteFilterMarkup() +
    duplicateFilterMarkup() +
    (window.CARD_TRADE?.filterMarkup("card") || "");
}
function chooseFamily(f) {
  if (!["おねがい", "ひみつ"].includes(f)) return;
  aipriFamily = f;
  updateHeader();
  filters = {};
  ownershipFilter = "all";
  favoriteFilter = duplicateFilter = false;
  window.CARD_TRADE?.clear("card");
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
      (!favoriteFilter || (favoritesReady && favorites.has(c.id))) &&
      (!duplicateFilter || (ownershipReady && quantityOf(c.id) >= 2)) &&
      (window.CARD_TRADE?.matches("card", c.id) ?? true) &&
      (!q ||
        [
          c.name,
          c.code,
          ...values(c.codeAliases),
          c.rarity,
          c.character,
          ...values(c.brand),
          ...values(c.songs),
        ]
          .join(" ")
          .normalize("NFKC")
          .toLowerCase()
          .includes(q) ||
        (compactQuery &&
          [c.code, ...values(c.codeAliases)].some((code) =>
            normalizeCardCode(code).includes(compactQuery),
          ))) &&
      Object.entries(filters).every(([k, v]) => !v || values(c[k]).includes(v)) &&
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
  if (favoriteFilter) active.push({ key: "favorites", label: "お気に入り", value: "のみ" });
  if (duplicateFilter) active.push({ key: "duplicates", label: "重複", value: "あり" });
  const trade = window.CARD_TRADE?.entry("card");
  if (trade) active.push(trade);
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
  const compact = window.matchMedia?.("(max-width: 760px)").matches || window.innerWidth <= 760;
  const viewport =
    $("page-numbers")?.parentElement?.clientWidth || Math.min(window.innerWidth - 32, 1100);
  const maxSlots = compact ? Math.max(3, Math.min(9, Math.floor((viewport - 100) / 34))) : 9;
  let candidates;
  if (total <= maxSlots) candidates = Array.from({ length: total }, (_, i) => i + 1);
  else {
    const count = Math.max(1, maxSlots - 4);
    const start = Math.max(2, Math.min(page - Math.floor(count / 2), total - count));
    candidates = [
      ...new Set([1, ...Array.from({ length: count }, (_, i) => start + i), total]),
    ].sort((a, b) => a - b);
    if (page <= 2 && maxSlots >= 6)
      candidates = [...new Set([1, 2, ...candidates, total - 1, total])].sort((a, b) => a - b);
  }
  let previous = 0;
  $("prev").textContent = compact ? "前へ" : "前のページ";
  $("next").textContent = compact ? "次へ" : "次のページ";
  $("page-numbers").innerHTML = candidates
    .map((n) => {
      const gap =
        previous && n - previous > 1 ? '<span class="page-gap" aria-hidden="true">…</span>' : "";
      previous = n;
      return `${gap}<button type="button" data-page="${n}" ${n === page ? 'aria-current="page"' : ""} aria-label="${n}ページ目">${n}</button>`;
    })
    .join("");
}
function render(keepCardNodes = false) {
  if (!game) return;
  renderActiveFilters();
  syncFavoriteFilter();
  syncDuplicateFilter();
  const all = albumCards(),
    got = all.filter((c) => owned.has(c.id)).length,
    rate = all.length ? (got / all.length) * 100 : 0,
    list = filtered(),
    base = filtered(false),
    baseGot = base.filter((c) => owned.has(c.id)).length;
  $("filter-summary").textContent =
    Object.values(filters).filter(Boolean).length +
    ($("query").value.trim() ? 1 : 0) +
    (favoriteFilter ? 1 : 0) +
    (duplicateFilter ? 1 : 0) +
    (window.CARD_TRADE?.entry("card") ? 1 : 0)
      ? `適用中 ${Object.values(filters).filter(Boolean).length + ($("query").value.trim() ? 1 : 0) + (favoriteFilter ? 1 : 0) + (duplicateFilter ? 1 : 0) + (window.CARD_TRADE?.entry("card") ? 1 : 0)}件`
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
    ? `取得済 ${got}枚 ／ 未取得 ${all.length - got}枚`
    : "所持データを読み込み中（設定が必要な場合は同梱の手順をご確認ください）";
  $("result-count").textContent = `見つかったカード ${list.length}枚`;
  $("filtered-rate").innerHTML = ownershipReady
    ? `<span class="rate-caption">絞り込み内の取得率</span><strong>${base.length ? ((baseGot / base.length) * 100).toFixed(1) : "0.0"}%</strong><span class="rate-fraction">取得済 ${baseGot}枚 ／ 未取得 ${base.length - baseGot}枚</span>`
    : "";
  document
    .querySelector(".owned-tabs")
    .style.setProperty("--owned-index", String(["all", "yes", "no"].indexOf(ownershipFilter)));
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
  const visibleIDs = list.slice((page - 1) * size, page * size).map((card) => card.id);
  const existingIDs = [...$("cards").querySelectorAll("[data-toggle]")].map(
    (button) => button.dataset.toggle,
  );
  const reuseCards =
    keepCardNodes === true && JSON.stringify(visibleIDs) === JSON.stringify(existingIDs);
  if (!reuseCards)
    $("cards").innerHTML = list
      .slice((page - 1) * size, page * size)
      .map(
        (c) =>
          `<article data-card-layout="rows" class="card ${owned.has(c.id) ? "owned" : ""}"><button type="button" class="card-trigger card-image-trigger" data-detail="${esc(c.id)}" aria-label="${esc(name(c))}の詳細"><span class="card-image-frame"><img data-card-image src="${esc(c.front)}" loading="lazy" decoding="async" alt="${esc(name(c))}">${owned.has(c.id) ? `<span class="owned-badge" aria-label="所持枚数：${quantityOf(c.id)}枚">${quantityOf(c.id)}枚</span>` : ""}${quantityOf(c.id) >= 2 ? '<span class="card-duplicate-tag">重複あり</span>' : ""}</span></button><div class="card-code-row"><button type="button" class="card-code-link" data-detail="${esc(c.id)}" aria-label="${esc(name(c))}の詳細"><span class="code">${esc(c.code)}</span></button>${favoriteButton(c)}</div><button type="button" class="card-trigger card-text-trigger" data-detail="${esc(c.id)}" aria-label="${esc(name(c))}の詳細"><span class="card-meta"><span>${esc(c.character || "")}</span><span class="pill">${esc(displayRarity(c))}</span></span>${c.game === "aikatsu" && c.variant === "パラレル" ? '<span class="parallel-tag">パラレル</span>' : ""}<span class="card-name">${esc(name(c))}</span>${game === "aipri" ? `<span class="card-song">♪ ${esc(c.songs?.join(" ／ ") || "曲名未取得")}</span>` : ""}</button><button class="ownership-button" data-toggle="${esc(c.id)}" aria-pressed="${owned.has(c.id)}" ${!ownershipReady ? "disabled" : ""}>${owned.has(c.id) ? "✓ 持っている" : "＋ 持っていない"}</button></article>`,
      )
      .join("");
  else syncOwnershipCardNodes();
  $("empty").hidden = list.length > 0;
  $("prev").disabled = page === 1;
  $("next").disabled = page * size >= list.length;
  updateSyncIndicator();
  $("sync-status").textContent = catalogLoading
    ? "カード情報を確認中"
    : catalog.sync?.running
      ? `${catalog.sync.stage}…`
      : catalog.updatedAt
        ? `カード情報の更新：${new Date(catalog.updatedAt).toLocaleString("ja-JP")}`
        : "カード情報の更新";
  const errors = catalog.errors?.length;
  $("data-warning").hidden = !errors;
  $("data-warning").textContent = errors ? catalog.errors[0] : "";
  renderCoordinates();
  if (selected) updateModalOwnership();
  if (!$("probabilities").hidden) renderProbabilities();
  scheduleOCR();
  window.CARD_TRADE?.patchBadges?.();
}
function quantityOf(id) {
  return owned.has(id) ? ownedCounts.get(id) || 1 : 0;
}
function setLocalQuantity(id, count) {
  if (count > 0) {
    owned.add(id);
    ownedCounts.set(id, count);
  } else {
    owned.delete(id);
    ownedCounts.delete(id);
  }
}
function syncOwnershipCardNodes() {
  for (const button of $("cards").querySelectorAll("[data-toggle]")) {
    const id = button.dataset.toggle;
    const active = owned.has(id);
    const article = button.closest(".card");
    article.classList.toggle("owned", active);
    button.textContent = active ? "✓ 持っている" : "＋ 持っていない";
    button.disabled = !ownershipReady;
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-disabled", String(saving.has(id)));
    const frame = article.querySelector(".card-image-frame");
    let badge = frame.querySelector(".owned-badge");
    if (active) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "owned-badge";
        frame.append(badge);
      }
      badge.textContent = quantityOf(id) + "枚";
      badge.setAttribute("aria-label", "所持枚数：" + quantityOf(id) + "枚");
    } else badge?.remove();
    let repeated = frame.querySelector(".card-duplicate-tag");
    if (quantityOf(id) >= 2) {
      if (!repeated) {
        repeated = document.createElement("span");
        repeated.className = "card-duplicate-tag";
        repeated.textContent = "重複あり";
        frame.append(repeated);
      }
    } else repeated?.remove();
  }
}
async function saveQuantity(id, delta, clear = false) {
  if (!session || !ownershipReady || saving.has(id) || maintenanceActive) return;
  const uid = session.user.id;
  const generation = loadGeneration;
  const before = quantityOf(id);
  const predicted = clear ? 0 : Math.min(1000000, Math.max(0, before + delta));
  saving.add(id);
  setLocalQuantity(id, predicted);
  render(true);
  try {
    const result = await db.rpc(
      clear ? "card_album_clear_quantity" : "card_album_change_quantity",
      clear ? { p_card_id: id } : { p_card_id: id, p_delta: delta },
    );
    if (session?.user.id !== uid || generation !== loadGeneration) return;
    if (result.error) throw result.error;
    const count = Number(result.data);
    if (result.data === null || !Number.isInteger(count) || count < 0 || count > 1000000)
      throw Error("Unexpected ownership quantity");
    setLocalQuantity(id, count);
    ownershipCheckedAt = Date.now();
  } catch {
    if (session?.user.id !== uid || generation !== loadGeneration) return;
    setLocalQuantity(id, before);
    render(true);
    toast("失敗しました", "error");

    try {
      const check = await db
        .from("card_ownership")
        .select("quantity")
        .eq("user_id", uid)
        .eq("card_id", id)
        .maybeSingle();
      if (!check.error && session?.user.id === uid && generation === loadGeneration) {
        const count = check.data ? Number(check.data.quantity) : 0;
        if (Number.isInteger(count) && count >= 0 && count <= 1000000) setLocalQuantity(id, count);
      }
    } catch {}
  } finally {
    if (session?.user.id === uid && generation === loadGeneration) {
      saving.delete(id);
      render(true);
    }
  }
}

async function toggle(id) {
  return saveQuantity(id, 1, owned.has(id));
}
let detailCardIds = [];
function openDetail(id, trigger, navigating = false) {
  if (!navigating) {
    const candidates = trigger?.closest("#coordinate-panel")
      ? [...document.querySelectorAll("#coordinate-list [data-coordinate-card]")].map(
          (button) => button.dataset.coordinateCard,
        )
      : trigger?.closest("#auth-art")
        ? [...document.querySelectorAll(".marquee-group:first-child [data-detail]")].map(
            (b) => b.dataset.detail,
          )
        : game
          ? filtered().map((c) => c.id)
          : catalog.cards.map((c) => c.id);
    detailCardIds = [...new Set(candidates)];
    if (!detailCardIds.includes(id)) detailCardIds = [id];
  }
  selected =
    catalog.cards.find((c) => c.id === id) ||
    window.CARD_STARTUP_PREVIEW?.cards.find((c) => c.id === id);
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
        `<dt>${c.game === "aipri" && k === "family" ? "シリーズ" : label}</dt><dd>${esc(values(c[k]).join(" ／ ") || "未取得")}</dd>`,
    )
    .join("");
  if (c.game === "aikatsu") {
    $("modal-fields").innerHTML +=
      `<dt>AP</dt><dd>${cardAP(c) === null ? "未確認" : cardAP(c).toLocaleString("ja-JP") + " AP"}</dd>`;
  }
  $("metadata-note").hidden = true;
  $("modal-source").href = c.source;
  showSide();
  updateModalOwnership();
  updateDetailNavigation();
  if (!$("detail").open) $("detail").showModal();
  if (window.innerWidth <= 760) {
    $("detail").querySelector(".modal-body").scrollTop = 0;
    $("detail").scrollTop = 0;
  }
  document.body.style.overflow = "hidden";
  window.CARD_MODAL_SCROLL?.refresh($("detail"));
}
function updateDetailNavigation() {
  document.querySelector(".detail-navigation").hidden = !session || !$("auth").hidden;
  const index = detailCardIds.indexOf(selected?.id);
  $("card-prev").disabled = index <= 0;
  $("card-next").disabled = index < 0 || index >= detailCardIds.length - 1;
  syncModalSideControls();
}
function moveDetail(delta) {
  if (!$("detail").open || !selected || !session || !$("auth").hidden) return;
  const index = detailCardIds.indexOf(selected.id);
  if (index < 0 || (delta !== -1 && delta !== 1)) return;
  const id = detailCardIds[index + delta];
  if (id && catalog.cards.some((card) => card.id === id)) openDetail(id, lastFocus, true);
}
$("card-prev").onclick = () => moveDetail(-1);
$("card-next").onclick = () => moveDetail(1);
function showSide() {
  const c = selected;
  const url = side ? c.back : c.front;
  $("modal-image").hidden = !url;
  $("image-failure").hidden = !!url;
  $("image-failure").textContent = url ? "画像を読み込めませんでした。" : "裏面画像は未登録です。";
  $("modal-image").src = url || "";
  $("modal-image").alt = `${name(c)} ${side ? "裏面" : "表面"}`;
  $("side-label").textContent = side ? "裏面" : "表面";
  syncModalSideControls();
}
function updateModalOwnership() {
  updateModalFavorite();
  let tradeControls = $("card-trade-controls");
  if (!tradeControls) {
    tradeControls = document.createElement("div");
    tradeControls.id = "card-trade-controls";
    $("quantity-controls").after(tradeControls);
  }
  tradeControls.innerHTML =
    selected && session ? window.CARD_TRADE?.markup("card", selected.id) || "" : "";
  if (!selected) return;
  $("modal-owned").hidden = !session;
  $("quantity-controls").hidden = !session || !owned.has(selected.id);
  $("quantity-value").textContent = quantityOf(selected.id) + "枚";
  $("quantity-minus").disabled = !ownershipReady;
  $("quantity-minus").setAttribute("aria-disabled", String(saving.has(selected.id)));
  $("quantity-plus").disabled = !ownershipReady || quantityOf(selected.id) >= 1000000;
  $("quantity-plus").setAttribute("aria-disabled", String(saving.has(selected.id)));
  $("modal-owned").textContent = owned.has(selected.id) ? "✓ 持っている" : "＋ 持っていない";
  $("modal-owned").classList.toggle("is-owned", owned.has(selected.id));
  $("modal-owned").setAttribute("aria-pressed", String(owned.has(selected.id)));
  $("modal-owned").disabled = !ownershipReady;
  $("modal-owned").setAttribute("aria-disabled", String(saving.has(selected.id)));
}
let albumAuthSubscription = null;
let albumRememberSession = albumSessionStorage.remembered();
function configureAlbumAuth(remember = albumRememberSession) {
  albumAuthSubscription?.unsubscribe();
  db?.auth.stopAutoRefresh();
  albumRememberSession = remember;
  const c = window.APP_CONFIG;
  const client = window.supabase.createClient(c.supabaseUrl, c.supabaseKey, {
    auth: {
      ...albumSessionStorage.options(remember),
      detectSessionInUrl: true,
      flowType: "implicit",
    },
    global: { fetch: window.CARD_MAINTENANCE.fetch },
  });
  db = client;
  albumAuthSubscription = client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (db === client) authChanged(event, session);
    }, 0);
  }).data.subscription;
}
const rememberSessionLabel = document.createElement("label");
rememberSessionLabel.className = "remember-session";
rememberSessionLabel.innerHTML =
  '<input id="remember-session" type="checkbox"><span>ログイン状態を保持する</span>';
$("auth-submit").after(rememberSessionLabel);
$("remember-session").checked = albumRememberSession;
$("remember-session").addEventListener("change", () => {
  const remember = $("remember-session").checked;
  albumSessionStorage.choose(remember);
  if (db && remember !== albumRememberSession) configureAlbumAuth(remember);
});

async function init() {
  const initialCards = loadInitialCatalog();
  buildMarquee();
  try {
    configureAlbumAuth();
    await window.CARD_MAINTENANCE.check();
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
      if (!checked.data.user?.email_confirmed_at) throw Error("メールの確認が完了していません");
      authResult(true, "メールアドレスの確認が完了しました。カードアルバムを使い始められます。");
    }
    await initialCards;
    await fetchCatalog();
    if (session && startupProbabilityRoute) {
      chooseGame(startupProbabilityRoute === "aikatsu" ? "aikatsu" : "aipri");
      if (startupProbabilityRoute !== "aikatsu")
        chooseFamily(startupProbabilityRoute === "onegai" ? "おねがい" : "ひみつ");
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
    else $("auth-message").textContent = "初期化できませんでした。" + translatedError(e);
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
    $("auth-message").textContent = "新規登録手続きをしてから再送してください。";
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
  if ((await window.CARD_MAINTENANCE.check()).maintenance)
    throw Error("ただ今メンテナンス中です。");
  if (body.action === "reserve") {
    const { data, error } = await db.rpc("card_album_reserve_id");
    if (error) throw error;
    if (!data?.album_id) throw Error(data?.error || "IDを発行できませんでした。");
    return data;
  }
  if (body.action === "login" || body.action === "legacy") {
    let email;
    if (body.action === "legacy")
      email = String(body.email || "")
        .trim()
        .toLowerCase();
    else {
      const { data, error } = await db.rpc("card_album_login_identifier", {
        p_id: body.album_id,
        p_password: body.password,
      });
      if (error) throw error;
      email = data;
    }
    const { data, error } = await db.auth.signInWithPassword({ email, password: body.password });
    if (error) throw Error("IDまたはパスワードが正しくありません。");
    const identity = await db
      .from("card_album_ids")
      .select("album_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (identity.error || !identity.data) throw Error("アルバムIDを確認できませんでした。");
    return { album_id: identity.data.album_id, session: data.session };
  }
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body.reservation_token),
  );
  const reservationHash = [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const { data, error } = await db.auth.signUp({
    email: body.album_id.toLowerCase() + "@album.card-album.invalid",
    password: body.password,
    options: {
      data: {
        nickname: body.nickname,
        album_registration_hash: reservationHash,
        personal_info_ack: body.personal_info_ack,
      },
    },
  });
  if (error) throw error;
  if (!data.session)
    throw Error("SupabaseのConfirm emailをOFFにしてください。登録状態を管理者に確認してください。");
  return { album_id: body.album_id, session: data.session };
}
async function applyAlbumSession(result) {
  await authChanged("SIGNED_IN", result.session);
  albumIdentity = result.album_id;
  $("account-album-id").textContent = "アルバムID：" + albumIdentity;
}
$("auth-form").onsubmit = async (event) => {
  event.preventDefault();
  if (!db || !validateAuthForm()) return;
  $("auth-submit").disabled = true;
  try {
    const remember = $("remember-session").checked;
    albumSessionStorage.choose(remember);
    if (remember !== albumRememberSession) configureAlbumAuth(remember);
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
    .forEach((el) => el.classList.toggle("active", el.dataset.signupMarker === step));
  $("issue-album-id").hidden = !!signupReservation;
  $("signup-password-start").hidden = !signupReservation;
  $("issued-id-panel").hidden = !signupReservation;
  $("issued-album-id").textContent = signupReservation?.album_id || "";
  $("signup-password-start").disabled = !signupReservation || signupBusy;
  document
    .querySelectorAll(".signup-id-reference")
    .forEach((el) => (el.textContent = "アルバムID：" + (signupReservation?.album_id || "")));
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
$("signup-back-id")?.remove();

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
    [...nick].length < 2 || [...nick].length > 8
      ? "ニックネームを2〜8文字で入力してください。"
      : /@|https?:\/\/|(?:\d[\s-]*){7,}/i.test(nick) || !$("nickname-privacy-ack").checked
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
      "アルバムIDを保存してください。\nこれからは、保存したIDとパスワードでログインできます。",
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
let albumIdentityRequest = null;
function loadAlbumIdentity() {
  const uid = session?.user.id;
  if (!uid || albumIdentity) return Promise.resolve();
  if (albumIdentityRequest?.uid === uid) return albumIdentityRequest.promise;
  const request = { uid, promise: null };
  request.promise = readAlbumIdentity().finally(() => {
    if (albumIdentityRequest === request) albumIdentityRequest = null;
  });
  albumIdentityRequest = request;
  return request.promise;
}
async function readAlbumIdentity() {
  const uid = session?.user.id;
  if (!uid) return;
  const identity = await db
    .from("card_album_ids")
    .select("album_id")
    .eq("user_id", uid)
    .maybeSingle();
  const data = identity.data?.album_id,
    error = identity.error;
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
  for (const button of $("logout-dialog").querySelectorAll("button")) button.disabled = busy;
  $("account-delete-word").disabled = busy;
  if (!busy)
    $("account-delete-confirm").disabled = $("account-delete-word").value.trim() !== "削除";
}
function accountDeleteView(show) {
  $("logout-normal").hidden = show;
  $("account-delete-panel").hidden = !show;
  $("logout-title").textContent = show ? "アカウント情報を削除" : "ログアウトしますか？";
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
  $("account-id-message").textContent = "";
  $("account-id-value").textContent = albumIdentity || "確認中…";
  $("account-id-copy").disabled = !albumIdentity;
  $("logout-dialog").showModal();
  if (!albumIdentity)
    loadAlbumIdentity()
      .catch(() => {
        $("account-id-message").textContent =
          "IDを取得できませんでした。時間をおいてお試しください。";
      })
      .finally(() => {
        $("account-id-copy").disabled = !albumIdentity;
      });
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
    const logoutSession = session;
    accountPresenceLoggingOut = true;
    await accountPresencePending.catch(() => {});
    const { error } = await db.auth.signOut();
    if (error) {
      accountPresenceLoggingOut = false;
      accountPresenceSent = 0;
      recordAccountPresence();
    }
    if (error) throw error;
    await recordConfirmedLogout(logoutSession, true);
    $("logout-dialog").close();
    await authChanged("SIGNED_OUT", null);
  } catch (error) {
    accountPresenceLoggingOut = false;
    accountPresenceSent = 0;
    recordAccountPresence();
    $("account-action-message").textContent = translatedError(error);
  } finally {
    setAccountBusy(false);
  }
};
$("account-delete-confirm").onclick = async () => {
  if (accountActionBusy || !session || $("account-delete-word").value.trim() !== "削除") return;
  setAccountBusy(true);
  $("account-action-message").textContent = "アカウントを削除しています…";
  try {
    const { data, error } = await db.rpc("card_album_delete_self", {
      p_confirmation: "DELETE_MY_ACCOUNT",
    });
    if (error || data !== true) throw Error(error?.message || "削除できませんでした。");
    await db.auth.signOut({ scope: "local" }).catch(() => {});
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
  if (e.target.matches("[data-duplicate-filter]")) {
    duplicateFilter = e.target.value === "only";
    page = 1;
    render();
    return;
  }
  if (e.target.matches("[data-favorite-filter]")) {
    favoriteFilter = e.target.value === "only";
    page = 1;
    render();
    return;
  }
  if (e.target.dataset.filter) {
    filters[e.target.dataset.filter] = e.target.value;
    page = 1;
    render();
  }
};
$("filters").onclick = (e) => {
  if (e.target.closest("[data-clear-duplicates]")) {
    duplicateFilter = false;
    page = 1;
    fillFilters();
    render();
    return;
  }
  if (e.target.closest("[data-clear-favorites]")) {
    favoriteFilter = false;
    page = 1;
    fillFilters();
    render();
    return;
  }
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
  else if (key === "favorites") favoriteFilter = false;
  else if (key === "duplicates") duplicateFilter = false;
  else if (key === "trade") window.CARD_TRADE?.clear("card");
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
  const expanded = !(
    revealStates.get($("series-progress"))?.expanded ?? !$("series-progress").hidden
  );
  $("progress-details").setAttribute("aria-expanded", String(expanded));
  $("progress-details").innerHTML = '<span class="progress-chevron" aria-hidden="true"></span>';
  $("progress-details").setAttribute(
    "aria-label",
    expanded ? "弾ごとの取得率を閉じる" : "弾ごとの取得率を表示",
  );
  if (expanded) renderSeriesProgress();
  animateReveal($("series-progress"), expanded);
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
  favoriteFilter = duplicateFilter = false;
  window.CARD_TRADE?.clear("card");
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
  const favorite = e.target.closest("[data-favorite]");
  if (favorite) {
    saveFavorite(favorite.dataset.favorite);
    return;
  }
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
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      $("detail").close();
  }
};
const modalSideSwitch = document.createElement("div");
modalSideSwitch.id = "modal-side-switch";
modalSideSwitch.className = "modal-side-switch";
modalSideSwitch.setAttribute("role", "group");
modalSideSwitch.setAttribute("aria-label", "カードの表面・裏面");
modalSideSwitch.innerHTML =
  '<button type="button" data-modal-side="0">表面</button><button type="button" data-modal-side="1">裏面</button>';
$("side-label").after(modalSideSwitch);
function syncModalSideControls() {
  if (!selected) return;
  modalSideSwitch.hidden = false;
  modalSideSwitch.dataset.side = String(side);
  $("side-label").hidden = true;
  modalSideSwitch.querySelectorAll("[data-modal-side]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.modalSide) === side));
    button.disabled = button.dataset.modalSide === "1" && !selected.back;
  });
}
modalSideSwitch.addEventListener("click", (event) => {
  const button = event.target.closest("[data-modal-side]");
  if (!button || button.disabled || !selected) return;
  side = Number(button.dataset.modalSide);
  showSide();
});
$("flip-prev")?.remove();
$("flip-next")?.remove();
$("detail").onkeydown = (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key) || !selected) return;
  if (event.target.matches("input,textarea,select")) return;
  if (window.innerWidth <= 760 && session && $("auth").hidden) {
    event.preventDefault();
    moveDetail(event.key === "ArrowLeft" ? -1 : 1);
  } else if (selected.back) {
    event.preventDefault();
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
  if (session && !document.hidden) {
    loadOwnership();
    loadFavorites();
  }
});

function nickname() {
  const n = session?.user.user_metadata?.nickname;
  return typeof n === "string" && n.trim() ? n.trim().slice(0, 20) : "あなた";
}
function closeMenu() {
  if ($("header-other")) $("header-other").open = false;
  $("nav").classList.remove("open");
  $("menu-toggle").setAttribute("aria-expanded", "false");
  $("menu-toggle").setAttribute("aria-label", "メニューを開く");
}
function updateHeader() {
  window.CARD_TRADE?.sync();
  window.CARD_SHARE?.sync();
  window.CARD_UI_SETTINGS?.sync();
  const probabilitiesOpen = !$("probabilities").hidden;
  const verseOpen = $("verse") ? !$("verse").hidden : false;
  window.CARD_VERSE?.syncNavigation();
  $("ownership-export-open").hidden = !session || !game;
  $("probability-open").hidden = !session || !game || probabilitiesOpen || verseOpen;
  $("probability-back").hidden = !session || !game || !probabilitiesOpen;
  $("header-title").textContent = session
    ? $("selection").hidden
      ? nickname() + "のアルバム"
      : "カードアルバム"
    : "カードアルバム";
  const selectedGame = game || "aikatsu";
  $("game-switch").classList.toggle("is-aipri", selectedGame === "aipri");
  document
    .querySelectorAll("#game-switch [data-game]")
    .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.game === selectedGame)));
  $("header-card").hidden = true;
  $("header-card").removeAttribute("src");
}
function updateSyncIndicator() {
  const busy = catalogLoading || !!catalog.sync?.running;
  catalogRefreshButton.disabled = busy || !session || maintenanceActive;
  catalogRefreshButton.classList.toggle("is-refreshing", busy);
  catalogRefreshButton.setAttribute("aria-busy", String(busy));
  $("sync-indicator").classList.toggle("is-updating", busy);
  $("sync-indicator").setAttribute("aria-busy", String(busy));
  document.querySelector(".sync-spinner").hidden = !busy;
  if (catalogLoading) $("sync-status").textContent = "カード情報を確認中";
}
$("menu-toggle").onclick = () => {
  const open = $("nav").classList.toggle("open");
  $("menu-toggle").setAttribute("aria-expanded", String(open));
  $("menu-toggle").setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
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
  if ([...value].length < 2 || [...value].length > 8) {
    $("nickname-message").textContent = "2〜8文字で入力してください。";
    return;
  }
  if (/@|https?:\/\/|(?:\d[\s-]*){7,}/i.test(value)) {
    $("nickname-message").textContent = "個人情報を含まないニックネームにしてください。";
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
    $("account").textContent = "";
    loadAlbumIdentity().catch(() => {});
    $("nickname-dialog").close();
    Promise.resolve(db.rpc("card_album_share_notify")).catch(() => {});
    toast("ニックネームを保存しました");
  } catch (e) {
    $("nickname-message").textContent = translatedError(e);
  } finally {
    $("nickname-save").disabled = false;
  }
};

$("resend").hidden = !pendingSignupEmail;

function needsOCR() {
  return false;
}
function scheduleOCR() {}
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

  if (
    card.game === "aipri" &&
    (/^[A-Z0-9]+-\d+P$/i.test(card.code || "") ||
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
    if (front.protocol !== "https:" || source.protocol !== "https:") return false;
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
  const available = catalog.cards.filter((c) => c.game === group && isOfficialMarqueeCard(c));
  if (!available.length) return null;
  const availableIds = new Set(available.map((c) => c.id));
  if (
    marqueePools[group].length !== available.length ||
    marqueePools[group].some((c) => !availableIds.has(c.id)) ||
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
    !isOfficialMarqueeCard(catalog.cards.find((c) => c.id === entry.card.id) || entry.card) ||
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
    button.dataset.game = entry.card.game;
    button.setAttribute("aria-label", (entry.card.name || entry.card.code) + "の詳細");
    const image = button.querySelector("img");
    prepareMarqueeImage(image, entry.card);
    image
      .closest(".marquee-image-frame")
      .classList.toggle(
        "landscape",
        entry.card.game === "aikatsu" && entry.image.naturalWidth > entry.image.naturalHeight,
      );
    const isLandscape =
      entry.card.game === "aikatsu" && entry.image.naturalWidth > entry.image.naturalHeight;
    const frame = image.closest(".marquee-image-frame");
    const width = isLandscape ? entry.image.naturalHeight : entry.image.naturalWidth;
    const height = isLandscape ? entry.image.naturalWidth : entry.image.naturalHeight;
    if (width && height) {
      frame.style.aspectRatio = width + " / " + height;
      frame.style.setProperty("--image-ratio", String(height / width));
    }
    image.src = entry.image.src;
    image.alt = entry.card.name || entry.card.code;
    image.removeAttribute("fetchpriority");
  }

  marqueePending.set(index, { shown: false });
  return true;
}
function pumpMarquee() {
  if (!catalogFallback || marqueePaused || $("detail").open || $("auth").hidden || document.hidden)
    return;
  const groups = $("auth-art").querySelectorAll(".marquee-group");
  if (groups.length !== 2) return;
  let loading = [...marqueePending.values()].filter((entry) => entry.image && !entry.ready).length;
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
    const primary = pair[0].dataset.game || (index % 2 ? "aipri" : "aikatsu");
    let card =
      nextMarqueeCard(primary) || nextMarqueeCard(primary === "aipri" ? "aikatsu" : "aipri");
    if (!card) continue;
    if (pair[0].dataset.preview === card.id) card = nextMarqueeCard(card.game) || card;
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
  const landscape = card?.game === "aikatsu" && image.naturalWidth > image.naturalHeight;
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
    const card =
      catalog.cards.find((c) => c.id === image.closest(".marquee-card").dataset.preview) ||
      window.CARD_STARTUP_PREVIEW?.cards.find(
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
    const displayCards = catalog.cards.length
      ? catalog.cards
      : window.CARD_STARTUP_PREVIEW?.cards || [];
    const pools = {
      aikatsu: shuffleCards(
        displayCards.filter((c) => c.game === "aikatsu" && isOfficialMarqueeCard(c)),
      ),
      aipri: shuffleCards(
        displayCards.filter((c) => c.game === "aipri" && isOfficialMarqueeCard(c)),
      ),
    };
    if (!pools.aikatsu.length && !pools.aipri.length) return;
    const initial = [];
    for (let i = 0; i < 16; i++) {
      const pool = pools[i % 2 ? "aipri" : "aikatsu"];
      const fallback = pools[i % 2 ? "aikatsu" : "aipri"];
      initial.push(
        (pool.length ? pool : fallback)[Math.floor(i / 2) % (pool.length || fallback.length)],
      );
    }
    if (!groups[0].childElementCount)
      groups[0].innerHTML = shuffleCards(initial)
        .map(
          (c) =>
            `<button class="marquee-card" data-preview="${esc(c.id)}" data-game="${esc(c.game)}" aria-label="${esc(c.name || c.code)}の詳細"><span class="marquee-image-frame"><img src="${esc(c.front)}" alt="${esc(c.name || c.code)}" decoding="async"></span></button>`,
        )
        .join("");
    const cards = [...groups[0].children];
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
      const card =
        catalog.cards.find((c) => c.id === image.closest(".marquee-card").dataset.preview) ||
        window.CARD_STARTUP_PREVIEW?.cards.find(
          (c) => c.id === image.closest(".marquee-card").dataset.preview,
        );
      prepareMarqueeImage(image, card);
    });

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
      $("info-dialog").classList.toggle("help-dialog", button.dataset.info === "help");
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
    if (/^[A-Z0-9]+-\d+P$/.test(code)) return "パラレル";
    if (/^(?:AP(?:R)?\d+|OA\d+)M-\d+/.test(code)) return "ミラクル";
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
      (card.game === "aipri" && /^[A-Z0-9]+-\d+P$/i.test(card.code || "")) ||
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
      .sort(([a], [b]) => rarityOrder(a) - rarityOrder(b) || a.localeCompare(b, "ja"))
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
    ? summary.rows.map((row) => `${row.rarity} ${row.rate.toFixed(1)}%`).join("、")
    : "所持枚数が未登録です";
  return `<div class="distribution-bar" role="img" aria-label="${esc(label)}">${summary.rows.map((row) => `<span class="distribution-segment" style="width:${row.rate}%;background:${rarityColor(row.rarity)}" title="${esc(row.rarity)} ${row.rate.toFixed(1)}%"><span class="segment-label">${row.count ? esc(row.rarity === "パラレル" ? "☆" : row.rarity === "ミラクル" ? "M" : row.rarity) : ""}</span></span>`).join("")}</div><table class="probability-table"><thead><tr><th scope="col">レアリティ</th><th scope="col">所持数</th><th scope="col">割合</th></tr></thead><tbody>${summary.rows.map((row) => `<tr><th scope="row"><span class="rarity-dot" style="background:${rarityColor(row.rarity)}" aria-hidden="true"></span>${esc(row.rarity)}</th><td>${row.count.toLocaleString("ja-JP")}枚</td><td>${summary.total ? row.rate.toFixed(1) + "%" : "—"}</td></tr>`).join("")}</tbody></table>`;
}
function renderProbabilities() {
  if (!session || !game) return;
  const cards = albumCards().filter((card) => regularSeries(card).length);
  const series = [...new Set(cards.flatMap(regularSeries))].sort(
    (a, b) => seriesRank(b) - seriesRank(a) || a.localeCompare(b, "ja", { numeric: true }),
  );
  const current = $("probability-series").value;
  $("probability-series").innerHTML = series
    .map((label) => `<option value="${esc(label)}">${esc(label)}</option>`)
    .join("");
  if (series.includes(current)) $("probability-series").value = current;
  const label = $("probability-series").value;
  const overall = probabilitySummary(cards);
  const detail = probabilitySummary(cards.filter((card) => regularSeries(card).includes(label)));
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
  $("probability-overall-cost").hidden = $("probability-detail-cost").hidden = !showCost;
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
      (game === "aikatsu" ? "aikatsu" : aipriFamily === "おねがい" ? "onegai" : "himitsu"),
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
    button.setAttribute("aria-label", reveal ? "パスワードを隠す" : "パスワードを表示");
    input.focus({ preventScroll: true });
    if (start !== null && end !== null) input.setSelectionRange(start, end);
  });
  wrapper.append(button);
}
authMode(location.hash === "#signup" ? "signup" : "login");
let maintenanceActive = false;
let maintenanceSigningOut = false;
async function applyMaintenance(status) {
  const wasActive = maintenanceActive;
  maintenanceActive = status.maintenance;
  $("maintenance-panel").hidden = !maintenanceActive;
  $("auth-normal-panel").hidden = maintenanceActive;
  $("maintenance-message").textContent =
    status.message || "ただ今システムのメンテナンスをしていますので、アルバムを開けません。";
  const end = status.ends_at ? new Date(status.ends_at) : null;
  $("maintenance-end").textContent =
    end && !Number.isNaN(end.getTime())
      ? new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(end) + "（予定）"
      : "未定";
  if (!maintenanceActive) return;
  screen("auth");
  for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
  signupReservation = null;
  $("password").value = "";
  $("signup-password").value = "";
  $("signup-password-confirm").value = "";
  const shouldSignOut = db && !maintenanceSigningOut && (!wasActive || session);
  await authChanged("SIGNED_OUT", null);
  if (shouldSignOut) {
    maintenanceSigningOut = true;
    try {
      await db.auth.signOut({ scope: "local" });
    } finally {
      maintenanceSigningOut = false;
    }
  }
  screen("auth");
}
window.CARD_MAINTENANCE?.subscribe((status) => {
  applyMaintenance(status).catch(() => screen("auth"));
});
$("maintenance-refresh").onclick = async () => {
  $("maintenance-refresh").disabled = true;
  try {
    const status = await window.CARD_MAINTENANCE.check();
    $("maintenance-check-message").textContent = status.maintenance
      ? "現在もメンテナンス中です。"
      : "メンテナンスが終了しました。";
  } catch (error) {
    $("maintenance-check-message").textContent = error.message;
  } finally {
    $("maintenance-refresh").disabled = false;
  }
};

let albumNewsFetchedAt = 0;
let albumNewsFlight = null;
const albumNewsPanel = document.createElement("div");
albumNewsPanel.className = "album-news";
albumNewsPanel.innerHTML =
  '<section class="album-news-box"><h2><span class="news-dot"></span>お知らせ</h2><div id="album-notices"></div></section><section class="album-news-box updates"><h2><span class="news-dot"></span>更新情報</h2><div id="album-updates"></div></section>';
$("selection").append(albumNewsPanel);
function renderAlbumNews(rows, target) {
  $(target).innerHTML = rows.length
    ? rows
        .map(
          (row) =>
            `<details class="album-news-item"><summary><time datetime="${esc(row.posted_at)}">${esc(new Date(row.posted_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }))}</time><span>${row.important ? '<small class="important-tag">重要</small>' : ""}${esc(row.title)}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></summary><p>${esc(row.body)}</p></details>`,
        )
        .join("")
    : '<p class="album-news-empty">現在、掲載情報はありません</p>';
}
async function loadAlbumNews() {
  if (!db || !session || maintenanceActive || $("selection").hidden) return;
  if (albumNewsFetchedAt && Date.now() - albumNewsFetchedAt < 300000) return;
  if (albumNewsFlight) return albumNewsFlight;
  const flight = (async () => {
    for (const id of ["album-notices", "album-updates"]) $(id).setAttribute("aria-busy", "true");
    try {
      const results = await Promise.all(
        ["notice", "update"].map((kind) =>
          db
            .from("card_announcements")
            .select("id,title,body,posted_at,important")
            .eq("published", true)
            .eq("kind", kind)
            .order("posted_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(5),
        ),
      );
      if (results.some((r) => r.error)) throw results.find((r) => r.error).error;
      renderAlbumNews(results[0].data || [], "album-notices");
      renderAlbumNews(results[1].data || [], "album-updates");
      albumNewsFetchedAt = Date.now();
    } catch {
      for (const id of ["album-notices", "album-updates"])
        if (!$(id).children.length) $(id).textContent = "現在、掲載情報を読み込めません。";
    } finally {
      for (const id of ["album-notices", "album-updates"]) $(id).removeAttribute("aria-busy");
    }
  })();
  albumNewsFlight = flight;
  try {
    await flight;
  } finally {
    if (albumNewsFlight === flight) albumNewsFlight = null;
  }
}

$("selection").append($("account-album-id"));
const displaySettingsButton = document.createElement("button");
displaySettingsButton.id = "display-settings-open";
displaySettingsButton.type = "button";
displaySettingsButton.textContent = "詳細設定";
$("nav").append(displaySettingsButton);
const headerOther = document.createElement("details");
headerOther.id = "header-other";
headerOther.innerHTML =
  '<summary>メニュー<span class="header-other-chevron" aria-hidden="true"></span></summary><div class="header-other-options"></div>';
headerOther
  .querySelector("div")
  .append($("ownership-export-open"), $("probability-open"), $("display-settings-open"));
$("nav").append($("game-switch"), $("probability-back"), headerOther);
let headerOtherMobile = null;
function placeHeaderOther(force = false) {
  const mobile = window.innerWidth <= 760;
  if (!force && headerOtherMobile === mobile) return;
  headerOtherMobile = mobile;
  const target = mobile ? $("nav") : headerOther.querySelector(".header-other-options");
  for (const id of [
    "ownership-export-open",
    "probability-open",
    "trade-open",
    "display-settings-open",
  ]) {
    const node = $(id);
    if (node) target.append(node);
  }
  headerOther.hidden = mobile;
  if (mobile) headerOther.open = false;
}
window.CARD_HEADER_LAYOUT = () => placeHeaderOther(true);
window.addEventListener("resize", () => placeHeaderOther(), { passive: true });
placeHeaderOther();

const totalProgressCard = document.querySelector("#collection > .progress-card");
if (totalProgressCard) {
  totalProgressCard.querySelector("div > span").textContent = "総取得率";
  totalProgressCard.insertBefore($("series-progress"), $("filtered-rate"));
}

const resolutionScript = document.createElement("script");
resolutionScript.src = new URL(
  "./image-resolution.js?v=20261017-centered",
  document.currentScript?.src || location.href,
).href;
document.head.append(resolutionScript);

const albumHomeLink = $("header-title").closest("a");
if (albumHomeLink)
  albumHomeLink.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    closeMenu();
    if (session && !maintenanceActive) {
      screen("selection");
      history.replaceState(null, "", location.pathname + location.search);
    } else screen("auth");
  });
const animatedFilterPanel = $("filter-panel");
animatedFilterPanel.querySelector("summary").addEventListener("click", (event) => {
  event.preventDefault();
  const content = animatedFilterPanel.querySelector(".filter-content");
  const expanded = !(revealStates.get(content)?.expanded ?? animatedFilterPanel.open);
  if (expanded) animatedFilterPanel.open = true;
  animateReveal(content, expanded, () => {
    if (!expanded) animatedFilterPanel.open = false;
    content.hidden = false;
  });
});

normalizeAlbumArt();
randomizeAuthTheme();
$("auth")
  .querySelectorAll(".account-retention-note")
  .forEach((note) => {
    note.hidden = true;
  });
const confirmPasswordButton = $("signup-password-form").querySelector('button[type="submit"]');
if (confirmPasswordButton) confirmPasswordButton.textContent = "パスワードを確定する";
window.CARD_VERSE_HOST = {
  client: () => db,
  session: () => session,
  family: () => aipriFamily,
  game: () => game,
  maintenance: () => maintenanceActive,
  screen,
  toast,
  reveal: animateReveal,
  star: favoriteStar,
  representativeCard: (family) => {
    const candidates = catalog.cards.filter(
      (c) => c.game === "aipri" && c.family === family && c.front,
    );
    return (
      (
        candidates.find((c) => c.code === (family === "おねがい" ? "OA4-001" : "APR6-001")) ||
        candidates[0]
      )?.front || ""
    );
  },
  cards: (family) => {
    aipriFamily = family;
    chooseGame("aipri");
  },
};
const verseStyles = document.createElement("link");
verseStyles.rel = "stylesheet";
verseStyles.href = new URL(
  "../css/aipri-verse.css?v=20261017-album-polish",
  document.currentScript?.src || location.href,
).href;
document.head.append(verseStyles);
const verseScript = document.createElement("script");
verseScript.src = new URL(
  "./aipri-verse.js?v=20261018-trade-image-export",
  document.currentScript?.src || location.href,
).href;
document.head.append(verseScript);
window.CARD_TRADE_HOST = {
  client: () => db,
  session: () => session,
  maintenance: () => maintenanceActive,
  game: () => game,
  family: () => aipriFamily,
  cards: () => catalog.cards,
  verse: () => window.CARD_VERSE?.tradeData(),
  quantity: (kind, id) =>
    kind === "card" ? quantityOf(id) : window.CARD_VERSE?.tradeQuantity(kind, id) ?? 0,
  isVerse: () => !!$("verse") && !$("verse").hidden,
  screen,
  toast,
  back: () => {
    screen("collection");
    render();
  },
  changed: (resetPage = false) => {
    if (resetPage) page = 1;
    if (game) {
      fillFilters();
      render(true);
    }
    window.CARD_VERSE?.refreshTrade(resetPage);
    if (selected) updateModalOwnership();
  },
};
const tradeStyles = document.createElement("link");
tradeStyles.rel = "stylesheet";
tradeStyles.href = new URL(
  "../css/trade.css?v=20261018-trade-share-polish",
  document.currentScript?.src || location.href,
).href;
document.head.append(tradeStyles);
const tradeScript = document.createElement("script");
tradeScript.src = new URL(
  "./trade.js?v=20261018-trade-share-polish",
  document.currentScript?.src || location.href,
).href;
document.head.append(tradeScript);
let shareVerseWaiting = null;
function requireShareVerse() {
  if (window.CARD_VERSE) return Promise.resolve(window.CARD_VERSE);
  if (!shareVerseWaiting) {
    shareVerseWaiting = new Promise((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer);
        verseScript.removeEventListener("load", finish);
        verseScript.removeEventListener("error", finish);
        if (window.CARD_VERSE) resolve(window.CARD_VERSE);
        else reject(Error("コーデ機能を読み込めませんでした。ページを再読み込みしてください。"));
      };
      const timer = setTimeout(finish, 15000);
      verseScript.addEventListener("load", finish);
      verseScript.addEventListener("error", finish);
    }).catch((error) => { shareVerseWaiting = null; throw error; });
  }
  return shareVerseWaiting;
}
window.CARD_SHARE_HOST = {
  async scopeItems(scope) {
    if (scope.startsWith("verse-")) return (await requireShareVerse()).shareCatalog(scope.slice(6));
    return catalog.cards.filter((c) =>
      scope === "aikatsu"
        ? c.game === "aikatsu"
        : c.game === "aipri" &&
          [scope, scope === "onegai" ? "おねがい" : "ひみつ"].includes(c.family),
    );
  },
  async rates(scopes, seriesFilters = {}) {
    const uid = session?.user.id;
    if (!uid) throw Error("再ログインしてください。");
    const result = {};
    if (scopes.some((scope) => !scope.startsWith("verse-"))) {
      if (!ownershipReady) await loadOwnership();
      if (!ownershipReady || uid !== session?.user.id)
        throw Error("所持状況を確認できませんでした。");
      for (const scope of scopes.filter((scope) => !scope.startsWith("verse-"))) {
        const cards = catalog.cards.filter((c) =>
          scope === "aikatsu"
            ? c.game === "aikatsu"
            : c.game === "aipri" &&
              [scope, scope === "onegai" ? "おねがい" : "ひみつ"].includes(c.family),
        );
        if (!cards.length) throw Error("カード情報の読み込み後にもう一度開いてください。");
        const visible = Array.isArray(seriesFilters[scope])
          ? cards.filter((c) =>
              values(c.series).some((label) => seriesFilters[scope].includes(label)),
            )
          : cards;
        result[scope] = (
          visible.length
            ? (visible.filter((c) => owned.has(c.id)).length / visible.length) * 100
            : 0
        ).toFixed(1);
      }
    }
    if (scopes.some((scope) => scope.startsWith("verse-"))) {
      const verse = await requireShareVerse();
      Object.assign(result, await verse.shareRates(scopes, seriesFilters));
    }
    if (uid !== session?.user.id) throw Error("再ログインしてください。");
    return result;
  },
  client: () => db,
  session: () => session,
  maintenance: () => maintenanceActive,
  closeMenu,
  toast,
  base: () => siteBase.href,
};
const shareStyles = document.createElement("link");
shareStyles.rel = "stylesheet";
shareStyles.href = new URL(
  "../css/public-share.css?v=20261018-trade-share-polish",
  document.currentScript?.src || location.href,
).href;
document.head.append(shareStyles);
init();
