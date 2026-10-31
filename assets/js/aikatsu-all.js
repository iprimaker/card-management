/* Past Aikatsu catalogs are immutable static assets, loaded one system at a time. */
(() => {
  "use strict";
  const host = window.CARD_ALL_HOST;
  if (!host) return;
  const root = new URL("../aikatsu-all/", document.currentScript.src);
  const systems = [
    ["cardlist", "アイカツ！", "アイカツ！", 3428, "btn.png?v2"],
    ["stars", "アイカツスターズ！", "スターズ！", 3285, "btn_stars.png?v2"],
    ["friends", "アイカツフレンズ！", "フレンズ！", 1623, "btn_friends.png?v2"],
    [
      "onparade",
      "アイカツオンパレード！",
      "オンパレード！",
      1538,
      "btn_onparade.png?v3",
    ],
    [
      "planet",
      "アイカツプラネット！",
      "プラネット！",
      444,
      "btn_planet.png?v3",
    ],
    [
      "academy",
      "アイカツアカデミー！",
      "アカデミー！",
      646,
      "btn_academy.png?v3",
    ],
  ];
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
  const byId = (id) => document.getElementById(id);
  const textValues = (value) =>
    (Array.isArray(value) ? value : value ? [value] : []).map(String);
  const normalize = (value) =>
    String(value)
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[\s\-‐‑–—ー・]/g, "");
  const uid = () => host.session()?.user?.id || null;
  const cache = new Map(),
    inflight = new Map();
  let current = null,
    catalog = null,
    owner = null,
    inventory = new Map(),
    inventoryReady = false;
  let inventoryRequest = null,
    inventoryChecked = 0,
    inventoryRevision = 0,
    generation = 0,
    viewGeneration = 0;
  let query = "",
    ownedFilter = "all",
    qrFilter = "all",
    filters = {},
    page = 1,
    size = 20,
    sort = "official";
  let selected = null,
    side = 0,
    lastFocus = null;
  const saving = new Set();
  let favorites = new Set(),
    favoritesReady = false,
    favoritesOwner = null,
    favoritesRequest = null,
    favoritesChecked = 0,
    favoritesRevision = 0,
    favoriteFilter = false;
  const favoriteSaving = new Set();
  const favoriteStar =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.5 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96Z"/></svg>';
  function favoriteButton(c, modal = false) {
    const enabled =
      favoritesReady && favoritesOwner === uid() && favorites.has(c.id);
    const label = enabled ? "お気に入りを解除" : "お気に入りに登録";
    return `<button type="button" class="${modal ? "modal-favorite" : "favorite-button"}${enabled ? " is-favorite" : ""}" data-all-favorite="${esc(c.id)}" aria-label="${esc(c.name + "：" + label)}" aria-pressed="${enabled}" title="${label}" ${!favoritesReady || favoriteSaving.has(c.id) ? "disabled" : ""}>${favoriteStar}${modal ? `<span>${enabled ? "お気に入り登録済み" : label}</span>` : ""}</button>`;
  }
  async function loadFavorites() {
    const user = uid();
    if (!user) return;
    if (favoritesOwner !== user) {
      favoritesOwner = user;
      favorites = new Set();
      favoritesReady = false;
      favoritesRequest = null;
      favoritesChecked = 0;
    }
    if (favoritesRequest) return favoritesRequest;
    if (
      favoriteSaving.size ||
      (favoritesReady && Date.now() - favoritesChecked < 300000)
    )
      return;
    const g = generation,
      revision = favoritesRevision;
    const task = (async () => {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await host
          .client()
          .from("card_all_favorites")
          .select("card_id")
          .eq("user_id", user)
          .order("card_id")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        if (user !== uid() || g !== generation) return;
        rows.push(...result.data);
        if (result.data.length < 1000) break;
      }
      if (revision !== favoritesRevision || favoriteSaving.size) return;
      favorites = new Set(rows.map((r) => r.card_id));
      favoritesReady = true;
      favoritesChecked = Date.now();
    })();
    favoritesRequest = task;
    try {
      await task;
    } finally {
      if (favoritesRequest === task) favoritesRequest = null;
    }
  }
  async function toggleFavorite(id) {
    if (
      !uid() ||
      host.maintenance() ||
      !favoritesReady ||
      favoriteSaving.has(id) ||
      !validId(id)
    )
      return;
    if (navigator.onLine === false) {
      host.toast(
        "通信に接続されていません。接続を確認して、もう一度お試しください。",
        "error",
      );
      return;
    }
    const user = uid(),
      g = generation,
      enabled = !favorites.has(id);
    favoritesRevision++;
    favoriteSaving.add(id);
    render();
    try {
      const result = await host
        .client()
        .rpc("card_all_set_favorite", { p_card_id: id, p_enabled: enabled });
      if (user !== uid() || g !== generation) return;
      if (result.error || result.data !== enabled) throw Error();
      if (enabled) favorites.add(id);
      else favorites.delete(id);
      favoritesChecked = Date.now();
    } catch {
      if (user === uid() && g === generation)
        host.toast(
          "お気に入りを保存できませんでした。通信状態を確認して、もう一度お試しください。",
          "error",
        );
    } finally {
      if (user === uid() && g === generation) {
        favoriteSaving.delete(id);
        favoritesRevision++;
        render();
      }
    }
  }
  const panel = document.createElement("section");
  panel.id = "all-collection";
  panel.hidden = true;
  panel.innerHTML = `<div class="collection-title"><div><span class="eyebrow">ALL AIKATSU!</span><h1 id="all-title">歴代カード</h1></div><div class="all-heading-actions"><span id="all-total" class="pill"></span></div></div>
    <div class="family-tabs all-system-tabs" role="group" aria-label="作品を切り替える">${systems.map(([id, title, short]) => `<button type="button" data-all-system="${id}" aria-pressed="false" title="${title}"><strong>${short}</strong></button>`).join("")}</div>
    <div class="progress-card"><div><span>総取得率</span><strong id="all-percent">—</strong></div><div class="progress-track"><span id="all-progress-bar"></span></div><div class="progress-bottom"><p id="all-progress-count"></p><button type="button" class="text-button" id="all-progress-details" aria-label="弾ごとの取得率を表示" aria-controls="all-series-progress" aria-expanded="false"><span class="progress-chevron" aria-hidden="true"></span></button></div><div id="all-series-progress" class="series-progress" hidden></div><div id="all-filtered-rate" aria-live="polite"></div></div>
    <details id="all-filter-panel" class="filter-panel"><summary>カードを絞り込む<span id="all-filter-summary" class="all-filter-count"></span></summary><div class="filter-content"><label class="search-label" for="all-query">フリーワード検索<input id="all-query" type="search" placeholder="カード名・コードなど" autocomplete="off"><button type="button" id="all-clear-query" class="filter-clear" data-all-clear="query" aria-label="フリーワード検索を解除">解除</button></label><div id="all-filter-fields" class="filter-grid"></div><div class="filter-footer"><button type="button" class="text-button" id="all-clear">すべての絞り込みを解除</button></div></div></details>
    <div id="all-active-filters" class="active-filters" aria-label="適用中の絞り込み" aria-live="polite"></div>
    <div class="ownership-toolbar"><div class="owned-tabs all-owned-tabs" role="group" aria-label="所持状況で絞り込む"><span class="owned-tabs-slider" aria-hidden="true"></span><button type="button" class="active" data-all-owned="all" aria-pressed="true">すべて</button><button type="button" data-all-owned="yes" aria-pressed="false">持っている</button><button type="button" data-all-owned="no" aria-pressed="false">持っていない</button></div></div>
    <div class="results-heading"><h2 id="all-filtered-count"></h2><div class="results-controls card-display-toolbar"><label class="display-count"><span class="display-control-label">並び順</span><select id="all-sort"><option value="official">公式掲載順</option><option value="code">番号順</option><option value="name">名前順</option><option value="rarity">レアリティ順</option><option value="quantity">所持数順</option></select></label><label class="display-count"><span class="display-control-label">表示件数</span><select id="all-size"><option value="20">20枚</option><option value="50">50枚</option><option value="100">100枚</option><option value="all">すべて</option></select></label><div class="mobile-column-control" role="group" aria-label="カード一覧の列数"><span class="mobile-column-label">カードの並び</span><div class="mobile-column-buttons"><button type="button" data-all-columns="2" aria-pressed="false">2列</button><button type="button" data-all-columns="3" aria-pressed="true">3列</button></div></div></div></div>
    <p id="all-status" role="status" aria-live="polite"></p><div id="all-cards" class="card-grid" data-mobile-columns="3"></div><p id="all-empty" hidden><strong>見つかりませんでした</strong><span>条件を変えて探してみてください</span></p>
    <div class="pagination"><button type="button" id="all-prev">前のページ</button><nav id="all-page-numbers" aria-label="カード一覧のページ"></nav><button type="button" id="all-next">次のページ</button></div>
    <p class="all-static-note">2026年10月30日時点の公式掲載情報です。確認できない項目は「未取得」と表示します。<br><a id="all-official" target="_blank" rel="noopener noreferrer">公式カードリスト</a></p>`;
  document.querySelector("main").append(panel);
  const dialog = document.createElement("dialog");
  dialog.id = "all-detail";
  dialog.setAttribute("aria-labelledby", "all-modal-name");
  dialog.innerHTML = `<div class="modal-top"><span id="all-modal-code"></span><button type="button" id="all-close" aria-label="閉じる">×</button></div><div class="modal-body"><div class="viewer"><div><img id="all-modal-image" alt=""><p id="all-image-failure" hidden>画像を読み込めませんでした。</p><span id="all-side-label"></span><div class="modal-side-switch" role="group" aria-label="表裏を切り替える" data-side="0"><button type="button" data-all-side="0">表面</button><button type="button" data-all-side="1">裏面</button></div></div></div><div class="modal-info"><span id="all-modal-rarity" class="pill"></span><h2 id="all-modal-name"></h2><dl id="all-modal-fields"></dl><button type="button" class="ownership-button" id="all-modal-owned"></button><div class="quantity-controls" id="all-quantity"><span>所持数</span><div><button type="button" id="all-minus" aria-label="所持数を1枚減らす">−</button><output id="all-quantity-value"></output><button type="button" id="all-plus" aria-label="所持数を1枚増やす">＋</button></div></div><div id="all-favorite-controls"></div><div id="all-qr-controls" class="qr-action-row"></div><a id="all-modal-source" target="_blank" rel="noopener noreferrer">公式カードリスト</a></div></div><nav class="detail-navigation" aria-label="カードの移動"><button type="button" id="all-detail-prev">← 前のカード</button><button type="button" id="all-detail-next">次のカード →</button></nav>`;
  document.body.append(dialog);
  const route = document.createElement("button");
  route.type = "button";
  route.id = "all-enter";
  route.className = "all-header-route";
  route.hidden = true;
  function active() {
    return !panel.hidden;
  }
  function hidden(node, value) {
    if (node && node.hidden !== value) node.hidden = value;
  }
  function syncNavigation() {
    if (owner && owner !== uid()) reset();
    const show =
      !!uid() &&
      host.game() === "aikatsu" &&
      !host.maintenance() &&
      byId("selection").hidden;
    hidden(route, !show);
    const label = active() ? "アンコールへ" : "ALLへ";
    if (route.textContent !== label) route.textContent = label;
    const anchor = byId(
      window.innerWidth <= 760 ? "menu-toggle" : "game-switch",
    );
    if (window.innerWidth <= 760) {
      if (anchor.previousElementSibling !== route) anchor.before(route);
    } else if (anchor.nextElementSibling !== route) anchor.after(route);
    document.body.classList.toggle("all-aikatsu-active", active());
    if (active())
      for (const id of [
        "ownership-export-open",
        "probability-open",
        "probability-back",
        "trade-open",
        "trade-route",
        "verse-enter",
        "verse-mobile-route",
      ])
        hidden(byId(id), true);
  }
  async function loadSystem(id) {
    if (cache.has(id)) return cache.get(id);
    if (inflight.has(id)) return inflight.get(id);
    if (!systems.some((s) => s[0] === id))
      throw Error("カード情報を表示できません");
    const task = (async () => {
      const response = await fetch(
        new URL(id + ".json?v=20261030-all-assets-v2", root),
        {
          cache: "force-cache",
          credentials: "omit",
        },
      );
      if (!response.ok)
        throw Error(
          "カード情報を読み込めませんでした。時間をおいて再度お試しください。",
        );
      const data = await response.json();
      if (
        data.system !== id ||
        !Array.isArray(data.cards) ||
        new Set(data.cards.map((c) => c.id)).size !== data.cards.length ||
        data.cards.some(
          (c) =>
            !validId(c.id) ||
            c.system !== id ||
            !c.front?.startsWith("https://card.aikatsu.net/"),
        )
      )
        throw Error("カード情報を表示できません");
      data.index = new Map(data.cards.map((c) => [c.id, c]));
      cache.set(id, data);
      return data;
    })().finally(() => inflight.delete(id));
    inflight.set(id, task);
    return task;
  }
  function validId(id) {
    return /^aikatsu-all:(cardlist|stars|friends|onparade|planet|academy):[a-f0-9]{20}$/.test(
      id,
    );
  }
  async function resolve(id) {
    if (!validId(id)) return null;
    const data = await loadSystem(id.split(":")[1]);
    return data.index.get(id) || null;
  }
  async function enrichQrRows(rows) {
    const ids = [
      ...new Set(
        rows
          .filter((r) => r.kind === "card" && validId(r.target_id))
          .map((r) => r.target_id.split(":")[1]),
      ),
    ];
    await Promise.allSettled(ids.map((id) => loadSystem(id)));
    return rows.map((row) => {
      if (row.kind !== "card" || !validId(row.target_id)) return row;
      const c = cache
        .get(row.target_id.split(":")[1])
        ?.index.get(row.target_id);
      return {
        ...row,
        name: c?.name || "カード（名称未取得）",
        series: "aikatsu-all",
      };
    });
  }
  function reset() {
    generation++;
    viewGeneration++;
    owner = null;
    inventory = new Map();
    inventoryReady = false;
    inventoryRequest = null;
    inventoryChecked = 0;
    saving.clear();
    favorites = new Set();
    favoritesReady = false;
    favoritesOwner = null;
    favoritesRequest = null;
    favoritesChecked = 0;
    favoritesRevision++;
    favoriteSaving.clear();
    favoriteFilter = false;
    selected = null;
    if (dialog.open) dialog.close();
    if (!uid()) {
      hidden(panel, true);
      hidden(route, true);
      document.body.classList.remove("all-aikatsu-active");
    }
  }
  async function loadInventory(force = false) {
    const user = uid();
    if (!user) return;
    if (owner !== user) {
      generation++;
      owner = user;
      inventory = new Map();
      inventoryReady = false;
      inventoryChecked = 0;
      inventoryRequest = null;
    }
    if (inventoryRequest) return inventoryRequest;
    if (!force && inventoryReady && Date.now() - inventoryChecked < 60000)
      return;
    const g = generation,
      revision = inventoryRevision;
    const task = (async () => {
      const all = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await host
          .client()
          .from("card_all_ownership")
          .select("card_id,quantity")
          .eq("user_id", user)
          .order("card_id")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        if (user !== uid() || g !== generation) return;
        all.push(...result.data);
        if (result.data.length < 1000) break;
      }
      if (saving.size || revision !== inventoryRevision) return;
      inventory = new Map(all.map((r) => [r.card_id, Number(r.quantity)]));
      inventoryReady = true;
      inventoryChecked = Date.now();
    })();
    inventoryRequest = task;
    try {
      await task;
    } finally {
      if (inventoryRequest === task) inventoryRequest = null;
    }
  }
  // Retain the existing entry API; ALL now opens the original Aikatsu list directly.
  function openSelection() {
    return openSystem("cardlist");
  }
  function resetFilters() {
    query = "";
    ownedFilter = "all";
    qrFilter = "all";
    favoriteFilter = false;
    filters = {};
    page = 1;
    byId("all-query").value = "";
  }
  async function openSystem(id) {
    if (!uid() || host.maintenance()) return;
    const request = ++viewGeneration,
      user = uid();
    try {
      applyColumns(localStorage.getItem("card-album-mobile-columns"));
    } catch {}
    current = id;
    catalog = null;
    selected = null;
    if (dialog.open) dialog.close();
    resetFilters();
    host.open("all-collection");
    byId("all-title").textContent =
      systems.find((s) => s[0] === id)?.[1] || "歴代カード";
    byId("all-cards").replaceChildren();
    byId("all-active-filters").replaceChildren();
    byId("all-filter-fields").replaceChildren();
    byId("all-filter-panel").open = false;
    byId("all-status").textContent = "カード情報を読み込んでいます…";
    byId("all-empty").hidden = true;
    byId("all-percent").textContent = "—";
    byId("all-filtered-rate").replaceChildren();
    byId("all-total").textContent = "";
    byId("all-series-progress").hidden = true;
    byId("all-progress-details").setAttribute("aria-expanded", "false");
    byId("all-progress-count").textContent = "";
    byId("all-filtered-count").textContent = "";
    byId("all-progress-bar").style.width = "0%";
    document
      .querySelectorAll("[data-all-system]")
      .forEach(
        (b) => (
          b.setAttribute("aria-pressed", String(b.dataset.allSystem === id)),
          b.classList.toggle("active", b.dataset.allSystem === id)
        ),
      );
    syncNavigation();
    history.replaceState(
      null,
      "",
      location.pathname + location.search + "#aikatsu-all/" + id,
    );
    try {
      const data = await loadSystem(id);
      if (request !== viewGeneration || user !== uid()) return;
      catalog = data;
      const results = await Promise.allSettled([
        loadInventory(),
        window.CARD_QR?.load(),
        loadFavorites(),
      ]);
      if (request !== viewGeneration || user !== uid()) return;
      fillFilters();
      render();
      if (results[0].status === "rejected" || !inventoryReady)
        status(
          "所持状況を読み込めませんでした。時間をおいて、画面を開き直してください。",
          true,
        );
      else if (results[1].status === "rejected")
        status(
          "QRコードの登録状況を確認できませんでした。画面を開き直してください。",
          true,
        );
      else if (results[2].status === "rejected" || !favoritesReady)
        status(
          "お気に入りを読み込めませんでした。時間をおいて、画面を開き直してください。",
          true,
        );
      else status("");
    } catch (e) {
      if (request === viewGeneration && user === uid()) {
        status(window.CARD_ERROR.message(e), true);
        byId("all-status").append(retryButton(id));
      }
    }
  }
  function status(text, error = false) {
    byId("all-status").textContent = text;
    byId("all-status").classList.toggle("is-error", error);
  }
  function retryButton(id) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "text-button";
    b.textContent = "再読み込み";
    b.onclick = () => openSystem(id);
    return b;
  }
  const preferred = [
    "だん数",
    "タイプ",
    "ブランド",
    "レアリティ",
    "カテゴリー",
    "キャラ名",
    "ラッキースター",
    "星座",
    "ロマンス",
    "レベル",
    "ユニットタイプ",
    "イラストレーター",
    "学園",
    "コスメ",
    "ラインナップ",
    "収録セット",
    "フレーム",
    "カード種別",
  ];
  const exclude = new Set([
    "カード画像",
    "カード番号",
    "カード名",
    "備考",
    "説明",
    "スキル",
    "ユニットスキル",
    "アピールポイント",
    "AP",
    "ドレスアピール",
    "コーデ",
    "ドレスグリッター",
    "グレードアップ",
    "単体効果",
    "アクセ効果",
    "コスメの効果",
    "お知らせ",
    "配布",
  ]);
  let filterKeys = [];
  function values(c, k) {
    return k === "だん数" ? c.series : textValues(c.details?.[k]);
  }
  function fillFilters() {
    const available = [
      ...new Set(catalog.cards.flatMap((c) => Object.keys(c.details))),
    ].filter((k) => !exclude.has(k));
    filterKeys = [
      "だん数",
      ...preferred.filter((k) => k !== "だん数" && available.includes(k)),
      ...available.filter((k) => !preferred.includes(k)),
    ];
    byId("all-filter-fields").innerHTML =
      filterKeys
        .map((k, i) => {
          const options = [
            ...new Set(
              catalog.cards.flatMap((c) =>
                values(c, k).map((v) => v.normalize("NFKC")),
              ),
            ),
          ]
            .filter((v) => v && v !== "-")
            .sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));
          const label =
            k === "だん数" && current === "academy" ? "収録区分" : k;
          return `<label><span class="filter-label">${esc(label)}<button type="button" class="filter-clear" data-all-clear="${esc(k)}" disabled>解除</button></span><select data-all-filter="${esc(k)}" id="all-filter-${i}"><option value="">すべて</option>${options.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}<option value="__unknown__">未取得・未設定</option></select></label>`;
        })
        .join("") +
      `<label><span class="filter-label">お気に入り<button type="button" class="filter-clear" data-all-clear="favorite" disabled>解除</button></span><select id="all-favorite-filter" ${favoritesReady ? "" : "disabled"}><option value="all">すべて</option><option value="only">☆ お気に入りのみ</option></select></label><label><span class="filter-label">QRコード<button type="button" class="filter-clear" data-all-clear="qr" disabled>解除</button></span><select id="all-qr-filter"><option value="all">すべて</option><option value="yes">QR登録済み</option><option value="no">QR未登録</option></select></label><label><span class="filter-label">重複<button type="button" class="filter-clear" data-all-clear="duplicate" disabled>解除</button></span><select id="all-duplicates"><option value="">すべて</option><option value="only">重複あり</option></select></label>`;
    for (const select of byId("all-filter-fields").querySelectorAll("select")) {
      const label = select.closest("label");
      label.htmlFor = select.id;
      const name = label
        .querySelector(".filter-label")
        .firstChild.textContent.trim();
      select.setAttribute("aria-label", name);
      label
        .querySelector(".filter-clear")
        .setAttribute("aria-label", name + "の絞り込みを解除");
    }
    byId("all-official").href = "https://card.aikatsu.net/" + current + "/";
  }
  const quantity = (id) =>
    inventoryReady && owner === uid() ? inventory.get(id) || 0 : 0;
  const hasQr = (id) => !!window.CARD_QR?.badge("card", id);
  function filtered(includeOwnership = true) {
    if (!catalog) return [];
    const terms = query.trim().split(/\s+/).filter(Boolean).map(normalize);
    let cards = catalog.cards.filter((c) => {
      const haystack = normalize(
        [c.name, c.code, ...c.series, ...Object.values(c.details).flat()].join(
          " ",
        ),
      );
      return (
        terms.every((term) => haystack.includes(term)) &&
        filterKeys.every(
          (k) =>
            !filters[k] ||
            (filters[k] === "__unknown__"
              ? values(c, k).length === 0 ||
                values(c, k).every((v) => v === "-")
              : values(c, k).some((v) => v.normalize("NFKC") === filters[k])),
        ) &&
        (!favoriteFilter || (favoritesReady && favorites.has(c.id))) &&
        (!filters.duplicate || quantity(c.id) >= 2) &&
        (!includeOwnership ||
          ownedFilter === "all" ||
          (ownedFilter === "yes"
            ? quantity(c.id) > 0
            : quantity(c.id) === 0)) &&
        (qrFilter === "all" ||
          (qrFilter === "yes" ? hasQr(c.id) : !hasQr(c.id)))
      );
    });
    const compare = (a, b) =>
      String(a).localeCompare(String(b), "ja", { numeric: true });
    const rarityRank = (c) => {
      const r = values(c, "レアリティ").join(" ");
      return /SEC|シークレット/.test(r)
        ? 0
        : /レジェンド|LPR/.test(r)
          ? 1
          : /プレミアム|PR|JLR|BFR/.test(r)
            ? 2
            : /レア|^R$/.test(r)
              ? 3
              : /CP|キャンペーン/.test(r)
                ? 4
                : 5;
    };
    if (sort !== "official")
      cards = [...cards].sort((a, b) =>
        sort === "quantity"
          ? quantity(b.id) - quantity(a.id) || compare(a.code, b.code)
          : sort === "rarity"
            ? rarityRank(a) - rarityRank(b) || compare(a.code, b.code)
            : compare(
                sort === "name" ? a.name : a.code,
                sort === "name" ? b.name : b.code,
              ),
      );
    return cards;
  }
  function renderPageNumbers(total) {
    const compact =
      window.matchMedia?.("(max-width: 760px)").matches ||
      window.innerWidth <= 760;
    const viewport =
      byId("all-page-numbers")?.parentElement?.clientWidth ||
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
    byId("all-prev").textContent = compact ? "前へ" : "前のページ";
    byId("all-next").textContent = compact ? "次へ" : "次のページ";
    byId("all-page-numbers").innerHTML = candidates
      .map((n) => {
        const gap =
          previous && n - previous > 1
            ? '<span class="page-gap" aria-hidden="true">…</span>'
            : "";
        previous = n;
        return `${gap}<button type="button" data-all-page="${n}" ${n === page ? 'aria-current="page"' : ""} aria-label="${n}ページ目">${n}</button>`;
      })
      .join("");
  }
  function renderSeriesProgress() {
    if (!catalog) return;
    const series = [...new Set(catalog.cards.flatMap((c) => c.series))];
    byId("all-series-progress").innerHTML = series
      .map((label) => {
        const cards = catalog.cards.filter((c) => c.series.includes(label));
        const got = cards.filter((c) => quantity(c.id) > 0).length;
        const rate = cards.length ? (got / cards.length) * 100 : 0;
        return `<div class="progress-card progress-card-small"><div><span>${esc(label)}</span><strong>${inventoryReady ? rate.toFixed(1) + "%" : "—"}</strong></div><div class="progress-track"><span style="width:${inventoryReady ? rate : 0}%"></span></div><p>${inventoryReady ? `取得済 ${got}件 ／ 未取得 ${cards.length - got}件` : "所持状況を確認できていません"}</p></div>`;
      })
      .join("");
  }
  function applyColumns(value) {
    const columns = value === "2" ? "2" : "3";
    byId("all-cards").dataset.mobileColumns = columns;
    if (byId("cards")) byId("cards").dataset.mobileColumns = columns;
    document
      .querySelectorAll(".mobile-column-control [data-card-columns]")
      .forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.cardColumns === columns),
        );
      });
    panel
      .querySelectorAll("[data-all-columns]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.allColumns === columns),
        ),
      );
    try {
      localStorage.setItem("card-album-mobile-columns", columns);
    } catch {}
  }
  try {
    applyColumns(localStorage.getItem("card-album-mobile-columns"));
  } catch {
    applyColumns("3");
  }
  function render() {
    if (!catalog || panel.hidden) return;
    const cards = filtered(),
      limit = size === "all" ? Math.max(1, cards.length) : Number(size),
      max = Math.max(1, Math.ceil(cards.length / limit));
    page = Math.min(Math.max(1, page), max);
    const got = catalog.cards.filter((c) => quantity(c.id) > 0).length,
      rate = catalog.cards.length ? (got / catalog.cards.length) * 100 : 0;
    byId("all-percent").textContent = inventoryReady
      ? rate.toFixed(1) + "%"
      : "—";
    byId("all-progress-bar").style.width = (inventoryReady ? rate : 0) + "%";
    byId("all-progress-count").textContent = inventoryReady
      ? `取得済 ${got.toLocaleString("ja-JP")} ／ 全 ${catalog.cards.length.toLocaleString("ja-JP")}件`
      : "所持状況を確認できていません";
    byId("all-filtered-count").textContent =
      `絞り込み結果 ${cards.length.toLocaleString("ja-JP")}件`;
    byId("all-cards").innerHTML = cards
      .slice((page - 1) * limit, page * limit)
      .map((c, i) => {
        const n = quantity(c.id),
          r =
            values(c, "レアリティ").join(" ／ ") ||
            values(c, "カード種別").join(" ／ ");
        return `<article data-card-layout="rows" class="card ${n ? "owned" : ""}"><button type="button" class="card-trigger card-image-trigger" data-all-detail="${c.id}" aria-label="${esc(c.name)}の詳細"><span class="card-image-frame">${window.CARD_QR?.badge("card", c.id) || ""}<img data-card-image src="${esc(c.front)}" alt="${esc(c.name)}" loading="${i < 4 ? "eager" : "lazy"}" decoding="async">${n ? `<span class="owned-badge" aria-label="所持枚数：${n}枚">${n}枚</span>` : ""}${n >= 2 ? '<span class="card-duplicate-tag">重複あり</span>' : ""}</span></button><div class="card-code-row"><button type="button" class="card-code-link" data-all-detail="${c.id}" aria-label="${esc(c.name)}の詳細"><span class="code">${esc(c.code)}</span></button>${favoriteButton(c)}</div><button type="button" class="card-trigger card-text-trigger" data-all-detail="${c.id}" aria-label="${esc(c.name)}の詳細"><span class="card-meta"><span>${esc(values(c, "キャラ名").join(" ／ "))}</span><span class="pill">${esc(r || "レアリティ未取得")}</span></span><span class="card-name">${esc(c.name)}</span></button><button type="button" class="ownership-button ${n ? "is-owned" : ""}" data-all-own="${c.id}" aria-pressed="${n > 0}" ${!inventoryReady || saving.has(c.id) ? "disabled" : ""}>${n ? "✓ 持っている" : "＋ 持っていない"}</button></article>`;
      })
      .join("");
    byId("all-empty").hidden = cards.length > 0;
    byId("all-prev").disabled = page <= 1;
    byId("all-next").disabled = page >= max;
    renderPageNumbers(max);
    byId("all-total").textContent =
      `全${catalog.cards.length.toLocaleString("ja-JP")}件`;
    const base = filtered(false),
      baseGot = base.filter((c) => quantity(c.id) > 0).length;
    byId("all-filtered-rate").innerHTML = inventoryReady
      ? `<span class="rate-caption">絞り込み内の取得率</span><strong>${base.length ? ((baseGot / base.length) * 100).toFixed(1) : "0.0"}%</strong><span class="rate-fraction">取得済 ${baseGot}件 ／ 未取得 ${base.length - baseGot}件</span>`
      : "";
    if (!byId("all-series-progress").hidden) renderSeriesProgress();
    panel
      .querySelector(".all-owned-tabs")
      .style.setProperty(
        "--owned-index",
        String(["all", "yes", "no"].indexOf(ownedFilter)),
      );
    panel.querySelectorAll("[data-all-owned]").forEach((b) => {
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.allOwned === ownedFilter),
      );
      b.classList.toggle("active", b.dataset.allOwned === ownedFilter);
      b.disabled = !inventoryReady;
    });
    renderChips();
    if (dialog.open) renderOwnership();
    window.CARD_QR?.sync();
  }
  function renderChips() {
    const entries = [
      ...(query ? [["query", "検索", query]] : []),
      ...Object.entries(filters)
        .filter(([, v]) => v)
        .map(([k, v]) => [
          k,
          k === "duplicate" ? "重複" : k,
          v === "__unknown__"
            ? "未取得・未設定"
            : k === "duplicate"
              ? "あり"
              : v,
        ]),
      ...(favoriteFilter ? [["favorite", "お気に入り", "登録済み"]] : []),
      ...(qrFilter !== "all"
        ? [["qr", "QRコード", qrFilter === "yes" ? "登録済み" : "未登録"]]
        : []),
    ];
    byId("all-active-filters").innerHTML =
      (entries.length
        ? '<span class="active-filters-label">適用中</span>'
        : '<span class="no-active-filters">絞り込みなし</span>') +
      entries
        .map(
          ([k, label, v]) =>
            `<button type="button" class="filter-chip" data-all-clear="${esc(k)}" aria-label="${esc(label + "：" + v)}を解除"><span>${esc(label)}：<strong>${esc(v)}</strong></span><span class="filter-chip-close" aria-hidden="true">×</span></button>`,
        )
        .join("");
    panel.querySelector(".all-filter-count").textContent = entries.length
      ? entries.length + "件適用中"
      : "";
    byId("all-clear").disabled = !entries.length && ownedFilter === "all";
    byId("all-clear-query").disabled = !query;
    panel.querySelectorAll(".filter-clear[data-all-clear]").forEach((b) => {
      const k = b.dataset.allClear;
      b.disabled =
        k === "qr"
          ? qrFilter === "all"
          : k === "favorite"
            ? !favoriteFilter
            : !filters[k];
    });
  }
  function clearFilter(k) {
    if (k === "query") {
      query = "";
      byId("all-query").value = "";
    } else if (k === "favorite") {
      favoriteFilter = false;
      byId("all-favorite-filter").value = "all";
    } else if (k === "qr") {
      qrFilter = "all";
      byId("all-qr-filter").value = "all";
    } else {
      delete filters[k];
      const el = [...panel.querySelectorAll("[data-all-filter]")].find(
        (s) => s.dataset.allFilter === k,
      );
      if (el) el.value = "";
      if (k === "duplicate") byId("all-duplicates").value = "";
    }
    page = 1;
    render();
  }
  async function changeQuantity(id, delta, clear = false) {
    if (
      !uid() ||
      host.maintenance() ||
      !inventoryReady ||
      saving.has(id) ||
      !validId(id)
    )
      return;
    if (navigator.onLine === false) {
      host.toast(
        "通信に接続されていません。接続を確認して、もう一度お試しください。",
        "error",
      );
      return;
    }
    const user = uid(),
      g = generation;
    saving.add(id);
    render();
    try {
      const result = await host
        .client()
        .rpc("card_all_change_quantity", {
          p_card_id: id,
          p_delta: delta,
          p_clear: clear,
        });
      if (user !== uid() || g !== generation) return;
      if (result.error) throw result.error;
      const count = Number(result.data);
      if (
        result.data === null ||
        !Number.isInteger(count) ||
        count < 0 ||
        count > 1000000
      )
        throw Error();
      inventoryRevision++;
      if (count) inventory.set(id, count);
      else inventory.delete(id);
      inventoryChecked = Date.now();
    } catch (e) {
      if (user === uid() && g === generation)
        host.toast(
          "保存できませんでした。通信状態を確認して、もう一度お試しください。",
          "error",
        );
    } finally {
      if (user === uid() && g === generation) {
        saving.delete(id);
        render();
      }
    }
  }
  function showDetail(id, trigger) {
    selected = catalog?.index.get(id);
    if (!selected) return;
    lastFocus = trigger || lastFocus;
    side = 0;
    const c = selected;
    byId("all-modal-code").textContent = c.code;
    byId("all-modal-name").textContent = c.name;
    byId("all-modal-rarity").textContent =
      values(c, "レアリティ").join(" ／ ") || "レアリティ未取得";
    const details = {
      作品: [systems.find((s) => s[0] === current)[1]],
      だん数: c.series,
      ...c.details,
    };
    for (const k of ["キャラ名", "ブランド", "カテゴリー"]) {
      if (!details[k]) details[k] = ["未取得"];
    }
    byId("all-modal-fields").innerHTML = Object.entries(details)
      .map(
        ([k, v]) =>
          `<dt>${esc(k)}</dt><dd>${esc(textValues(v).join(" ／ ") || "未取得")}</dd>`,
      )
      .join("");
    byId("all-modal-source").href = c.source;
    byId("all-qr-controls").innerHTML =
      window.CARD_QR?.button("card", c.id, c.name, [], "aikatsu-all") || "";
    renderOwnership();
    showSide();
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  function showSide() {
    if (!selected) return;
    const url = side ? selected.back : selected.front,
      image = byId("all-modal-image");
    image.hidden = !url;
    byId("all-image-failure").hidden = !!url;
    byId("all-image-failure").textContent = url
      ? "画像を読み込めませんでした。"
      : "裏面画像は未取得です。";
    image.src = url || "";
    image.alt = selected.name + " " + (side ? "裏面" : "表面");
    byId("all-side-label").textContent = side ? "裏面" : "表面";
    dialog.querySelector(".modal-side-switch").dataset.side = String(side);
    dialog.querySelectorAll("[data-all-side]").forEach((b) => {
      b.setAttribute(
        "aria-pressed",
        String(Number(b.dataset.allSide) === side),
      );
      b.disabled = b.dataset.allSide === "1" && !selected.back;
    });
  }
  function renderOwnership() {
    if (!selected) return;
    byId("all-favorite-controls").innerHTML = favoriteButton(selected, true);
    const n = quantity(selected.id),
      busy = saving.has(selected.id) || !inventoryReady;
    byId("all-modal-owned").textContent = n
      ? "✓ 持っている"
      : "＋ 持っていない";
    byId("all-modal-owned").classList.toggle("is-owned", n > 0);
    byId("all-modal-owned").disabled = busy;
    byId("all-modal-owned").setAttribute("aria-pressed", String(n > 0));
    byId("all-quantity").hidden = !n;
    byId("all-quantity-value").textContent = n + "枚";
    byId("all-minus").disabled = busy;
    byId("all-plus").disabled = busy || n >= 1000000;
    const ids = filtered().map((c) => c.id),
      index = ids.indexOf(selected.id);
    byId("all-detail-prev").disabled = index <= 0;
    byId("all-detail-next").disabled = index < 0 || index >= ids.length - 1;
  }
  function moveDetail(delta) {
    const cards = filtered(),
      index = cards.findIndex((c) => c.id === selected?.id);
    if (cards[index + delta]) showDetail(cards[index + delta].id);
  }
  document.addEventListener("click", (event) => {
    const numbered = event.target.closest("[data-all-page]");
    if (numbered) {
      page = Number(numbered.dataset.allPage);
      render();
      panel.scrollIntoView({ block: "start" });
      return;
    }
    const columnsButton = event.target.closest("[data-all-columns]");
    if (columnsButton) {
      applyColumns(columnsButton.dataset.allColumns);
      return;
    }
    const system = event.target.closest("[data-all-system]");
    if (system) {
      openSystem(system.dataset.allSystem);
      return;
    }
    const clear = event.target.closest("[data-all-clear]");
    if (clear) {
      clearFilter(clear.dataset.allClear);
      return;
    }
    const favorite = event.target.closest("[data-all-favorite]");
    if (favorite) {
      toggleFavorite(favorite.dataset.allFavorite);
      return;
    }
    const detail = event.target.closest("[data-all-detail]");
    if (detail) {
      showDetail(detail.dataset.allDetail, detail);
      return;
    }
    const own = event.target.closest("[data-all-own]");
    if (own) {
      changeQuantity(own.dataset.allOwn, 1, quantity(own.dataset.allOwn) > 0);
      return;
    }
    const tab = event.target.closest("[data-all-owned]");
    if (tab) {
      ownedFilter = tab.dataset.allOwned;
      page = 1;
      render();
      return;
    }
    const sideButton = event.target.closest("[data-all-side]");
    if (sideButton) {
      side = Number(sideButton.dataset.allSide);
      showSide();
    }
  });
  panel.addEventListener("change", (e) => {
    if (e.target.matches("[data-all-filter]"))
      filters[e.target.dataset.allFilter] = e.target.value;
    else if (e.target.id === "all-favorite-filter")
      favoriteFilter = e.target.value === "only";
    else if (e.target.id === "all-qr-filter") qrFilter = e.target.value;
    else if (e.target.id === "all-duplicates")
      filters.duplicate = e.target.value;
    else return;
    page = 1;
    render();
  });
  byId("all-query").oninput = (e) => {
    query = e.target.value;
    page = 1;
    render();
  };
  byId("all-clear").onclick = () => {
    resetFilters();
    if (catalog) fillFilters();
    render();
  };
  byId("all-size").onchange = (e) => {
    size = e.target.value;
    page = 1;
    render();
  };
  byId("all-sort").onchange = (e) => {
    sort = e.target.value;
    page = 1;
    render();
  };
  byId("all-prev").onclick = () => {
    page--;
    render();
    panel.scrollIntoView({ block: "start" });
  };
  byId("all-next").onclick = () => {
    page++;
    render();
    panel.scrollIntoView({ block: "start" });
  };
  byId("all-progress-details").onclick = () => {
    const expanded = byId("all-series-progress").hidden;
    byId("all-series-progress").hidden = !expanded;
    byId("all-progress-details").setAttribute(
      "aria-expanded",
      String(expanded),
    );
    if (expanded) renderSeriesProgress();
  };
  byId("all-close").onclick = () => dialog.close();
  byId("all-modal-image").onerror = () => {
    byId("all-modal-image").hidden = true;
    byId("all-image-failure").hidden = false;
  };
  byId("all-modal-owned").onclick = () =>
    selected && changeQuantity(selected.id, 1, quantity(selected.id) > 0);
  byId("all-minus").onclick = () => selected && changeQuantity(selected.id, -1);
  byId("all-plus").onclick = () => selected && changeQuantity(selected.id, 1);
  byId("all-detail-prev").onclick = () => moveDetail(-1);
  byId("all-detail-next").onclick = () => moveDetail(1);
  dialog.addEventListener(
    "close",
    () => lastFocus?.isConnected && lastFocus.focus({ preventScroll: true }),
  );
  route.onclick = () => {
    if (active()) {
      viewGeneration++;
      host.back();
      syncNavigation();
    } else openSelection();
  };
  document.addEventListener("private-qr-changed", render);
  window.addEventListener("resize", syncNavigation, { passive: true });
  window.addEventListener("focus", async () => {
    if (!panel.hidden && uid() && !saving.size) {
      try {
        await Promise.all([loadInventory(), loadFavorites()]);
        render();
      } catch {}
    }
  });
  window.CARD_ALL = {
    active,
    openSelection,
    openSystem,
    syncNavigation,
    reset,
    resolve,
    enrichQrRows,
    character(id) {
      for (const data of cache.values()) {
        const c = data.index.get(id);
        if (c) return values(c, "キャラ名").join(" ／ ");
      }
      return "";
    },
    leave() {
      viewGeneration++;
      if (dialog.open) dialog.close();
    },
  };
  syncNavigation();
})();
