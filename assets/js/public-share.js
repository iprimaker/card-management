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
    return verse() ? [...new Set((c.appearances || []).map((a) => a.series))] : values(c.series);
  }
  function groups(c) {
    return [...new Set((c.appearances || []).map((a) => a.group))];
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
  function render() {
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
                return `<article><img src="${esc(p?.image || "")}" alt="${esc(p?.slot)}"><span>${esc(p?.slot)} ／ ${p?.buzz || 0} BP</span><small class="public-part-state ${(quantities.get(id) || 0) > 0 ? "is-yes" : "is-no"}">${(quantities.get(id) || 0) > 0 ? "持っている " + quantities.get(id) + "枚" : "持っていない"}</small></article>`;
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
      $("public-detail").showModal();
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
            `<span class="public-banner-image" data-banner-game="${esc(c.game)}"><img src="${esc(c.front)}" alt="" loading="lazy" decoding="async"></span>`,
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
