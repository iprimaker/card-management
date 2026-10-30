/* Site information is supplied by CARD_SITE_COMMON.init before this module. */

/* catalog-cache.js */
(() => {
  window.PUBLIC_CATALOG_CACHE = {
    peek: () => window.CARD_VISIBILITY.cache(),
    invalidate() {},
    async load() {
      await window.CARD_VISIBILITY.refresh();
      return window.CARD_VISIBILITY.cache();
    },
  };
})();

/* maintenance.js */
(() => {
  "use strict";
  if (window.CARD_SHARED_PAGE_READY === "album") return;
  const nativeFetch = window.fetch.bind(window);
  let pending = null;
  let freshUntil = 0,
    retryAt = 0,
    failures = 0,
    lastError;
  let state = { maintenance: false };
  let notify = () => {};
  async function check({ force = false } = {}) {
    if (pending) return pending;
    if (Date.now() < retryAt) throw lastError;
    if (!force && Date.now() < freshUntil) return state;
    pending = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const config = window.APP_CONFIG;
        const response = await nativeFetch(
          config.supabaseUrl + "/rest/v1/rpc/card_album_site_status",
          {
            method: "POST",
            headers: { apikey: config.supabaseKey, "Content-Type": "application/json" },
            body: "{}",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok) throw Error("接続が混み合っています。時間をおいて再度お試しください。");
        const data = await response.json();
        if (!data || typeof data.maintenance !== "boolean")
          throw Error("メンテナンス設定を確認できません。");
        state = data;
        freshUntil = Date.now() + 30000 * (1 + Math.random() * 0.2);
        failures = 0;
        retryAt = 0;
        notify(state);
        return state;
      } finally {
        clearTimeout(timeout);
      }
    })()
      .catch((error) => {
        lastError = error;
        failures = Math.min(failures + 1, 6);
        retryAt =
          Date.now() + Math.min(300000, 15000 * 2 ** (failures - 1)) * (1 + Math.random() * 0.2);
        throw error;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }
  async function guardedFetch(input, options) {
    const url = typeof input === "string" ? input : input.url || String(input);
    if (!url.startsWith(window.APP_CONFIG.supabaseUrl + "/")) return nativeFetch(input, options);
    const status = await check();

    const publicRead =
      /\/rest\/v1\/(?:card_catalog(?:\?|$)|card_catalog_revision(?:\?|$)|rpc\/card_album_catalog_cached(?:\?|$)|rpc\/card_album_registration_status(?:\?|$))/.test(
        url,
      );
    if (status.maintenance && !publicRead) {
      return new Response(JSON.stringify({ code: "42501", message: "CARD_ALBUM_MAINTENANCE" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const response = await nativeFetch(input, options);
    if (!response.ok) {
      const text = await response.clone().text();
      if (text.includes("CARD_ALBUM_MAINTENANCE") || text.includes("user_banned"))
        await check({ force: true });
    }
    return response;
  }
  window.CARD_MAINTENANCE = {
    check,
    fetch: guardedFetch,
    subscribe(fn) {
      notify = fn;
    },
    get state() {
      return state;
    },
  };
})();

/* app-title-fix.js */
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
        {
          height: (expanded ? fullHeight : 0) + "px",
          opacity: expanded ? "1" : "0",
        },
      ],
      { duration: 220, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" },
    );
    state.animation.onfinish = finish;
  } catch {
    finish();
  }
}

const coordinateStylesheetURL = new URL(
  "../css/coordinates.css?v=20261030-registration-30min-v2",
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
      return {
        ...definition,
        members,
        missing,
        total,
        got,
        complete,
        ap,
        acquiredAP,
      };
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
  if (!requireEditingSession()) return;
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
  document.dispatchEvent(
    new CustomEvent("card-album-operation-start", { detail: { userId: uid } }),
  );
  try {
    const result = await db.rpc("card_album_set_favorite", {
      p_card_id: id,
      p_enabled: enabled,
    });
    if (generation !== favoritesGeneration || uid !== session?.user.id) return;
    if (result.error) throw result.error;
    if (result.data !== enabled) throw Error("Unexpected favorite state");
    favoritesCheckedAt = Date.now();
    document.dispatchEvent(
      new CustomEvent("card-album-operation-saved", {
        detail: {
          kind: "favorite",
          userId: uid,
          cardId: id,
          before: wasEnabled,
          enabled,
        },
      }),
    );
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
    document.dispatchEvent(
      new CustomEvent("card-album-operation-finished", {
        detail: { userId: uid },
      }),
    );
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
  <span class="signup-notice-item"><strong>1か月間ご利用がない場合</strong><span>1か月間ログイン・利用がないと、アカウントと所持記録が自動削除されます。削除されたIDは再利用できません。</span></span>
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
  $("auth-result-next").hidden = invitationPage && !session;
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
function songFilterValue(value) {
  let song = String(value || "").trim();
  const personal = song.match(/^(.+?のひみつマイソング♪)/u);
  if (personal) return personal[1];
  song = song.replace(/(?:～|〜)まんかい\s*ver\.?[～〜]?/giu, "");
  // 歌手・人数・バージョンはカード情報に残し、曲の選択肢だけをまとめる。
  while (/[（(][^()（）]*[）)]\s*$/u.test(song))
    song = song.replace(/\s*[（(][^()（）]*[）)]\s*$/u, "");
  return song.replace(/^わいるど[☆★]?すたー/u, "わいるどすたー").trim();
}

function toast(s, kind = "normal") {
  $("toast").classList.toggle("is-error", kind === "error");
  $("toast").textContent = s;
  $("toast").hidden = false;
  window.CARD_TOAST_LAYER.raise($("toast"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    window.CARD_TOAST_LAYER.hide($("toast"));
    $("toast").hidden = true;
  }, 3500);
}
function randomizeAuthTheme() {
  document.body.classList.remove("game-primagi");
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
    "command-page",
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
// Invitation proof stays in memory only; reloading cannot resume a claim.
let invitationPage = new URLSearchParams(location.search).get("view") === "invite";
let invitationToken = invitationPage
  ? new URLSearchParams(location.hash.slice(1)).get("invite")
  : null;
let invitationStarted = false,
  invitationEnded = false;
const invitationNotice =
  "こちらでの登録は1度のみ可能です。再読み込み・ページを閉じる・再アクセスすると登録手続きを再開できません。招待URLの再発行はいたしかねます。";
if (invitationPage) {
  history.replaceState(null, "", location.pathname + location.search);
  $("auth-normal-panel").querySelector("h2").textContent = "招待からアルバムを作成";
  $("login-tab").parentElement.hidden = true;
  const note = document.createElement("p");
  note.id = "invitation-notice";
  note.className = "id-save-note";
  note.textContent = invitationNotice;
  $("signup-flow").prepend(note);
  document.querySelector(".id-expiry-note").textContent =
    "このままパスワード設定に進んでください。再読み込みせず、アルバムID発行から30分以内に登録を完了してください。";
}
let signupReservation = null;
let signupStep = "id";
let signupBusy = false;
let signupRegistrationAllowed = null;
let signupInvitationAllowed = false;
let signupRegistrationMessage = "受付状況を確認しています…";
let signupRegistrationFlight = null,
  signupRegistrationFreshUntil = 0,
  signupRegistrationTimer;
function renderSignupRegistrationAvailability() {
  const inviteOnly =
    !invitationPage &&
    !signupReservation &&
    signupRegistrationAllowed === false &&
    signupInvitationAllowed;
  $("signup-invitation-notice").hidden = !inviteOnly;
  $("signup-flow").classList.toggle("invitation-only", inviteOnly);
  $("signup-flow").classList.toggle(
    "registration-paused",
    !invitationPage && !signupReservation && signupRegistrationAllowed === false,
  );
  if (invitationPage) {
    $("issue-album-id").hidden = true;
    const status = $("signup-registration-status");
    status.hidden = !!signupReservation;
    status.textContent = invitationEnded
      ? "登録手続きは終了しました。この招待URLでは再開できません。"
      : "招待URLを確認し、アルバムIDを割り当てています…";
    return;
  }
  $("issue-album-id").hidden = !!signupReservation || signupRegistrationAllowed !== true;
  $("issue-album-id").disabled = signupBusy;
  const status = $("signup-registration-status");
  status.hidden = !!signupReservation || signupRegistrationAllowed === true || inviteOnly;
  status.textContent = signupRegistrationMessage;
}
function scheduleSignupRegistrationCheck() {
  clearTimeout(signupRegistrationTimer);
  if (
    mode !== "signup" ||
    document.hidden ||
    navigator.onLine === false ||
    $("auth").hidden ||
    signupReservation
  )
    return;
  signupRegistrationTimer = setTimeout(
    () => {
      if (mode === "signup" && !document.hidden && !$("auth").hidden && !signupReservation)
        void refreshSignupRegistrationStatus();
    },
    60000 + Math.random() * 12000,
  );
}
async function refreshSignupRegistrationStatus({ force = false } = {}) {
  if (!db || invitationPage) return;
  if (signupRegistrationFlight) return signupRegistrationFlight;
  if (!force && Date.now() < signupRegistrationFreshUntil) {
    renderSignupRegistrationAvailability();
    scheduleSignupRegistrationCheck();
    return;
  }
  signupRegistrationFlight = (async () => {
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 10000);
    try {
      let request = db.rpc("card_album_registration_status_v2");
      if (typeof request.abortSignal === "function")
        request = request.abortSignal(controller.signal);
      const { data, error } = await request;
      if (error || typeof data?.allowed !== "boolean")
        throw Error("registration status unavailable");
      signupRegistrationAllowed = data.allowed;
      signupInvitationAllowed = data.invitation_allowed === true;
      signupRegistrationMessage = data.allowed
        ? ""
        : data.message || "現在、新規登録の受付を停止しています。";
    } catch {
      signupRegistrationAllowed = null;
      signupInvitationAllowed = false;
      signupRegistrationMessage =
        "受付状況を確認できませんでした。時間をおいて再度お試しください。";
    } finally {
      clearTimeout(timeout);
      signupRegistrationFreshUntil = Date.now() + 30000;
      renderSignupRegistrationAvailability();
      scheduleSignupRegistrationCheck();
    }
  })().finally(() => {
    signupRegistrationFlight = null;
  });
  return signupRegistrationFlight;
}
document.addEventListener("visibilitychange", () => {
  clearTimeout(signupRegistrationTimer);
  if (!document.hidden && mode === "signup" && !$("auth").hidden)
    void refreshSignupRegistrationStatus();
});
window.addEventListener("online", () => {
  if (mode === "signup" && !$("auth").hidden) void refreshSignupRegistrationStatus();
});

try {
  localStorage.removeItem("card-album-id-reservation");
} catch {}
window.addEventListener("pagehide", () => {
  signupReservation = null;
  if (invitationPage) {
    invitationToken = null;
    invitationEnded = true;
  }
  try {
    localStorage.removeItem("card-album-id-reservation");
  } catch {}
  $("signup-password").value = $("signup-password-confirm").value = "";
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && mode === "signup") renderSignupStep("id");
});
async function startInvitationRegistration(existingSession) {
  if (invitationStarted) return;
  invitationStarted = true;
  screen("auth");
  const token = invitationToken;
  invitationToken = null;
  try {
    if (existingSession)
      throw Error(
        "ログイン中は招待登録を開始できません。ログアウトしてから招待URLを開いてください。",
      );
    if (!token || !/^[0-9a-f]{64}$/.test(token) || invitationEnded)
      throw Error("この招待URLは利用できません。使用済み、期限切れ、または無効なURLです。");
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    let result;
    try {
      let request = db.rpc("card_album_invitation_claim", { p_token: token });
      if (typeof request.abortSignal === "function")
        request = request.abortSignal(controller.signal);
      result = await request;
    } finally {
      clearTimeout(timer);
    }
    if (invitationEnded) return;
    if (result.error)
      throw Error(
        "招待URLの確認を完了できませんでした。通信状態を確認してください。IDの割り当てが完了していた場合、同じURLは利用できません。",
      );
    if (result.data?.error) throw Error(result.data.error);
    if (
      !/^[A-HJ-NP-Z0-9]{12}$/.test(result.data?.album_id || "") ||
      !/^[0-9a-f]{64}$/.test(result.data?.reservation_token || "")
    )
      throw Error("招待URLを確認できませんでした。時間をおいてお試しください。");
    signupReservation = result.data;
    renderSignupStep("id");
  } catch (error) {
    invitationEnded = true;
    renderSignupStep("id");
    $("signup-registration-status").textContent = error.message;
  }
}
function authMode(m) {
  if (invitationPage) m = "signup";
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
  if (m === "signup") {
    renderSignupStep(signupStep);
    void refreshSignupRegistrationStatus();
  } else clearTimeout(signupRegistrationTimer);
}
function translatedError(e) {
  const raw = typeof e === "string" ? e : String(e?.message || "");
  if (
    /load[\s_-]*fail(?:ed)?|lode[\s_-]*fail(?:ed|ede)?|failed[\s_-]*to[\s_-]*fetch|network|offline|fetch/i.test(
      raw,
    )
  )
    return "接続できませんでした。通信状態を確認して、もう一度お試しください。";
  if (/timeout|timed.?out|abort/i.test(raw) || e?.name === "AbortError")
    return "通信に時間がかかっています。時間をおいて、もう一度お試しください。";
  if (/Invalid login credentials/i.test(raw))
    return "アルバムIDまたはパスワードが正しくありません。";
  if (typeof window.CARD_ERROR?.message === "function") return window.CARD_ERROR.message(e);
  return "操作を完了できませんでした。時間をおいて、もう一度お試しください。";
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
        let request = client.rpc("card_account_presence_touch", {
          p_logout: logout,
          p_all: true,
        });
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
  // 招待の確認中・エラー時は既存セッションによって通常画面へ切り替えない。
  // 新規作成の完了処理ではauthResultShowingを立ててからセッションを反映する。
  if (invitationPage && !authResultShowing) {
    screen("auth");
    return;
  }
  if (maintenanceActive) next = null;
  const previous = session?.user.id;
  session = next;
  if (previous !== session?.user.id) stopAccountRequests();
  if (previous !== session?.user.id) accountPresenceSent = 0;
  if (next) {
    accountPresenceLoggingOut = false;
    recordAccountPresence();
  }
  if (previous !== session?.user.id) {
    resetContactReplyNews();
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
    catalog = {
      cards: saved.cards.map((c) => ({ ...c })),
      source: "live",
      errors: [],
    };
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
    $("auth-message").textContent = window.CARD_ERROR.message(e);
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
      if (c.id !== "aipri:OP-072" && Array.isArray(patch.songs) && patch.songs.length)
        c.songs = patch.songs;
      c.metadataSource = patch.metadataSource || "画像文字読み取り（未確認）";
    }
    const forced = adminOverrides.get(c.id);
    if (forced) Object.assign(c, forced);
    const visible = window.CARD_VISIBILITY.mask([c])[0];
    if (visible !== c) {
      Object.keys(c).forEach((key) => delete c[key]);
      Object.assign(c, visible);
    }
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
              String(b.code).localeCompare(String(a.code), "en", {
                numeric: true,
              }),
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
  document.body.classList.toggle("game-primagi", g === "primagi");
  filters = {};
  ownershipFilter = "all";
  favoriteFilter = duplicateFilter = false;
  window.CARD_TRADE?.clear("card");
  page = 1;
  $("query").value = "";
  document.body.classList.toggle("game-aipri", g === "aipri");
  $("aipri-families").hidden = g !== "aipri";
  updateHeader();
  if (g === "primagi") {
    history.replaceState(null, "", "#primagi");
    window.CARD_VERSE.open("primagi");
    return;
  }
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
  if (game === "primagi") return;
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
        const opts = [
          ...new Set(
            cards.flatMap((c) =>
              key === "songs" ? values(c.songs).map(songFilterValue) : values(c[key]),
            ),
          ),
        ].sort((a, b) => {
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
      (window.CARD_QR?.matches("card", c.id) ?? true) &&
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
      Object.entries(filters).every(
        ([k, v]) =>
          !v || (k === "songs" ? values(c.songs).map(songFilterValue) : values(c[k])).includes(v),
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
  if (favoriteFilter) active.push({ key: "favorites", label: "お気に入り", value: "のみ" });
  if (duplicateFilter) active.push({ key: "duplicates", label: "重複", value: "あり" });
  const qr = window.CARD_QR?.entry("card");
  if (qr) active.push(qr);
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
  if (game === "primagi") {
    window.CARD_VERSE?.refreshTrade();
    return;
  }
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
          `<article data-card-layout="rows" class="card ${owned.has(c.id) ? "owned" : ""}"><button type="button" class="card-trigger card-image-trigger" data-detail="${esc(c.id)}" aria-label="${esc(name(c))}の詳細"><span class="card-image-frame">${window.CARD_QR?.badge("card", c.id) || ""}<img data-card-image src="${esc(c.front)}" loading="lazy" decoding="async" alt="${esc(name(c))}">${owned.has(c.id) ? `<span class="owned-badge" aria-label="所持枚数：${quantityOf(c.id)}枚">${quantityOf(c.id)}枚</span>` : ""}${quantityOf(c.id) >= 2 ? '<span class="card-duplicate-tag">重複あり</span>' : ""}</span></button><div class="card-code-row"><button type="button" class="card-code-link" data-detail="${esc(c.id)}" aria-label="${esc(name(c))}の詳細"><span class="code">${esc(c.code)}</span></button>${favoriteButton(c)}</div><button type="button" class="card-trigger card-text-trigger" data-detail="${esc(c.id)}" aria-label="${esc(name(c))}の詳細"><span class="card-meta"><span>${esc(c.character || "")}</span><span class="pill">${esc(displayRarity(c))}</span></span>${c.game === "aikatsu" && c.variant === "パラレル" ? '<span class="parallel-tag">パラレル</span>' : ""}<span class="card-name">${esc(name(c))}</span>${game === "aipri" ? `<span class="card-song">♪ ${esc(c.songs?.join(" ／ ") || "曲名未取得")}</span>` : ""}</button><button class="ownership-button" data-toggle="${esc(c.id)}" aria-pressed="${owned.has(c.id)}" ${!ownershipReady ? "disabled" : ""}>${owned.has(c.id) ? "✓ 持っている" : "＋ 持っていない"}</button></article>`,
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
  $("data-warning").textContent = errors ? window.CARD_ERROR.message(catalog.errors[0]) : "";
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
  if (!requireEditingSession()) return;
  if (!session || !ownershipReady || saving.has(id) || maintenanceActive) return;
  if (navigator.onLine === false) {
    toast("通信に接続されていません。接続を確認して、もう一度お試しください。", "error");
    return;
  }
  const uid = session.user.id;
  const generation = loadGeneration;
  const before = quantityOf(id);
  const predicted = clear ? 0 : Math.min(1000000, Math.max(0, before + delta));
  saving.add(id);
  setLocalQuantity(id, predicted);
  render(true);
  document.dispatchEvent(
    new CustomEvent("card-album-operation-start", { detail: { userId: uid } }),
  );
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
    document.dispatchEvent(
      new CustomEvent("card-album-operation-saved", {
        detail: {
          kind: "ownership",
          userId: uid,
          cardId: id,
          before,
          quantity: count,
        },
      }),
    );
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
    document.dispatchEvent(
      new CustomEvent("card-album-operation-finished", {
        detail: { userId: uid },
      }),
    );
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
    window.CARD_VISIBILITY.mask(window.CARD_STARTUP_PREVIEW?.cards || []).find((c) => c.id === id);
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
    selected && session
      ? `<div class="qr-action-row">${window.CARD_TRADE?.markup("card", selected.id) || ""}${window.CARD_QR?.button("card", selected.id, name(selected)) || ""}</div>`
      : "";
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
let loginRequiredAt = 0;
let accountRequestEpoch = 0;
const accountRequests = new Set();
function stopAccountRequests() {
  accountRequestEpoch++;
  for (const controller of accountRequests) controller.abort();
  accountRequests.clear();
}
function requireEditingSession() {
  if (session?.user?.id) return true;
  showLoginRequired();
  return false;
}
function showLoginRequired() {
  if (maintenanceActive) return;
  const now = Date.now();
  if (now - loginRequiredAt < 800) return;
  loginRequiredAt = now;
  for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
  authResultShowing = false;
  callbackPending = false;
  void authChanged("SIGNED_OUT", null);
  authMode("login");
  screen("auth");
  history.replaceState(null, "", location.pathname + location.search);
  toast("ログインしてください", "error");
  setTimeout(() => toast("ログインしてください", "error"), 0);
}
function isAccountEditRequest(input, options = {}) {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
    location.href,
  );
  if (url.origin !== new URL(window.APP_CONFIG.supabaseUrl).origin) return false;
  const method = String(
    options.method || (input instanceof Request ? input.method : "GET"),
  ).toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method) || !url.pathname.startsWith("/rest/v1/"))
    return false;
  if (!url.pathname.startsWith("/rest/v1/rpc/")) return true;
  const name = decodeURIComponent(url.pathname.split("/").pop());
  return (
    /^card_admin_/.test(name) ||
    /^card_(?:album|verse)_(?:set_|change_|clear_|delete_|share_(?:issue|delete|restore|set_))/.test(
      name,
    )
  );
}
function isPrivateAccountRequest(input, options = {}) {
  if (isAccountEditRequest(input, options)) return true;
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
    location.href,
  );
  if (
    url.origin !== new URL(window.APP_CONFIG.supabaseUrl).origin ||
    !url.pathname.startsWith("/rest/v1/")
  )
    return false;
  const name = decodeURIComponent(url.pathname.split("/").pop());
  if (url.pathname.startsWith("/rest/v1/rpc/"))
    return (
      /^(?:card_account_presence_touch|card_album_touch_activity|card_verse_my_inventory)$/.test(
        name,
      ) || /^card_(?:qr_|save_code_|contact_reply_)/.test(name)
    );
  return new Set([
    "card_ownership",
    "card_favorites",
    "card_album_ids",
    "card_personal_metadata",
    "card_verse_ownership",
    "card_verse_coordinate_ownership",
    "card_verse_favorites",
    "card_contacts",
    "card_contact_replies",
    "card_qr_limit_notices",
    "card_album_shares",
    "card_private_qr",
    "card_save_codes",
  ]).has(name);
}
function accountLoginResponse() {
  return Response.json({ code: "PGRST301", message: "ログインしてください" }, { status: 401 });
}
async function accountGuardFetch(input, options = {}) {
  const editing = isAccountEditRequest(input, options);
  const privateRequest = isPrivateAccountRequest(input, options);
  if (!privateRequest) return window.CARD_MAINTENANCE.fetch(input, options);
  if (!session?.user?.id) {
    if (editing) showLoginRequired();
    return accountLoginResponse();
  }
  const uid = session.user.id,
    epoch = accountRequestEpoch,
    token = session.access_token;
  const controller = new AbortController();
  const callerSignal = options.signal || (input instanceof Request ? input.signal : null);
  const abort = () => controller.abort();
  if (callerSignal?.aborted) abort();
  else callerSignal?.addEventListener("abort", abort, { once: true });
  accountRequests.add(controller);
  let response;
  try {
    await window.CARD_MAINTENANCE.check();
    if (controller.signal.aborted) throw new DOMException("通信を中断しました", "AbortError");
    if (epoch !== accountRequestEpoch || session?.user?.id !== uid) return accountLoginResponse();
    response = await window.CARD_MAINTENANCE.fetch(input, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    accountRequests.delete(controller);
    callerSignal?.removeEventListener("abort", abort);
  }
  if (epoch !== accountRequestEpoch || session?.user?.id !== uid) return accountLoginResponse();
  if (response.status === 401 && session?.access_token === token && !maintenanceActive) {
    const client = db;
    showLoginRequired();
    void client?.auth.signOut({ scope: "local" }).catch(() => {});
  }
  return response;
}
const editingControls =
  "[data-toggle], [data-favorite], [data-verse-own], [data-verse-adjust], [data-verse-favorite], [data-trade-side], #modal-owned, #modal-favorite, #quantity-minus, #quantity-plus, #edit-nickname, #account-delete-confirm";
document.addEventListener(
  "click",
  (event) => {
    if (event.target.closest(editingControls) && !requireEditingSession()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
document.addEventListener(
  "submit",
  (event) => {
    if (event.target.id === "nickname-form" && !requireEditingSession()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);

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
    global: { fetch: accountGuardFetch },
  });
  db = client;
  if (mode === "signup") void refreshSignupRegistrationStatus();
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
  if (!invitationPage) buildMarquee();
  try {
    configureAlbumAuth();
    await window.CARD_MAINTENANCE.check();
    if (invitationPage) {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      await startInvitationRegistration(data.session);
      await initialCards;
      await fetchCatalog();
      return;
    }
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
    if (invitationPage) {
      invitationEnded = true;
      $("signup-registration-status").hidden = false;
      $("signup-registration-status").textContent =
        "招待登録を開始できませんでした。" + translatedError(e);
    } else if (confirmationCallback || callbackError)
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
      if (data === "__CARD_ALBUM_DELETED__") {
        $("auth-message").style.whiteSpace = "pre-line";
        throw Error("このアルバムは削除されています\n新規登録より新しいアルバムを作成してください");
      }
      email = data;
    }
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password: body.password,
    });
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
    throw Error(
      "登録を完了できませんでした。時間をおいて再度お試しください。改善しない場合はお問い合わせください。",
    );
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
    $("auth-message").textContent = translatedError(error);
  } finally {
    $("auth-submit").disabled = false;
  }
};
function updateLoginIdentifier() {
  const isEmail = $("email").value.includes("@");
  $("forgot").hidden = invitationPage || mode !== "login";
  $("resend").hidden = invitationPage || mode !== "login" || !isEmail || !pendingSignupEmail;
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
  renderSignupRegistrationAvailability();
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
  if (!db || signupBusy || invitationPage) return;
  signupBusy = true;
  renderSignupRegistrationAvailability();
  try {
    await refreshSignupRegistrationStatus({ force: true });
    if (signupRegistrationAllowed !== true) return;
    signupReservation = await albumAuth({ action: "reserve" });
    renderSignupStep("id");
  } catch (error) {
    await refreshSignupRegistrationStatus({ force: true });
    if (signupRegistrationAllowed !== false)
      $("signup-message").textContent = window.CARD_ERROR.message(error);
  } finally {
    signupBusy = false;
    renderSignupRegistrationAvailability();
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
    if (invitationPage) {
      invitationPage = false;
      invitationEnded = true;
      const url = new URL(location.href);
      url.searchParams.delete("view");
      history.replaceState(null, "", url.pathname + url.search);
      $("login-tab").parentElement.hidden = false;
      $("invitation-notice")?.remove();
      document.body.classList.remove("invitation-route");
      document.title = "カードアルバム";
      document.querySelector(".wordmark").setAttribute("href", "./");
      document.querySelector(".wordmark").setAttribute("aria-label", "カードアルバムのトップへ");
      document.querySelector('[data-signup-marker="id"]').textContent = "ID発行";
      $("guest-browse-link").hidden = !!session;
      document.querySelector(".id-expiry-note").textContent =
        "このままパスワード設定に進んでください。このページを離れると登録手続きを引き継げません。戻った際はIDを発行し直してください。";
      $("auth-normal-panel").querySelector("h2").textContent = "カードアルバムへようこそ";
    }
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
    window.CARD_TUTORIAL?.created(session?.user.id);
  } catch (error) {
    authResultShowing = false;
    $("signup-message").textContent = window.CARD_ERROR.message(error);
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
  else if (key === "qr") window.CARD_QR?.clear("card");
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
  $("probability-open").hidden = !session || !game || verseOpen;
  $("probability-back").hidden = !session || !game || !probabilitiesOpen;
  $("header-title").textContent = session
    ? $("selection").hidden
      ? nickname() + "のアルバム"
      : "カードアルバム"
    : "カードアルバム";
  const selectedGame = game || "aikatsu";
  $("game-switch").classList.toggle("is-aipri", selectedGame === "aipri");
  $("game-switch").classList.toggle("is-primagi", selectedGame === "primagi");
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
  if (!requireEditingSession() || !db) return;
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
  if (!card?.front || !card.source || card._visibility?.image) return false;

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
      window.CARD_VISIBILITY.mask(window.CARD_STARTUP_PREVIEW?.cards || []).find(
        (c) => c.id === image.closest(".marquee-card").dataset.preview,
      );
    prepareMarqueeImage(image, card);
  },
  true,
);
function buildMarquee() {
  if (invitationPage) return;
  const groups = $("auth-art").querySelectorAll(".marquee-group");
  if (groups.length !== 2) return;
  const signature = catalog.cards
    .map((c) => c.id + "|" + c.front + "|" + !!c._visibility?.image)
    .join(";");
  if (marqueeBootstrapped && $("auth-art").dataset.catalogSignature !== signature) {
    clearInterval(marqueeTimer);
    marqueePending.clear();
    marqueePools.aikatsu = [];
    marqueePools.aipri = [];
    marqueePositions.aikatsu = 0;
    marqueePositions.aipri = 0;
    groups.forEach((group) => group.replaceChildren());
    marqueeBootstrapped = false;
  }
  $("auth-art").dataset.catalogSignature = signature;
  if (!marqueeBootstrapped) {
    const displayCards = catalog.cards.length
      ? catalog.cards
      : window.CARD_VISIBILITY.mask(window.CARD_STARTUP_PREVIEW?.cards || []) || [];
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
        window.CARD_VISIBILITY.mask(window.CARD_STARTUP_PREVIEW?.cards || []).find(
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
  rare = window.CARD_VISIBILITY.rarityCode(rare);
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
    if (/^OP-?132$/.test(code)) return "SP";
    if (/^[A-Z0-9]+-\d+P$/.test(code)) return "パラレル";
    if (/^(?:AP(?:R)?\d+|OA\d+)M-\d+/.test(code)) return "ミラクル";
  }
  return window.CARD_VISIBILITY.rarity(c.rarity || "記載なし");
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
  rarity = window.CARD_VISIBILITY.rarityCode(rarity);
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
  if (!$("probabilities").hidden) return;
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
authMode(invitationPage || location.hash === "#signup" ? "signup" : "login");
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
    $("maintenance-check-message").textContent = window.CARD_ERROR.message(error);
  } finally {
    $("maintenance-refresh").disabled = false;
  }
};

let albumNewsFetchedAt = 0;
let albumNewsFlight = null;
const albumNewsPanel = document.createElement("div");
albumNewsPanel.className = "album-news";
albumNewsPanel.innerHTML =
  '<section class="album-news-box"><h2><span class="news-dot"></span>お知らせ</h2><div id="album-contact-replies"></div><div id="album-notices"></div></section><section class="album-news-box updates"><h2><span class="news-dot"></span>更新情報</h2><div id="album-updates"></div></section>';
$("selection").append(albumNewsPanel);
function albumNewsHTML(rows) {
  return rows
    .map(
      (row) =>
        `<details class="album-news-item"><summary><time datetime="${esc(row.posted_at)}">${esc(new Date(row.posted_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }))}</time><span>${row.reply ? '<small class="contact-reply-tag">返信</small>' : ""}${row.important ? '<small class="important-tag">重要</small>' : ""}${esc(row.title)}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></summary><p>${esc(row.body)}</p></details>`,
    )
    .join("");
}
function renderAlbumNews(rows, target) {
  const box = $(target);
  const latest = rows.slice(0, 5);
  box.innerHTML = latest.length
    ? albumNewsHTML(latest)
    : '<p class="album-news-empty">現在、掲載情報はありません</p>';
  if (rows.length <= 5) return;
  let cursor = latest[latest.length - 1];
  let loading = false;
  let loaded = false;
  const history = document.createElement("div");
  history.id = target + "-history";
  history.hidden = true;
  const list = document.createElement("div");
  history.append(list);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "album-news-history";
  button.textContent = "過去の情報も確認する";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", history.id);
  button.style.cssText =
    "display:block;margin:10px 0 0 auto;padding:4px 0;border:0;background:transparent;color:var(--accent);font:inherit;font-size:11px;line-height:1.6;box-shadow:none";
  const more = button.cloneNode(false);
  more.removeAttribute("aria-expanded");
  more.removeAttribute("aria-controls");
  more.textContent = "さらに過去の情報を確認する";
  more.hidden = true;
  history.append(more);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.className = "album-news-empty";
  status.hidden = true;
  box.append(history, status, button);
  function setExpanded(expanded) {
    history.hidden = !expanded;
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = expanded ? "折りたたむ" : "過去の情報も確認する";
    status.hidden = true;
  }
  async function loadOlder() {
    if (loading || !db || !session || maintenanceActive) return;
    loading = true;
    button.disabled = true;
    more.disabled = true;
    status.hidden = false;
    status.textContent = "読み込み中…";
    try {
      const result = await db
        .from("card_announcements")
        .select("id,title,body,posted_at,important")
        .eq("published", true)
        .eq("kind", target === "album-notices" ? "notice" : "update")
        .or(
          `posted_at.lt.${cursor.posted_at},and(posted_at.eq.${cursor.posted_at},id.lt.${cursor.id})`,
        )
        .order("posted_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(21);
      if (result.error) throw result.error;
      if (!session || maintenanceActive || !button.isConnected) return;
      const older = (result.data || []).slice(0, 20);
      list.insertAdjacentHTML("beforeend", albumNewsHTML(older));
      if (older.length) cursor = older[older.length - 1];
      more.hidden = (result.data || []).length <= 20;
      loaded = true;
      setExpanded(true);
    } catch {
      if (button.isConnected) {
        status.textContent = "過去の情報を読み込めませんでした。もう一度お試しください。";
        status.hidden = false;
      }
    } finally {
      loading = false;
      button.disabled = false;
      more.disabled = false;
    }
  }
  button.onclick = () => {
    if (loading) return;
    if (!history.hidden) setExpanded(false);
    else if (loaded) setExpanded(true);
    else loadOlder();
  };
  more.onclick = loadOlder;
}
async function loadAlbumNews() {
  if (!db || !session || maintenanceActive || $("selection").hidden) return;
  void loadContactReplyNews();
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
            .limit(6),
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

// 返信は公開お知らせとは別に取得し、ログイン中の本人のお知らせ欄に表示する。
function resetContactReplyNews() {
  const previous = loadContactReplyNews.state;
  if (previous) previous.cancelled = true;
  loadContactReplyNews.state = null;
  const box = document.getElementById("album-contact-replies");
  box?.replaceChildren();
  if (box) delete box.dataset.noticeOwner;
}
function loadContactReplyNews() {
  const box = document.getElementById("album-contact-replies");
  const user = session?.user.id;
  if (!box || !db || !user || maintenanceActive) {
    resetContactReplyNews();
    return Promise.resolve();
  }
  const previous = loadContactReplyNews.state;
  if (previous?.owner === user && previous.flight) return previous.flight;
  if (previous) previous.cancelled = true;
  box.dataset.noticeOwner = user;
  const state = { owner: user, cancelled: false, flight: null };
  loadContactReplyNews.state = state;
  const current = () =>
    !state.cancelled &&
    loadContactReplyNews.state === state &&
    session?.user.id === user &&
    !maintenanceActive;
  const list = document.createElement("div");
  const more = document.createElement("button");
  more.type = "button";
  more.className = "album-news-history";
  more.textContent = "以前の返信を表示";
  more.hidden = true;
  const status = document.createElement("p");
  status.className = "album-news-empty";
  status.setAttribute("role", "status");
  status.textContent = "返信を確認中…";
  box.replaceChildren(list, status, more);
  let cursor = null,
    busy = false;
  async function page() {
    if (busy || !current()) return;
    busy = true;
    more.disabled = true;
    status.textContent = "返信を確認中…";
    try {
      let query = db
        .from("card_contact_replies")
        .select("contact_id,body,created_at,updated_at")
        .eq("recipient_id", user)
        .order("created_at", { ascending: false })
        .order("contact_id", { ascending: false })
        .limit(21);
      if (cursor)
        query = query.or(
          `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},contact_id.lt.${cursor.contact_id})`,
        );
      const { data, error } = await query;
      if (!current()) return;
      if (error) throw error;
      const rows = (data || []).slice(0, 20);
      list.insertAdjacentHTML(
        "beforeend",
        albumNewsHTML(
          rows.map((row) => ({
            id: row.contact_id,
            title: "お問い合わせへの返信",
            body: "受付番号：" + row.contact_id + "\n\n" + row.body,
            posted_at: row.created_at,
            reply: true,
          })),
        ),
      );
      if (rows.length) cursor = rows[rows.length - 1];
      more.hidden = (data || []).length <= 20;
      status.textContent = "";
    } catch {
      if (current()) {
        status.textContent = "返信を読み込めませんでした。再度お試しください。";
        more.textContent = "返信を再読み込み";
        more.hidden = false;
      }
    } finally {
      busy = false;
      if (current()) more.disabled = false;
    }
  }
  more.onclick = page;
  state.flight = page().finally(() => {
    state.flight = null;
  });
  return state.flight;
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !document.getElementById("selection")?.hidden)
    void loadContactReplyNews();
});

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
$("nav").append($("game-switch"), headerOther);
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
  cardCharacter: (id) => catalog.cards.find((c) => c.id === id)?.character || "",
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
    if (family === "primagi") {
      game = null;
      document.body.classList.remove("game-primagi");
      screen("selection");
      updateHeader();
      history.replaceState(null, "", location.pathname);
      return;
    }
    aipriFamily = family;
    chooseGame("aipri");
  },
};
const verseScript = document.createElement("script");
window.CARD_TRADE_HOST = {
  closeTutorialMenu: () => closeMenu(),
  prepareTutorial(chapter = "basic") {
    if (game === "primagi" && chapter !== "share") chooseGame("aipri");
    filters = {};
    ownershipFilter = "all";
    favoriteFilter = duplicateFilter = false;
    window.CARD_TRADE?.clear("card");
    $("query").value = "";
    page = 1;
    if (game) {
      fillFilters();
      render();
    }
  },
  async refreshCommandData() {
    await Promise.all([loadOwnership(true), loadFavorites(true)]);
    window.CARD_VERSE?.reset();
    window.CARD_TRADE?.reset();
    if (game) render();
  },
  client: () => db,
  session: () => session,
  maintenance: () => maintenanceActive,
  game: () => game,
  family: () => aipriFamily,
  cards: () => catalog.cards,
  verse: () => window.CARD_VERSE?.tradeData(),
  quantity: (kind, id) =>
    kind === "card" ? quantityOf(id) : (window.CARD_VERSE?.tradeQuantity(kind, id) ?? 0),
  isVerse: () => !!$("verse") && !$("verse").hidden,
  screen,
  toast,
  back: () => {
    if (game === "primagi") {
      window.CARD_VERSE.open("primagi");
      return;
    }
    if (!game) {
      screen("selection");
      return;
    }
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
    }).catch((error) => {
      shareVerseWaiting = null;
      throw error;
    });
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

