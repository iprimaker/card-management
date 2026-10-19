/* catalog-cache.js */
(() => {
  const key = "card-table-catalog-v2:" + window.APP_CONFIG.supabaseUrl;
  let cache = null,
    pending = null,
    checkedAt = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (
      saved &&
      Number.isSafeInteger(saved.version) &&
      Array.isArray(saved.cards) &&
      Array.isArray(saved.overrides)
    )
      cache = saved;
  } catch (_) {}
  window.PUBLIC_CATALOG_CACHE = {
    peek: () => cache,
    invalidate: () => {
      checkedAt = 0;
    },
    load(db) {
      if (pending) return pending;
      if (cache && Date.now() - checkedAt < 300000) return Promise.resolve(cache);
      pending = request(db).finally(() => {
        pending = null;
      });
      return pending;
    },
  };
  async function revision(db) {
    const { data, error } = await db
      .from("card_catalog_revision")
      .select("version,updated_at")
      .eq("id", 1)
      .single();
    if (error)
      throw Error(
        "カード取得設定を確認してください。01-schema.sqlとカード移行を確認してください。",
      );
    if (!data || !Number.isSafeInteger(Number(data.version)))
      throw Error("カードの版番号を確認できませんでした。");
    return { version: Number(data.version), updated_at: data.updated_at };
  }
  async function rows(db, table, columns, order) {
    const result = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from(table)
        .select(columns)
        .order(order)
        .range(offset, offset + 999);
      if (error)
        throw Error(
          "カード情報を取得できませんでした。接続とテーブルの閲覧権限を確認してください。",
        );
      result.push(...data);
      if (data.length < 1000) return result;
    }
  }
  async function request(db) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await revision(db);
      if (cache?.version === before.version) {
        checkedAt = Date.now();
        return cache;
      }
      const [cards, overrides] = await Promise.all([
        rows(db, "card_catalog", "card", "id"),
        rows(db, "card_catalog_overrides", "card_id,patch,updated_at", "card_id"),
      ]);
      const after = await revision(db);
      if (before.version !== after.version) continue;
      cache = {
        version: after.version,
        cards: cards.map((r) => r.card),
        overrides,
        state: { updated_at: after.updated_at, running: false },
      };
      checkedAt = Date.now();
      try {
        localStorage.setItem(key, JSON.stringify(cache));
      } catch (_) {}
      return cache;
    }
    throw Error("カード情報の登録中です。少し待って再読み込みしてください。");
  }
})();

