(() => {
  "use strict";
  const host = window.CARD_VERSE_HOST;
  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const familyName = (value) => (value === "onegai" ? "おねがい" : "ひみつの");
  const displayLabel = (value) => String(value || "").replaceAll("弾", "だん");
  const cacheKey = "card-verse-public:" + new URL(window.APP_CONFIG.supabaseUrl).hostname;
  let catalog = null,
    parts = new Map(),
    owned = new Set(),
    owner = null;
  let partQuantities = new Map(),
    fullQuantities = new Map();
  const quantityQueues = new Map();
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
    if (window.innerWidth <= 760) $("menu-toggle").before(mobileRoute);
    else $("game-switch").after(mobileRoute);
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
    <details id="verse-filters"><summary><span>コーデを絞り込む</span><span id="verse-filter-summary" class="filter-summary"></span><span class="verse-chevron" aria-hidden="true"></span></summary><div class="verse-disclosure"><label class="verse-search"><span>フリーワード検索<button type="button" class="filter-clear" data-verse-clear="query">解除</button></span><input id="verse-query" type="search" placeholder="コーデ名・コード・キャンペーン名" autocomplete="off"></label><div class="verse-filter-grid"><label><span>だん数<button type="button" class="filter-clear" data-verse-clear="series">解除</button></span><select id="verse-series"></select></label><label><span>ガチャ・キャンペーン<button type="button" class="filter-clear" data-verse-clear="group">解除</button></span><select id="verse-group"></select></label><label><span>お気に入り<button type="button" class="filter-clear" data-verse-clear="favorite">解除</button></span><select id="verse-favorite-filter"><option value="all">すべて</option><option value="only">お気に入りのみ</option></select></label><label><span>重複<button type="button" class="filter-clear" data-verse-clear="duplicate">解除</button></span><select id="verse-duplicate-filter"><option value="all">すべて</option><option value="only">重複あり</option></select></label></div><div class="verse-clear-row"><button id="verse-clear" type="button" class="text-button">全ての絞り込みを解除</button></div></div></details>
    <div id="verse-active-filters" class="verse-active-filters"></div>
    <div class="verse-owned-tabs owned-tabs" role="group" aria-label="コーデの所持状態"><span class="verse-owned-slider owned-tabs-slider" aria-hidden="true"></span><button type="button" data-verse-view="all">すべて</button><button type="button" data-verse-view="full">持っている</button><button type="button" data-verse-view="partial">一部持っている</button><button type="button" data-verse-view="none">持っていない</button></div>
    <p id="verse-message" role="status"></p><div class="verse-list-toolbar"><h2 id="verse-found"></h2><div class="verse-display-controls"><label class="verse-display-count display-count"><span>表示件数</span><select id="verse-size"><option value="20">20</option><option value="50">50</option><option value="100">100</option><option value="all">すべて</option></select></label><div class="verse-column-control"><span>コーデの並び</span><div class="verse-column-segment" role="group" aria-label="スマホのコーデ列数"><button type="button" data-verse-columns="2">2列</button><button type="button" data-verse-columns="3">3列</button></div></div></div></div>
    <div id="verse-cards" class="verse-cards"></div><p id="verse-empty" hidden><strong>見つかりませんでした</strong><span>条件を変えて探してみてください</span></p><nav id="verse-pages" class="verse-pages" aria-label="コーデ一覧のページ"></nav>
    <div class="verse-sync"><button id="verse-sync" type="button" class="catalog-update-text" aria-label="コーデ情報を更新する">コーデ情報の更新</button></div>`;
  $("collection").after(panel);
  const dialog = document.createElement("dialog");
  dialog.id = "verse-detail";
  dialog.innerHTML = `<button id="verse-close" class="verse-close" type="button" aria-label="閉じる">×</button><div id="verse-detail-content"></div>`;
  document.body.append(dialog);
  function currentUser() {
    return host.session()?.user.id || null;
  }
  const trade = () => window.CARD_TRADE;
  function full(c) {
    return (
      (fullQuantities.get(c.id) || 0) > 0 ||
      (c.part_ids.length > 0 && c.part_ids.every((id) => owned.has(id)))
    );
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
    return full(c) ? "full" : got(c) ? "partial" : "none";
  }
  const compact = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replaceAll("だん", "弾")
      .replace(/[\s_-]/g, "");
  function filtered(includeOwnership = true) {
    const needle = compact(query);
    return pool().filter(
      (c) =>
        (!favoriteOnly || favorites.has(c.id)) &&
        (!duplicateOnly || duplicate(c)) &&
        (trade()?.matches("coordinate", c.id) ?? true) &&
        appearances(c).some(
          (a) => (!series || a.series === series) && (!group || a.group === group),
        ) &&
        (!needle ||
          compact([c.name, c.code, ...appearances(c).map((a) => a.group)].join(" ")).includes(
            needle,
          )) &&
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
    if (showPanel)
      panel.querySelectorAll("[data-verse-family]").forEach((b) => {
        const url = representative(b.dataset.verseFamily);
        if (b.dataset.imageKey === url) return;
        b.dataset.imageKey = url;
        b.innerHTML = `<span class="verse-family-image" aria-hidden="true"><img src="${esc(url)}" alt="" loading="eager" decoding="async"></span><span class="verse-family-label"><strong>${familyName(b.dataset.verseFamily)}アイプリ</strong></span>`;
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
    if (showPanel) links.push([$("verse-back"), backImage, "カード一覧へ"]);
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
      node.innerHTML = `<span class="verse-nav-image" aria-hidden="true"><img src="${esc(url)}" alt="" loading="eager" decoding="async"></span><span>${label}</span><span class="verse-nav-chevron" aria-hidden="true">›</span>`;
    }
  }
  function options(id, values, value, label) {
    $(id).innerHTML =
      `<option value="">${label}</option>` +
      [...new Set(values)]
        .map((v) => `<option value="${esc(v)}">${esc(displayLabel(v))}</option>`)
        .join("");
    $(id).value = value;
  }
  function fillFilters(latest = false) {
    const all = pool();
    const labels = [...new Set(all.flatMap((c) => appearances(c).map((a) => a.series)))].sort(
      (a, b) => {
        const rank = (label) =>
          label.startsWith("おねがい")
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
    if (c.image)
      return `<span class="verse-full-image"><img src="${esc(large ? c.image : c.thumbnail || c.image)}" alt="${esc(c.name)}" loading="${large || eager ? "eager" : "lazy"}" decoding="async"></span>`;

    return `<span class="verse-image-collage">${c.part_ids.map((id) => `<span class="verse-collage-item"><img src="${esc(parts.get(id)?.image || "")}" alt="" loading="${eager ? "eager" : "lazy"}" decoding="async"></span>`).join("")}</span>`;
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
    return `<button type="button" title="${hint}" class="verse-owned ${active ? "is-owned" : ""} ${repeated ? "is-duplicate" : ""}" data-verse-own="${esc(c.id)}" ${part === null ? "" : `data-verse-part="${part}"`} aria-pressed="${active}" ${ready ? "" : "disabled"}>${repeated ? "重複して所有" : part === null ? (active ? "✓ フルコーデ獲得済" : "フルコーデ未獲得") : active ? "✓ 持っている" : "＋ 持っていない"}</button>`;
  }
  function renderCollection() {
    const base = pool().filter(
      (c) => !collectionSeries || appearances(c).some((a) => a.series === collectionSeries),
    );
    const completed = base.filter(full).length;
    $("verse-collection-count").textContent =
      `収集済 ${completed} ／ 未収集 ${base.length - completed}`;
    if (!$("verse-collection").open) return;
    const all = base.filter(
      (c) =>
        collectionFilter === "all" ||
        (collectionFilter === "complete"
          ? full(c)
          : got(c) > 0 && c.part_ids.length - got(c) === 1),
    );
    const key = JSON.stringify([
      catalog?.version,
      family,
      collectionSeries,
      collectionFilter,
      all.map((c) => [c.id, c.part_ids.map((id) => owned.has(id))]),
    ]);
    if (key === collectionKey) return;
    collectionKey = key;
    $("verse-collection-list").innerHTML = all
      .map(
        (c) =>
          `<article class="verse-coordinate ${full(c) ? "is-complete" : ""}"><h3>${esc(c.name)}</h3><div class="verse-coordinate-images"><button type="button" class="verse-character ${full(c) ? "is-owned" : ""}" data-verse-detail="${esc(c.id)}" aria-label="${esc(c.name)}の詳細">${image(c)}</button>${c.part_ids.map((id) => `<button type="button" class="verse-part-image ${owned.has(id) ? "is-owned" : ""}" data-verse-detail="${esc(c.id)}" aria-label="${esc(c.name)} ${esc(parts.get(id)?.slot)}の詳細"><span class="verse-part-image-frame"><img src="${esc(parts.get(id)?.image)}" alt="${esc(parts.get(id)?.slot)}" loading="lazy" decoding="async"></span></button>`).join("")}</div></article>`,
      )
      .join("");
    $("verse-collection-empty").hidden = all.length > 0;
  }
  function renderActiveFilters() {
    const entries = [
      ["query", "検索", query],
      ["series", "だん数", displayLabel(series)],
      ["group", "ガチャ・キャンペーン", group],
      ["favorite", "お気に入り", favoriteOnly ? "登録済み" : ""],
      ["duplicate", "重複", duplicateOnly ? "重複あり" : ""],
    ].filter((x) => x[2]);
    const item = trade()?.entry("coordinate");
    if (item) entries.push(["trade", item.label, item.value]);
    $("verse-filter-summary").textContent = entries.length ? `適用中 ${entries.length}件` : "";
    $("verse-active-filters").innerHTML = entries.length
      ? '<span class="active-filters-label">適用中</span>' +
        entries
          .map(
            ([key, label, value]) =>
              `<button type="button" class="filter-chip" data-verse-clear="${key}" aria-label="${esc(label)}を解除"><span>${esc(label)}：<strong>${esc(displayLabel(value))}</strong></span><span class="filter-chip-close" aria-hidden="true">×</span></button>`,
          )
          .join("")
      : '<span class="no-active-filters">絞り込みなし</span>';
    panel
      .querySelectorAll(".filter-clear[data-verse-clear]")
      .forEach((b) => (b.disabled = !entries.some((x) => x[0] === b.dataset.verseClear)));
  }
  function renderProgress() {
    const all = pool(),
      complete = all.filter(full).length;
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
      n = base.filter(full).length;
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
          n = rows.filter(full).length,
          rate = rows.length ? (n / rows.length) * 100 : 0;
        return `<div class="progress-card progress-card-small"><div><span>${esc(displayLabel(label))}</span><strong>${rate.toFixed(1)}%</strong></div><div class="progress-track"><span style="width:${rate}%"></span></div><p>収集済 ${n}コーデ ／ 未収集 ${rows.length - n}コーデ</p></div>`;
      })
      .join("");
  }
  function favoriteButton(c, modal = false) {
    const active = favorites.has(c.id);
    return `<button type="button" class="${modal ? "verse-modal-favorite" : "verse-favorite"} ${active ? "is-favorite" : ""}" data-verse-favorite="${esc(c.id)}" aria-pressed="${active}" aria-label="${active ? "お気に入りを解除" : "お気に入りに登録"}" ${ready ? "" : "disabled"}>${host.star}${modal ? `<span>${active ? "お気に入り登録済み" : "お気に入りに登録"}</span>` : ""}</button>`;
  }
  function partialBadge(c) {
    return state(c) === "partial"
      ? `<span class="verse-partial" aria-label="一部所持 ${got(c)}／${c.part_ids.length}">一部獲得済</span>`
      : "";
  }
  function syncUpdateText() {
    const date = catalog?.updated_at ? new Date(catalog.updated_at) : null;
    $("verse-sync").textContent =
      "コーデ情報の更新" +
      (date && !Number.isNaN(date.getTime()) ? "：" + date.toLocaleString("ja-JP") : "");
  }
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
    $("verse-pages").innerHTML =
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
      (family === "himitsu" ? "ひみつの" : "おねがい") + "アイプリバース";
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
      visible.map((c) => [c.id, state(c), duplicate(c), favorites.has(c.id)]),
    ]);
    if (listKey !== cardListKey) {
      cardListKey = listKey;
      $("verse-cards").innerHTML = rows
        .slice((page - 1) * perPage, page * perPage)
        .map(
          (c, index) =>
            `<article class="verse-card ${full(c) ? "is-owned" : state(c) === "partial" ? "is-partial" : ""}" data-verse-card="${esc(c.id)}">${favoriteButton(c)}${partialBadge(c)}<button type="button" class="verse-card-detail" data-verse-detail="${esc(c.id)}"><span class="verse-card-picture">${image(c, false, index < 6)}${duplicateBadge(c)}</span><span class="verse-code">${esc(c.code || "コード記載なし")}</span><strong>${esc(c.name)}</strong></button>${ownedButton(c)}</article>`,
        )
        .join("");
    }
    $("verse-empty").hidden = rows.length > 0;
    renderPages(pageCount);
    renderCollection();
    renderDetail();
    syncUpdateText();
  }
  function renderDetail() {
    if (!selected || !dialog.open) return;
    const c = catalog.coordinates.find((c) => c.id === selected);
    if (!c) return;
    $("verse-detail-content").innerHTML =
      `<div class="verse-modal-heading"><div class="verse-modal-full">${image(c, true)}</div><div class="verse-modal-info"><span class="verse-code">${esc(c.code || "コード記載なし")}</span><h2>${esc(c.name)}</h2><dl><dt>シリーズ</dt><dd>${familyName(c.family)}アイプリ</dd><dt>レアリティ</dt><dd>${esc(c.rarity)}</dd><dt>だん数</dt><dd>${esc(displayLabel([...new Set(appearances(c).map((a) => a.series))].join(" ／ ")))}</dd><dt>ガチャ・キャンペーン</dt><dd>${esc(displayLabel([...new Set(appearances(c).map((a) => a.group))].join(" ／ ")))}</dd></dl><div class="verse-modal-total">${ownControl(c)}${favoriteButton(c, true)}${trade()?.markup("coordinate", c.id) || ""}</div></div></div><h3 class="verse-parts-heading">パーツごとに管理</h3><div class="verse-modal-parts">${c.part_ids
        .map((id) => {
          const p = parts.get(id);
          return `<article><span class="verse-part-image-frame"><img src="${esc(p.image)}" alt="${esc(p.slot)}" loading="eager" decoding="async"></span><div class="verse-part-stats"><span class="verse-slot-tag">${esc(p.slot)}</span><strong>${p.buzz} バズパワー</strong></div>${ownControl(c, id)}${trade()?.markup("part", id) || ""}</article>`;
        })
        .join("")}</div>`;
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
      a.classList.toggle("is-partial", state(c) === "partial");
      let badge = a.querySelector(".verse-partial");
      if (state(c) === "partial") {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "verse-partial";
          badge.textContent = "一部獲得済";
          a.prepend(badge);
        }
        badge.setAttribute("aria-label", `一部所持 ${got(c)}／${c.part_ids.length}`);
      } else badge?.remove();
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
            ? "✓ フルコーデ獲得済"
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
      n = base.filter(full).length;
    $("verse-collection-count").textContent = `収集済 ${n} ／ 未収集 ${base.length - n}`;
    if (collectionFilter !== "all") {
      renderCollection();
      return;
    }
    panel.querySelectorAll(".verse-coordinate").forEach((a) => {
      const b = a.querySelector("[data-verse-detail]"),
        c = catalog.coordinates.find((c) => c.id === b?.dataset.verseDetail);
      if (!c) return;
      a.classList.toggle("is-complete", full(c));
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
    if (enabled) favorites.add(id);
    else favorites.delete(id);
    patchFavorite(id);
    try {
      const r = await host
        .client()
        .rpc("card_verse_set_favorite", { p_coordinate_id: id, p_enabled: enabled });
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
      if (uid === currentUser() && g === generation) favoriteBusy.delete(id);
    }
  }
  function save(coordinateID, partID = null, delta = null) {
    if (!ready || !currentUser() || host.maintenance()) return;
    const c = catalog.coordinates.find((c) => c.id === coordinateID);
    if (!c || (partID !== null && !c.part_ids.includes(partID))) return;
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
    const key = partID === null ? "full:" + coordinateID : "part:" + partID;
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
          const result = await host
            .client()
            .rpc("card_verse_change_quantity", {
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
      const data = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (Array.isArray(data?.coordinates) && Array.isArray(data?.parts)) {
        catalog = data;
        parts = new Map(data.parts.map((p) => [p.id, p]));
      }
    } catch {}
  }
  async function readCatalog(force = false) {
    if (!force && catalog && Date.now() - checkedAt < 300000) return;
    hydrateCatalog();
    const r = await host
      .client()
      .rpc("card_verse_catalog_cached", { p_version: catalog?.version || null });
    if (r.error || !r.data) throw Error("バース用SQLを導入してから、もう一度開いてください。");
    const data = r.data.omitted ? catalog : r.data;
    if (!Array.isArray(data?.coordinates) || !Array.isArray(data?.parts))
      throw Error("コーデデータを確認できませんでした。");
    catalog = { ...data, updated_at: r.data.updated_at || data.updated_at };
    parts = new Map(data.parts.map((p) => [p.id, p]));
    checkedAt = Date.now();
    if (!r.data.omitted)
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
    const task = { uid, g, promise: null };
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
      partQuantities = new Map(result.data.parts.map((r) => [r.part_id, r.quantity]));
      fullQuantities = new Map(result.data.coordinates.map((r) => [r.coordinate_id, r.quantity]));
      favorites = new Set(result.data.favorites);
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
      host.game() !== "aipri" ||
      Date.now() - lastWarmAt < 30000
    )
      return;
    lastWarmAt = Date.now();
    hydrateCatalog();
    Promise.all([ensureCatalog(), ensureInventory()])
      .then(() => {
        if (currentUser() && host.game() === "aipri" && !host.maintenance()) syncImages();
      })
      .catch(() => {});
  }
  async function open(value) {
    if (!currentUser() || host.maintenance()) return;
    family = value === "himitsu" ? "himitsu" : "onegai";
    series = group = query = collectionSeries = "";
    collectionFilter = ownershipView = "all";
    favoriteOnly = duplicateOnly = false;
    trade()?.clear("coordinate");
    page = 1;
    $("verse-query").value = "";
    $("verse-favorite-filter").value = "all";
    $("verse-duplicate-filter").value = "all";
    host.screen("verse");
    document.body.classList.add("game-aipri");
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
      if (current()) $("verse-message").textContent = error.message;
    }
  }
  function reset() {
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
    favorites.clear();
    favoriteBusy.clear();
    busy.clear();
    selected = null;
    if (dialog.open) dialog.close();
    $("verse-cards").replaceChildren();
    $("verse-collection-list").replaceChildren();
    $("verse-detail-content").replaceChildren();
    $("verse-percent").textContent = "—";
    $("verse-count").textContent = "";
    $("verse-progress-bar").style.width = "0%";
  }
  button.onclick = () => open(host.family() === "ひみつ" ? "himitsu" : "onegai");
  $("verse-back").onclick = () => host.cards(family === "himitsu" ? "ひみつ" : "おねがい");
  mobileRoute.onclick = () =>
    panel.hidden
      ? open(host.family() === "ひみつ" ? "himitsu" : "onegai")
      : host.cards(family === "himitsu" ? "ひみつ" : "おねがい");
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
    const f = e.target.closest("[data-verse-family]");
    if (f) {
      family = f.dataset.verseFamily;
      series = group = query = collectionSeries = "";
      collectionFilter = ownershipView = "all";
      favoriteOnly = duplicateOnly = false;
      trade()?.clear("coordinate");
      page = 1;
      $("verse-query").value = "";
      $("verse-favorite-filter").value = "all";
      $("verse-duplicate-filter").value = "all";
      if (catalog) {
        fillFilters(true);
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
    series = group = query = "";
    favoriteOnly = duplicateOnly = false;
    trade()?.clear("coordinate");
    ownershipView = "all";
    page = 1;
    $("verse-query").value = "";
    $("verse-favorite-filter").value = "all";
    $("verse-duplicate-filter").value = "all";
    fillFilters();
    render();
  };
  function clearFilter(key) {
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
  window.CARD_VERSE = {
    open,
    reset,
    tradeData: () => catalog,
    refreshTrade(resetPage = false) {
      if (resetPage) page = 1;
      if (catalog) render();
    },
    leave() {
      if (dialog.open) dialog.close();
    },
    syncNavigation() {
      const visible = !!currentUser() && host.game() === "aipri" && !host.maintenance();
      button.hidden = !visible;
      mobileRoute.hidden = !visible;
      syncImages();
      if (visible) warm();
    },
  };
  let resizeFrame = null;
  window.addEventListener(
    "resize",
    () => {
      if (resizeFrame !== null) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        placeRoute();
        if (!panel.hidden && catalog) renderPages(maxPage);
      });
    },
    { passive: true },
  );
  window.CARD_VERSE.syncNavigation();
})();