init();

/* dropdowns.js */
(() => {
  "use strict";
  if (window.CARD_SHARED_PAGE_READY === "album") return;
  const enhanced = new WeakMap();
  let active = null;
  let serial = 0;
  let query = "";
  let queryTimer;

  function close(restoreFocus = false) {
    if (!active) return;
    const { button, menu } = active;
    active = null;
    if (typeof menu.hidePopover === "function") {
      try {
        menu.hidePopover();
      } catch (_) {}
    }
    menu.remove();
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    if (restoreFocus && button.isConnected) button.focus();
    query = "";
    clearTimeout(queryTimer);
  }

  function sync(select) {
    const state = enhanced.get(select);
    if (!state) return;
    const value = select.selectedOptions[0]?.textContent || "選択してください";
    if (state.text.textContent !== value) state.text.textContent = value;
    if (state.button.disabled !== select.disabled) state.button.disabled = select.disabled;
    const label =
      select.getAttribute("aria-label") ||
      select.labels?.[0]?.querySelector(".filter-label")?.firstChild?.textContent ||
      select.labels?.[0]?.firstChild?.textContent ||
      "選択項目";
    state.button.setAttribute("aria-label", `${label.trim()}：${state.text.textContent}`);
  }

  function highlight(index) {
    if (!active) return;
    active.index = index;
    active.items.forEach((item, i) => item.classList.toggle("is-current", i === index));
    const item = active.items[index];
    if (item) {
      active.button.setAttribute("aria-activedescendant", item.id);
      item.scrollIntoView?.({ block: "nearest" });
    }
  }

  function choose(index) {
    if (!active) return;
    const { select, options } = active;
    const option = options[index];
    if (!option || option.disabled || option.parentElement.disabled) return;
    const changed = select.selectedIndex !== option.index;
    select.selectedIndex = option.index;
    close(true);
    sync(select);
    if (changed) {
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function open(select) {
    close();
    if (select.disabled) return;
    const { button } = enhanced.get(select);
    const options = Array.from(select.options);
    if (!options.length) return;
    const menu = document.createElement("div");
    menu.className = "album-select-menu";
    menu.id = button.getAttribute("aria-controls");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", button.getAttribute("aria-label"));
    const theme = getComputedStyle(select);
    for (const name of ["--accent", "--soft", "--line", "--muted"]) {
      menu.style.setProperty(name, theme.getPropertyValue(name));
    }
    let group = null;
    const items = options.map((option, i) => {
      if (option.parentElement.tagName === "OPTGROUP" && group !== option.parentElement) {
        group = option.parentElement;
        const heading = document.createElement("div");
        heading.className = "album-select-group";
        heading.textContent = group.label;
        heading.setAttribute("role", "presentation");
        menu.append(heading);
      }
      const item = document.createElement("div");
      item.id = `${menu.id}-${i}`;
      item.className = "album-select-option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.setAttribute(
        "aria-disabled",
        String(option.disabled || !!option.parentElement.disabled),
      );
      item.textContent = option.textContent;
      item.addEventListener("pointermove", () => highlight(i));
      item.addEventListener("click", () => choose(i));
      menu.append(item);
      return item;
    });
    const ownerDialog = select.closest("dialog");
    (ownerDialog || document.body).append(menu);
    if (ownerDialog && typeof menu.showPopover === "function") {
      menu.setAttribute("popover", "manual");
      menu.showPopover();
    }
    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0;
    const topEdge = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const menuWidth = Math.min(Math.max(rect.width, 180), width - 24);
    menu.style.width = `${menuWidth}px`;
    menu.style.left = `${Math.max(leftEdge + 12, Math.min(rect.left, leftEdge + width - menuWidth - 12))}px`;
    const below = topEdge + height - rect.bottom - 18;
    const above = rect.top - topEdge - 18;
    const upwards = below < 180 && above > below;
    const maxHeight = Math.max(80, Math.min(320, upwards ? above : below));
    menu.style.maxHeight = `${maxHeight}px`;
    menu.style.top = `${upwards ? Math.max(topEdge + 12, rect.top - Math.min(menu.scrollHeight, maxHeight) - 6) : rect.bottom + 6}px`;
    active = {
      select,
      button,
      menu,
      options,
      items,
      index: select.selectedIndex,
    };
    button.setAttribute("aria-expanded", "true");
    highlight(select.selectedIndex);
  }

  function keydown(event, select) {
    const key = event.key;
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(key)) {
      event.preventDefault();
      if (!active || active.select !== select) {
        open(select);
        return;
      }
      if (key === "Enter" || key === " ") {
        choose(active.index);
        return;
      }
      const allowed = active.options
        .map((option, i) => (option.disabled || option.parentElement.disabled ? -1 : i))
        .filter((i) => i >= 0);
      if (!allowed.length) return;
      const current = allowed.indexOf(active.index);
      const index =
        key === "Home"
          ? allowed[0]
          : key === "End"
            ? allowed.at(-1)
            : allowed[
                Math.max(0, Math.min(allowed.length - 1, current + (key === "ArrowDown" ? 1 : -1)))
              ];
      highlight(index);
    } else if (key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (key === "Tab") close();
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (!active) open(select);
      if (!active) return;
      query += key.toLocaleLowerCase();
      clearTimeout(queryTimer);
      queryTimer = setTimeout(() => {
        query = "";
      }, 650);
      const index = active.options.findIndex(
        (option) =>
          !option.disabled &&
          !option.parentElement.disabled &&
          option.textContent.trim().toLocaleLowerCase().startsWith(query),
      );
      if (index >= 0) highlight(index);
    }
  }

  function enhance(select) {
    if (enhanced.has(select) || select.multiple || select.size > 1) return;
    const wrapper = document.createElement("span");
    wrapper.className = "album-select";
    select.before(wrapper);
    wrapper.append(select);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "album-select-trigger";
    button.setAttribute("role", "combobox");
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", `album-select-menu-${++serial}`);
    if (select.getAttribute("aria-labelledby"))
      button.setAttribute("aria-labelledby", select.getAttribute("aria-labelledby"));
    const text = document.createElement("span");
    text.className = "album-select-value";
    const arrow = document.createElement("span");
    arrow.className = "album-select-chevron";
    arrow.setAttribute("aria-hidden", "true");
    button.append(text, arrow);
    wrapper.append(button);
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    enhanced.set(select, { button, text });
    sync(select);
    button.addEventListener("click", () => (active?.select === select ? close() : open(select)));
    button.addEventListener("keydown", (event) => keydown(event, select));
    select.addEventListener("change", () => sync(select));
    select.addEventListener("focus", () => button.focus());
    select.addEventListener("invalid", () => {
      button.focus();
    });
  }

  document.querySelectorAll("select").forEach(enhance);
  new MutationObserver((records) => {
    if (
      active &&
      (!active.select.isConnected ||
        active.select.disabled ||
        records.some((record) => active.select.contains(record.target)))
    )
      close();
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches("select")) enhance(node);
        node.querySelectorAll("select").forEach(enhance);
      }
      const select = record.target.closest?.("select");
      if (select) sync(select);
    }
    document.querySelectorAll(".album-select > select").forEach(sync);
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "selected", "label", "value"],
  });
  document.addEventListener("pointerdown", (event) => {
    if (active && !active.menu.contains(event.target) && !active.button.contains(event.target))
      close();
  });
  document.addEventListener(
    "scroll",
    (event) => {
      if (active && event.target !== active.menu && !active.menu.contains(event.target)) close();
    },
    true,
  );
  document.addEventListener(
    "close",
    (event) => {
      if (active && event.target.matches?.("dialog") && event.target.contains(active.select))
        close();
    },
    true,
  );
  document.addEventListener(
    "cancel",
    (event) => {
      if (active && event.target.matches?.("dialog") && event.target.contains(active.select)) {
        event.preventDefault();
        close(true);
      }
    },
    true,
  );
  window.addEventListener("resize", () => close());
  window.visualViewport?.addEventListener("resize", () => close());
  document.addEventListener("reset", (event) =>
    setTimeout(() => event.target.querySelectorAll("select").forEach(sync), 0),
  );
})();

/* card-columns.js */
(() => {
  "use strict";
  const grid = document.getElementById("cards");
  const control = document.querySelector(".mobile-column-control");
  if (!grid || !control) return;
  const key = "card-album-mobile-columns";
  let columns = "3";
  try {
    const saved = localStorage.getItem(key);
    if (saved === "2" || saved === "3") columns = saved;
  } catch {}
  function apply(value) {
    columns = value === "3" ? "3" : "2";
    grid.dataset.mobileColumns = columns;
    control.querySelectorAll("[data-card-columns]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.cardColumns === columns));
    });
  }
  control.addEventListener("click", (event) => {
    const button = event.target.closest("[data-card-columns]");
    if (!button || !control.contains(button)) return;
    apply(button.dataset.cardColumns);
    try {
      localStorage.setItem(key, columns);
    } catch {}
  });
  apply(columns);
})();