/* image-resolution.js */
(() => {
  "use strict";
  const MAX_EDGE = 560;
  const LIST_MAX_EDGE = 420;
  const normalizedFrames =
    ".family-card-image,.coordinate-card-image,.card-image-frame,.marquee-image-frame,.album-card-frame,.verse-full-image,.verse-family-image,.verse-nav-image,.verse-part-image-frame,.verse-collage-item,.public-image,.public-banner-image,.public-modal-image";
  function orientedFrame(image) {
    return image.parentElement?.matches(normalizedFrames) && !image.closest("dialog");
  }
  const entries = new WeakMap();
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
              } else inView.delete(record.target);
            }
          },
          { rootMargin: "240px 0px" },
        )
      : null;
  function official(image) {
    if (image.closest(".trade-shot-image")) return false;
    try {
      const host = new URL(image.getAttribute("src") || "", location.href).hostname;
      return host === "aipri.jp" || host === "dcd.aikatsu.com";
    } catch {
      return false;
    }
  }
  function clear(image) {
    const entry = entries.get(image);
    entry?.canvas.remove();
    image.removeAttribute("data-low-resolution");
    entries.delete(image);
  }
  function draw(image) {
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
      const canvas = document.createElement("canvas");
      canvas.className = "low-resolution-image";
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.pointerEvents = "none";
      image.after(canvas);
      entry = { canvas, parent, src: "", width: 0, height: 0 };
      entries.set(image, entry);
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
      const context = entry.canvas.getContext("2d");
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

  const observer = new MutationObserver((records) => {
    const roots = new Set();
    for (const record of records) {
      if (record.type === "childList") {
        for (const node of record.removedNodes) {
          if (node.nodeType !== 1) continue;
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

/* public-share.js */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
      );
  const labels = {
    aikatsu: "アイカツアンコール",
    onegai: "おねがいアイプリ",
    himitsu: "ひみつのアイプリ",
    "verse-onegai": "おねがいアイプリバース",
    "verse-himitsu": "ひみつのアイプリバース",
  };
  const values = (v) => (Array.isArray(v) ? v : v ? [v] : []),
    normal = (s) =>
      String(s || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[\s‐‑–—−_-]/g, "");
  const token = location.hash.slice(1);
  let verseCatalog = null,
    publicCatalog = null,
    bannerFlight = false;
  let client,
    scope = new URLSearchParams(location.search).get("type"),
    snapshot = null,
    items = [],
    parts = new Map(),
    quantities = new Map(),
    fullQuantities = new Map(),
    filters = {},
    ownership = "all",
    page = 1,
    size = 20,
    selected = null,
    side = 0,
    generation = 0,
    busy = false,
    lastRead = 0,
    channel = null,
    liveClosing = false,
    liveWanted = false,
    refreshTimer = null,
    pendingRefresh = false;
  const scopeFilters = new Map();
  const verse = () => scope?.startsWith("verse-");
  function unavailable() {
    generation++;
    busy = false;
    snapshot = null;
    $("public-scope-note")?.replaceChildren();
    if ($("public-scope-note")) $("public-scope-note").hidden = true;
    items = [];
    quantities.clear();
    fullQuantities.clear();
    parts.clear();
    selected = null;
    $("public-owner").textContent = "カードアルバム";
    $("public-cards").replaceChildren();
    $("public-detail-content").replaceChildren();
    if ($("public-detail").open) $("public-detail").close();
    $("public-album").hidden = true;
    $("public-unavailable").hidden = false;
    $("public-status").textContent = "";
  }
  function rarity(c) {
    if (c.game === "aipri") {
      const code = String(c.code || "").toUpperCase();
      if (code.endsWith("P")) return "パラレル";
      if (code.includes("M")) return "ミラクル";
    }
    return c.rarity || "記載なし";
  }
  function full(c) {
    return verse()
      ? (fullQuantities.get(c.id) || 0) > 0 ||
          (c.part_ids?.length > 0 && c.part_ids.every((id) => (quantities.get(id) || 0) > 0))
      : (quantities.get(c.id) || 0) > 0;
  }
  function state(c) {
    return full(c)
      ? "yes"
      : verse() && c.part_ids.some((id) => (quantities.get(id) || 0) > 0)
        ? "partial"
        : "no";
  }
  function series(c) {
    const labels = verse()
      ? [...new Set((c.appearances || []).map((a) => a.series))]
      : values(c.series);
    return Array.isArray(snapshot?.series_filter)
      ? labels.filter((label) => snapshot.series_filter.includes(label))
      : labels;
  }
  function groups(c) {
    return [
      ...new Set(
        (c.appearances || [])
          .filter(
            (a) =>
              !Array.isArray(snapshot?.series_filter) || snapshot.series_filter.includes(a.series),
          )
          .map((a) => a.group),
      ),
    ];
  }
  function fields() {
    return verse()
      ? [
          ["series", "だん数"],
          ["group", "ガチャ・キャンペーン"],
        ]
      : scope === "aikatsu"
        ? [
            ["series", "弾数"],
            ["type", "タイプ"],
            ["rarity", "レアリティ"],
            ["category", "カテゴリ"],
            ["brand", "ブランド"],
            ["character", "キャラクター"],
            ["variant", "カードの種類"],
          ]
        : [
            ["series", "弾数"],
            ["character", "キャラクター"],
            ["rarity", "レアリティ"],
            ["songs", "遊べる曲"],
          ];
  }
  function fieldValues(c, key) {
    return key === "series"
      ? series(c)
      : key === "group"
        ? groups(c)
        : key === "rarity"
          ? [rarity(c)]
          : values(c[key]);
  }
  function filtered(includeOwned = true) {
    const q = normal($("public-query").value);
    return items.filter(
      (c) =>
        (!q ||
          normal(
            [c.code, c.name, c.character, ...values(c.songs), ...groups(c)].join(" "),
          ).includes(q)) &&
        Object.entries(filters).every(
          ([key, value]) => !value || fieldValues(c, key).includes(value),
        ) &&
        (!includeOwned || ownership === "all" || state(c) === ownership),
    );
  }
  function fillFields() {
    $("public-fields").innerHTML = fields()
      .map(([key, label]) => {
        const rows = items.filter((c) =>
          Object.entries(filters).every(
            ([k, v]) => k === key || !v || fieldValues(c, k).includes(v),
          ),
        );
        const options = [...new Set(rows.flatMap((c) => fieldValues(c, key)).filter(Boolean))].sort(
          (a, b) =>
            key === "series"
              ? String(b).localeCompare(String(a), "ja", { numeric: true })
              : String(a).localeCompare(String(b), "ja", { numeric: true }),
        );
        if (filters[key] && !options.includes(filters[key])) options.unshift(filters[key]);
        return `<label>${esc(label)}<select data-public-filter="${key}"><option value="">すべて</option>${options.map((v) => `<option value="${esc(v)}" ${v === filters[key] ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
      })
      .join("");
  }
  function image(c, large = false) {
    const url = verse() ? c.image || c.thumbnail : side && large ? c.back : c.front;
    if (url)
      return `<img src="${esc(url)}" alt="${esc(c.name || c.code)}" loading="${large ? "eager" : "lazy"}" decoding="async">`;
    return `<span class="public-collage">${(c.part_ids || []).map((id) => `<img src="${esc(parts.get(id)?.image || "")}" alt="" loading="lazy">`).join("")}</span>`;
  }
  function renderScopeNote() {
    const note = $("public-scope-note");
    if (!note) return;
    note.replaceChildren();
    const selected = snapshot?.series_filter;
    note.hidden = !Array.isArray(selected);
    if (note.hidden) return;
    const labels = [...new Set(selected.map((value) => String(value).replaceAll("弾", "だん")))];
    const caption = document.createElement("span");
    caption.className = "public-scope-caption";
    caption.textContent = "公開範囲";
    const text = document.createElement("span");
    text.textContent = labels.length ? labels.slice(0, 3).join("・") : "だん数・プロモの選択なし";
    if (labels.length <= 3) {
      note.append(caption, text);
      return;
    }
    const details = document.createElement("details"),
      summary = document.createElement("summary"),
      more = document.createElement("span"),
      list = document.createElement("div");
    more.className = "public-scope-more";
    more.textContent = "ほか" + (labels.length - 3) + "件";
    summary.append(caption, text, more);
    list.className = "public-scope-list";
    for (const label of labels) {
      const item = document.createElement("span");
      item.textContent = label;
      list.append(item);
    }
    details.append(summary, list);
    note.append(details);
  }
  function render() {
    renderScopeNote();
    if (!snapshot) return;
    renderProgressDetails();
    const all = filtered(),
      got = items.filter(full).length,
      count = items.length;
    page = Math.min(
      page,
      Math.max(1, Math.ceil(all.length / (size === "all" ? Math.max(1, all.length) : size))),
    );
    const limit = size === "all" ? Math.max(1, all.length) : size;
    $("public-title").textContent = labels[scope];
    $("public-owner").textContent = (snapshot.nickname || "ゲスト") + "のカードアルバム";
    const subset = filtered(false),
      subsetGot = subset.filter(full).length,
      unit = verse() ? "コーデ" : "枚";
    $("public-filtered-rate").innerHTML =
      `<span>絞り込み内の取得率</span><strong>${(subset.length ? (subsetGot / subset.length) * 100 : 0).toFixed(1)}%</strong><small>取得済 ${subsetGot}${unit} ／ 未取得 ${subset.length - subsetGot}${unit}</small>`;
    $("public-filter-label").textContent = verse() ? "コーデを絞り込む" : "カードを絞り込む";
    document.body.classList.toggle("game-aipri", scope !== "aikatsu");
    $("public-rate").textContent = (count ? (got / count) * 100 : 0).toFixed(1) + "%";
    $("public-progress-bar").style.width = (count ? (got / count) * 100 : 0) + "%";
    $("public-layout-label").textContent = verse() ? "コーデの並び" : "カードの並び";
    $("public-count").textContent =
      `取得済 ${got} ／ 未取得 ${count - got} ／ 全${count}${verse() ? "コーデ" : "枚"}`;
    $("public-scopes").innerHTML = snapshot.scopes
      .map(
        (id) =>
          `<button type="button" data-public-scope="${esc(id)}" aria-pressed="${id === scope}">${esc(labels[id])}</button>`,
      )
      .join("");
    const choices = [
      ["all", "すべて"],
      ["yes", verse() ? "全て持っている" : "持っている"],
      ...(verse() ? [["partial", "一部持っている"]] : []),
      ["no", "持っていない"],
    ];
    if ($("public-owned").dataset.count !== String(choices.length)) {
      $("public-owned").innerHTML =
        '<span class="owned-tabs-slider" aria-hidden="true"></span>' +
        choices
          .map(([id, label]) => `<button type="button" data-public-owned="${id}">${label}</button>`)
          .join("");
      $("public-owned").dataset.count = choices.length;
    }
    $("public-owned").style.setProperty("--count", choices.length);
    $("public-owned").style.setProperty(
      "--index",
      choices.findIndex(([id]) => id === ownership),
    );
    $("public-owned")
      .querySelectorAll("button")
      .forEach((b) => {
        b.classList.toggle("active", b.dataset.publicOwned === ownership);
        b.setAttribute("aria-pressed", String(b.dataset.publicOwned === ownership));
      });
    const active =
      Object.values(filters).filter(Boolean).length + ($("public-query").value.trim() ? 1 : 0);
    $("public-filter-count").textContent = active ? `適用中 ${active}件` : "";
    $("public-tags").innerHTML =
      Object.entries(filters)
        .filter(([, v]) => v)
        .map(
          ([key, value]) =>
            `<button class="filter-chip" type="button" data-public-clear="${esc(key)}">${esc(fields().find(([k]) => k === key)?.[1] || key)}：${esc(value)}<span aria-hidden="true">×</span></button>`,
        )
        .join("") +
      ($("public-query").value.trim()
        ? `<button class="filter-chip" type="button" data-public-clear="query">検索：${esc($("public-query").value.trim())}<span aria-hidden="true">×</span></button>`
        : "");
    $("public-found").textContent = `見つかった${verse() ? "コーデ" : "カード"} ${all.length}件`;
    $("public-cards").innerHTML = all
      .slice((page - 1) * limit, page * limit)
      .map(
        (c) =>
          `<article class="public-card ${full(c) ? "is-owned" : ""}"><button type="button" data-public-detail="${esc(c.id)}"><span class="public-image ${full(c) ? "" : "is-unowned"}">${image(c)}${(verse() ? fullQuantities.get(c.id) : quantities.get(c.id)) > 0 ? `<span class="public-quantity">${verse() ? fullQuantities.get(c.id) : quantities.get(c.id)}枚</span>` : ""}${state(c) === "partial" ? '<span class="public-partial">一部獲得済</span>' : ""}</span><span class="public-code">${esc(c.code || "コード記載なし")}</span><strong>${esc(c.name || "カード名未取得")}</strong>${verse() ? "" : `<small>${esc(rarity(c))}</small>`}</button></article>`,
      )
      .join("");
    $("public-empty").hidden = all.length > 0;
    renderPages(Math.max(1, Math.ceil(all.length / limit)));
  }
  function renderPages(total) {
    const compact = innerWidth <= 760,
      width = $("public-pages").clientWidth || Math.min(innerWidth - 32, 1100);
    const slots = compact ? Math.max(3, Math.min(9, Math.floor((width - 100) / 34))) : 9;
    let candidates;
    if (total <= slots) candidates = Array.from({ length: total }, (_, i) => i + 1);
    else {
      const count = Math.max(1, slots - 4),
        start = Math.max(2, Math.min(page - Math.floor(count / 2), total - count));
      candidates = [
        ...new Set([1, ...Array.from({ length: count }, (_, i) => start + i), total]),
      ].sort((a, b) => a - b);
    }
    let previous = 0;
    $("public-pages").innerHTML =
      `<button type="button" data-public-page="${page - 1}" ${page === 1 ? "disabled" : ""}>${compact ? "前へ" : "前のページ"}</button>` +
      candidates
        .map((n) => {
          const gap =
            previous && n - previous > 1
              ? '<span class="page-gap" aria-hidden="true">…</span>'
              : "";
          previous = n;
          return (
            gap +
            `<button type="button" data-public-page="${n}" ${n === page ? 'aria-current="page"' : ""} aria-label="${n}ページ目">${n}</button>`
          );
        })
        .join("") +
      `<button type="button" data-public-page="${page + 1}" ${page === total ? "disabled" : ""}>${compact ? "次へ" : "次のページ"}</button>`;
  }
  function detail() {
    const c = selected;
    if (!c) return;
    const held = full(c);
    const rows = verse()
      ? [
          ["シリーズ", labels[scope]],
          ["だん数", series(c).join(" ／ ")],
          ["ガチャ・キャンペーン", groups(c).join(" ／ ")],
        ]
      : [
          ["キャラクター", c.character],
          ["レアリティ", rarity(c)],
          ["弾数", series(c).join(" ／ ")],
          ["タイプ", values(c.type).join(" ／ ")],
          ["カテゴリ", values(c.category).join(" ／ ")],
          ["ブランド", values(c.brand).join(" ／ ")],
          ["遊べる曲", values(c.songs).join(" ／ ")],
        ];
    $("public-detail-content").innerHTML =
      `<div class="public-modal-layout"><div><div class="public-modal-image">${image(c, true)}</div>${!verse() ? `<div class="public-side-switch" role="group" aria-label="表面・裏面"><button type="button" data-public-side="0" aria-pressed="${!side}">表面</button><button type="button" data-public-side="1" aria-pressed="${!!side}" ${!c.back ? "disabled" : ""}>裏面</button></div>` : ""}</div><div><span class="public-code">${esc(c.code || "コード記載なし")}</span><h2>${esc(c.name || "カード名未取得")}</h2><p class="public-possession is-${state(c)}">${held ? "持っている" : state(c) === "partial" ? "一部持っている" : "持っていない"}</p><dl>${rows
        .filter(([, v]) => v)
        .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
        .join("")}</dl></div></div>${
        verse()
          ? `<h3>パーツごとの所持状況</h3><div class="public-modal-parts">${c.part_ids
              .map((id) => {
                const p = parts.get(id);
                return `<article><img src="${esc(p?.image || "")}" alt="${esc(p?.slot)}"><span>${esc(p?.slot)} ／ ${p?.buzz == null ? "BP未確認" : p.buzz + " BP"}</span><small class="public-part-state ${(quantities.get(id) || 0) > 0 ? "is-yes" : "is-no"}">${(quantities.get(id) || 0) > 0 ? "持っている " + quantities.get(id) + "枚" : "持っていない"}</small></article>`;
              })
              .join("")}</div>`
          : ""
      }`;
  }
  async function load(wanted = scope, quiet = false) {
    const g = ++generation;
    busy = true;
    if (!quiet) {
      $("public-status").textContent = "所持状況を読み込み中…";
      $("public-album").hidden = true;
      selected = null;
      if ($("public-detail").open) $("public-detail").close();
    }
    try {
      const r = await client.rpc("card_album_share_read", {
        p_token: token,
        p_scope: wanted || null,
      });
      if (g !== generation) return;
      if (r.error) throw Error("所持状況を取得できませんでした。再読み込みしてください。");
      if (r.data?.available !== true) {
        if (quiet && wanted) {
          const retry = await client.rpc("card_album_share_read", {
            p_token: token,
            p_scope: null,
          });
          if (g !== generation) return;
          if (retry.error) throw Error("更新できませんでした。");
          if (retry.data?.available === true) {
            r.data = retry.data;
          } else {
            unavailable();
            return;
          }
        } else {
          unavailable();
          return;
        }
      }
      const snap = r.data;
      let rows,
        partMap = new Map();
      if (snap.scope.startsWith("verse-")) {
        const c =
          verseCatalog || (await client.rpc("card_verse_catalog_cached", { p_version: null }));
        if (c.error || !Array.isArray(c.data?.coordinates) || !Array.isArray(c.data?.parts))
          throw Error("コーデ情報を取得できませんでした。");
        verseCatalog = c;
        const family = snap.scope === "verse-onegai" ? "onegai" : "himitsu";
        rows = c.data.coordinates.filter((x) => x.family === family);
        partMap = new Map(c.data.parts.filter((p) => p.family === family).map((p) => [p.id, p]));
      } else {
        const catalog = publicCatalog || (await window.PUBLIC_CATALOG_CACHE.load(client));
        publicCatalog = catalog;
        const patches = new Map(catalog.overrides.map((r) => [r.card_id, r.patch]));
        rows = catalog.cards
          .map((c) => ({ ...c, ...(patches.get(c.id) || {}) }))
          .filter((c) =>
            snap.scope === "aikatsu"
              ? c.game === "aikatsu"
              : c.game === "aipri" &&
                [snap.scope, snap.scope === "onegai" ? "おねがい" : "ひみつ"].includes(c.family),
          );
      }
      if (Array.isArray(snap.visible_ids)) {
        const visible = new Set(snap.visible_ids);
        rows = rows.filter((row) => visible.has(row.id));
      }
      if (g !== generation) return;
      const changed = scope !== snap.scope || !scopeFilters.has(snap.scope);
      scope = snap.scope;
      snapshot = snap;
      items = rows;
      parts = partMap;
      quantities = new Map(
        (snap.cards || snap.parts || []).map((r) => [r.card_id ?? r.part_id, r.quantity]),
      );
      fullQuantities = new Map((snap.coordinates || []).map((r) => [r.coordinate_id, r.quantity]));
      if (changed) {
        filters = scopeFilters.get(scope) || {};
        if (!scopeFilters.has(scope)) {
          const rank = (t) => {
            const x = String(t).normalize("NFKC"),
              n = x.match(/(\d+)\s*(?:だん|弾)/);
            return n ? (x.includes("リング") ? 1000000 : 0) + Number(n[1]) : -1;
          };
          const latest = [...new Set(items.flatMap(series))]
            .filter((t) => rank(t) >= 0)
            .sort((a, b) => rank(b) - rank(a))[0];
          if (latest) filters.series = latest;
          scopeFilters.set(scope, filters);
        }
        ownership = "all";
        page = 1;
        $("public-query").value = "";
      }
      if (filters.series && !items.some((c) => series(c).includes(filters.series)))
        delete filters.series;
      fillFields();
      render();
      $("public-unavailable").hidden = true;
      $("public-album").hidden = false;
      $("public-status").textContent = "";
      lastRead = Date.now();
      startLive();
      fillBanner();
      if (quiet && selected) {
        selected = items.find((c) => c.id === selected.id);
        if (selected) detail();
        else {
          $("public-detail-content").replaceChildren();
          if ($("public-detail").open) $("public-detail").close();
        }
      }
    } catch (error) {
      if (g === generation) {
        if (!quiet) unavailable();
        $("public-status").textContent = error.message;
      }
    } finally {
      if (g === generation) {
        busy = false;
        if (pendingRefresh) {
          pendingRefresh = false;
          scheduleRefresh();
        }
      }
    }
  }
  document.addEventListener("click", (e) => {
    const columns = e.target.closest("[data-public-columns]");
    if (columns) {
      $("public-cards").style.setProperty("--public-columns", columns.dataset.publicColumns);
      document
        .querySelectorAll("[data-public-columns]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === columns)));
      return;
    }
    const clear = e.target.closest("[data-public-clear]");
    if (clear) {
      if (clear.dataset.publicClear === "query") $("public-query").value = "";
      else delete filters[clear.dataset.publicClear];
      page = 1;
      fillFields();
      render();
      return;
    }
    const s = e.target.closest("[data-public-scope]");
    if (s) {
      if (!snapshot?.scopes.includes(s.dataset.publicScope)) return;
      load(s.dataset.publicScope);
      return;
    }
    const own = e.target.closest("[data-public-owned]");
    if (own) {
      ownership = own.dataset.publicOwned;
      page = 1;
      render();
      return;
    }
    const pg = e.target.closest("[data-public-page]");
    if (pg && !pg.disabled) {
      page = Number(pg.dataset.publicPage);
      render();
      $("public-cards").scrollIntoView({ block: "start" });
      return;
    }
    const card = e.target.closest("[data-public-detail]");
    if (card) {
      selected = items.find((c) => c.id === card.dataset.publicDetail);
      side = 0;
      detail();
      $("public-detail").tabIndex = -1;
      $("public-detail").showModal();
      $("public-detail").focus({ preventScroll: true });
      return;
    }
    const flip = e.target.closest("[data-public-side]");
    if (flip && !flip.disabled) {
      side = Number(flip.dataset.publicSide);
      detail();
    }
  });
  $("public-fields").onchange = (e) => {
    const key = e.target.dataset.publicFilter;
    if (!key) return;
    filters[key] = e.target.value;
    page = 1;
    fillFields();
    render();
  };
  $("public-query").oninput = () => {
    page = 1;
    render();
  };
  $("public-reset").onclick = () => {
    filters = {};
    scopeFilters.set(scope, filters);
    ownership = "all";
    page = 1;
    $("public-query").value = "";
    fillFields();
    render();
  };
  $("public-size").onchange = () => {
    size = $("public-size").value === "all" ? "all" : Number($("public-size").value);
    page = 1;
    render();
  };
  $("public-close").onclick = () => $("public-detail").close();
  $("public-banner-close").onclick = () => {
    $("public-banner").hidden = true;
    document.body.classList.add("public-banner-dismissed");
  };
  $("public-refresh").onclick = () => load();
  document.addEventListener(
    "load",
    (event) => {
      const image = event.target;
      if (image.tagName === "IMG" && image.parentElement?.classList.contains("public-image"))
        image.parentElement.classList.toggle("landscape", image.naturalWidth > image.naturalHeight);
    },
    true,
  );
  function scheduleRefresh() {
    if (document.hidden) return;
    if (busy) {
      pendingRefresh = true;
      return;
    }
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => load(scope, true), 500);
  }
  function stopLive() {
    liveWanted = false;
    clearTimeout(refreshTimer);
    if (channel) {
      const previous = channel;
      channel = null;
      liveClosing = true;
      Promise.resolve(client.removeChannel(previous))
        .catch(() => {})
        .finally(() => {
          liveClosing = false;
          if (liveWanted && !document.hidden) startLive();
        });
    }
  }
  function startLive() {
    liveWanted = true;
    if (channel || liveClosing || document.hidden || typeof client.channel !== "function") return;
    channel = client
      .channel("album-share:" + token, { config: { private: false } })
      .on("broadcast", { event: "refresh" }, scheduleRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") scheduleRefresh();
      });
  }
  function shuffle(rows) {
    const result = [...rows];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  async function fillBanner() {
    const box = $("public-banner-cards");
    if (box.dataset.ready || bannerFlight) return;
    bannerFlight = true;
    try {
      const catalog = publicCatalog || (await window.PUBLIC_CATALOG_CACHE.load(client));
      publicCatalog = catalog;
      const candidates = catalog.cards.filter((c) => {
        try {
          return !!c.front && ["aipri.jp", "dcd.aikatsu.com"].includes(new URL(c.front).hostname);
        } catch {
          return false;
        }
      });
      const a = shuffle(candidates.filter((c) => c.game === "aikatsu")),
        b = shuffle(candidates.filter((c) => c.game === "aipri"));
      const count = Math.min(7, a.length, b.length);
      const cards = count
        ? shuffle([...a.slice(0, count), ...b.slice(0, count)])
        : shuffle([...a, ...b]).slice(0, 14);
      if (!cards.length) return;
      const sequence = cards
        .map(
          (c) =>
            `<span class="public-banner-image" data-banner-game="${esc(c.game)}"><img src="${esc(c.front)}" alt="" loading="eager" decoding="async" fetchpriority="low"></span>`,
        )
        .join("");
      box.innerHTML = sequence + sequence;
      box.dataset.ready = "true";
    } catch {
    } finally {
      bannerFlight = false;
    }
  }
  function renderProgressDetails() {
    if (!$("public-progress-details").open) return;
    const rank = (t) => {
      const x = String(t).normalize("NFKC"),
        n = x.match(/(\d+)\s*(?:だん|弾)/);
      return n ? (x.includes("リング") ? 1000000 : 0) + Number(n[1]) : -1;
    };
    const labels = [...new Set(items.flatMap(series))]
      .filter(Boolean)
      .sort(
        (a, b) => rank(b) - rank(a) || String(a).localeCompare(String(b), "ja", { numeric: true }),
      );
    $("public-series-progress").innerHTML = labels
      .map((label) => {
        const rows = items.filter((c) => series(c).includes(label)),
          got = rows.filter(full).length,
          rate = rows.length ? (got / rows.length) * 100 : 0,
          unit = verse() ? "コーデ" : "枚";
        return `<div class="public-series-rate"><div><span>${esc(label)}</span><strong>${rate.toFixed(1)}%</strong></div><div class="public-progress-track"><span style="width:${rate}%"></span></div><p>取得済 ${got}${unit} ／ 未取得 ${rows.length - got}${unit}</p></div>`;
      })
      .join("");
  }
  window.addEventListener(
    "resize",
    () => {
      if (snapshot) {
        const count = filtered().length;
        renderPages(Math.max(1, Math.ceil(count / (size === "all" ? Math.max(1, count) : size))));
      }
    },
    { passive: true },
  );
  $("public-progress-details").addEventListener("toggle", renderProgressDetails);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopLive();
    else if (client) {
      startLive();
      if (!busy) load(scope, true);
    }
  });
  window.addEventListener("pagehide", stopLive);
  window.addEventListener("focus", () => {
    if (client && !busy && Date.now() - lastRead > 60000) load(scope, true);
  });
  window.addEventListener("pageshow", (event) => {
    if (client && event.persisted) {
      startLive();
      load(scope, true);
    }
  });
  if (!/^[0-9a-f]{64}$/.test(token)) {
    unavailable();
    return;
  }
  try {
    client = window.supabase.createClient(
      window.APP_CONFIG.supabaseUrl,
      window.APP_CONFIG.supabaseKey,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    load();
  } catch {
    unavailable();
  }
})();

/* modal-scrollbar.js */
(() => {
  "use strict";
  if (!HTMLElement.prototype.showPopover) return;
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
    trackHeight = 0,
    thumbHeight = 0,
    thumbTop = 0,
    drag = null,
    nextId = 0;
  let cachedScroller = null,
    needsScan = true;
  const resize = new ResizeObserver(() => {
    needsScan = true;
    schedule();
  });
  function scrollable(node) {
    return (
      node instanceof HTMLElement &&
      !rail.contains(node) &&
      node !== rail &&
      node.clientHeight > 0 &&
      node.scrollHeight > node.clientHeight + 1 &&
      /auto|scroll/.test(getComputedStyle(node).overflowY)
    );
  }
  function findScroller(active) {
    if (active !== modal || needsScan || !cachedScroller?.isConnected) {
      const candidates = [active, ...active.querySelectorAll("*")].filter(scrollable);
      cachedScroller = candidates.includes(active)
        ? active
        : candidates.sort(
            (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
          )[0] || active;
      needsScan = false;
    }
    return cachedScroller;
  }
  function clear() {
    try {
      rail.hidePopover();
    } catch {}
    if (target) target.classList.remove("external-modal-scroll");
    resize.disconnect();
    modal = target = drag = null;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function update() {
    frame = 0;
    const dialogs = [...document.querySelectorAll("dialog[open]")].filter((node) =>
      node.matches(":modal"),
    );
    const active = dialogs.at(-1);
    if (!active) {
      clear();
      return;
    }
    const scroller = findScroller(active);
    if (active !== modal || target !== scroller) {
      clear();
      modal = active;
      target = scroller;
      active.append(rail);
      resize.observe(active);
      if (target !== active) resize.observe(target);
    }
    const rect = active.getBoundingClientRect();
    trackHeight = Math.max(
      0,
      Math.min(rect.bottom, innerHeight - 12) - Math.max(12, rect.top) - 20,
    );
    const max = Math.max(0, target.scrollHeight - target.clientHeight);
    if (!max || trackHeight < 40) {
      try {
        rail.hidePopover();
      } catch {}
      return;
    }
    try {
      if (!rail.matches(":popover-open")) rail.showPopover();
    } catch {
      clear();
      return;
    }
    if (!target.classList.contains("external-modal-scroll"))
      target.classList.add("external-modal-scroll");
    if (!target.id) target.id = "modal-scroll-target-" + ++nextId;
    rail.setAttribute("aria-controls", target.id);
    rail.setAttribute("aria-valuemin", "0");
    rail.setAttribute("aria-valuemax", String(Math.round(max)));
    rail.setAttribute("aria-valuenow", String(Math.round(target.scrollTop)));
    rail.style.left = Math.min(innerWidth - 11, rect.right + 3) + "px";
    rail.style.top = Math.max(12, rect.top) + 10 + "px";
    rail.style.height = trackHeight + "px";
    thumbHeight = Math.min(
      trackHeight,
      Math.max(28, (trackHeight * target.clientHeight) / target.scrollHeight),
    );
    thumbTop = (trackHeight - thumbHeight) * Math.min(1, Math.max(0, target.scrollTop / max));
    thumb.style.height = thumbHeight + "px";
    thumb.style.transform = "translateY(" + thumbTop + "px)";
  }
  function move(pointerY, offset) {
    if (!target) return;
    const max = target.scrollHeight - target.clientHeight;
    const top = pointerY - rail.getBoundingClientRect().top - offset;
    target.scrollTop = Math.max(0, Math.min(1, top / Math.max(1, trackHeight - thumbHeight))) * max;
    schedule();
  }
  rail.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !target) return;
    event.preventDefault();
    rail.focus({ preventScroll: true });
    const y = event.clientY - rail.getBoundingClientRect().top;
    drag = {
      id: event.pointerId,
      offset: y >= thumbTop && y <= thumbTop + thumbHeight ? y - thumbTop : thumbHeight / 2,
    };
    rail.setPointerCapture(event.pointerId);
    move(event.clientY, drag.offset);
  });
  rail.addEventListener("pointermove", (event) => {
    if (drag?.id === event.pointerId) move(event.clientY, drag.offset);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    rail.addEventListener(type, () => {
      drag = null;
    });
  rail.addEventListener(
    "wheel",
    (event) => {
      if (!target) return;
      event.preventDefault();
      target.scrollTop +=
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.clientHeight : 1);
      schedule();
    },
    { passive: false },
  );
  rail.addEventListener("keydown", (event) => {
    if (
      !target ||
      !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Home") target.scrollTop = 0;
    else if (event.key === "End") target.scrollTop = target.scrollHeight;
    else
      target.scrollTop +=
        (event.key.endsWith("Up") ? -1 : 1) *
        (event.key.startsWith("Page") ? target.clientHeight * 0.85 : 40);
    schedule();
  });
  new MutationObserver((records) => {
    if (records.some((record) => record.target !== rail && !rail.contains(record.target))) {
      needsScan = true;
      schedule();
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open", "hidden"],
  });
  document.addEventListener(
    "scroll",
    (event) => {
      if (modal?.contains(event.target) && scrollable(event.target)) {
        cachedScroller = event.target;
        needsScan = false;
      }
      schedule();
    },
    true,
  );
  document.addEventListener(
    "load",
    () => {
      needsScan = true;
      schedule();
    },
    true,
  );
  addEventListener(
    "resize",
    () => {
      needsScan = true;
      schedule();
    },
    { passive: true },
  );
  schedule();
})();

/* dropdowns.js */
(() => {
  "use strict";
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

/* public-info.js */
(() => {
  "use strict";
  const information = {
    terms: {
      title: "利用規約",
      body: `<p class="effective-date">共有閲覧画面について · 更新日：2026年10月17日</p>
      <p>この規約は、カードアルバムの共有URLから利用する閲覧専用画面の利用条件を定めます。</p>
      <h3>1. この画面でできること</h3><p>アルバムの持ち主が公開したカード・コーデの所持状況、所持数、取得率を、ログインせずに確認できます。検索・絞り込みや画像の閲覧はできますが、所持情報の登録・変更・削除はできません。</p>
      <h3>2. 公開範囲とURL</h3><p>持ち主のニックネームと「〇〇のカードアルバム」、公開がONになっている種類の所持情報を表示します。公開範囲は持ち主が変更でき、URLが削除された場合は閲覧できなくなります。共有URLを知っている方は閲覧できるため、第三者への再共有は持ち主の意向に配慮してください。</p>
      <h3>3. 禁止事項</h3><ul><li>不正アクセス、権限や公開範囲の制限を回避する行為</li><li>機械的な大量取得やサービスへ過度な負荷をかける行為</li><li>公開情報を用いた嫌がらせ、なりすまし、他の利用者や権利者への迷惑行為</li></ul>
      <h3>4. 掲載情報と権利</h3><p>所持状況は持ち主が登録した記録であり、実際の所持や交換・譲渡の可否を保証するものではありません。カード情報には誤りや反映の遅れが含まれる場合があります。画像、名称、作品名などの権利は各権利者に帰属します。</p>
      <h3>5. 変更・停止</h3><p>持ち主の設定変更、保守、障害などにより、公開内容の変更や閲覧の停止が生じる場合があります。通信状況によって更新の反映が遅れることがあります。</p>
      <h3>6. 責任について</h3><p>運営者は掲載情報の正確性や継続的な提供を保証するものではありません。ただし、法令上免除できない責任を免除するものではありません。</p>`,
    },
    privacy: {
      title: "プライバシーポリシー",
      body: `<p class="effective-date">共有閲覧画面について · 更新日：2026年10月17日</p>
      <p>この方針は、共有URLから開く閲覧専用画面での情報の取り扱いを説明します。</p>
      <h3>1. 表示される情報</h3><p>持ち主が公開したニックネーム、アルバムのタイトル、カード・コーデの所持状況、所持数、取得率を表示します。アルバムID、ユーザーID、メールアドレス、お気に入り、譲求情報は表示しません。共有URLにもアルバムIDは含みません。</p>
      <h3>2. 閲覧する方の情報</h3><p>閲覧のためのアカウント作成やログイン、氏名・メールアドレスなどの入力は必要ありません。通信先のサービスでは、配信、不正利用の防止、障害対応などのために、IPアドレスやアクセス日時などが記録される場合があります。</p>
      <h3>3. ブラウザへの保存</h3><p>表示を速くするため、公開カードカタログをブラウザにキャッシュします。共有先のニックネーム・所持情報を、この画面の機能でブラウザの永続領域へ保存することはありません。検索・絞り込みは画面内で処理します。</p>
      <h3>4. 公開内容の変更</h3><p>公開・非公開の切り替えや共有URLの削除は、持ち主が通常サイトで管理します。ログアウトしても共有URLは失効せず、削除するまで継続します。非公開にしたりURLを削除したりしても、閲覧者が既に保存した画像やスクリーンショットなどを取り消すことはできません。</p>
      <h3>5. 更新通知</h3><p>閲覧中の画面を最新に保つため、変更時に更新通知を受け取り、公開設定と所持情報を確認します。通知本文にニックネームや所持情報は含めません。画面を離れている間は通知の購読を停止します。</p>`,
    },
    about: {
      title: "このサイトについて",
      body: `<p>カードアルバムは、アイカツ！アンコール・アイプリ・アイプリバースのコレクションを記録・共有する非公式サイトです。</p>
      <h3>この画面について</h3><p>持ち主が公開したコレクションを閲覧するための専用画面です。カードやコーデを検索し、画像・所持数・取得率を確認できます。記録の追加や変更はできません。</p>
      <h3>公式サービスとの関係</h3><p>本サイトは作品・ゲームの公式運営とは関係ありません。作品名、カード画像などの権利は各権利者に帰属します。ゲームの仕様や最新情報は公式サイトをご確認ください。</p>
      <h3>自分のアルバムを作るには</h3><p>画面下部の「アルバムを作成する」から通常サイトへ進めます。共有アルバムを閲覧するだけなら、登録は不要です。</p>`,
    },
  };
  const dialog = document.getElementById("public-info-dialog"),
    title = document.getElementById("public-info-title"),
    body = document.getElementById("public-info-body");
  document.querySelectorAll("[data-share-info]").forEach((button) =>
    button.addEventListener("click", () => {
      const item = information[button.dataset.shareInfo];
      if (!item) return;
      title.textContent = item.title;
      body.innerHTML = item.body;
      dialog.showModal();
      dialog.scrollTop = 0;
      title.focus({ preventScroll: true });
    }),
  );
  document.getElementById("public-info-close").onclick = () => dialog.close();
})();