/* ui-settings.js */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const key = "card-display-preferences-v1";
  const options = [
    ["grayscale", "非所持カードを白黒にする", "一覧の画像に適用します"],
    ["hideText", "一覧の文字情報を非表示にする", "画像と所持ボタンを中心に表示します"],
    ["hideRates", "取得率を非表示にする", "取得率と、その内訳を隠します"],
    [
      "versePartsAsOwned",
      "持っているにパーツコンプを含める",
      "バースの所持状態の絞り込みに適用します。OFFではパーツコンプは「一部持っている」に含まれます。色・タグ・収集率は変わりません。",
    ],
  ];
  let prefs = {};
  const dialog = document.createElement("dialog");
  dialog.id = "display-settings-dialog";
  dialog.setAttribute("aria-labelledby", "display-settings-title");
  dialog.innerHTML = `<div class="modal-top"><h2 id="display-settings-title">詳細設定</h2><button type="button" id="display-settings-close" aria-label="閉じる">×</button></div><h3 class="display-settings-section-title">表示</h3><div class="display-settings-options">${options.map(([id, label, help]) => `<div><span class="display-setting-label"><span>${label}</span><small>${help}</small></span><button type="button" role="switch" data-display-setting="${id}" aria-label="${label}" aria-checked="false"><span aria-hidden="true"></span></button></div>`).join("")}</div><p class="display-settings-note">表示設定はアカウントに保存され、別の端末でも引き継がれます。</p><h3 class="display-settings-section-title">アカウント</h3><div class="display-account-actions"></div><p role="status" id="display-settings-status"></p>`;
  document.body.append(dialog);
  const actions = dialog.querySelector(".display-account-actions");
  actions.append($("edit-nickname"), $("logout"));
  const normalize = (value) =>
    Object.fromEntries(
      options.map(([id]) => [
        id,
        id === "versePartsAsOwned" ? value?.[id] !== false : value?.[id] === true,
      ]),
    );
  let owner = null,
    ready = false,
    generation = 0;
  let loading = null,
    saving = false,
    saveTimer = null;
  let pending = {};
  const currentUser = () => window.CARD_SHARE_HOST?.session()?.user.id || null;
  const client = () => window.CARD_SHARE_HOST.client();
  const localKey = (user) => key + ":" + user;
  function storeLocal() {
    if (!owner) return;
    try {
      localStorage.setItem(localKey(owner), JSON.stringify(prefs));
    } catch {}
  }
  function initialFor(user) {
    try {
      const cached = localStorage.getItem(localKey(user));
      if (cached) return normalize(JSON.parse(cached));
      const migrated = localStorage.getItem(key + ":migrated-user");
      if (!migrated || migrated === user)
        return normalize(JSON.parse(localStorage.getItem(key) || "{}"));
    } catch {}
    return normalize({});
  }
  async function flushSettings() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (saving || !ready || !owner || owner !== currentUser() || !Object.keys(pending).length)
      return;
    const user = owner,
      g = generation,
      patch = pending;
    pending = {};
    saving = true;
    try {
      const { data, error } = await client().rpc("card_album_display_save", { p_patch: patch });
      if (error || !data) throw error || Error("response");
      if (g !== generation || user !== currentUser()) return;
      prefs = { ...normalize(data), ...pending };
      storeLocal();
      apply();
      $("display-settings-status").textContent = "";
    } catch {
      if (g === generation && user === currentUser()) {
        pending = { ...patch, ...pending };
        $("display-settings-status").textContent =
          "設定をDBに保存できませんでした。この端末には保持しています。詳細設定を開き直すと再試行します。";
        window.CARD_SHARE_HOST.toast?.("表示設定をDBに保存できませんでした。", "error");
        return;
      }
    } finally {
      if (g === generation) saving = false;
    }
    if (g === generation && Object.keys(pending).length) flushSettings();
  }
  async function loadSettings() {
    if (!owner || loading || currentUser() !== owner) return;
    const user = owner,
      g = generation;
    const task = (async () => {
      try {
        const { data, error } = await client().rpc("card_album_display_load", {
          p_initial: initialFor(user),
        });
        if (error || !data) throw error || Error("response");
        if (g !== generation || user !== currentUser()) return;
        prefs = normalize(data);
        ready = true;
        storeLocal();
        try {
          localStorage.setItem(key + ":migrated-user", user);
        } catch {}
        $("display-settings-status").textContent = "";
      } catch {
        if (g === generation && user === currentUser())
          $("display-settings-status").textContent =
            "表示設定をDBから取得できませんでした。詳細設定を開き直して再試行してください。";
      } finally {
        if (g === generation) {
          loading = null;
          apply();
        }
      }
    })();
    loading = task;
    return task;
  }
  let appliedPartsAsOwned = true;
  function apply() {
    const includeParts = prefs.versePartsAsOwned !== false;
    if (includeParts !== appliedPartsAsOwned) {
      appliedPartsAsOwned = includeParts;
      window.CARD_VERSE?.refreshOwnershipFilter();
    }
    for (const [id] of options) {
      document.body.classList.toggle("display-" + id, prefs[id] === true);
      dialog
        .querySelector(`[data-display-setting="${id}"]`)
        .setAttribute("aria-checked", String(prefs[id] === true));
      dialog.querySelector(`[data-display-setting="${id}"]`).disabled = !ready;
    }
  }
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-display-setting]");
    if (!button) return;
    if (!ready || owner !== currentUser()) return;
    const setting = button.dataset.displaySetting;
    prefs[setting] = !prefs[setting];
    pending[setting] = prefs[setting];
    apply();
    storeLocal();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSettings, 250);
  });
  $("display-settings-open").onclick = () => {
    if (!window.CARD_SHARE_HOST?.session() || window.CARD_SHARE_HOST.maintenance()) return;
    if (!ready) loadSettings();
    else if (Object.keys(pending).length) flushSettings();
    window.CARD_SHARE_HOST.closeMenu();
    dialog.showModal();
    $("display-settings-close").focus({ preventScroll: true });
  };
  dialog.addEventListener("close", () => {
    if (ready) flushSettings();
  });
  $("display-settings-close").onclick = () => dialog.close();
  for (const id of ["edit-nickname", "logout"])
    $(id).addEventListener("click", () => dialog.close(), { capture: true });
  window.CARD_UI_SETTINGS = {
    get(id) {
      return id === "versePartsAsOwned" ? prefs[id] !== false : prefs[id] === true;
    },
    sync() {
      const user = currentUser();
      if (user !== owner) {
        generation++;
        clearTimeout(saveTimer);
        owner = user;
        ready = false;
        loading = null;
        saving = false;
        pending = {};
        prefs = user ? initialFor(user) : {};
        $("display-settings-status").textContent = "";
        apply();
        if (user) loadSettings();
      }
      const active = !!user;
      $("display-settings-open").hidden = !active;
      if (!active && dialog.open) dialog.close();
    },
  };
  function theme() {
    try {
      sessionStorage.setItem(
        "card-active-theme",
        document.body.classList.contains("game-primagi")
          ? "primagi"
          : document.body.classList.contains("game-aipri")
            ? "aipri"
            : "aikatsu",
      );
    } catch {}
  }
  theme();
  new MutationObserver(theme).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  function contactLink(event) {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && /\/contact\/?$/.test(url.pathname)) {
      url.searchParams.set(
        "theme",
        document.body.classList.contains("game-primagi")
          ? "primagi"
          : document.body.classList.contains("game-aipri")
            ? "aipri"
            : "aikatsu",
      );
      link.href = url.href;
    }
  }
  document.addEventListener("pointerdown", contactLink, true);
  document.addEventListener("click", contactLink, true);
  apply();
  window.CARD_UI_SETTINGS.sync();
})();

/* modal-scrollbar.js */
(() => {
  "use strict";
  if (window.CARD_SHARED_PAGE_READY === "album") return;
  const desktop = matchMedia("(min-width: 761px) and (hover: hover) and (pointer: fine)");
  const root = document.documentElement;
  const rail = document.createElement("div");
  rail.id = "modal-scroll-rail";
  rail.setAttribute("popover", "manual");
  rail.setAttribute("role", "scrollbar");
  rail.setAttribute("aria-orientation", "vertical");
  rail.setAttribute("aria-label", "モーダルをスクロール");
  rail.tabIndex = 0;
  const thumb = document.createElement("span");
  thumb.className = "modal-scroll-thumb";
  thumb.setAttribute("aria-hidden", "true");
  rail.append(thumb);
  let modal = null,
    target = null,
    frame = 0,
    drag = null;
  let trackHeight = 0,
    thumbHeight = 0,
    thumbTop = 0,
    nextId = 0,
    sequence = 0;
  const order = new WeakMap();
  const canPopover = typeof rail.showPopover === "function";
  const resize = new ResizeObserver(schedule);
  function scrollable(node) {
    return (
      node instanceof HTMLElement &&
      node !== rail &&
      !rail.contains(node) &&
      node.clientHeight > 0 &&
      node.scrollHeight > node.clientHeight + 1 &&
      /auto|scroll/.test(getComputedStyle(node).overflowY)
    );
  }
  function hideRail() {
    if (target) target.classList.remove("external-modal-scroll");
    if (rail.isConnected && canPopover) {
      try {
        rail.hidePopover();
      } catch (_) {}
    }
    if (drag && rail.hasPointerCapture(drag.id)) rail.releasePointerCapture(drag.id);
    drag = null;
  }
  function clear() {
    hideRail();
    resize.disconnect();
    rail.remove();
    modal = target = null;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function update() {
    frame = 0;
    const dialogs = [...document.querySelectorAll("dialog[open]")].filter((d) =>
      d.matches(":modal"),
    );
    dialogs.forEach((d) => {
      if (!order.has(d)) order.set(d, ++sequence);
    });
    const active = dialogs.sort((a, b) => order.get(a) - order.get(b)).at(-1);
    root.classList.toggle("album-modal-open", Boolean(active));
    if (!active) {
      clear();
      return;
    }
    if (active !== modal) {
      clear();
      modal = active;
      resize.observe(active);
    }
    if (!canPopover) {
      hideRail();
      target = null;
      return;
    }
    const candidates = [active, ...active.querySelectorAll("*")].filter(scrollable);
    const cardBody = active.id === "detail" ? active.querySelector(".modal-body") : null;
    const scroller = cardBody
      ? scrollable(cardBody)
        ? cardBody
        : null
      : scrollable(target) && active.contains(target)
        ? target
        : candidates.includes(active)
          ? active
          : candidates.sort(
              (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
            )[0];
    if (!scroller) {
      hideRail();
      target = null;
      return;
    }
    if (target !== scroller) {
      hideRail();
      resize.disconnect();
      target = scroller;
      resize.observe(active);
      if (target !== active) resize.observe(target);
      if (target.firstElementChild) resize.observe(target.firstElementChild);
    }
    // 内部のスクロール領域に追従し、画面内に収めます。
    const rect = target.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    const vv = window.visualViewport;
    const left = vv?.offsetLeft || 0,
      top = vv?.offsetTop || 0;
    const width = vv?.width || innerWidth,
      height = vv?.height || innerHeight;
    const y = Math.max(top + 8, box.top + 8);
    const bottom = Math.min(top + height - 8, box.bottom - 8);
    trackHeight = Math.max(0, bottom - y);
    const max = Math.max(0, target.scrollHeight - target.clientHeight);
    if (!max || trackHeight < 40) {
      hideRail();
      return;
    }
    if (!rail.isConnected || rail.parentElement !== active) active.append(rail);
    rail.style.left = Math.max(left + 2, Math.min(left + width - 10, box.right + 8)) + "px";
    rail.style.top = y + "px";
    rail.style.height = trackHeight + "px";
    try {
      if (!rail.matches(":popover-open")) rail.showPopover();
    } catch (_) {
      hideRail();
      return;
    }
    // 表示に成功した場合だけ、その領域の標準バーを隠します。
    target.classList.add("external-modal-scroll");
    if (!target.id) target.id = "modal-scroll-target-" + ++nextId;
    rail.setAttribute("aria-controls", target.id);
    rail.setAttribute("aria-valuemin", "0");
    rail.setAttribute("aria-valuemax", String(Math.round(max)));
    rail.setAttribute("aria-valuenow", String(Math.round(target.scrollTop)));
    thumbHeight = Math.min(
      trackHeight,
      Math.max(28, (trackHeight * target.clientHeight) / target.scrollHeight),
    );
    thumbTop = (trackHeight - thumbHeight) * Math.min(1, Math.max(0, target.scrollTop / max));
    thumb.style.height = thumbHeight + "px";
    thumb.style.transform = "translateY(" + thumbTop + "px)";
  }
  function move(y, offset) {
    if (!target) return;
    const ratio =
      (y - rail.getBoundingClientRect().top - offset) / Math.max(1, trackHeight - thumbHeight);
    target.scrollTop =
      Math.max(0, Math.min(1, ratio)) * Math.max(0, target.scrollHeight - target.clientHeight);
    schedule();
  }
  rail.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !target) return;
    e.preventDefault();
    rail.focus({ preventScroll: true });
    const y = e.clientY - rail.getBoundingClientRect().top;
    drag = {
      id: e.pointerId,
      offset: y >= thumbTop && y <= thumbTop + thumbHeight ? y - thumbTop : thumbHeight / 2,
    };
    rail.setPointerCapture(e.pointerId);
    move(e.clientY, drag.offset);
  });
  rail.addEventListener("pointermove", (e) => {
    if (drag?.id === e.pointerId) move(e.clientY, drag.offset);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    rail.addEventListener(type, () => {
      drag = null;
    });
  rail.addEventListener(
    "wheel",
    (e) => {
      if (!target) return;
      e.preventDefault();
      target.scrollTop +=
        e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? target.clientHeight : 1);
      schedule();
    },
    { passive: false },
  );
  rail.addEventListener("keydown", (e) => {
    if (!target || !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key))
      return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Home") target.scrollTop = 0;
    else if (e.key === "End") target.scrollTop = target.scrollHeight;
    else
      target.scrollTop +=
        (e.key.endsWith("Up") ? -1 : 1) *
        (e.key.startsWith("Page") ? target.clientHeight * 0.85 : 40);
    schedule();
  });
  new MutationObserver((records) => {
    let changed = false;
    for (const record of records) {
      if (record.target === rail || rail.contains(record.target)) continue;
      if (record.attributeName === "open" && record.target instanceof HTMLDialogElement) {
        if (record.target.open) order.set(record.target, ++sequence);
        else order.delete(record.target);
      }
      changed = true;
    }
    if (changed) schedule();
  }).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["open", "hidden"],
  });
  document.addEventListener(
    "scroll",
    (e) => {
      if (!modal) return;
      if (modal.contains(e.target) && scrollable(e.target) && e.target !== target) {
        hideRail();
        target = e.target;
        resize.observe(target);
      }
      schedule();
    },
    true,
  );
  document.addEventListener(
    "load",
    () => {
      if (modal) schedule();
    },
    true,
  );
  document.addEventListener("close", schedule, true);
  addEventListener("resize", schedule, { passive: true });
  desktop.addEventListener("change", schedule);
  window.visualViewport?.addEventListener("resize", schedule, { passive: true });
  window.visualViewport?.addEventListener("scroll", schedule, { passive: true });
  schedule();
})();

/* ownership-export.js */
(() => {
  "use strict";
  const host = window.CARD_SHARE_HOST;
  if (!host) return;
  const $ = (id) => document.getElementById(id),
    labels = {
      aikatsu: "アイカツアンコール",
      onegai: "おねがいアイプリ",
      himitsu: "ひみつのアイプリ",
      "verse-onegai": "おねがいアイプリバース",
      "verse-himitsu": "ひみつのアイプリバース",
      "verse-primagi": "ワッチャプリマジ！",
    };
  let owner = null,
    scopes = [],
    hasLink = false,
    token = null,
    busy = false,
    generation = 0,
    rateGeneration = 0,
    rates = null,
    sharing = false,
    seriesFilters = {},
    confirmedScopes = [],
    confirmedFilters = {},
    mutations = [],
    savingSettings = false,
    settingsLoaded = false;
  const seriesOptions = new Map();
  const dialog = document.createElement("dialog");
  dialog.id = "ownership-share-dialog";
  dialog.className = "ownership-share-dialog";
  dialog.setAttribute("aria-labelledby", "share-settings-title");
  dialog.innerHTML = `<button type="button" class="share-close" id="share-settings-close" aria-label="閉じる">×</button><span class="eyebrow">SHARE ALBUM</span><h2 id="share-settings-title">所持状況を共有</h2><p class="share-settings-intro">公開するアルバムを選んで、あなたのコレクションを共有。</p><details class="share-help"><summary>公開する情報・URLの取り扱い</summary><div><dl><dt>表示される情報</dt><dd>ニックネーム、「〇〇のカードアルバム」、公開をONにしたアルバムの、選択しただん数の所持状況・所持数。</dd><dt>表示されない情報</dt><dd>アルバムID・メールアドレス・お気に入り・譲求。URLにもアルバムIDは含まれません。</dd><dt>公開範囲と有効期間</dt><dd>URLを知っている方は登録・ログインなしで閲覧できます。URLは削除するまで有効で、ログアウト後も継続します。</dd><dt>変更の反映</dt><dd>公開設定と所持状況は同じURLへ反映されます。閲覧中も通信がつながっている間は自動更新されます。共有文の所持率は公開範囲に対して計算した値で、送信後は自動更新されません。</dd><dt>公開をやめるとき</dt><dd>種類ごとにOFFにするか、共有URLを削除してください。既に閲覧・保存・送信された情報は取り消せません。</dd></dl></div></details><div class="share-scope-settings">${Object.entries(
    labels,
  )
    .map(
      ([id, label]) =>
        `<div class="share-scope-row"><div class="share-scope-label"><span>${label}</span><small class="share-scope-state" id="share-scope-state-${id}" data-share-state="${id}"></small><button type="button" class="share-series-toggle" data-share-details="${id}" aria-expanded="false" aria-controls="share-series-${id}"><span class="share-details-chevron" aria-hidden="true"></span>細かく設定</button></div><button type="button" role="switch" aria-checked="false" data-share-scope="${id}" aria-describedby="share-scope-state-${id}" aria-label="${label}を公開"><span aria-hidden="true"></span></button><div class="share-series-panel" id="share-series-${id}" data-series-panel="${id}" hidden><p>公開するだん数・プロモにチェックを入れてください。</p><div class="share-series-list"></div><button type="button" class="share-series-all" data-share-series-all="${id}">すべて公開（今後の追加分も含む）</button></div></div>`,
    )
    .join(
      "",
    )}</div><p class="share-live-note">公開設定・所持状況は、発行済みのURLへ自動で反映されます。</p><p id="share-settings-status" role="status"></p><button type="button" id="share-issue" class="share-issue">所持状況を公開する</button><div id="share-link-area" hidden><label>閲覧用URL<input id="share-link-value" readonly type="text"></label><button type="button" id="share-send" class="share-send">所持率とURLを共有</button><div class="share-link-actions"><button type="button" id="share-link-copy">URLをコピー</button><a id="share-link-open" target="_blank" rel="noopener noreferrer">閲覧画面を開く</a></div></div><div id="share-restore-area" hidden><label>以前の共有URL<input id="share-restore-input" type="url" placeholder="発行済みのURLを貼り付け" autocomplete="off"></label><button type="button" id="share-restore">このURLを引き継ぐ</button></div><button type="button" id="share-delete" hidden>このURLの公開を終了</button><div id="share-delete-confirm" hidden role="group" aria-labelledby="share-delete-title"><strong id="share-delete-title">共有URLを削除しますか？</strong><p>今のURLは無効になり、閲覧できなくなります。カードや所持記録は残ります。再び公開する場合は、新しいURLを発行できます。</p><div><button type="button" id="share-delete-cancel">キャンセル</button><button type="button" id="share-delete-yes">URLを削除</button></div></div>`;
  document.body.append(dialog);
  const previousConfirm = $("share-delete-confirm");
  const deleteDialog = document.createElement("dialog");
  deleteDialog.id = "share-delete-confirm";
  deleteDialog.className = "share-delete-dialog";
  deleteDialog.setAttribute("role", "alertdialog");
  deleteDialog.setAttribute("aria-labelledby", "share-delete-title");
  deleteDialog.setAttribute("aria-describedby", "share-delete-description");
  deleteDialog.append(...previousConfirm.childNodes);
  previousConfirm.remove();
  deleteDialog.querySelector("p").id = "share-delete-description";
  const deleteClose = document.createElement("button");
  deleteClose.type = "button";
  deleteClose.className = "share-delete-close";
  deleteClose.setAttribute("aria-label", "閉じる");
  deleteClose.textContent = "×";
  deleteDialog.prepend(deleteClose);
  const deleteStatus = document.createElement("p");
  deleteStatus.id = "share-delete-status";
  deleteStatus.setAttribute("role", "alert");
  deleteDialog.querySelector("div").before(deleteStatus);
  document.body.append(deleteDialog);
  $("ownership-export-dialog")?.remove();
  $("ownership-export-open").textContent = "所持状況を共有";
  const current = () => host.session()?.user.id || null;
  function update() {
    dialog.querySelectorAll("[data-share-scope]").forEach((b) => {
      b.setAttribute("aria-checked", String(scopes.includes(b.dataset.shareScope)));
      b.disabled = !settingsLoaded || busy;
      const state = dialog.querySelector(`[data-share-state="${b.dataset.shareScope}"]`);
      const selected = seriesFilters[b.dataset.shareScope];
      if (state)
        state.textContent = !settingsLoaded
          ? "確認中…"
          : !scopes.includes(b.dataset.shareScope)
            ? "非公開"
            : Array.isArray(selected)
              ? selected.length
                ? `公開中 · ${selected.length}項目`
                : "選択なし（表示なし）"
              : "公開中 · すべて";
    });
    dialog.querySelectorAll("[data-share-details], [data-share-series-all]").forEach((b) => {
      b.disabled = !settingsLoaded || busy;
    });
    $("share-issue").hidden = hasLink;
    $("share-issue").disabled = busy || mutations.length > 0 || !scopes.length;
    $("share-restore-area").hidden = !hasLink || !!token;
    $("share-restore").disabled = busy;
    $("share-delete").hidden = !hasLink;
    $("share-delete").disabled = busy || mutations.length > 0;
    $("share-send").disabled =
      busy || mutations.length > 0 || sharing || !rates || !token || !scopes.length;
    $("share-delete-yes").disabled = busy || mutations.length > 0;
    $("share-delete-cancel").disabled = busy;
    deleteClose.disabled = busy;
    syncSeriesChecks();
    const valid = /^[0-9a-f]{64}$/.test(token || "");
    $("share-link-area").hidden = !valid;
    if (valid) {
      const url = new URL("share/", host.base());
      url.hash = token;
      $("share-link-value").value = url.href;
      $("share-link-open").href = url.href;
    } else {
      $("share-link-value").value = "";
      $("share-link-open").removeAttribute("href");
    }
  }
  async function prepareRates() {
    const revision = ++rateGeneration,
      g = generation,
      uid = current();
    rates = null;
    update();
    if (!uid || !scopes.length || mutations.length) return;
    try {
      const result = await host.rates([...scopes], seriesFilters);
      if (revision !== rateGeneration || g !== generation || uid !== current()) return;
      if (scopes.some((scope) => !Number.isFinite(Number(result[scope]))))
        throw Error("所持率を確認できませんでした。");
      rates = result;
    } catch (error) {
      if (revision === rateGeneration && g === generation && uid === current())
        $("share-settings-status").textContent = window.CARD_ERROR.message(error);
    } finally {
      if (revision === rateGeneration && g === generation) update();
    }
  }
  const shortLabels = {
    aikatsu: "アイカツ",
    onegai: "おねがい",
    himitsu: "ひみつ",
    "verse-onegai": "おねがいバース",
    "verse-himitsu": "ひみつバース",
    "verse-primagi": "プリマジ",
  };
  $("share-send").onclick = async () => {
    if (
      busy ||
      sharing ||
      mutations.length ||
      !rates ||
      !token ||
      !scopes.length ||
      current() !== owner ||
      host.maintenance()
    )
      return;
    const g = generation,
      uid = current();
    const text = [
      "カードアルバム所持率",
      "",
      ...Object.keys(labels)
        .filter((scope) => scopes.includes(scope))
        .map((scope) => shortLabels[scope] + "：" + Number(rates[scope]).toFixed(1) + "%"),
      "",
      "詳しくはこちらから（登録不要）↓",
      $("share-link-value").value,
    ].join("\n");
    sharing = true;
    update();
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        if (g === generation && uid === current()) host.toast("共有用文章をコピーしました");
      }
    } catch (error) {
      if (error.name !== "AbortError" && g === generation && uid === current())
        $("share-settings-status").textContent =
          "共有できませんでした。通信やブラウザーの設定を確認してください。";
    } finally {
      if (g === generation && uid === current()) {
        sharing = false;
        update();
      }
    }
  };
  function apply(data) {
    confirmedScopes = data.scopes.filter((s) => s in labels);
    confirmedFilters =
      data.series_filters && typeof data.series_filters === "object" ? data.series_filters : {};
    optimisticState();
    hasLink = data.has_link === true;
    token = data.token || null;
    rates = null;
    update();
    prepareRates();
  }
  function reset() {
    generation++;
    rateGeneration++;
    mutations = [];
    savingSettings = false;
    settingsLoaded = false;
    confirmedScopes = [];
    confirmedFilters = {};
    seriesFilters = {};
    dialog.querySelectorAll("[data-series-panel]").forEach((panel) => {
      panel.hidden = true;
    });
    dialog
      .querySelectorAll("[data-share-details]")
      .forEach((button) => button.setAttribute("aria-expanded", "false"));
    rates = null;
    sharing = false;
    owner = null;
    scopes = [];
    hasLink = false;
    token = null;
    busy = false;
    if (deleteDialog.open) deleteDialog.close();
    $("share-restore-input").value = "";
    update();
    if (dialog.open) dialog.close();
  }
  function sync() {
    if (owner && owner !== current()) reset();
  }
  async function run(name, args, onSuccess) {
    if (busy || mutations.length || !current() || host.maintenance()) return;
    const g = generation,
      user = current();
    busy = true;
    update();
    try {
      const r = await host.client().rpc(name, args);
      if (g !== generation || user !== current()) return;
      if (r.error) throw Error("保存できませんでした。通信状態をご確認ください。");
      onSuccess(r.data);
    } catch (error) {
      if (g === generation && user === current()) {
        $("share-settings-status").textContent = window.CARD_ERROR.message(error);
        if (deleteDialog.open) deleteStatus.textContent = window.CARD_ERROR.message(error);
      }
    } finally {
      if (g === generation && user === current()) {
        busy = false;
        update();
      }
    }
  }
  async function open() {
    if (!current() || host.maintenance()) return;
    host.closeMenu();
    if (owner === current() && (busy || savingSettings || mutations.length)) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    reset();
    owner = current();
    dialog.showModal();
    dialog.tabIndex = -1;
    dialog.focus({ preventScroll: true });
    $("share-settings-status").textContent = "公開設定を確認中…";
    await run("card_album_share_settings", {}, (data) => {
      if (!Array.isArray(data?.scopes)) throw Error("公開設定用SQLをご確認ください。");
      settingsLoaded = true;
      apply(data);
      $("share-settings-status").textContent =
        hasLink && !token
          ? "以前のURLはこの画面に再表示できません。以前のURLを貼り付けると、同じURLを引き継げます。"
          : "URLは削除するまで継続します。再ログイン後もここで確認できます。";
    });
  }
  function optimisticState() {
    const active = new Set(confirmedScopes);
    seriesFilters = { ...confirmedFilters };
    for (const change of mutations) {
      if (change.kind === "scope") {
        if (change.value) active.add(change.scope);
        else active.delete(change.scope);
      } else if (change.value === null) delete seriesFilters[change.scope];
      else seriesFilters[change.scope] = [...change.value];
    }
    scopes = Object.keys(labels).filter((scope) => active.has(scope));
  }
  function syncSeriesChecks() {
    dialog.querySelectorAll("[data-share-series]").forEach((input) => {
      input.disabled = !settingsLoaded || busy;
      input.checked =
        !Array.isArray(seriesFilters[input.dataset.shareSeries]) ||
        seriesFilters[input.dataset.shareSeries].includes(input.value);
    });
  }
  function queueChange(change) {
    if (!settingsLoaded || busy || !current() || current() !== owner || host.maintenance()) {
      update();
      return;
    }
    mutations.push(change);
    $("share-settings-status").textContent = "";
    optimisticState();
    rates = null;
    rateGeneration++;
    update();
    saveChanges();
  }
  async function saveChanges() {
    if (savingSettings || !mutations.length) return;
    savingSettings = true;
    const g = generation,
      uid = current();
    while (mutations.length && g === generation && uid === current()) {
      const change = mutations[0];
      try {
        const result = await host
          .client()
          .rpc(
            change.kind === "scope" ? "card_album_share_set_scope" : "card_album_share_set_series",
            change.kind === "scope"
              ? { p_scope: change.scope, p_enabled: change.value }
              : { p_scope: change.scope, p_series: change.value },
          );
        if (g !== generation || uid !== current()) return;
        if (result.error || !Array.isArray(result.data?.scopes)) throw Error();
        if (change.kind === "scope" && result.data.scopes.includes(change.scope) !== change.value)
          throw Error("公開状態を確認できませんでした。");
        let data = result.data;
        if (
          change.kind === "series" &&
          !Object.prototype.hasOwnProperty.call(data, "series_filters")
        ) {
          const check = await host.client().rpc("card_album_share_settings", {});
          if (g !== generation || uid !== current()) return;
          if (check.error || !Array.isArray(check.data?.scopes)) throw Error();
          data = check.data;
        }
        if (change.kind === "series") {
          const stored = data.series_filters?.[change.scope];
          if (
            change.value === null
              ? Array.isArray(stored)
              : !Array.isArray(stored) ||
                JSON.stringify([...stored].sort()) !== JSON.stringify([...change.value].sort())
          )
            throw Error("公開するだん数を確認できませんでした。");
        }
        confirmedScopes = data.scopes.filter((scope) => scope in labels);
        if (data.series_filters && typeof data.series_filters === "object")
          confirmedFilters = data.series_filters;
      } catch {
        if (g !== generation || uid !== current()) return;
        $("share-settings-status").textContent =
          "公開設定を保存できませんでした。変更を元に戻しました。";
        host.toast("公開設定の保存に失敗しました", "error");
      }
      mutations.shift();
      optimisticState();
      update();
    }
    if (g === generation && uid === current()) {
      savingSettings = false;
      prepareRates();
    }
  }
  async function openSeries(scope) {
    const panel = $("share-series-" + scope),
      button = dialog.querySelector('[data-share-details="' + scope + '"]');
    if (!settingsLoaded || busy || current() !== owner) return;
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
    if (panel.hidden || seriesOptions.has(scope)) return;
    const g = generation,
      uid = current();
    const list = panel.querySelector(".share-series-list");
    list.textContent = "だん数を読み込み中…";
    panel.setAttribute("aria-busy", "true");
    try {
      const rows = await host.scopeItems(scope);
      if (g !== generation || uid !== current()) return;
      const options = [
        ...new Set(
          rows.flatMap((row) =>
            scope.startsWith("verse-")
              ? (row.appearances || []).map((a) => a.series)
              : Array.isArray(row.series)
                ? row.series
                : row.series
                  ? [row.series]
                  : [],
          ),
        ),
      ]
        .filter(Boolean)
        .sort((a, b) =>
          scope === "verse-primagi"
            ? window.CARD_PRIMAGI.chapterRank(b) - window.CARD_PRIMAGI.chapterRank(a) ||
              b.localeCompare(a, "ja", { numeric: true })
            : b.localeCompare(a, "ja", { numeric: true }),
        );
      if (!options.length) throw Error();
      seriesOptions.set(scope, options);
      list.replaceChildren(
        ...options.map((value) => {
          const label = document.createElement("label"),
            input = document.createElement("input");
          input.type = "checkbox";
          input.dataset.shareSeries = scope;
          input.value = value;
          label.append(
            input,
            document.createTextNode(
              (scope === "verse-primagi"
                ? window.CARD_PRIMAGI.chapterLabel(value)
                : value
              ).replaceAll("弾", "だん"),
            ),
          );
          return label;
        }),
      );
      syncSeriesChecks();
    } catch {
      if (g === generation && uid === current()) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        host.toast("だん数を読み込めませんでした", "error");
      }
    } finally {
      if (g === generation && uid === current()) panel.removeAttribute("aria-busy");
    }
  }
  dialog.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-share-scope]"),
      detail = event.target.closest("[data-share-details]"),
      all = event.target.closest("[data-share-series-all]");
    if (toggle)
      queueChange({
        kind: "scope",
        scope: toggle.dataset.shareScope,
        value: !scopes.includes(toggle.dataset.shareScope),
      });
    else if (detail) openSeries(detail.dataset.shareDetails);
    else if (all)
      queueChange({
        kind: "series",
        scope: all.dataset.shareSeriesAll,
        value: null,
      });
  });
  dialog.addEventListener("change", (event) => {
    const input = event.target.closest("[data-share-series]");
    if (!input) return;
    const scope = input.dataset.shareSeries;
    const selected = new Set(
      Array.isArray(seriesFilters[scope]) ? seriesFilters[scope] : seriesOptions.get(scope) || [],
    );
    if (input.checked) selected.add(input.value);
    else selected.delete(input.value);
    queueChange({ kind: "series", scope, value: [...selected] });
  });
  $("share-issue").onclick = () => {
    if (hasLink || !scopes.length) return;
    run("card_album_share_issue", {}, (data) => {
      if (!/^[0-9a-f]{64}$/.test(data?.token || "")) throw Error("URLを発行できませんでした。");
      token = data.token;
      hasLink = true;
      prepareRates();
      $("share-settings-status").textContent =
        "共有URLを発行しました。削除するまで同じURLを使用できます。";
    });
  };
  $("share-restore").onclick = () => {
    let previous;
    try {
      const url = new URL($("share-restore-input").value.trim());
      const base = new URL("share/", host.base());
      if (url.origin !== base.origin || url.pathname !== base.pathname) throw Error();
      previous = url.hash.slice(1);
      if (!/^[0-9a-f]{64}$/.test(previous)) throw Error();
    } catch {
      $("share-settings-status").textContent = "以前の共有URLを貼り付けてください。";
      return;
    }
    run("card_album_share_restore", { p_token: previous }, (data) => {
      apply(data);
      $("share-settings-status").textContent = "同じ共有URLを引き継ぎました。";
      $("share-restore-input").value = "";
    });
  };
  $("share-delete").onclick = () => {
    if (busy || mutations.length || !hasLink || current() !== owner) return;
    deleteStatus.textContent = "";
    if (!deleteDialog.open) deleteDialog.showModal();
    deleteDialog.tabIndex = -1;
    deleteDialog.focus({ preventScroll: true });
  };
  function cancelDelete() {
    if (!busy) deleteDialog.close();
  }
  $("share-delete-cancel").onclick = cancelDelete;
  deleteClose.onclick = cancelDelete;
  deleteDialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  deleteDialog.addEventListener("close", () => {
    if (dialog.open && hasLink && current() === owner) dialog.focus({ preventScroll: true });
  });
  dialog.addEventListener("close", () => {
    if (deleteDialog.open) deleteDialog.close();
  });
  $("share-delete-yes").onclick = () =>
    run("card_album_share_delete", {}, () => {
      token = null;
      hasLink = false;
      deleteDialog.close();
      $("share-settings-status").textContent = "共有URLを削除しました。以前のURLは使用できません。";
    });
  $("share-link-copy").onclick = async () => {
    if (!current() || current() !== owner || !token) return;
    try {
      await navigator.clipboard.writeText($("share-link-value").value);
      host.toast("URLをコピーしました");
    } catch {
      $("share-link-value").focus();
      $("share-link-value").select();
      $("share-settings-status").textContent = "URLを選択してコピーしてください。";
    }
  };
  $("share-settings-close").onclick = () => dialog.close();
  $("ownership-export-open").onclick = open;
  window.CARD_SHARE = { sync, reset };
})();

/* mobile-modal-navigation.js */
(() => {
  "use strict";
  const dialog = document.getElementById("detail");
  const image = document.getElementById("modal-image");
  const viewer = dialog?.querySelector(".viewer");
  const navigation = dialog?.querySelector(".detail-navigation");
  const previous = document.getElementById("card-prev");
  const next = document.getElementById("card-next");
  if (!dialog || !image || !viewer || !navigation || !previous || !next) return;

  const media = window.matchMedia("(max-width: 760px), (max-height: 500px) and (pointer: coarse)");
  const style = document.createElement("style");
  style.textContent = `
    #detail .mobile-card-nav { display:none!important; }
    @media (max-width:760px), (max-height:500px) and (pointer:coarse) {
      #detail .detail-navigation { display:none!important; }
      #detail > .mobile-card-nav:not([hidden]) {
        position:absolute;display:grid!important;place-items:center;
        width:32px;height:32px;min-width:32px;min-height:32px;
        box-sizing:border-box;padding:0;margin:0;flex:none;
        border:1.5px solid var(--accent,#bd829c);border-radius:50%;
        background:rgba(255,255,255,.95);color:var(--accent,#bd829c);
        box-shadow:0 2px 8px #44334b12;z-index:6;
        transform:translateY(-50%);line-height:1;touch-action:manipulation;
        -webkit-tap-highlight-color:transparent;
        transition:background .12s,opacity .12s;
      }
      #detail .mobile-card-nav::before { content:"";position:absolute;inset:-6px;border-radius:50%; }
      #detail .mobile-card-nav svg { display:block;width:18px;height:18px;pointer-events:none; }
      #detail .mobile-card-nav:disabled { opacity:.32;box-shadow:none;cursor:default; }
      #detail .mobile-card-nav:not(:disabled):active { background:var(--soft,#f9edf2); }
      #detail .mobile-card-nav:focus:not(:focus-visible) { outline:none; }
      #detail .mobile-card-nav:focus-visible { outline:2px solid var(--accent,#bd829c);outline-offset:3px; }
    }`;
  document.head.append(style);
  const make = (source, label, triangle) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mobile-card-nav";
    button.hidden = true;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${triangle}" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!button.disabled && !navigation.hidden) source.click();
      schedule();
    });
    dialog.append(button);
    return button;
  };
  const left = make(previous, "前のカードを見る", "M14.5 5.5 6.5 12 14.5 18.5Z");
  const right = make(next, "次のカードを見る", "M9.5 5.5 17.5 12 9.5 18.5Z");
  let frame;
  function update() {
    frame = null;
    const show = media.matches && dialog.open && !navigation.hidden;
    left.hidden = right.hidden = !show;
    if (!show) return;
    left.disabled = previous.disabled;
    right.disabled = next.disabled;
    const picture = image.hidden ? viewer : image;
    const rect = picture.getBoundingClientRect();
    const modal = dialog.getBoundingClientRect();
    let width = rect.width;
    // object-fit:containによる余白がある場合は、実際の絵の左右へ配置。
    if (
      !image.hidden &&
      image.naturalWidth &&
      image.naturalHeight &&
      getComputedStyle(image).objectFit === "contain"
    ) {
      width =
        image.naturalWidth *
        Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    }
    const edge = rect.left + (rect.width - width) / 2;
    const size = 32;
    const minimum = modal.left + dialog.clientLeft + 3;
    const maximum = modal.right - dialog.clientLeft - size - 3;
    const clamp = (x) => Math.max(minimum, Math.min(x, maximum));
    const origin = modal.left + dialog.clientLeft - dialog.scrollLeft;
    const top = rect.top + rect.height / 2 - modal.top - dialog.clientTop + dialog.scrollTop;
    left.style.left = `${clamp(edge - size - 5) - origin}px`;
    right.style.left = `${clamp(edge + width + 5) - origin}px`;
    left.style.top = right.style.top = `${top}px`;
  }
  function schedule() {
    if (frame == null) frame = requestAnimationFrame(update);
  }
  new MutationObserver(schedule).observe(navigation, {
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "disabled"],
  });
  new MutationObserver(schedule).observe(dialog, {
    attributes: true,
    attributeFilter: ["open"],
  });
  new MutationObserver(schedule).observe(image, {
    attributes: true,
    attributeFilter: ["src", "hidden", "class", "style"],
  });
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(schedule);
    observer.observe(viewer);
    observer.observe(image);
    observer.observe(dialog);
  }
  image.addEventListener("load", schedule);
  image.addEventListener("error", schedule);
  dialog.addEventListener("close", schedule);
  dialog.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule, { passive: true });
  window.visualViewport?.addEventListener("resize", schedule, {
    passive: true,
  });
  media.addEventListener?.("change", schedule);
  schedule();
})();

/* app-shortcut.js */
(() => {
  "use strict";
  let installPrompt = null;
  let installing = false;
  const standalone = () =>
    window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    const status = document.getElementById("shortcut-status");
    if (status) status.textContent = "カードアルバムを追加しました。";
  });
  function mount() {
    const settings = document.getElementById("display-settings-dialog");
    if (!settings || document.getElementById("shortcut-add")) return false;
    const section = document.createElement("section");
    section.className = "shortcut-settings";
    const icon = new URL("./assets/images/icon.png", document.baseURI).href;
    section.innerHTML = `<h3 class="display-settings-section-title">ショートカット</h3><button type="button" id="shortcut-add" class="shortcut-setting-row"><img src="${icon}" width="36" height="36" alt=""><span class="shortcut-setting-label"><span>ホーム画面・デスクトップに追加</span><small>カードアルバムをすぐに開けます</small></span><svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true"><path d="m8 5 5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button><p id="shortcut-status" role="status" aria-live="polite"></p><div id="shortcut-guide" hidden></div>`;
    const accountTitle = [...settings.querySelectorAll("h3")].find(
      (el) => el.textContent === "アカウント",
    );
    settings.insertBefore(section, accountTitle || null);
    const button = section.querySelector("button");
    const status = section.querySelector("#shortcut-status");
    const guide = section.querySelector("#shortcut-guide");
    button.onclick = async () => {
      if (installing) return;
      guide.hidden = true;
      if (standalone()) {
        status.textContent = "現在、追加済みのアプリで開いています。";
        return;
      }
      if (installPrompt) {
        const prompt = installPrompt;
        installPrompt = null;
        installing = true;
        button.disabled = true;
        try {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          status.textContent =
            choice.outcome === "accepted"
              ? "追加を受け付けました。端末の画面をご確認ください。"
              : "追加をキャンセルしました。ブラウザーのメニューからも追加できます。";
        } catch {
          showGuide();
        } finally {
          installing = false;
          button.disabled = false;
        }
      } else {
        showGuide();
      }
    };
    function showGuide() {
      status.textContent = "ブラウザーのメニューから追加してください。";
      const appleMobile =
        /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (appleMobile) {
        guide.textContent =
          "Safariでこのサイトを開き、共有ボタン →「ホーム画面に追加」を選んでください。名前は「カードアルバム」です。";
      } else if (/Android/.test(navigator.userAgent)) {
        guide.textContent =
          "ブラウザーのメニュー（︙など）→「アプリをインストール」または「ホーム画面に追加」を選んでください。名前は「カードアルバム」です。";
      } else {
        guide.textContent =
          "Chrome・Edgeなどのブラウザーのメニューから「このサイトをアプリとしてインストール」などを選んでください。MacのSafariでは「ファイル」→「Dockに追加」から追加できます。表示される項目はブラウザーによって異なります。名前は「カードアルバム」です。";
      }
      guide.hidden = false;
    }
    return true;
  }
  const style = document.createElement("style");
  style.textContent = `
#display-settings-dialog .shortcut-settings { margin: 20px 0; }
#display-settings-dialog .shortcut-setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 14px 15px;
  box-sizing: border-box;
  border: 1px solid var(--line, #eadce3);
  border-radius: 15px;
  background: #fff;
  color: inherit;
  font: inherit;
  text-align: left;
  box-shadow: none;
  cursor: pointer;
  transition: background 140ms;
}
#display-settings-dialog .shortcut-setting-row:hover { background: var(--soft, #fff5f8); }
#display-settings-dialog .shortcut-setting-row:active { background: var(--soft, #fff5f8); }
#display-settings-dialog .shortcut-setting-row:focus:not(:focus-visible) { outline: none; box-shadow: none; }
#display-settings-dialog .shortcut-setting-row:disabled { opacity: .65; cursor: wait; }
.shortcut-setting-row > img { flex: 0 0 36px; border-radius: 9px; }
.shortcut-setting-label { display: grid; gap: 5px; flex: 1; min-width: 0; }
.shortcut-setting-label > span { font-size: 12px; font-weight: 400; line-height: 1.6; }
.shortcut-setting-label small { color: var(--muted, #81747b); font-size: 10px; font-weight: 400; line-height: 1.6; }
.shortcut-setting-row > svg { flex: 0 0 16px; color: var(--muted, #81747b); }
#shortcut-status:empty { display: none; }
#shortcut-status, #shortcut-guide { font-size: 10px; line-height: 1.8; color: var(--muted, #81747b); margin: 10px 2px 0; }
#shortcut-guide { padding: 12px; background: var(--soft, #fff5f8); border-radius: 11px; }
@media (max-width: 380px) {
  #display-settings-dialog .shortcut-setting-row { padding: 12px; gap: 9px; }
}
`;
  document.head.append(style);
  if (!mount()) {
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();

/* image-resolution.js */
(() => {
  "use strict";
  // Keep the original image available when a mobile canvas loses its backing store.
  const fallbackStyle = document.createElement("style");
  fallbackStyle.textContent = `html body img[data-low-resolution="true"],
    html body .public-share img[data-low-resolution="true"] { opacity: 1 !important; }`;
  document.head.append(fallbackStyle);
  const MAX_EDGE = 560;
  const LIST_MAX_EDGE = 420;
  // Keep native images in the touch-driven Verse view. Creating and removing
  // canvas overlays at the viewport edge must not compete with a slow pan.
  const touchImages = matchMedia("(pointer: coarse)").matches;
  const nativeVerseImage = (image) => touchImages && !!image.closest("#verse");
  const normalizedFrames =
    ".family-card-image,.coordinate-card-image,.card-image-frame,.marquee-image-frame,.album-card-frame,.verse-full-image,.verse-family-image,.verse-nav-image,.verse-part-image-frame,.verse-collage-item,.public-image,.public-banner-image,.public-modal-image";
  function orientedFrame(image) {
    return image.parentElement?.matches(normalizedFrames) && !image.closest("dialog");
  }
  const entries = new WeakMap();
  const canvasOwners = new WeakMap();
  function removeOrphans(image) {
    for (const canvas of image.parentElement?.querySelectorAll(
      ":scope > canvas.low-resolution-image",
    ) || []) {
      if (!canvasOwners.has(canvas)) canvas.remove();
    }
    if (!entries.has(image)) image.removeAttribute("data-low-resolution");
  }
  const pending = new Set();
  let frame = null;
  const inView = new WeakSet();
  const visibility =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
          (records) => {
            for (const record of records) {
              if (record.isIntersecting) {
                inView.add(record.target);
                schedule(record.target);
              } else {
                inView.delete(record.target);
                clear(record.target);
              }
            }
          },
          { rootMargin: "240px 0px" },
        )
      : null;
  function official(image) {
    if (image.closest(".trade-shot-image")) return false;
    try {
      const host = new URL(image.getAttribute("src") || "", location.href).hostname;
      return (
        host === "aipri.jp" || host === "dcd.aikatsu.com" || host === "www.takaratomy-arts.co.jp"
      );
    } catch {
      return false;
    }
  }
  function clear(image) {
    const entry = entries.get(image);
    if (entry) {
      entry.canvas.remove();
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    }
    image.removeAttribute("data-low-resolution");
    entries.delete(image);
  }
  function draw(image) {
    if (nativeVerseImage(image)) {
      clear(image);
      return;
    }
    if (!image.isConnected || !image.complete || !image.naturalWidth || !image.naturalHeight) {
      clear(image);
      return;
    }
    const maxEdge =
      image.closest("#cards, #verse-cards, #public-cards") && !image.closest("dialog")
        ? LIST_MAX_EDGE
        : MAX_EDGE;
    const parent = image.parentElement;
    const normalizedFrame = !!parent?.matches(normalizedFrames);
    const rotated = !!orientedFrame(image) && image.naturalWidth > image.naturalHeight;
    if (orientedFrame(image) && parent.classList.contains("landscape") !== rotated)
      parent.classList.toggle("landscape", rotated);
    if (!official(image) && !rotated) {
      clear(image);
      return;
    }
    if (!rotated && Math.max(image.naturalWidth, image.naturalHeight) <= maxEdge) {
      clear(image);
      return;
    }
    if (!parent || image.hidden) {
      clear(image);
      return;
    }

    const savedTransition = image.style.getPropertyValue("transition");
    const savedTransitionPriority = image.style.getPropertyPriority("transition");
    image.style.setProperty("transition", "none", "important");
    image.removeAttribute("data-low-resolution");
    const style = getComputedStyle(image);
    const properties = {
      width: style.width,
      height: style.height,
      boxSizing: style.boxSizing,
      border: style.border,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      background: style.background,
      padding: style.padding,
      transform: style.transform,
      transformOrigin: style.transformOrigin,
      filter: style.filter,
      opacity: style.opacity,
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
      zIndex: style.zIndex,
    };
    if (savedTransition)
      image.style.setProperty("transition", savedTransition, savedTransitionPriority);
    else image.style.removeProperty("transition");
    if (
      !image.getClientRects().length ||
      image.clientWidth === 0 ||
      image.clientHeight === 0 ||
      style.display === "none"
    ) {
      clear(image);
      return;
    }
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    let entry = entries.get(image);
    if (!entry || entry.parent !== parent || !entry.canvas.isConnected) {
      clear(image);
      removeOrphans(image);
      const canvas = document.createElement("canvas");
      canvas.className = "low-resolution-image";
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.pointerEvents = "none";
      image.after(canvas);
      entry = { canvas, parent, src: "", width: 0, height: 0 };
      entries.set(image, entry);
      canvasOwners.set(canvas, image);
      canvas.addEventListener("contextlost", () => {
        if (entries.get(image)?.canvas === canvas) clear(image);
      });
    }
    const ratio = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const scaledWidth = Math.max(1, Math.round(image.naturalWidth * ratio));
    const scaledHeight = Math.max(1, Math.round(image.naturalHeight * ratio));
    const width = rotated ? scaledHeight : scaledWidth;
    const height = rotated ? scaledWidth : scaledHeight;
    if (
      entry.src !== image.currentSrc ||
      entry.width !== width ||
      entry.height !== height ||
      entry.rotated !== rotated ||
      !entry.canvas.isConnected
    ) {
      entry.canvas.width = width;
      entry.canvas.height = height;
      let context;
      try {
        context = entry.canvas.getContext("2d");
      } catch {
        clear(image);
        return;
      }
      if (!context) {
        clear(image);
        return;
      }
      try {
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";

        if (rotated) {
          context.translate(width / 2, height / 2);
          context.rotate(Math.PI / 2);
          context.drawImage(image, -scaledWidth / 2, -scaledHeight / 2, scaledWidth, scaledHeight);
        } else context.drawImage(image, 0, 0, width, height);
      } catch {
        clear(image);
        return;
      }
      entry.src = image.currentSrc;
      entry.width = width;
      entry.height = height;
      entry.rotated = rotated;
    }
    Object.assign(entry.canvas.style, properties, {
      position: "absolute",
      left: image.offsetLeft + "px",
      top: image.offsetTop + "px",
      right: "auto",
      bottom: "auto",
      margin: "0",
      display: "block",
      maxWidth: "none",
      maxHeight: "none",
      pointerEvents: "none",
    });
    if (normalizedFrame) {
      Object.assign(entry.canvas.style, {
        left: "0px",
        top: "0px",
        right: "auto",
        bottom: "auto",
        width: "100%",
        height: "100%",
        margin: "0",
        padding: "0",
        border: "0",
        borderRadius: "inherit",
        boxShadow: "none",
        background: "transparent",
        transform: "none",
        transformOrigin: "center",
        objectFit: "contain",
        objectPosition: "center",
        zIndex: "1",
      });
    }
    if (!entry.canvas.isConnected) {
      clear(image);
      return;
    }
    image.setAttribute("data-low-resolution", "true");
  }
  function schedule(image) {
    if (!(image instanceof HTMLImageElement) || !image.isConnected) return;
    if (nativeVerseImage(image)) {
      clear(image);
      return;
    }
    if (image.hidden) {
      clear(image);
      return;
    }
    if (visibility && !inView.has(image)) return;
    pending.add(image);
    queueFrame();
  }
  function queueFrame() {
    if (frame !== null || !pending.size) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const started = performance.now();
      let count = 0;

      for (const image of pending) {
        pending.delete(image);
        if (!image.isConnected || (visibility && !inView.has(image))) continue;
        draw(image);
        if (++count >= 2 || performance.now() - started >= 4) break;
      }
      queueFrame();
    });
  }
  const resize =
    typeof ResizeObserver === "function"
      ? new ResizeObserver((records) => {
          for (const record of records) schedule(record.target);
        })
      : null;
  const watched = new WeakSet();
  function scan(root) {
    const images = root instanceof HTMLImageElement ? [root] : root.querySelectorAll?.("img") || [];
    for (const image of images) {
      removeOrphans(image);
      if (nativeVerseImage(image)) {
        clear(image);
        continue;
      }
      if (!watched.has(image)) {
        watched.add(image);
        resize?.observe(image);
        visibility?.observe(image);
      }
      if (official(image) || (orientedFrame(image) && image.naturalWidth > image.naturalHeight))
        schedule(image);
      else clear(image);
    }
  }
  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLImageElement) schedule(event.target);
    },
    true,
  );
  document.addEventListener(
    "error",
    (event) => {
      if (event.target instanceof HTMLImageElement) clear(event.target);
    },
    true,
  );
  window.addEventListener("resize", () => scan(document));
  function restoreVisibleImages() {
    document.querySelectorAll('img[data-low-resolution="true"]').forEach(clear);
    scan(document);
  }
  window.addEventListener("pageshow", restoreVisibleImages);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) restoreVisibleImages();
  });

  const observer = new MutationObserver((records) => {
    const roots = new Set();
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.removedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.("canvas.low-resolution-image")) {
            const owner = canvasOwners.get(node);
            if (owner && entries.get(owner)?.canvas === node && !node.isConnected) clear(owner);
          }
          const images =
            node instanceof HTMLImageElement ? [node] : node.querySelectorAll?.("img") || [];
          for (const image of images) {
            resize?.unobserve(image);
            visibility?.unobserve(image);
            inView.delete(image);
            watched.delete(image);
            pending.delete(image);
            clear(image);
          }
        }
        for (const node of record.addedNodes)
          if (node.nodeType === 1 && !node.matches?.("canvas.low-resolution-image"))
            roots.add(node);
      } else if (record.target instanceof HTMLImageElement && record.attributeName === "src") {
        clear(record.target);
        removeOrphans(record.target);
        schedule(record.target);
      } else roots.add(record.target);
    }
    for (const root of roots) {
      if (!root.isConnected) continue;
      if ([...roots].some((other) => other !== root && other.contains(root))) continue;
      scan(root);
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "class", "hidden", "open"],
  });
  scan(document);
})();

/* aipri-verse.js */
(() => {
  "use strict";
  const host = window.CARD_VERSE_HOST;
  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "").replace(
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
  const familyName = (value) =>
    value === "primagi" ? "ワッチャプリマジ！" : value === "onegai" ? "おねがい" : "ひみつの";
  const seriesName = (value) =>
    value === "primagi" ? "ワッチャプリマジ！" : familyName(value) + "アイプリ";
  const displayLabel = (value) => String(value || "").replaceAll("弾", "だん");
  const chapterDisplayLabel = (value) =>
    displayLabel(family === "primagi" ? window.CARD_PRIMAGI.chapterLabel(value) : value);
  const cacheKey = "card-verse-public:" + new URL(window.APP_CONFIG.supabaseUrl).hostname;
  let catalog = null,
    parts = new Map(),
    owned = new Set(),
    owner = null;
  let partQuantities = new Map(),
    fullQuantities = new Map();
  const quantityQueues = new Map();
  let inventoryRevision = 0;
  const inventoryChanges = new Map();
  function markInventoryChange(key) {
    inventoryChanges.set(key, ++inventoryRevision);
  }
  function preserveInventoryChanges(nextParts, nextFull, nextFavorites, revision) {
    for (const [key, changedAt] of inventoryChanges) {
      if (
        changedAt <= revision &&
        !quantityQueues.has(key) &&
        !(key.startsWith("favorite:") && favoriteBusy.has(key.slice(9)))
      )
        continue;
      if (key.startsWith("favorite:")) {
        const id = key.slice(9);
        if (favorites.has(id)) nextFavorites.add(id);
        else nextFavorites.delete(id);
        continue;
      }
      const isPart = key.startsWith("part:");
      const id = isPart ? Number(key.slice(5)) : key.slice(5);
      const source = isPart ? partQuantities : fullQuantities;
      const target = isPart ? nextParts : nextFull;
      if (source.has(id)) target.set(id, source.get(id));
      else target.delete(id);
    }
  }
  let primagiRarity = "";
  let primagiVerseCompatibility = "";
  let family = "onegai",
    series = "",
    group = "",
    query = "",
    collectionSeries = "",
    collectionFilter = "all",
    ownershipView = "all",
    favoriteOnly = false,
    duplicateOnly = false;
  let favorites = new Set();
  const favoriteBusy = new Set();
  let page = 1,
    maxPage = 1,
    columns = "3",
    size = 20,
    selected = null,
    loading = null,
    checkedAt = 0;
  let collectionKey = "",
    cardListKey = "";
  let generation = 0,
    viewGeneration = 0,
    ownedCheckedAt = 0,
    ready = false;
  let inventoryLoading = null,
    lastWarmAt = 0;
  const busy = new Set();
  const button = document.createElement("button");
  button.id = "verse-enter";
  button.type = "button";
  button.className = "text-button";
  button.textContent = "バースへ";
  button.hidden = true;
  $("total").before(button);
  const mobileRoute = document.createElement("button");
  mobileRoute.id = "verse-mobile-route";
  mobileRoute.type = "button";
  mobileRoute.hidden = true;
  mobileRoute.className = "verse-nav-link verse-mobile-route";
  function placeRoute() {
    // Moving an existing control can disturb focus and scroll anchoring in Safari.
    const mobile = window.innerWidth <= 760;
    const anchor = $(mobile ? "menu-toggle" : "game-switch");
    if (mobile) {
      if (anchor.previousElementSibling !== mobileRoute) anchor.before(mobileRoute);
    } else if (anchor.nextElementSibling !== mobileRoute) anchor.after(mobileRoute);
  }
  placeRoute();
  const panel = document.createElement("section");
  panel.id = "verse";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="verse-heading"><div><span class="eyebrow">AIPRI VERSE</span><h1 id="verse-title">アイプリバース</h1></div><button id="verse-back" class="verse-nav-link" type="button">カード一覧へ</button><span id="verse-total" class="pill"></span></div>
    <div class="verse-families" role="group" aria-label="アイプリのシリーズ"><button type="button" data-verse-family="onegai"></button><button type="button" data-verse-family="himitsu"></button></div>
    <div class="progress-card verse-progress"><div><span>コーデ総取得率</span><strong id="verse-percent">—</strong></div><div class="progress-track"><span id="verse-progress-bar"></span></div><div class="progress-bottom"><p id="verse-count"></p><button id="verse-progress-details" class="text-button" type="button" aria-expanded="false" aria-controls="verse-series-progress" aria-label="だんごとの取得率を表示"><span class="progress-chevron" aria-hidden="true"></span></button></div><div id="verse-series-progress" hidden></div><div id="verse-filtered-rate"></div></div>
    <details id="verse-collection"><summary><span>コーデ収集状況</span><span id="verse-collection-count"></span><span class="verse-chevron" aria-hidden="true"></span></summary><div class="verse-disclosure"><label class="verse-collection-select">だん数<select id="verse-collection-series"></select></label><div class="verse-collection-options"><button type="button" data-verse-collection="complete" aria-pressed="false">収集済のみ</button><button type="button" data-verse-collection="one-away" aria-pressed="false">あと1つで完成</button></div><div id="verse-collection-list"></div><p id="verse-collection-empty" hidden>該当するコーデがありません</p></div></details>
    <details id="verse-filters"><summary><span>コーデを絞り込む</span><span id="verse-filter-summary" class="filter-summary"></span><span class="verse-chevron" aria-hidden="true"></span></summary><div class="verse-disclosure"><label class="verse-search"><span>フリーワード検索<button type="button" class="filter-clear" data-verse-clear="query">解除</button></span><input id="verse-query" type="search" placeholder="コーデ名・コード・キャンペーン名" autocomplete="off"></label><div class="verse-filter-grid"><label id="primagi-verse-compat-field" hidden><span>アイプリバース対応<button type="button" class="filter-clear" data-verse-clear="primagi-verse-compat">解除</button></span><select id="primagi-verse-compat"><option value="">すべて</option><option value="supported">対応コーデ（全パーツ）</option><option value="partial">一部パーツのみ対応</option><option value="unlisted">公式一覧に掲載なし・未確認</option></select></label><label id="primagi-rarity-field" hidden><span>レアリティ<button type="button" class="filter-clear" data-verse-clear="primagi-rarity">解除</button></span><select id="primagi-rarity"></select></label><label><span>だん数<button type="button" class="filter-clear" data-verse-clear="series">解除</button></span><select id="verse-series"></select></label><label><span>ガチャ・キャンペーン<button type="button" class="filter-clear" data-verse-clear="group">解除</button></span><select id="verse-group"></select></label><label><span>お気に入り<button type="button" class="filter-clear" data-verse-clear="favorite">解除</button></span><select id="verse-favorite-filter"><option value="all">すべて</option><option value="only">お気に入りのみ</option></select></label><label><span>重複<button type="button" class="filter-clear" data-verse-clear="duplicate">解除</button></span><select id="verse-duplicate-filter"><option value="all">すべて</option><option value="only">重複あり</option></select></label><label id="verse-qr-filter" for="verse-qr-select"><span class="filter-label">QRコード<button type="button" class="filter-clear" data-qr-clear="coordinate">解除</button></span><select id="verse-qr-select" data-qr-filter="coordinate" disabled><option value="all">すべて</option><option value="yes">QR登録済み</option><option value="no">QR未登録</option></select></label></div><p id="primagi-verse-compat-source" hidden class="primagi-verse-compat-source">対応状況は公式の対象一覧（2026年10月30日確認）に基づきます。<a href="https://aipri.jp/verse/howto/6.html" target="_blank" rel="noopener noreferrer">公式情報</a></p><div class="verse-clear-row"><button id="verse-clear" type="button" class="text-button">全ての絞り込みを解除</button></div></div></details>
    <div id="verse-active-filters" class="verse-active-filters"></div>
    <div class="verse-owned-tabs owned-tabs" role="group" aria-label="コーデの所持状態"><span class="verse-owned-slider owned-tabs-slider" aria-hidden="true"></span><button type="button" data-verse-view="all">すべて</button><button type="button" data-verse-view="full">持っている</button><button type="button" data-verse-view="partial">一部持っている</button><button type="button" data-verse-view="none">持っていない</button></div>
    <p id="verse-message" role="status"></p><div class="verse-list-toolbar"><h2 id="verse-found"></h2><div class="verse-display-controls"><label class="verse-display-count display-count"><span>表示件数</span><select id="verse-size"><option value="20">20</option><option value="50">50</option><option value="100">100</option><option value="all">すべて</option></select></label><div class="verse-column-control"><span>コーデの並び</span><div class="verse-column-segment" role="group" aria-label="スマホのコーデ列数"><button type="button" data-verse-columns="2">2列</button><button type="button" data-verse-columns="3">3列</button></div></div></div></div>
    <div id="verse-cards" class="verse-cards"></div><p id="verse-empty" hidden><strong>見つかりませんでした</strong><span>条件を変えて探してみてください</span></p><section id="verse-related-search" class="verse-related-search" aria-label="別シリーズの検索結果" hidden><p data-related-message role="status"></p><button type="button" data-verse-related-family></button><small>フリーワードを引き継ぎ、ほかの絞り込みを解除して表示します。</small></section><nav id="verse-pages" class="verse-pages" aria-label="コーデ一覧のページ"></nav>
    <div class="verse-sync"><button id="verse-sync" type="button" class="catalog-update-text" aria-label="コーデ情報を更新する">コーデ情報の更新</button></div>`;
  $("collection").after(panel);
  window.CARD_QR?.mountFilters?.();
  const dialog = document.createElement("dialog");
  dialog.id = "verse-detail";
  dialog.innerHTML = `<button id="verse-close" class="verse-close" type="button" aria-label="閉じる">×</button><div id="verse-detail-content"></div>`;
  document.body.append(dialog);
  function currentUser() {
    return host.session()?.user.id || null;
  }
  const trade = () => window.CARD_TRADE;
  function full(c) {
    return (fullQuantities.get(c.id) || 0) > 0;
  }
  function partsComplete(c) {
    return c.part_ids.length > 0 && c.part_ids.every((id) => owned.has(id));
  }
  function collected(c) {
    return full(c) || partsComplete(c);
  }
  function ownershipClass(c) {
    return full(c)
      ? "is-owned"
      : partsComplete(c)
        ? "is-parts-complete"
        : got(c)
          ? "is-partial"
          : "";
  }
  function quantity(c, part = null) {
    return (part === null ? fullQuantities.get(c.id) : partQuantities.get(part)) || 0;
  }
  function duplicate(c) {
    return quantity(c) >= 2 || c.part_ids.some((id) => (partQuantities.get(id) || 0) >= 2);
  }
  function refreshEffectiveOwnership() {
    owned = new Set([...partQuantities].filter(([, q]) => q > 0).map(([id]) => id));
  }
  function duplicateBadge(c) {
    return duplicate(c) ? '<span class="verse-duplicate-tag">重複あり</span>' : "";
  }
  function quantityControls(c, part = null) {
    const q = quantity(c, part),
      target = part === null ? "" : `data-verse-part="${part}"`;
    return `<div class="verse-quantity" role="group" aria-label="${part === null ? "フルコーデ" : esc(parts.get(part)?.slot)}の所持数"><button type="button" data-verse-adjust="-1" data-verse-own="${esc(c.id)}" ${target} aria-label="所持数を1減らす" ${!ready || q === 0 ? "disabled" : ""}>−</button><span class="verse-quantity-value" data-verse-quantity="${esc(c.id)}" ${target} aria-live="polite">${q}枚</span><button type="button" data-verse-adjust="1" data-verse-own="${esc(c.id)}" ${target} aria-label="所持数を1増やす" ${!ready || q >= 9999 ? "disabled" : ""}>＋</button></div>`;
  }
  function ownControl(c, part = null) {
    return `<div class="verse-own-control">${ownedButton(c, part, true)}${quantityControls(c, part)}</div>`;
  }
  function pool() {
    return catalog?.coordinates.filter((c) => c.family === family) || [];
  }
  function appearances(c) {
    return c.appearances || [];
  }
  function got(c) {
    return c.part_ids.filter((id) => owned.has(id)).length;
  }
  function state(c) {
    return full(c) ||
      (window.CARD_UI_SETTINGS?.get("versePartsAsOwned") !== false && partsComplete(c))
      ? "full"
      : got(c)
        ? "partial"
        : "none";
  }
  const compact = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replaceAll("だん", "弾")
      .replace(/[\s_-]/g, "");
  function matchesQuery(c, needle = compact(query)) {
    return (
      !needle ||
      compact(
        [
          c.name,
          c.code,
          ...(c.part_ids || []).map((id) => parts.get(id)?.metadata?.name || ""),
          ...appearances(c).map((a) => a.group),
        ].join(" "),
      ).includes(needle)
    );
  }
  function renderRelatedSearch(hasResults) {
    if (family === "primagi") {
      $("verse-related-search").hidden = true;
      return;
    }
    const hint = $("verse-related-search"),
      needle = compact(query),
      target = family === "onegai" ? "himitsu" : "onegai",
      count =
        !hasResults && needle
          ? (catalog?.coordinates || []).filter(
              (c) => c.family === target && matchesQuery(c, needle),
            ).length
          : 0;
    hint.hidden = count === 0;
    if (!count) return;
    const label = target === "himitsu" ? "ひみつのアイプリバース" : "おねがいアイプリバース";
    hint.querySelector("[data-related-message]").textContent =
      `同じフリーワードに該当するコーデが、${label}で見つかりました。`;
    const link = hint.querySelector("[data-verse-related-family]");
    link.dataset.verseRelatedFamily = target;
    link.textContent = `${label}で見る（${count}件）`;
  }
  function filtered(includeOwnership = true) {
    const needle = compact(query);
    return pool().filter(
      (c) =>
        (family !== "primagi" ||
          !primagiRarity ||
          c.rarity.split(" ／ ").includes(primagiRarity)) &&
        (family !== "primagi" ||
          window.CARD_PRIMAGI_VERSE_COMPAT.matches(c, parts, primagiVerseCompatibility)) &&
        (!favoriteOnly || favorites.has(c.id)) &&
        (!duplicateOnly || duplicate(c)) &&
        (trade()?.matches("coordinate", c.id) ?? true) &&
        (window.CARD_QR?.matches("coordinate", c.id, c.part_ids) ?? true) &&
        appearances(c).some(
          (a) => (!series || a.series === series) && (!group || a.group === group),
        ) &&
        matchesQuery(c, needle) &&
        (!includeOwnership || ownershipView === "all" || state(c) === ownershipView),
    );
  }
  function representative(value) {
    const all = catalog?.coordinates.filter((c) => c.family === value && c.image) || [];
    return (
      (all.find((c) => c.code === (value === "onegai" ? "OA4-001" : "APR6-001")) || all[0])
        ?.image ||
      (value === "onegai"
        ? "https://aipri.jp/verse/item/img/oa4/OA4-001.webp"
        : "https://aipri.jp/verse/item/img/ring6/APR6-001.webp")
    );
  }
  function syncImages() {
    const showPanel = !panel.hidden;
    panel.querySelector(".verse-families").hidden = family === "primagi";
    panel.querySelector('[data-verse-clear="series"]').parentElement.firstChild.textContent =
      family === "primagi" ? "章" : "だん数";
    panel.querySelector('[data-verse-clear="group"]').parentElement.firstChild.textContent =
      family === "primagi" ? "入手方法" : "ガチャ・キャンペーン";
    panel.querySelector(".verse-collection-select").firstChild.textContent =
      family === "primagi" ? "章" : "だん数";
    panel.querySelector(".eyebrow").textContent =
      family === "primagi" ? "PRIMAGI COORDINATES" : "AIPRI VERSE";
    if (showPanel)
      panel.querySelectorAll("[data-verse-family]").forEach((b) => {
        const url = representative(b.dataset.verseFamily);
        if (b.dataset.imageKey === url) return;
        b.dataset.imageKey = url;
        b.innerHTML = `<span class="verse-family-image" aria-hidden="true"><img src="${esc(window.CARD_PRIMAGI.verseImage(url))}" alt="" loading="eager" decoding="async"></span><span class="verse-family-label"><strong>${familyName(b.dataset.verseFamily)}アイプリ</strong></span>`;
      });
    const backImage =
      host.representativeCard?.(family === "onegai" ? "おねがい" : "ひみつ") ||
      "https://aipri.jp/card/img/oa4/OA4-001_O.webp";
    const links = [];
    if (!button.hidden)
      links.push([
        button,
        representative(host.family() === "ひみつ" ? "himitsu" : "onegai"),
        "バースへ",
      ]);
    if (showPanel && family !== "primagi") links.push([$("verse-back"), backImage, "カード一覧へ"]);
    if (showPanel && family === "primagi") {
      $("verse-back").textContent = "アルバム選択へ";
      delete $("verse-back").dataset.imageKey;
    }
    if (!mobileRoute.hidden)
      links.push([
        mobileRoute,
        showPanel ? backImage : representative(host.family() === "ひみつ" ? "himitsu" : "onegai"),
        showPanel ? "カードへ" : "バースへ",
      ]);
    for (const [node, url, label] of links) {
      if (node.dataset.imageKey === url + "|" + label) continue;
      node.dataset.imageKey = url + "|" + label;
      node.className =
        node === mobileRoute ? "verse-nav-link verse-mobile-route" : "verse-nav-link";
      node.innerHTML = `<span class="verse-nav-image" aria-hidden="true"><img src="${esc(window.CARD_PRIMAGI.verseImage(url))}" alt="" loading="eager" decoding="async"></span><span>${label}</span><span class="verse-nav-chevron" aria-hidden="true">›</span>`;
    }
  }
  function options(id, values, value, label) {
    $(id).innerHTML =
      `<option value="">${label}</option>` +
      [...new Set(values)]
        .map(
          (v) =>
            `<option value="${esc(v)}">${esc(id === "verse-series" || id === "verse-collection-series" ? chapterDisplayLabel(v) : displayLabel(v))}</option>`,
        )
        .join("");
    $(id).value = value;
  }
  function fillFilters(latest = false) {
    const all = pool();
    $("primagi-rarity-field").hidden = family !== "primagi";
    $("primagi-verse-compat-field").hidden = family !== "primagi";
    $("primagi-verse-compat-source").hidden = family !== "primagi";
    $("primagi-verse-compat").value = primagiVerseCompatibility;
    options(
      "primagi-rarity",
      all.flatMap((c) => c.rarity.split(" ／ ")),
      primagiRarity,
      "すべて",
    );
    const labels = [...new Set(all.flatMap((c) => appearances(c).map((a) => a.series)))].sort(
      (a, b) => {
        const rank = (label) =>
          family === "primagi"
            ? window.CARD_PRIMAGI.chapterRank(label)
            : label.includes("オールスター")
              ? 300 + Number(label.match(/\d+/)?.[0] || 0)
              : label.startsWith("スタジオ")
                ? 200 + Number(label.match(/\d+/)?.[0] || 0)
                : /^第\d+章/.test(label)
                  ? Number(label.match(/\d+/)?.[0] || 0)
                  : label.startsWith("おねがい")
                    ? 100 + Number(label.match(/\d+/)?.[0] || 0)
                    : label.startsWith("リング")
                      ? 50 + Number(label.match(/\d+/)?.[0] || 0)
                      : label.startsWith("ひみつ")
                        ? Number(label.match(/\d+/)?.[0] || 0)
                        : -1;
        return rank(b) - rank(a) || a.localeCompare(b, "ja");
      },
    );
    if (latest) series = labels[0] || "";
    if (!labels.includes(series)) series = "";
    options("verse-series", labels, series, "すべて");
    options("verse-collection-series", labels, collectionSeries, "すべて");
    const matching = all.filter((c) => appearances(c).some((a) => !series || a.series === series));
    const starRank = (label) =>
      Math.max(0, ...(String(label).match(/[★☆]+/g) || []).map((v) => v.length));
    const groups = [
      ...new Set(
        matching.flatMap((c) =>
          appearances(c)
            .filter((a) => !series || a.series === series)
            .map((a) => a.group),
        ),
      ),
    ].sort((a, b) => starRank(b) - starRank(a) || a.localeCompare(b, "ja"));
    if (!groups.includes(group)) group = "";
    options("verse-group", groups, group, "すべて");
  }

  function image(c, large = false, eager = false) {
    const fullImage = large
      ? window.CARD_PRIMAGI.verseImage(c.image) || window.CARD_PRIMAGI.verseImage(c.thumbnail)
      : window.CARD_PRIMAGI.verseImage(c.thumbnail) || window.CARD_PRIMAGI.verseImage(c.image);
    if (fullImage)
      return `<span class="verse-full-image"><img src="${esc(fullImage)}" alt="${esc(c.name)}" loading="${large || eager ? "eager" : "lazy"}" decoding="async"></span>`;

    const images = c.part_ids
      .map((id) => parts.get(id))
      .filter((part) => window.CARD_PRIMAGI.verseImage(part?.image));
    if (!images.length)
      return '<span class="verse-image-unavailable catalog-image-unavailable" role="img" aria-label="画像なし">画像なし</span>';
    return `<span class="verse-image-collage">${images.map((part) => `<span class="verse-collage-item"><img src="${esc(window.CARD_PRIMAGI.verseImage(part.image))}" alt="" loading="${eager ? "eager" : "lazy"}" decoding="async"></span>`).join("")}</span>`;
  }
  function ownedButton(c, part = null, modal = false) {
    const active = part === null ? full(c) : owned.has(part);
    const repeated = modal && quantity(c, part) >= 2;
    const hint =
      quantity(c, part) > 0
        ? "この項目の所持数を0枚にします"
        : active
          ? "他の登録で取得済みです。この項目の所持数を1枚にします"
          : "この項目を1枚登録します";
    return `<button type="button" title="${hint}" class="verse-owned ${active ? "is-owned" : ""} ${repeated ? "is-duplicate" : ""}" data-verse-own="${esc(c.id)}" ${part === null ? "" : `data-verse-part="${part}"`} aria-pressed="${active}" ${ready ? "" : "disabled"}>${repeated ? "重複して所有" : part === null ? (active ? "✓ フルコーデ持ってる" : "フルコーデ未獲得") : active ? "✓ 持っている" : "＋ 持っていない"}</button>`;
  }
  function renderCollection() {
    const base = pool().filter(
      (c) => !collectionSeries || appearances(c).some((a) => a.series === collectionSeries),
    );
    const completed = base.filter(collected).length;
    $("verse-collection-count").textContent =
      `収集済 ${completed} ／ 未収集 ${base.length - completed}`;
    if (!$("verse-collection").open) return;
    const all = base.filter(
      (c) =>
        collectionFilter === "all" ||
        (collectionFilter === "complete"
          ? collected(c)
          : got(c) > 0 && c.part_ids.length - got(c) === 1),
    );
    const key = JSON.stringify([
      catalog?.version,
      family,
      collectionSeries,
      collectionFilter,
      all.map((c) => [c.id, full(c), c.part_ids.map((id) => owned.has(id))]),
    ]);
    if (key === collectionKey) return;
    collectionKey = key;
    $("verse-collection-list").innerHTML = all
      .map(
        (c) =>
          `<article class="verse-coordinate ${collected(c) ? "is-complete" : ""} ${!full(c) && partsComplete(c) ? "is-parts-complete" : ""}"><h3>${esc(c.name)}</h3><div class="verse-coordinate-images"><button type="button" class="verse-character ${full(c) ? "is-owned" : ""}" data-verse-detail="${esc(c.id)}" aria-label="${esc(c.name)}の詳細">${image(c)}</button>${c.part_ids.map((id) => `<button type="button" class="verse-part-image ${owned.has(id) ? "is-owned" : ""}" data-verse-detail="${esc(c.id)}" aria-label="${esc(c.name)} ${esc(parts.get(id)?.slot)}の詳細"><span class="verse-part-image-frame">${window.CARD_PRIMAGI.verseImage(parts.get(id)?.image) ? `<img src="${esc(window.CARD_PRIMAGI.verseImage(parts.get(id)?.image))}" alt="${esc(parts.get(id)?.slot)}" loading="lazy" decoding="async">` : `<span class="catalog-image-unavailable">画像なし</span>`}</span></button>`).join("")}</div></article>`,
      )
      .join("");
    $("verse-collection-empty").hidden = all.length > 0;
  }
  function renderActiveFilters() {
    const entries = [
      ["query", "検索", query],
      ["series", family === "primagi" ? "章" : "だん数", chapterDisplayLabel(series)],
      ["primagi-rarity", "レアリティ", family === "primagi" ? primagiRarity : ""],
      [
        "primagi-verse-compat",
        "アイプリバース対応",
        family === "primagi" && primagiVerseCompatibility
          ? window.CARD_PRIMAGI_VERSE_COMPAT.labels[primagiVerseCompatibility]
          : "",
      ],
      ["group", "ガチャ・キャンペーン", group],
      ["favorite", "お気に入り", favoriteOnly ? "登録済み" : ""],
      ["duplicate", "重複", duplicateOnly ? "重複あり" : ""],
    ].filter((x) => x[2]);
    const qr = window.CARD_QR?.entry("coordinate");
    if (qr) entries.push([qr.key, qr.label, qr.value]);
    const item = trade()?.entry("coordinate");
    if (item) entries.push(["trade", item.label, item.value]);
    $("verse-filter-summary").textContent = entries.length ? `適用中 ${entries.length}件` : "";
    $("verse-active-filters").innerHTML = entries.length
      ? '<span class="active-filters-label">適用中</span>' +
        entries
          .map(
            ([key, label, value]) =>
              `<button type="button" class="filter-chip" data-verse-clear="${key}" aria-label="${esc(label)}を解除"><span>${esc(label)}：<strong>${esc(key === "series" ? chapterDisplayLabel(value) : displayLabel(value))}</strong></span><span class="filter-chip-close" aria-hidden="true">×</span></button>`,
          )
          .join("")
      : '<span class="no-active-filters">絞り込みなし</span>';
    panel
      .querySelectorAll(".filter-clear[data-verse-clear]")
      .forEach((b) => (b.disabled = !entries.some((x) => x[0] === b.dataset.verseClear)));
  }
  function renderProgress() {
    const all = pool(),
      complete = all.filter(collected).length;
    $("verse-total").textContent = `全${all.length}コーデ`;
    $("verse-percent").textContent = ready
      ? (all.length ? ((complete / all.length) * 100).toFixed(1) : "0.0") + "%"
      : "—";
    $("verse-progress-bar").style.width =
      ready && all.length ? (complete / all.length) * 100 + "%" : "0%";
    $("verse-count").textContent = ready
      ? `収集済 ${complete}コーデ ／ 未収集 ${all.length - complete}コーデ`
      : "所持データを確認中";
    const base = filtered(false),
      n = base.filter(collected).length;
    $("verse-filtered-rate").innerHTML = ready
      ? `<span class="rate-caption">絞り込み内の取得率</span><strong>${base.length ? ((n / base.length) * 100).toFixed(1) : "0.0"}%</strong><span class="rate-fraction">収集済 ${n}コーデ ／ 未収集 ${base.length - n}コーデ</span>`
      : "";
    if (!$("verse-series-progress").hidden) renderSeriesProgress();
  }
  function renderSeriesProgress() {
    const labels = [...$("verse-series").options].map((o) => o.value).filter(Boolean);
    $("verse-series-progress").innerHTML = labels
      .map((label) => {
        const rows = pool().filter((c) => appearances(c).some((a) => a.series === label)),
          n = rows.filter(collected).length,
          rate = rows.length ? (n / rows.length) * 100 : 0;
        return `<div class="progress-card progress-card-small"><div><span>${esc(chapterDisplayLabel(label))}</span><strong>${rate.toFixed(1)}%</strong></div><div class="progress-track"><span style="width:${rate}%"></span></div><p>収集済 ${n}コーデ ／ 未収集 ${rows.length - n}コーデ</p></div>`;
      })
      .join("");
  }
  function favoriteButton(c, modal = false) {
    const active = favorites.has(c.id);
    return `<button type="button" class="${modal ? "verse-modal-favorite" : "verse-favorite"} ${active ? "is-favorite" : ""}" data-verse-favorite="${esc(c.id)}" aria-pressed="${active}" aria-label="${active ? "お気に入りを解除" : "お気に入りに登録"}" ${ready ? "" : "disabled"}>${host.star}${modal ? `<span>${active ? "お気に入り登録済み" : "お気に入りに登録"}</span>` : ""}</button>`;
  }
  function partialBadge(c) {
    const count = got(c);
    if (!count) return "";
    const complete = partsComplete(c);
    return `<span class="verse-partial ${complete ? "is-parts-complete" : ""}" aria-label="パーツ所持 ${count}／${c.part_ids.length}">${complete ? "パーツコンプ" : "パーツ一部獲得"}</span>`;
  }
  function syncUpdateText() {
    const date = catalog?.updated_at ? new Date(catalog.updated_at) : null;
    $("verse-sync").textContent =
      "コーデ情報の更新" +
      (date && !Number.isNaN(date.getTime()) ? "：" + date.toLocaleString("ja-JP") : "");
  }
  let paginationMarkup = "";
  function renderPages(count) {
    maxPage = count;
    const width = $("verse-pages").clientWidth || Math.max(200, window.innerWidth - 48);
    const budget = width < 310 ? 1 : width < 420 ? 3 : width < 560 ? 5 : 7;
    const selected = new Set([page]);
    if (budget >= 3) {
      selected.add(1);
      selected.add(count);
    }
    if (count <= budget) {
      for (let i = 1; i <= count; i++) selected.add(i);
    } else
      for (let distance = 1; selected.size < budget && distance < count; distance++) {
        for (const n of [page - distance, page + distance])
          if (n >= 1 && n <= count && selected.size < budget) selected.add(n);
      }
    let previous = 0;
    const markup =
      `<button class="verse-page-prev" type="button" data-verse-page="${page - 1}" ${page === 1 ? "disabled" : ""}>前のページ</button>` +
      [...selected]
        .filter((n) => n >= 1 && n <= count)
        .sort((a, b) => a - b)
        .map((n) => {
          const gap = previous && n > previous + 1 ? '<span aria-hidden="true">…</span>' : "";
          previous = n;
          return (
            gap +
            `<button class="verse-page-number" type="button" data-verse-page="${n}" ${n === page ? 'aria-current="page"' : ""}>${n}</button>`
          );
        })
        .join("") +
      `<button class="verse-page-next" type="button" data-verse-page="${page + 1}" ${page === count ? "disabled" : ""}>次のページ</button>`;
    // Keep the existing buttons (and focus) when the visible page range is unchanged.
    if (markup !== paginationMarkup) {
      paginationMarkup = markup;
      $("verse-pages").innerHTML = markup;
    }
  }
  function applyColumns() {
    try {
      const saved = localStorage.getItem("card-album-mobile-columns");
      if (saved === "2" || saved === "3") columns = saved;
    } catch {}
    $("verse-cards").dataset.mobileColumns = columns;
    panel
      .querySelectorAll("[data-verse-columns]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.verseColumns === columns)));
  }
  function render() {
    let control = $("verse-trade-filter");
    if (!control) {
      control = document.createElement("div");
      control.id = "verse-trade-filter";
      panel.querySelector(".verse-filter-grid").append(control);
    }
    control.innerHTML = trade()?.filterMarkup("coordinate") || "";
    $("verse-title").textContent =
      family === "primagi"
        ? "ワッチャプリマジ！"
        : (family === "himitsu" ? "ひみつの" : "おねがい") + "アイプリバース";
    panel.querySelectorAll("[data-verse-family]").forEach((b) => {
      const active = b.dataset.verseFamily === family;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    syncImages();
    applyColumns();
    renderProgress();
    renderActiveFilters();
    const index = ["all", "full", "partial", "none"].indexOf(ownershipView);
    panel.querySelector(".verse-owned-tabs").style.setProperty("--verse-owned-index", index);
    panel.querySelectorAll("[data-verse-view]").forEach((b) => {
      const active = b.dataset.verseView === ownershipView;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    const rows = filtered();
    const perPage = size === "all" ? Math.max(1, rows.length) : Number(size);
    const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
    page = Math.min(page, pageCount);
    $("verse-found").textContent = `見つかったコーデ ${rows.length}件`;
    const visible = rows.slice((page - 1) * perPage, page * perPage);
    const listKey = JSON.stringify([
      catalog?.version,
      ready,
      family,
      visible.map((c) => [c.id, full(c), got(c), state(c), duplicate(c), favorites.has(c.id)]),
    ]);
    if (listKey !== cardListKey) {
      cardListKey = listKey;
      $("verse-cards").innerHTML = rows
        .slice((page - 1) * perPage, page * perPage)
        .map(
          (c, index) =>
            `<article class="verse-card ${ownershipClass(c)}" data-verse-card="${esc(c.id)}">${window.CARD_QR?.badge("coordinate", c.id, c.part_ids) || ""}${favoriteButton(c)}${partialBadge(c)}<button type="button" class="verse-card-detail" data-verse-detail="${esc(c.id)}"><span class="verse-card-picture">${image(c, false, index < 6)}${duplicateBadge(c)}</span><span class="verse-code">${esc(c.code || "コード未取得")}</span><strong>${esc(c.name)}</strong></button>${ownedButton(c)}</article>`,
        )
        .join("");
    }
    $("verse-empty").hidden = rows.length > 0;
    renderRelatedSearch(rows.length > 0);
    renderPages(pageCount);
    renderCollection();
    renderDetail();
    syncUpdateText();
    trade()?.patchBadges?.();
  }
  function renderDetail() {
    if (!selected || !dialog.open) return;
    const c = catalog.coordinates.find((c) => c.id === selected);
    if (!c) return;
    $("verse-detail-content").innerHTML =
      `<div class="verse-modal-heading"><div class="verse-modal-full">${image(c, true)}</div><div class="verse-modal-info"><span class="verse-code">${esc(c.code || "コード未取得")}</span><h2>${esc(c.name)}</h2><dl><dt>シリーズ</dt><dd>${seriesName(c.family)}</dd><dt>レアリティ</dt><dd>${esc(c.rarity)}</dd><dt>${c.family === "primagi" ? "章" : "だん数"}</dt><dd>${esc(chapterDisplayLabel([...new Set(appearances(c).map((a) => a.series))].join(" ／ ")))}</dd><dt>${c.family === "primagi" ? "入手方法" : "ガチャ・キャンペーン"}</dt><dd>${esc(displayLabel([...new Set(appearances(c).map((a) => a.group))].join(" ／ ")))}</dd></dl><div class="verse-modal-total">${ownControl(c)}${favoriteButton(c, true)}<div class="qr-action-row">${trade()?.markup("coordinate", c.id) || ""}${window.CARD_QR?.button("coordinate", c.id, c.name, [], c.family) || ""}</div></div></div></div><h3 class="verse-parts-heading">パーツごとに管理</h3><div class="verse-modal-parts">${
        c.part_ids
          .map((id) => {
            const p = parts.get(id);
            return `<article><span class="verse-part-image-frame">${window.CARD_PRIMAGI.verseImage(p.image) ? `<img src="${esc(window.CARD_PRIMAGI.verseImage(p.image))}" alt="${esc(p.slot)}" loading="eager" decoding="async">` : `<span class="catalog-image-unavailable">画像なし</span>`}</span><div class="verse-part-stats"><span class="verse-slot-tag">${esc(p.slot)}</span><strong>${p.buzz == null ? (c.family === "primagi" ? "ワッチャ未取得" : "BP未取得") : p.buzz + (c.family === "primagi" ? " ワッチャ" : " バズパワー")}</strong></div>${c.family === "primagi" ? `<p class="primagi-part-name">${esc(p.metadata?.name || "未取得")}</p><p class="primagi-part-code">${esc((p.codes || []).join(" ／ "))} · ${esc(p.metadata?.rarity || "未取得")}</p>` : ""}${ownControl(c, id)}<div class="qr-action-row">${trade()?.markup("part", id) || ""}${
              window.CARD_QR?.button(
                "part",
                id,
                c.name + " ／ " + p.slot,
                c.part_ids.map((pid) => ({
                  kind: "part",
                  id: String(pid),
                  name: c.name + " ／ " + (parts.get(pid)?.slot || pid),
                  family: c.family,
                })),
                c.family,
              ) || ""
            }</div></article>`;
          })
          .join("") ||
        '<p class="verse-data-unavailable">構成パーツ未取得。部位・番号・BPは確認でき次第追加します。</p>'
      }</div>`;
  }
  function openDetail(id) {
    if (!catalog?.coordinates.some((c) => c.id === id)) return;
    selected = id;
    dialog.showModal();
    renderDetail();
  }
  function patchOwnership() {
    if (ownershipView !== "all" || duplicateOnly) {
      render();
      return;
    }
    panel.querySelectorAll("[data-verse-card]").forEach((a) => {
      const c = catalog.coordinates.find((c) => c.id === a.dataset.verseCard);
      if (!c) return;
      a.classList.toggle("is-owned", full(c));
      a.classList.toggle("is-parts-complete", !full(c) && partsComplete(c));
      a.classList.toggle("is-partial", !full(c) && !partsComplete(c) && got(c) > 0);
      const badge = a.querySelector(".verse-partial");
      const markup = partialBadge(c);
      if (badge) {
        if (markup) badge.outerHTML = markup;
        else badge.remove();
      } else if (markup) a.insertAdjacentHTML("afterbegin", markup);
      const old = a.querySelector(".verse-duplicate-tag");
      if (duplicate(c)) {
        if (!old)
          a.querySelector(".verse-card-picture")?.insertAdjacentHTML(
            "beforeend",
            duplicateBadge(c),
          );
      } else old?.remove();
    });
    document.querySelectorAll("button.verse-owned[data-verse-own]").forEach((b) => {
      const c = catalog.coordinates.find((c) => c.id === b.dataset.verseOwn);
      if (!c) return;
      const isPart = !!b.dataset.versePart,
        active = isPart ? owned.has(Number(b.dataset.versePart)) : full(c);
      b.classList.toggle("is-owned", active);
      b.setAttribute("aria-pressed", String(active));
      b.title =
        quantity(c, isPart ? Number(b.dataset.versePart) : null) > 0
          ? "この項目の所持数を0枚にします"
          : active
            ? "他の登録で取得済みです。この項目の所持数を1枚にします"
            : "この項目を1枚登録します";
      const repeated =
        !!b.closest("#verse-detail") &&
        quantity(c, isPart ? Number(b.dataset.versePart) : null) >= 2;
      b.classList.toggle("is-duplicate", repeated);
      b.textContent = repeated
        ? "重複して所有"
        : isPart
          ? active
            ? "✓ 持っている"
            : "＋ 持っていない"
          : active
            ? "✓ フルコーデ持ってる"
            : "フルコーデ未獲得";
    });
    document.querySelectorAll("[data-verse-quantity]").forEach((value) => {
      const c = catalog.coordinates.find((c) => c.id === value.dataset.verseQuantity);
      if (!c) return;
      const part = value.dataset.versePart ? Number(value.dataset.versePart) : null,
        q = quantity(c, part);
      value.textContent = q + "枚";
      const group = value.parentElement;
      group.querySelector('[data-verse-adjust="-1"]').disabled = !ready || q === 0;
      group.querySelector('[data-verse-adjust="1"]').disabled = !ready || q >= 9999;
    });
    renderProgress();
    const base = pool().filter(
        (c) => !collectionSeries || appearances(c).some((a) => a.series === collectionSeries),
      ),
      n = base.filter(collected).length;
    $("verse-collection-count").textContent = `収集済 ${n} ／ 未収集 ${base.length - n}`;
    if (collectionFilter !== "all") {
      renderCollection();
      return;
    }
    panel.querySelectorAll(".verse-coordinate").forEach((a) => {
      const b = a.querySelector("[data-verse-detail]"),
        c = catalog.coordinates.find((c) => c.id === b?.dataset.verseDetail);
      if (!c) return;
      a.classList.toggle("is-complete", collected(c));
      a.classList.toggle("is-parts-complete", !full(c) && partsComplete(c));
      a.querySelector(".verse-character").classList.toggle("is-owned", full(c));
      a.querySelectorAll(".verse-part-image").forEach((b, i) =>
        b.classList.toggle("is-owned", owned.has(c.part_ids[i])),
      );
    });
  }
  function patchFavorite(id) {
    document.querySelectorAll("[data-verse-favorite]").forEach((b) => {
      if (b.dataset.verseFavorite !== id) return;
      const active = favorites.has(id);
      b.classList.toggle("is-favorite", active);
      b.setAttribute("aria-pressed", String(active));
      b.setAttribute("aria-label", active ? "お気に入りを解除" : "お気に入りに登録");
      const label = b.querySelector("span");
      if (label) label.textContent = active ? "お気に入り登録済み" : "お気に入りに登録";
    });
    if (favoriteOnly) render();
  }
  async function saveFavorite(id) {
    if (!ready || !currentUser() || host.maintenance() || favoriteBusy.has(id)) return;
    const uid = currentUser(),
      g = generation,
      before = favorites.has(id),
      enabled = !before;
    favoriteBusy.add(id);
    markInventoryChange("favorite:" + id);
    if (enabled) favorites.add(id);
    else favorites.delete(id);
    patchFavorite(id);
    try {
      const r = await host.client().rpc("card_verse_set_favorite", {
        p_coordinate_id: id,
        p_enabled: enabled,
      });
      if (uid !== currentUser() || g !== generation) return;
      if (r.error || r.data !== enabled) throw Error("Favorite failed");
    } catch {
      if (uid !== currentUser() || g !== generation) return;
      if (before) favorites.add(id);
      else favorites.delete(id);
      patchFavorite(id);
      host.toast("失敗しました", "error");
      try {
        const r = await host
          .client()
          .from("card_verse_favorites")
          .select("coordinate_id")
          .eq("user_id", uid)
          .eq("coordinate_id", id)
          .maybeSingle();
        if (!r.error && uid === currentUser() && g === generation) {
          if (r.data) favorites.add(id);
          else favorites.delete(id);
          patchFavorite(id);
        }
      } catch {}
    } finally {
      if (uid === currentUser() && g === generation) {
        markInventoryChange("favorite:" + id);
        favoriteBusy.delete(id);
      }
    }
  }
  function save(coordinateID, partID = null, delta = null) {
    if (!ready || !currentUser() || host.maintenance()) return;
    const c = catalog.coordinates.find((c) => c.id === coordinateID);
    if (!c || (partID !== null && !c.part_ids.includes(partID))) return;
    const key = partID === null ? "full:" + coordinateID : "part:" + partID;
    // 所持ボタンの再タップで、保存中の登録を解除しない。枚数の±は従来通りキューへ追加。
    if (delta === null && busy.has(key)) return;
    const q = quantity(c, partID),
      operation =
        delta === null ? { clear: q > 0, delta: q > 0 ? null : 1 } : { clear: false, delta };
    if (
      !operation.clear &&
      ((operation.delta !== 1 && operation.delta !== -1) ||
        (operation.delta === -1 && q === 0) ||
        (operation.delta === 1 && q >= 9999))
    )
      return;
    let queue = quantityQueues.get(key);
    if (!queue) {
      queue = {
        key,
        coordinateID,
        partID,
        base: q,
        operations: [],
        uid: currentUser(),
        generation,
        running: false,
      };
      quantityQueues.set(key, queue);
    }
    markInventoryChange(key);
    queue.operations.push(operation);
    busy.add(key);
    showQueuedQuantity(queue);
    if (!queue.running) processQuantity(queue);
  }
  function showQueuedQuantity(queue) {
    let value = queue.base;
    for (const op of queue.operations)
      value = op.clear ? 0 : Math.min(9999, Math.max(0, value + op.delta));
    const map = queue.partID === null ? fullQuantities : partQuantities,
      id = queue.partID === null ? queue.coordinateID : queue.partID;
    if (value > 0) map.set(id, value);
    else map.delete(id);
    refreshEffectiveOwnership();
    patchOwnership();
  }
  async function processQuantity(queue) {
    queue.running = true;
    const current = () =>
      queue.uid === currentUser() &&
      queue.generation === generation &&
      quantityQueues.get(queue.key) === queue;
    try {
      while (queue.operations.length && current()) {
        const operation = queue.operations[0];
        try {
          const result = await host.client().rpc("card_verse_change_quantity", {
            p_coordinate_id: queue.coordinateID,
            p_part_id: queue.partID,
            p_delta: operation.delta,
            p_clear: operation.clear,
          });
          if (!current()) return;
          if (
            result.error ||
            !Number.isInteger(result.data?.quantity) ||
            result.data.quantity < 0 ||
            result.data.quantity > 9999
          )
            throw Error("Quantity save failed");
          queue.base = result.data.quantity;
          ownedCheckedAt = Date.now();
        } catch {
          if (!current()) return;
          host.toast("失敗しました", "error");

          try {
            const table =
                queue.partID === null ? "card_verse_coordinate_ownership" : "card_verse_ownership",
              column = queue.partID === null ? "coordinate_id" : "part_id",
              id = queue.partID === null ? queue.coordinateID : queue.partID;
            const result = await host
              .client()
              .from(table)
              .select("quantity")
              .eq("user_id", queue.uid)
              .eq(column, id)
              .maybeSingle();
            if (!current()) return;
            if (!result.error) {
              const value = result.data?.quantity || 0;
              if (Number.isInteger(value) && value >= 0 && value <= 9999) queue.base = value;
            }
          } catch {}
        }
        if (!current()) return;
        markInventoryChange(queue.key);
        queue.operations.shift();
        showQueuedQuantity(queue);
      }
    } finally {
      if (current()) {
        quantityQueues.delete(queue.key);
        busy.delete(queue.key);
      }
    }
  }
  function hydrateCatalog() {
    if (catalog) return;
    try {
      const data = window.CARD_VERSE_CATALOG
        ? window.CARD_VERSE_CATALOG.peek()
        : JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (Array.isArray(data?.coordinates) && Array.isArray(data?.parts)) {
        catalog = data;
        parts = new Map(data.parts.map((p) => [p.id, p]));
      }
    } catch {}
  }
  async function readCatalog(force = false) {
    if (!force && catalog && Date.now() - checkedAt < 300000) return;
    if (!window.CARD_VERSE_CATALOG) hydrateCatalog();
    const r = window.CARD_VERSE_CATALOG
      ? { data: await window.CARD_VERSE_CATALOG.load(host.client(), { force }), error: null }
      : await host
          .client()
          .rpc("card_verse_catalog_cached", { p_version: catalog?.version || null });
    if (r.error || !r.data) throw Error("バース用SQLを導入してから、もう一度開いてください。");
    const data = r.data.omitted ? catalog : r.data;
    if (!Array.isArray(data?.coordinates) || !Array.isArray(data?.parts))
      throw Error("コーデデータを確認できませんでした。");
    catalog = { ...data, updated_at: r.data.updated_at || data.updated_at };
    parts = new Map(data.parts.map((p) => [p.id, p]));
    checkedAt = Date.now();
    if (!r.data.omitted && !window.CARD_VERSE_CATALOG)
      try {
        localStorage.setItem(cacheKey, JSON.stringify(catalog));
      } catch {}
  }
  function ensureCatalog() {
    if (catalog && Date.now() - checkedAt < 300000) return Promise.resolve();
    if (!loading) {
      const task = readCatalog();
      loading = task;
      task
        .finally(() => {
          if (loading === task) loading = null;
        })
        .catch(() => {});
    }
    return loading;
  }
  function ensureInventory() {
    const uid = currentUser(),
      g = generation;
    if (!uid || host.maintenance()) return Promise.resolve();
    if (
      owner === uid &&
      ready &&
      (busy.size || favoriteBusy.size || Date.now() - ownedCheckedAt < 300000)
    )
      return Promise.resolve();
    if (inventoryLoading?.uid === uid && inventoryLoading.g === g) return inventoryLoading.promise;
    const task = { uid, g, revision: inventoryRevision, promise: null };
    task.promise = (async () => {
      const result = await host.client().rpc("card_verse_my_inventory", {});
      if (uid !== currentUser() || g !== generation) return;
      if (
        result.error ||
        !Array.isArray(result.data?.parts) ||
        !Array.isArray(result.data?.coordinates) ||
        !Array.isArray(result.data?.favorites)
      )
        throw Error("所持数用SQLと通信状態を確認してください。");
      const nextParts = new Map(result.data.parts.map((r) => [r.part_id, r.quantity]));
      const nextFull = new Map(result.data.coordinates.map((r) => [r.coordinate_id, r.quantity]));
      const nextFavorites = new Set(result.data.favorites);
      // 読み込み開始後に編集した項目は、古い応答で巻き戻さない。
      preserveInventoryChanges(nextParts, nextFull, nextFavorites, task.revision);
      partQuantities = nextParts;
      fullQuantities = nextFull;
      favorites = nextFavorites;
      refreshEffectiveOwnership();
      owner = uid;
      ready = true;
      ownedCheckedAt = Date.now();
    })();
    inventoryLoading = task;
    task.promise
      .finally(() => {
        if (inventoryLoading === task) inventoryLoading = null;
      })
      .catch(() => {});
    return task.promise;
  }
  function warm() {
    if (
      !currentUser() ||
      host.maintenance() ||
      !["aipri", "primagi"].includes(host.game()) ||
      Date.now() - lastWarmAt < 30000
    )
      return;
    lastWarmAt = Date.now();
    hydrateCatalog();
    Promise.all([ensureCatalog(), ensureInventory()])
      .then(() => {
        if (currentUser() && ["aipri", "primagi"].includes(host.game()) && !host.maintenance())
          syncImages();
      })
      .catch(() => {});
  }
  async function open(value) {
    if (!currentUser() || host.maintenance()) return;
    family = value === "primagi" ? "primagi" : value === "himitsu" ? "himitsu" : "onegai";
    primagiRarity = "";
    primagiVerseCompatibility = "";
    series = group = query = collectionSeries = "";
    collectionFilter = ownershipView = "all";
    favoriteOnly = duplicateOnly = false;
    trade()?.clear("coordinate");
    page = 1;
    $("verse-query").value = "";
    $("verse-favorite-filter").value = "all";
    $("verse-duplicate-filter").value = "all";
    host.screen("verse");
    document.body.classList.toggle("game-aipri", family !== "primagi");
    document.body.classList.toggle("game-primagi", family === "primagi");
    const uid = currentUser(),
      g = generation,
      view = ++viewGeneration;
    const current = () =>
      uid === currentUser() && g === generation && view === viewGeneration && !host.maintenance();
    hydrateCatalog();
    if (catalog) {
      fillFilters(true);
      render();
      $("verse-message").textContent = "";
    } else $("verse-message").textContent = "コーデを読み込み中…";
    try {
      await Promise.all([
        ensureCatalog().then(() => {
          if (current()) {
            fillFilters(true);
            render();
            $("verse-message").textContent = "";
          }
        }),
        ensureInventory(),
      ]);
      if (!current()) return;
      fillFilters();
      $("verse-message").textContent = "";
      render();
    } catch (error) {
      if (current()) $("verse-message").textContent = window.CARD_ERROR.message(error);
    }
  }
  function reset() {
    primagiVerseCompatibility = "";
    $("primagi-verse-compat").value = "";
    collectionKey = cardListKey = "";
    generation++;
    viewGeneration++;
    ownedCheckedAt = 0;
    inventoryLoading = null;
    lastWarmAt = 0;
    owner = null;
    ready = false;
    owned.clear();
    partQuantities.clear();
    fullQuantities.clear();
    quantityQueues.clear();
    inventoryChanges.clear();
    inventoryRevision = 0;
    favorites.clear();
    favoriteBusy.clear();
    busy.clear();
    selected = null;
    if (dialog.open) dialog.close();
    $("verse-cards").replaceChildren();
    $("verse-related-search").hidden = true;
    $("verse-collection-list").replaceChildren();
    $("verse-detail-content").replaceChildren();
    $("verse-percent").textContent = "—";
    $("verse-count").textContent = "";
    $("verse-progress-bar").style.width = "0%";
  }
  button.onclick = () => open(host.family() === "ひみつ" ? "himitsu" : "onegai");
  $("verse-back").onclick = () =>
    host.cards(family === "primagi" ? "primagi" : family === "himitsu" ? "ひみつ" : "おねがい");
  mobileRoute.onclick = () =>
    panel.hidden
      ? open(host.family() === "ひみつ" ? "himitsu" : "onegai")
      : host.cards(family === "primagi" ? "primagi" : family === "himitsu" ? "ひみつ" : "おねがい");
  $("verse-close").onclick = () => dialog.close();
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        dialog.close();
    }
  });
  panel.addEventListener("click", (e) => {
    const column = e.target.closest("[data-verse-columns]");
    if (column) {
      columns = column.dataset.verseColumns;
      try {
        localStorage.setItem("card-album-mobile-columns", columns);
      } catch {}
      applyColumns();
      if ($("cards")) $("cards").dataset.mobileColumns = columns;
      document
        .querySelectorAll(".mobile-column-control [data-card-columns]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cardColumns === columns)));
      return;
    }
    const clear = e.target.closest("[data-verse-clear]");
    if (clear) {
      clearFilter(clear.dataset.verseClear);
      return;
    }
    const favorite = e.target.closest("[data-verse-favorite]");
    if (favorite) {
      saveFavorite(favorite.dataset.verseFavorite);
      return;
    }
    const view = e.target.closest("[data-verse-view]");
    if (view) {
      ownershipView = view.dataset.verseView;
      page = 1;
      render();
      return;
    }
    const collection = e.target.closest("[data-verse-collection]");
    if (collection) {
      collectionFilter =
        collectionFilter === collection.dataset.verseCollection
          ? "all"
          : collection.dataset.verseCollection;
      panel
        .querySelectorAll("[data-verse-collection]")
        .forEach((b) =>
          b.setAttribute("aria-pressed", String(b.dataset.verseCollection === collectionFilter)),
        );
      renderCollection();
      return;
    }
    const related = e.target.closest("[data-verse-related-family]");
    const f = e.target.closest("[data-verse-family]");
    if (f || related) {
      const inheritedQuery = related ? query : "";
      family = related ? related.dataset.verseRelatedFamily : f.dataset.verseFamily;
      series = group = collectionSeries = "";
      query = inheritedQuery;
      if (related) window.CARD_QR?.clear("coordinate");
      collectionFilter = ownershipView = "all";
      favoriteOnly = duplicateOnly = false;
      trade()?.clear("coordinate");
      page = 1;
      $("verse-query").value = inheritedQuery;
      $("verse-favorite-filter").value = "all";
      $("verse-duplicate-filter").value = "all";
      if (catalog) {
        fillFilters(!related);
        render();
      }
      return;
    }
    const d = e.target.closest("[data-verse-detail]");
    if (d) {
      openDetail(d.dataset.verseDetail);
      return;
    }
    const o = e.target.closest("[data-verse-own]");
    if (o) {
      save(o.dataset.verseOwn, o.dataset.versePart ? Number(o.dataset.versePart) : null);
      return;
    }
    const p = e.target.closest("[data-verse-page]");
    if (p) {
      const next = Number(p.dataset.versePage);
      if (p.disabled || !Number.isInteger(next) || next < 1 || next > maxPage || next === page)
        return;
      const kind = p.classList.contains("verse-page-next")
        ? "verse-page-next"
        : p.classList.contains("verse-page-prev")
          ? "verse-page-prev"
          : null;
      page = next;
      render();
      if (kind)
        $("verse-pages")
          .querySelector("." + kind)
          ?.focus({ preventScroll: true });
      $("verse-cards").scrollIntoView({ block: "start", behavior: "instant" });
    }
  });
  dialog.addEventListener("click", (e) => {
    const adjust = e.target.closest("[data-verse-adjust]");
    if (adjust) {
      if (!adjust.disabled)
        save(
          adjust.dataset.verseOwn,
          adjust.dataset.versePart ? Number(adjust.dataset.versePart) : null,
          Number(adjust.dataset.verseAdjust),
        );
      return;
    }
    const favorite = e.target.closest("[data-verse-favorite]");
    if (favorite) {
      saveFavorite(favorite.dataset.verseFavorite);
      return;
    }
    const b = e.target.closest("[data-verse-own]");
    if (b) save(b.dataset.verseOwn, b.dataset.versePart ? Number(b.dataset.versePart) : null);
  });
  $("verse-series").onchange = () => {
    series = $("verse-series").value;
    group = "";
    page = 1;
    fillFilters();
    render();
  };

  $("verse-group").onchange = () => {
    group = $("verse-group").value;
    page = 1;
    render();
  };
  $("verse-collection-series").onchange = () => {
    collectionSeries = $("verse-collection-series").value;
    renderCollection();
  };
  $("verse-size").onchange = () => {
    size = $("verse-size").value;
    page = 1;
    render();
  };
  $("verse-clear").onclick = () => {
    primagiRarity = "";
    primagiVerseCompatibility = "";
    series = group = query = "";
    favoriteOnly = duplicateOnly = false;
    trade()?.clear("coordinate");
    window.CARD_QR?.clear("coordinate");
    ownershipView = "all";
    page = 1;
    $("verse-query").value = "";
    $("verse-favorite-filter").value = "all";
    $("verse-duplicate-filter").value = "all";
    fillFilters();
    render();
  };
  $("primagi-verse-compat").onchange = () => {
    primagiVerseCompatibility = $("primagi-verse-compat").value;
    page = 1;
    render();
  };
  $("primagi-rarity").onchange = () => {
    primagiRarity = $("primagi-rarity").value;
    page = 1;
    render();
  };
  function clearFilter(key) {
    if (key === "primagi-verse-compat") {
      primagiVerseCompatibility = "";
      $("primagi-verse-compat").value = "";
    }
    if (key === "primagi-rarity") {
      primagiRarity = "";
      $("primagi-rarity").value = "";
    }
    if (key === "qr") window.CARD_QR?.clear("coordinate");
    if (key === "trade") trade()?.clear("coordinate");
    if (key === "query") {
      query = "";
      $("verse-query").value = "";
    }
    if (key === "series") series = "";
    if (key === "group") group = "";
    if (key === "favorite") {
      favoriteOnly = false;
      $("verse-favorite-filter").value = "all";
    }
    if (key === "duplicate") {
      duplicateOnly = false;
      $("verse-duplicate-filter").value = "all";
    }
    page = 1;
    fillFilters();
    render();
  }
  $("verse-query").oninput = () => {
    query = $("verse-query").value;
    page = 1;
    render();
  };
  $("verse-duplicate-filter").onchange = () => {
    duplicateOnly = $("verse-duplicate-filter").value === "only";
    page = 1;
    render();
  };
  $("verse-favorite-filter").onchange = () => {
    favoriteOnly = $("verse-favorite-filter").value === "only";
    page = 1;
    render();
  };
  const disclosures = new Map();
  for (const id of ["verse-collection", "verse-filters"]) {
    const details = $(id),
      body = details.querySelector(".verse-disclosure");
    details.querySelector("summary").addEventListener("click", (event) => {
      event.preventDefault();
      const expanded = !(disclosures.get(id) ?? details.open);
      disclosures.set(id, expanded);
      if (expanded) {
        details.open = true;
        if (id === "verse-collection") renderCollection();
      }
      host.reveal(body, expanded, () => {
        if (!expanded) details.open = false;
        body.hidden = false;
      });
    });
  }
  $("verse-collection").addEventListener("toggle", renderCollection);
  let progressExpanded = false;
  $("verse-progress-details").onclick = () => {
    progressExpanded = !progressExpanded;
    if (progressExpanded) renderSeriesProgress();
    $("verse-progress-details").setAttribute("aria-expanded", String(progressExpanded));
    host.reveal($("verse-series-progress"), progressExpanded);
  };
  let refreshing = false,
    lastRefresh = 0;
  $("verse-sync").onclick = async () => {
    if (refreshing || !currentUser() || host.maintenance() || Date.now() - lastRefresh < 10000)
      return;
    refreshing = true;
    lastRefresh = Date.now();
    $("verse-sync").disabled = true;
    $("verse-sync").textContent = "コーデ情報を確認中…";
    try {
      await readCatalog(true);
      fillFilters();
      render();
    } catch {
      host.toast("失敗しました", "error");
    } finally {
      refreshing = false;
      $("verse-sync").disabled = false;
      syncUpdateText();
    }
  };
  // Refresh public pictures at a visibility boundary, keeping personal state and the current page.
  let visibilityPictureFlight = null;
  document.addEventListener("card-visibility-updated", () => {
    checkedAt = 0;
    if ((panel.hidden && !dialog.open) || visibilityPictureFlight || !host.client()) return;
    visibilityPictureFlight = (async () => {
      await readCatalog(true);
      if (panel.hidden && !dialog.open) return;
      const scroll = { x: window.scrollX, y: window.scrollY },
        ds = dialog.scrollTop;
      const content = $("verse-detail-content"),
        cs = content.scrollTop;
      fillFilters();
      render();
      dialog.scrollTop = ds;
      content.scrollTop = cs;
      window.scrollTo(scroll.x, scroll.y);
      window.CARD_TRADE?.renderOutput?.();
    })()
      .catch(() => {})
      .finally(() => {
        visibilityPictureFlight = null;
      });
  });
  window.CARD_VERSE = {
    refreshOwnershipFilter() {
      if (!panel.hidden) {
        page = 1;
        render();
      }
    },
    async shareCatalog(scopeFamily) {
      await ensureCatalog();
      return catalog.coordinates.filter((c) => c.family === scopeFamily);
    },
    async shareRates(scopes, seriesFilters = {}) {
      const uid = currentUser();
      await Promise.all([ensureCatalog(), ensureInventory()]);
      if (!uid || uid !== currentUser() || owner !== uid || !ready || !catalog)
        throw Error("コーデの所持状況を確認できませんでした。");
      const rates = {};
      for (const scope of scopes.filter((value) => value.startsWith("verse-"))) {
        const rows = catalog.coordinates.filter(
          (c) =>
            c.family === scope.slice(6) &&
            (!Array.isArray(seriesFilters[scope]) ||
              appearances(c).some((a) => seriesFilters[scope].includes(a.series))),
        );

        rates[scope] = (
          rows.length ? (rows.filter(collected).length / rows.length) * 100 : 0
        ).toFixed(1);
      }
      return rates;
    },
    open,
    reset,
    family: () => family,
    tradeData: () => catalog,
    tradeQuantity(kind, id) {
      if (!ready || owner !== currentUser()) return 0;
      return (kind === "part" ? partQuantities.get(Number(id)) : fullQuantities.get(id)) || 0;
    },
    refreshTrade(resetPage = false) {
      if (resetPage) page = 1;
      if (catalog) render();
    },
    leave() {
      if (dialog.open) dialog.close();
    },
    syncNavigation() {
      const visible =
        !!currentUser() && ["aipri", "primagi"].includes(host.game()) && !host.maintenance();
      button.hidden = !visible || host.game() === "primagi";
      mobileRoute.hidden = !visible || host.game() === "primagi";
      syncImages();
      if (visible) warm();
    },
  };
  let resizeFrame = null;
  let layoutWidth = window.innerWidth;
  window.addEventListener(
    "resize",
    () => {
      // Mobile browser chrome changes height while a slow pan is in progress.
      // Only a width change requires navigation/pagination layout work.
      if (window.innerWidth === layoutWidth || resizeFrame !== null) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        if (window.innerWidth === layoutWidth) return;
        layoutWidth = window.innerWidth;
        placeRoute();
        if (!panel.hidden && catalog) renderPages(maxPage);
      });
    },
    { passive: true },
  );
  window.CARD_VERSE.syncNavigation();
})();

/* verse-ready */
verseScript.dispatchEvent(new Event("load"));

/* trade.js */
(() => {
  "use strict";
  const host = window.CARD_TRADE_HOST;
  const exporterURL = new URL(
    "./trade-image-export.js?v=20261030-registration-30min-v2",
    document.currentScript.src,
  ).href;
  let exportSheets = [],
    outputVersion = 0,
    exportLoading = null;
  if (!host) return;
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
  let owner = null,
    ready = false,
    loading = null,
    generation = 0,
    records = new Set(),
    priorities = new Map(),
    busy = new Set(),
    origin = null;
  const filters = { card: "all", coordinate: "all" };
  const uid = () => host.session()?.user.id || null;
  const key = (kind, id, side) => JSON.stringify([kind, String(id), side]);
  const targetKey = (kind, id) => JSON.stringify([kind, String(id)]);
  const has = (kind, id, side) => records.has(key(kind, id, side));
  const level = (kind, id, side) =>
    has(kind, id, side) ? priorities.get(key(kind, id, side)) || 1 : 0;
  const label = { offer: "譲れるもの", want: "求めるもの" };
  const button = document.createElement("button");
  button.id = "trade-open";
  button.type = "button";
  button.className = "text-button";
  button.textContent = "交換希望";
  button.hidden = true;
  document.querySelector("#header-other .header-other-options").prepend(button);
  window.CARD_HEADER_LAYOUT?.();
  const panel = document.createElement("section");
  panel.id = "trade-page";
  panel.hidden = true;
  panel.innerHTML = `<div class="trade-heading"><div><span class="eyebrow">TRADE LIST</span><h1 id="trade-title">交換希望</h1><p class="trade-intro">登録した譲・求をまとめて、交換希望を作成できます。</p></div><button type="button" id="trade-back" class="text-button">アルバムに戻る</button></div>
 <details id="trade-filter-panel" class="trade-filter-panel"><summary><span class="trade-chevron" aria-hidden="true"></span><span>交換希望を絞り込む</span><small id="trade-filter-count"></small></summary><div class="trade-filters"><label>キーワード<input id="trade-query" type="search" placeholder="名前・コード"></label><label>だん数<select id="trade-series"></select></label><label id="trade-rarity-label">レアリティ<select id="trade-rarity"></select></label><label id="trade-group-label">ガチャ・キャンペーン<select id="trade-group"></select></label></div></details><p id="trade-load-status" role="status"></p>
 <section class="trade-step"><div class="trade-step-heading"><span class="trade-step-number">1</span><div><h2 id="trade-review-title">譲・求のカードを確認</h2><p>絞り込みを使って、画像に入れるカードを確認してください。赤枠は優先のものです。</p></div></div><div class="trade-totals" id="trade-output-count"></div><p id="trade-overflow" class="trade-error" role="status"></p><div id="trade-sheets"></div></section>
 <section class="trade-step trade-export-step"><div class="trade-step-heading"><span class="trade-step-number">2</span><div><h2>希望画像を出力</h2><p>1画像に最大36枚。譲・求ごとに、保存する画像を選んでください。</p></div></div><div id="trade-export-buttons" class="trade-export-buttons"></div><p id="trade-export-status" role="status" aria-live="polite"></p></section>
 <section class="trade-step trade-message-step"><div class="trade-step-heading"><span class="trade-step-number">3</span><div><h2>交換希望の文章をコピー</h2><p>出力した画像と一緒に使える文章です。画像番号は自動で入ります。</p></div></div><label class="trade-method">交換方法（任意）<input id="trade-method" maxlength="200" placeholder="手渡し・郵送など、記載してください"></label><textarea id="trade-post" readonly aria-label="交換希望の文章"></textarea><div class="trade-actions"><button type="button" id="trade-copy-post">交換希望文をコピー</button><button type="button" id="trade-show-text" aria-expanded="false" aria-controls="trade-text-panel">文字情報を出力</button></div><div id="trade-text-panel" hidden><p class="trade-text-note">カード情報を文字で確認・コピーできます。</p><textarea id="trade-text" readonly aria-label="譲・求のカード情報"></textarea><button id="trade-copy-text" type="button">カード情報をコピー</button></div></section><div class="trade-share-area"><button id="trade-share" type="button">共有</button><p>文章を共有します。出力した画像は共有先で添付してください。</p></div><p class="trade-disclaimer">※ 当サイトはこの機能の利用により生じたトラブルについて一切の責任を負いません。</p>`;
  $("collection").after(panel);
  function reset() {
    generation++;
    outputVersion++;
    exportSheets = [];
    window.CARD_TRADE_IMAGE?.close();
    owner = null;
    ready = false;
    loading = null;
    records.clear();
    priorities.clear();
    busy.clear();
    imageQueue.clear();
    filters.card = filters.coordinate = "all";
    origin = null;
    panel.hidden = true;
    for (const id of ["trade-post", "trade-text", "trade-method"]) $(id).value = "";
    $("trade-sheets").replaceChildren();
    $("trade-export-buttons").replaceChildren();
    $("trade-export-status").textContent = "";
  }
  async function load() {
    const user = uid();
    if (!user || host.maintenance()) return;
    if (owner === user && ready) return;
    if (loading?.uid === user) return loading.promise;
    if (owner !== user) {
      records = new Set();
      priorities = new Map();
      ready = false;
      owner = user;
    }
    const g = generation,
      task = { uid: user, promise: null };
    task.promise = (async () => {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const r = await host
          .client()
          .from("card_trade_requests")
          .select("kind,target_id,side,priority")
          .eq("user_id", user)
          .order("kind")
          .order("target_id")
          .order("side")
          .range(offset, offset + 999);
        if (r.error) throw Error("交換希望用SQLと通信状態を確認してください。");
        if (!Array.isArray(r.data)) throw Error("交換希望を取得できませんでした。");
        rows.push(...r.data);
        if (r.data.length < 1000) break;
      }
      if (user !== uid() || g !== generation) return;
      records = new Set(rows.map((r) => key(r.kind, r.target_id, r.side)));
      priorities = new Map(
        rows.map((r) => [key(r.kind, r.target_id, r.side), r.priority === 2 ? 2 : 1]),
      );
      ready = true;
      host.changed();
      patch();
    })();
    loading = task;
    task.promise
      .finally(() => {
        if (loading === task) loading = null;
      })
      .catch(() => {});
    return task.promise;
  }
  function sync() {
    if (!uid()) {
      if (owner) reset();
      button.hidden = true;
      patch();
      return;
    }
    if (owner && owner !== uid()) reset();
    button.hidden = !host.game() || host.maintenance();
    if (!button.hidden) load().catch(() => {});
  }
  function markup(kind, id) {
    if (!uid()) return "";
    return `<div class="trade-toggles" data-trade-control data-trade-kind="${esc(kind)}" data-trade-id="${esc(id)}" role="group" aria-label="交換希望">${["offer", "want"].map((side) => `<button type="button" data-trade-side="${side}" aria-pressed="${has(kind, id, side)}" data-priority="${level(kind, id, side) === 2}" title="タップで通常・優先・解除を切り替え" ${!ready ? "disabled" : ""}><strong>${level(kind, id, side) === 2 ? "優先" : ""}${side === "offer" ? "譲" : "求"}</strong><span>${kind === "card" ? label[side] : side === "offer" ? "譲れるコーデ" : "欲しいコーデ"}</span></button>`).join("")}</div>`;
  }
  function patch() {
    patchBadges();
    document.querySelectorAll("[data-trade-control]").forEach((node) => {
      for (const b of node.querySelectorAll("[data-trade-side]")) {
        b.setAttribute(
          "aria-pressed",
          String(has(node.dataset.tradeKind, node.dataset.tradeId, b.dataset.tradeSide)),
        );
        const priority =
          level(node.dataset.tradeKind, node.dataset.tradeId, b.dataset.tradeSide) === 2;
        b.dataset.priority = String(priority);
        b.querySelector("strong").textContent =
          (priority ? "優先" : "") + (b.dataset.tradeSide === "offer" ? "譲" : "求");
        b.disabled =
          !ready ||
          host.maintenance() ||
          busy.has(targetKey(node.dataset.tradeKind, node.dataset.tradeId));
      }
    });
  }
  function patchBadges() {
    document
      .querySelectorAll("#cards article.card,#verse-cards [data-verse-card]")
      .forEach((card) => {
        const kind = card.hasAttribute("data-verse-card") ? "coordinate" : "card";
        const id =
          kind === "coordinate"
            ? card.dataset.verseCard
            : card.querySelector("[data-detail]")?.dataset.detail;
        const frame = card.querySelector(
          kind === "coordinate" ? ".verse-card-picture" : ".card-image-frame",
        );
        if (!id || !frame) return;
        let tag = frame.querySelector(".card-trade-tag");
        const side =
          ready && owner === uid()
            ? has(kind, id, "offer")
              ? "offer"
              : has(kind, id, "want")
                ? "want"
                : null
            : null;
        if (!side) {
          tag?.remove();
          return;
        }
        if (!tag) {
          tag = document.createElement("span");
          tag.className = "card-trade-tag";
          frame.append(tag);
        }
        tag.dataset.side = side;
        tag.dataset.priority = String(level(kind, id, side) === 2);
        tag.textContent = side === "offer" ? "譲" : "求";
        tag.setAttribute(
          "aria-label",
          (level(kind, id, side) === 2 ? "優先" : "") +
            (side === "offer" ? "譲れるカード" : "求めるカード"),
        );
      });
  }
  async function toggle(kind, id, side) {
    if (!uid() || !ready || host.maintenance()) return;
    const target = targetKey(kind, id);
    if (busy.has(target)) return;
    const k = key(kind, id, side),
      other = key(kind, id, side === "offer" ? "want" : "offer");
    const user = uid(),
      g = generation,
      before = level(kind, id, side),
      beforeOther = level(kind, id, side === "offer" ? "want" : "offer"),
      next = (before + 1) % 3;
    const remove = () => {
      records.delete(k);
      records.delete(other);
      priorities.delete(k);
      priorities.delete(other);
    };
    busy.add(target);
    remove();
    if (next) {
      records.add(k);
      priorities.set(k, next);
    }
    host.changed();
    patch();
    document.dispatchEvent(
      new CustomEvent("card-album-operation-start", {
        detail: { userId: user },
      }),
    );
    try {
      const r = await host.client().rpc("card_album_set_trade_priority", {
        p_kind: kind,
        p_target_id: String(id),
        p_side: side,
        p_level: next,
      });
      if (user !== uid() || g !== generation) return;
      if (r.error || r.data !== next) throw Error("save");
      document.dispatchEvent(
        new CustomEvent("card-album-operation-saved", {
          detail: {
            kind: "trade",
            userId: user,
            targetId: id,
            targetType: kind,
            before: {
              side: before ? side : beforeOther ? (side === "offer" ? "want" : "offer") : null,
              priority: before || beforeOther || 0,
            },
            after: { side: next ? side : null, priority: next },
            level: next,
          },
        }),
      );
    } catch {
      if (user !== uid() || g !== generation) return;
      remove();
      if (before) {
        records.add(k);
        priorities.set(k, before);
      }
      if (beforeOther) {
        records.add(other);
        priorities.set(other, beforeOther);
      }
      host.changed();
      host.toast("失敗しました", "error");
      try {
        const r = await host
          .client()
          .from("card_trade_requests")
          .select("side,priority")
          .eq("user_id", user)
          .eq("kind", kind)
          .eq("target_id", String(id))
          .maybeSingle();
        if (!r.error && user === uid() && g === generation) {
          remove();
          if (r.data?.side) {
            const actual = key(kind, id, r.data.side);
            records.add(actual);
            priorities.set(actual, r.data.priority === 2 ? 2 : 1);
          }
          host.changed();
        }
      } catch {}
    } finally {
      if (user === uid() && g === generation) {
        busy.delete(target);
        patch();
      }
      document.dispatchEvent(
        new CustomEvent("card-album-operation-finished", {
          detail: { userId: user },
        }),
      );
    }
  }
  function filterMarkup(kind) {
    const value = filters[kind] || "all";
    return `<label class="trade-filter"><span class="filter-label">譲渡関係<button type="button" class="filter-clear" data-trade-clear="${kind}" ${value === "all" ? "disabled" : ""}>解除</button></span><select data-trade-filter="${kind}" ${!ready ? "disabled" : ""}><option value="all" ${value === "all" ? "selected" : ""}>すべて</option><option value="offer" ${value === "offer" ? "selected" : ""}>譲れるもの</option><option value="want" ${value === "want" ? "selected" : ""}>求めるもの</option></select></label>`;
  }
  function matches(kind, id) {
    const side = filters[kind];
    if (!side || side === "all") return true;
    if (!ready) return false;
    return (
      has(kind, id, side) ||
      (kind === "coordinate" &&
        (host.verse()?.coordinates.find((c) => c.id === id)?.part_ids || []).some((p) =>
          has("part", p, side),
        ))
    );
  }
  function entry(kind) {
    return filters[kind] && filters[kind] !== "all"
      ? { key: "trade", label: "譲渡関係", value: label[filters[kind]] }
      : null;
  }
  function clear(kind) {
    filters[kind] = "all";
  }
  function items() {
    if (!origin) return [];
    if (origin.kind === "card")
      return host
        .cards()
        .filter((c) => c.game === origin.game && (c.game !== "aipri" || c.family === origin.family))
        .map((c) => ({
          kind: "card",
          id: c.id,
          code: c.code,
          name: c.name || "カード名未取得",
          image: c.front,
          series: c.series || [],
          rarity: c.rarity || "",
          groups: [],
          songs: c.songs || [],
          character: c.character || "",
        }));
    const data = host.verse();
    if (!data) return [];
    const coords = data.coordinates.filter(
      (c) =>
        c.family ===
        (origin.family === "primagi"
          ? "primagi"
          : origin.family === "ひみつ"
            ? "himitsu"
            : "onegai"),
    );
    const partMap = new Map(data.parts.map((p) => [p.id, p])),
      parts = new Map();
    const full = coords.map((c) => {
      const series = [...new Set((c.appearances || []).map((a) => a.series))],
        groups = [...new Set((c.appearances || []).map((a) => a.group))];
      for (const id of c.part_ids) {
        const p = partMap.get(id);
        if (!p) continue;
        const prev = parts.get(id);
        parts.set(id, {
          kind: "part",
          id,
          code: c.family === "primagi" ? (p.codes || []).join(" / ") : prev?.code || c.code || "",
          name: p.metadata?.name || p.name || c.name,
          image: window.CARD_PRIMAGI.verseImage(p.image),
          series: [...new Set([...(prev?.series || []), ...series])],
          groups: [...new Set([...(prev?.groups || []), ...groups])],
          rarity: p.rarity || c.rarity || "",
          slot: p.slot,
          buzz: p.buzz,
        });
      }
      return {
        kind: "coordinate",
        id: c.id,
        code: c.code,
        name: c.name,
        image:
          window.CARD_PRIMAGI.verseImage(c.image) || window.CARD_PRIMAGI.verseImage(c.thumbnail),
        collage: c.part_ids
          .map((id) => window.CARD_PRIMAGI.verseImage(partMap.get(id)?.image))
          .filter(Boolean),
        series,
        groups,
        rarity: c.rarity || "",
      };
    });
    return [...full, ...parts.values()];
  }
  const values = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  function filtered() {
    const query = $("trade-query").value.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "");
    return items().filter(
      (c) =>
        (!query ||
          [c.code, c.name, c.character, ...values(c.songs)]
            .join(" ")
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[\s-]/g, "")
            .includes(query)) &&
        (!$("trade-series").value || values(c.series).includes($("trade-series").value)) &&
        (!$("trade-rarity").value || c.rarity === $("trade-rarity").value) &&
        (!$("trade-group").value || values(c.groups).includes($("trade-group").value)),
    );
  }
  function options(id, rows) {
    $(id).innerHTML =
      '<option value="">すべて</option>' +
      [...new Set(rows.filter(Boolean))]
        .sort((a, b) =>
          id === "trade-series" && origin?.game === "primagi"
            ? window.CARD_PRIMAGI.chapterRank(b) - window.CARD_PRIMAGI.chapterRank(a) ||
              b.localeCompare(a, "ja", { numeric: true })
            : b.localeCompare(a, "ja", { numeric: true }),
        )
        .map(
          (v) =>
            `<option value="${esc(v)}">${esc(origin?.game === "primagi" && id === "trade-series" ? window.CARD_PRIMAGI.chapterLabel(v) : v)}</option>`,
        )
        .join("");
  }
  function title() {
    if (origin?.game === "primagi") return "ワッチャプリマジ！";
    return origin.game === "aikatsu"
      ? "アイカツアンコール"
      : (origin.family === "ひみつ" ? "ひみつのアイプリ" : "おねがいアイプリ") +
          (origin.kind === "coordinate" ? "バース" : "");
  }
  const imageQueue = new Set();
  let imageFrame = null;
  function drawShotImage(img) {
    if (!img.isConnected || !img.complete || !img.naturalWidth || !img.naturalHeight) return;
    const frame = img.closest(".trade-shot-image");
    if (!frame) return;
    const rotate = frame.dataset.rotate === "true" && img.naturalWidth > img.naturalHeight;
    const ratio = Math.min(1, 240 / Math.max(img.naturalWidth, img.naturalHeight));
    const sw = Math.max(1, Math.round(img.naturalWidth * ratio)),
      sh = Math.max(1, Math.round(img.naturalHeight * ratio));
    let canvas = frame.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      frame.append(canvas);
    }
    canvas.width = rotate ? sh : sw;
    canvas.height = rotate ? sw : sh;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw Error("canvas");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      if (rotate) {
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate(Math.PI / 2);
        context.drawImage(img, -sw / 2, -sh / 2, sw, sh);
      } else context.drawImage(img, 0, 0, sw, sh);
      img.dataset.tradeDrawn = "true";
    } catch {
      canvas.remove();
      img.removeAttribute("data-trade-drawn");
    }
  }
  function queueShotImage(img) {
    imageQueue.add(img);
    if (imageFrame !== null) return;
    imageFrame = requestAnimationFrame(function process() {
      imageFrame = null;
      let n = 0;
      for (const image of imageQueue) {
        imageQueue.delete(image);
        drawShotImage(image);
        if (++n >= 3) break;
      }
      if (imageQueue.size) imageFrame = requestAnimationFrame(process);
    });
  }
  panel.addEventListener(
    "load",
    (event) => {
      if (event.target.matches?.(".trade-shot-image>img")) queueShotImage(event.target);
    },
    true,
  );
  function image(c) {
    const source = (url) =>
      c.kind === "card" ? window.CARD_PRIMAGI.image(url) : window.CARD_PRIMAGI.verseImage(url);
    const frame = (url, rotate) =>
      `<span class="trade-shot-image" data-rotate="${rotate}"><img src="${esc(source(url))}" alt="${esc(c.name)}" loading="eager" decoding="async"></span>`;
    if (source(c.image)) return frame(c.image, c.kind !== "coordinate");
    const images = (c.collage || []).filter((url) => source(url));
    return images.length
      ? `<span class="trade-collage">${images.map((url) => frame(url, true)).join("")}</span>`
      : `<span class="catalog-image-unavailable">画像なし</span>`;
  }
  function renderOutput() {
    if (!origin || panel.hidden) return;
    const applied = [
      $("trade-query").value.trim(),
      $("trade-series").value,
      $("trade-rarity").value,
      $("trade-group").value,
    ].filter(Boolean).length;
    $("trade-filter-count").textContent = applied ? `適用中 ${applied}件` : "";
    outputVersion++;
    const all = filtered(),
      rank = (side) => (a, b) => level(b.kind, b.id, side) - level(a.kind, a.id, side),
      offer = all.filter((c) => has(c.kind, c.id, "offer")).sort(rank("offer")),
      want = all.filter((c) => has(c.kind, c.id, "want")).sort(rank("want")),
      capacity = 36;
    const priorityNote =
      [...offer].some((c) => level(c.kind, c.id, "offer") === 2) ||
      want.some((c) => level(c.kind, c.id, "want") === 2)
        ? "※ 赤枠は優先して交換したいものです。"
        : "";
    const groups = [
        { side: "譲", rows: offer },
        { side: "求", rows: want },
      ],
      count = groups.reduce((n, g) => n + Math.ceil(g.rows.length / capacity), 0);
    exportSheets = [];
    let n = 0;
    const numbers = { 譲: [], 求: [] };
    for (const g of groups)
      for (let offset = 0; offset < g.rows.length; offset += capacity) {
        n++;
        numbers[g.side].push(n);
        const side = g.side === "譲" ? "offer" : "want";
        const cards = g.rows.slice(offset, offset + capacity).map((c) => ({
          ...c,
          quantity: Math.max(0, Number(host.quantity(c.kind, c.id)) || 0),
          priority: level(c.kind, c.id, side) === 2,
        }));
        const sheet = {
          side,
          cards,
          number: n,
          page: numbers[g.side].length,
          pages: Math.ceil(g.rows.length / capacity),
          total: count,
        };
        sheet.kind = origin.kind;
        exportSheets.push(sheet);
      }
    $("trade-output-count").innerHTML =
      `<span><strong>譲</strong> ${offer.length}件</span><span><strong>求</strong> ${want.length}件</span>`;
    const overflow = count >= 4;
    $("trade-overflow").textContent = overflow
      ? `譲・求合わせて${count}画像になります。共有先の添付枚数をご確認ください。すべての画像を出力できます。`
      : "";
    const unit = origin.kind === "coordinate" ? "コーデ" : "カード";
    $("trade-review-title").textContent = `譲・求の${unit}を確認`;
    $("trade-copy-text").textContent = `${unit}情報をコピー`;
    $("trade-text").setAttribute("aria-label", `譲・求の${unit}情報`);
    $("trade-text-panel").querySelector("p").textContent =
      `${unit}情報を文字で確認・コピーできます。`;
    $("trade-sheets").innerHTML = count
      ? `<div class="trade-review">${groups
          .map((group) => {
            const side = group.side === "譲" ? "offer" : "want";
            return `<section class="trade-review-group" data-side="${side}"><h3>${group.side === "譲" ? "譲れる" : "欲しい"}${unit}<small>${group.rows.length}件</small></h3><div class="trade-review-grid">${group.rows.length ? group.rows.map((c) => `<article class="trade-review-card ${level(c.kind, c.id, side) === 2 ? "is-priority" : ""}" data-kind="${c.kind}" title="${esc(c.code)} ${esc(c.name)}">${image(c)}<small>${esc(c.code || "コード記載なし")}</small></article>`).join("") : '<p class="trade-review-empty">登録なし</p>'}</div></section>`;
          })
          .join("")}</div>`
      : '<p class="trade-empty">譲・求の登録がありません。モーダルから登録してください。</p>';
    $("trade-export-buttons").innerHTML = ["offer", "want"]
      .map((side) => {
        const rows = exportSheets
          .map((sheet, index) => ({ sheet, index }))
          .filter((r) => r.sheet.side === side);
        return `<div class="trade-export-group" data-side="${side}"><h3>${side === "offer" ? "譲れる" : "欲しい"}${unit}<small>${rows.length}画像</small></h3><div>${rows.length ? rows.map(({ sheet, index }) => `<button type="button" data-trade-export="${index}"><span>${sheet.page}枚目を出力</span><small>画像${sheet.number}枚目 · ${sheet.cards.length}枚</small></button>`).join("") : "<p>登録なし</p>"}</div></div>`;
      })
      .join("");
    $("trade-export-status").textContent = "";
    imageQueue.clear();
    for (const image of $("trade-sheets").querySelectorAll(".trade-shot-image>img"))
      if (image.complete) queueShotImage(image);
    const refs = (side) =>
      numbers[side].length ? "画像" + numbers[side].join("、") + "枚目" : "登録なし";
    $("trade-post").value =
      `${title()}　交換希望\n\n譲　${refs("譲")}\n求　${refs("求")}\n\n交換方法　${$("trade-method").value.trim() || "（記載してください）"}${priorityNote ? "\n\n" + priorityNote : ""}`;
    $("trade-copy-post").disabled = count === 0;
    $("trade-share").disabled = count === 0;
    $("trade-text").value =
      title() +
      "　交換希望\n\n" +
      groups
        .map(
          (g) =>
            g.side +
            "\n" +
            (g.rows
              .map((c) =>
                [
                  level(c.kind, c.id, g.side === "譲" ? "offer" : "want") === 2 ? "【優先】" : "",
                  c.code,
                  c.name,
                  c.slot,
                  c.character,
                  c.rarity,
                  c.buzz == null ? "" : c.buzz + " BP",
                ]
                  .filter(Boolean)
                  .join(" ｜ "),
              )
              .join("\n") || "登録なし"),
        )
        .join("\n\n") +
      "\n\n交換方法　" +
      ($("trade-method").value.trim() || "（記載してください）") +
      (priorityNote ? "\n\n" + priorityNote : "");
  }
  function ensureExporter() {
    if (window.CARD_TRADE_IMAGE) return Promise.resolve(window.CARD_TRADE_IMAGE);
    if (!exportLoading) {
      exportLoading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = exporterURL;
        script.onload = () =>
          window.CARD_TRADE_IMAGE
            ? resolve(window.CARD_TRADE_IMAGE)
            : reject(Error("画像出力機能を読み込めませんでした。"));
        script.onerror = () => {
          script.remove();
          reject(Error("画像出力機能を読み込めませんでした。"));
        };
        document.head.append(script);
      }).catch((error) => {
        exportLoading = null;
        throw error;
      });
    }
    return exportLoading;
  }
  async function outputImage(button) {
    const sheet = exportSheets[Number(button.dataset.tradeExport)];
    if (!sheet || button.disabled || !uid() || host.maintenance()) return;
    const label = button.querySelector("span");
    const originalLabel = label?.textContent || "画像を出力";
    const wasExported = button.dataset.exportState === "done";
    if (label) label.textContent = `${sheet.page}枚目 · 出力中`;
    button.dataset.exportState = "busy";
    button.setAttribute("aria-busy", "true");
    let completed = false;
    const version = outputVersion,
      user = uid(),
      g = generation;
    const current = () =>
      version === outputVersion &&
      user === uid() &&
      g === generation &&
      !panel.hidden &&
      !host.maintenance();
    const heading = title().replace("アイカツアンコール", "アイカツ！アンコール");
    const buttons = [...$("trade-export-buttons").querySelectorAll("button")];
    buttons.forEach((b) => {
      b.disabled = true;
    });
    $("trade-export-status").textContent = "画像を準備しています…";
    try {
      const exporter = await ensureExporter();
      if (!current()) return;
      const blob = await exporter.create(
        sheet,
        heading,
        (done, total) => {
          if (current())
            $("trade-export-status").textContent = `画像を準備しています… ${done} / ${total}`;
        },
        current,
      );
      if (!current()) return;
      exporter.show(
        blob,
        `${heading}_${sheet.side === "offer" ? "譲" : "求"}_${sheet.page}.jpg`,
        `${sheet.side === "offer" ? "譲" : "求"} ${sheet.page}枚目（画像${sheet.number}枚目）`,
      );
      completed = true;
      button.dataset.exportState = "done";
      if (label) label.textContent = `${sheet.page}枚目 · 出力済み`;
      $("trade-export-status").textContent = "画像を作成しました。「画像を保存」から保存できます。";
    } catch (error) {
      if (current()) {
        $("trade-export-status").textContent = window.CARD_ERROR.message(error);
        host.toast("画像を作成できませんでした", "error");
      }
    } finally {
      button.removeAttribute("aria-busy");
      if (!completed) {
        button.dataset.exportState = wasExported ? "done" : "";
        if (label) label.textContent = originalLabel;
      }
      if (current())
        buttons.forEach((b) => {
          b.disabled = false;
        });
    }
  }
  async function open() {
    if (!uid() || host.maintenance()) return;
    const isVerse = host.isVerse();
    origin = {
      kind: isVerse ? "coordinate" : "card",
      game: isVerse
        ? window.CARD_VERSE.family() === "primagi"
          ? "primagi"
          : "aipri"
        : host.game(),
      family: isVerse
        ? window.CARD_VERSE.family() === "primagi"
          ? "primagi"
          : window.CARD_VERSE.family() === "himitsu"
            ? "ひみつ"
            : "おねがい"
        : host.family(),
    };
    host.screen("trade-page");
    $("trade-title").textContent = title() + "の交換希望";
    $("trade-load-status").textContent = "読み込み中…";
    $("trade-text-panel").hidden = true;
    $("trade-show-text").setAttribute("aria-expanded", "false");
    $("trade-query").value = "";
    $("trade-filter-panel").open = false;
    $("trade-sheets").replaceChildren();
    const user = uid(),
      g = generation;
    try {
      await load();
      if (user !== uid() || g !== generation || panel.hidden) return;
      const all = items();
      options(
        "trade-series",
        all.flatMap((c) => values(c.series)),
      );
      options(
        "trade-rarity",
        all.map((c) => c.rarity),
      );
      options(
        "trade-group",
        all.flatMap((c) => values(c.groups)),
      );
      $("trade-group-label").hidden = origin.kind === "card";
      $("trade-rarity-label").hidden = origin.kind !== "card";
      $("trade-load-status").textContent = "";
      renderOutput();
    } catch (error) {
      if (user === uid() && g === generation)
        $("trade-load-status").textContent = window.CARD_ERROR.message(error);
    }
  }
  function exportText(id) {
    return $(id).value.trimEnd() + "\n\nhttps://iprimaker.github.io/card-management";
  }
  async function copy(id) {
    let temporary;
    const previous = document.activeElement;
    try {
      const text = exportText(id);
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        temporary = document.createElement("textarea");
        temporary.value = text;
        temporary.readOnly = true;
        temporary.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.append(temporary);
        temporary.focus({ preventScroll: true });
        temporary.select();
        if (!document.execCommand("copy")) throw Error("copy");
      }
      host.toast("コピーしました");
    } catch {
      host.toast("コピーできませんでした。", "error");
    } finally {
      temporary?.remove();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    }
  }
  button.onclick = open;
  $("trade-back").onclick = () => {
    if (origin?.kind === "coordinate")
      window.CARD_VERSE.open(
        origin.family === "primagi" ? "primagi" : origin.family === "ひみつ" ? "himitsu" : "onegai",
      );
    else host.back();
  };
  $("trade-query").oninput = renderOutput;
  $("trade-method").oninput = () => {
    for (const id of ["trade-post", "trade-text"]) {
      $(id).value = $(id).value.replace(
        /交換方法　[^\n]*/,
        () => "交換方法　" + ($("trade-method").value.trim() || "（記載してください）"),
      );
    }
  };
  for (const id of ["trade-series", "trade-rarity", "trade-group"]) $(id).onchange = renderOutput;
  $("trade-share").onclick = async () => {
    if ($("trade-share").disabled || !uid() || host.maintenance()) return;
    const data = {
      title: title() + " 交換希望",
      text: exportText("trade-post"),
    };
    if (!navigator.share) {
      await copy("trade-post");
      return;
    }
    try {
      await navigator.share(data);
    } catch (error) {
      if (error?.name !== "AbortError")
        host.toast("共有できませんでした。コピーをご利用ください。", "error");
    }
  };
  $("trade-copy-post").onclick = () => copy("trade-post");
  $("trade-copy-text").onclick = () => copy("trade-text");
  $("trade-show-text").onclick = () => {
    const show = $("trade-text-panel").hidden;
    $("trade-text-panel").hidden = !show;
    $("trade-show-text").setAttribute("aria-expanded", String(show));
  };
  document.addEventListener("click", (e) => {
    const exportButton = e.target.closest("[data-trade-export]");
    if (exportButton) outputImage(exportButton);
    const side = e.target.closest("[data-trade-side]");
    if (side) {
      const c = side.closest("[data-trade-control]");
      toggle(c.dataset.tradeKind, c.dataset.tradeId, side.dataset.tradeSide);
    }
    const clearButton = e.target.closest("[data-trade-clear]");
    if (clearButton) {
      clear(clearButton.dataset.tradeClear);
      host.changed(true);
    }
  });
  document.addEventListener("change", (e) => {
    const kind = e.target.dataset.tradeFilter;
    if (kind) {
      filters[kind] = e.target.value;
      host.changed(true);
    }
  });
  window.CARD_TRADE = {
    sync,
    reset,
    markup,
    patch,
    patchBadges,
    filterMarkup,
    matches,
    entry,
    clear,
    open,
    renderOutput,
  };
  const badgeObserver = new MutationObserver((records) => {
    if (
      records.some((record) =>
        [...record.addedNodes].some(
          (node) =>
            node.nodeType === 1 && (node.matches("article") || node.querySelector("article")),
        ),
      )
    )
      patchBadges();
  });
  badgeObserver.observe($("collection"), { childList: true, subtree: true });
  if ($("verse-cards")) badgeObserver.observe($("verse-cards"), { childList: true, subtree: true });
  sync();
  host.changed();
})();

// Update card information without navigating or changing personal records.
document.addEventListener("card-visibility-updated", () => {
  const fresh = window.CARD_VISIBILITY.cache();
  if (!fresh) return;
  const currentId = selected?.id,
    oldSide = side;
  const dialog = $("detail"),
    body = dialog?.querySelector(".modal-body");
  const dialogScroll = dialog?.scrollTop || 0,
    bodyScroll = body?.scrollTop || 0;
  const position = { x: window.scrollX, y: window.scrollY };
  catalogFallback = fresh;
  adminOverrides.clear();
  catalog = {
    ...catalog,
    cards: fresh.cards.map((c) => ({ ...c })),
    updatedAt: fresh.state.updated_at,
    source: "live",
  };
  applyPersonalMetadata();
  if (game) {
    fillFilters();
    render();
  }
  if (dialog?.open && currentId) {
    openDetail(currentId, lastFocus, true);
    side = oldSide && selected?.back ? 1 : 0;
    showSide();
    dialog.scrollTop = dialogScroll;
    if (body) body.scrollTop = bodyScroll;
  }
  if (!$("auth").hidden) art();
  if ($("trade-page") && !$("trade-page").hidden) window.CARD_TRADE?.renderOutput();
  window.scrollTo(position.x, position.y);
});

document.addEventListener("private-qr-changed", () => {
  if (game) {
    page = 1;
    render();
  }
  window.CARD_VERSE?.refreshOwnershipFilter();
});
