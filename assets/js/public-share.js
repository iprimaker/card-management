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
  let verseCatalog = null;
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
    lastRead = 0;
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
    const all = filtered(),
      got = items.filter(full).length,
      count = items.length;
    page = Math.min(
      page,
      Math.max(1, Math.ceil(all.length / (size === "all" ? Math.max(1, all.length) : size))),
    );
    const limit = size === "all" ? Math.max(1, all.length) : size;
    $("public-title").textContent = labels[scope] + "の所持状況";
    document.body.classList.toggle("game-aipri", scope !== "aikatsu");
    $("public-rate").textContent = (count ? (got / count) * 100 : 0).toFixed(1) + "%";
    $("public-count").textContent =
      `取得済 ${got} ／ 未取得 ${count - got} ／ 全${count}${verse() ? "コーデ" : "枚"}`;
    $("public-scopes").innerHTML = snapshot.scopes
      .map(
        (id) =>
          `<button type="button" data-public-scope="${esc(id)}" aria-pressed="${id === scope}">${esc(labels[id])}</button>`,
      )
      .join("");
    $("public-owned").innerHTML = [
      ["all", "すべて"],
      ["yes", verse() ? "全て持っている" : "持っている"],
      ...(verse() ? [["partial", "一部持っている"]] : []),
      ["no", "持っていない"],
    ]
      .map(
        ([id, label]) =>
          `<button type="button" data-public-owned="${id}" aria-pressed="${id === ownership}">${label}</button>`,
      )
      .join("");
    const active =
      Object.values(filters).filter(Boolean).length + ($("public-query").value.trim() ? 1 : 0);
    $("public-filter-count").textContent = active ? `適用中 ${active}件` : "";
    $("public-found").textContent = `見つかった${verse() ? "コーデ" : "カード"} ${all.length}件`;
    $("public-cards").innerHTML = all
      .slice((page - 1) * limit, page * limit)
      .map(
        (c) =>
          `<article class="public-card ${full(c) ? "is-owned" : ""}"><button type="button" data-public-detail="${esc(c.id)}"><span class="public-image ${full(c) ? "" : "is-unowned"}">${image(c)}${(verse() ? fullQuantities.get(c.id) : quantities.get(c.id)) > 0 ? `<span class="public-quantity">${verse() ? fullQuantities.get(c.id) : quantities.get(c.id)}枚</span>` : ""}${state(c) === "partial" ? '<span class="public-partial">一部獲得済</span>' : ""}</span><span class="public-code">${esc(c.code || "コード記載なし")}</span><strong>${esc(c.name || "カード名未取得")}</strong>${verse() ? "" : `<small>${esc(rarity(c))}</small>`}</button></article>`,
      )
      .join("");
    $("public-empty").hidden = all.length > 0;
    const total = Math.max(1, Math.ceil(all.length / limit)),
      candidates =
        total <= (innerWidth <= 760 ? 5 : 7)
          ? Array.from({ length: total }, (_, i) => i + 1)
          : [...new Set([1, page - 1, page, page + 1, total].filter((n) => n >= 1 && n <= total))];
    let previous = 0;
    $("public-pages").innerHTML =
      `<button type="button" data-public-page="${page - 1}" ${page === 1 ? "disabled" : ""}>前のページ</button>` +
      candidates
        .map((n) => {
          const gap = previous && n - previous > 1 ? "<span>…</span>" : "";
          previous = n;
          return (
            gap +
            `<button type="button" data-public-page="${n}" ${n === page ? 'aria-current="page"' : ""}>${n}</button>`
          );
        })
        .join("") +
      `<button type="button" data-public-page="${page + 1}" ${page === total ? "disabled" : ""}>次のページ</button>`;
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
      `<div class="public-modal-layout"><div><div class="public-modal-image">${image(c, true)}</div>${!verse() ? `<div class="public-side-switch" role="group" aria-label="表面・裏面"><button type="button" data-public-side="0" aria-pressed="${!side}">表面</button><button type="button" data-public-side="1" aria-pressed="${!!side}" ${!c.back ? "disabled" : ""}>裏面</button></div>` : ""}</div><div><span class="public-code">${esc(c.code || "コード記載なし")}</span><h2>${esc(c.name || "カード名未取得")}</h2><p class="public-possession">${held ? "持っている" : state(c) === "partial" ? "一部持っている" : "持っていない"}</p><dl>${rows
        .filter(([, v]) => v)
        .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
        .join("")}</dl></div></div>${
        verse()
          ? `<h3>パーツごとの所持状況</h3><div class="public-modal-parts">${c.part_ids
              .map((id) => {
                const p = parts.get(id);
                return `<article><img src="${esc(p?.image || "")}" alt="${esc(p?.slot)}"><span>${esc(p?.slot)} ／ ${p?.buzz || 0} BP</span><small>${(quantities.get(id) || 0) > 0 ? "持っている " + quantities.get(id) + "枚" : "持っていない"}</small></article>`;
              })
              .join("")}</div>`
          : ""
      }`;
  }
  async function load(wanted = scope) {
    const g = ++generation;
    busy = true;
    $("public-status").textContent = "所持状況を読み込み中…";
    $("public-album").hidden = true;
    selected = null;
    if ($("public-detail").open) $("public-detail").close();
    try {
      const r = await client.rpc("card_album_share_read", {
        p_token: token,
        p_scope: wanted || null,
      });
      if (g !== generation) return;
      if (r.error) throw Error("所持状況を取得できませんでした。再読み込みしてください。");
      if (r.data?.available !== true) {
        unavailable();
        return;
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
        const catalog = await window.PUBLIC_CATALOG_CACHE.load(client);
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
      const changed = scope !== snap.scope;
      scope = snap.scope;
      snapshot = snap;
      items = rows;
      parts = partMap;
      quantities = new Map(
        (snap.cards || snap.parts || []).map((r) => [r.card_id ?? r.part_id, r.quantity]),
      );
      fullQuantities = new Map((snap.coordinates || []).map((r) => [r.coordinate_id, r.quantity]));
      if (changed) {
        filters = {};
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
    } catch (error) {
      if (g === generation) {
        unavailable();
        $("public-status").textContent = error.message;
      }
    } finally {
      if (g === generation) busy = false;
    }
  }
  document.addEventListener("click", (e) => {
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
  $("public-refresh").onclick = () => load();
  window.addEventListener("focus", () => {
    if (client && !busy && Date.now() - lastRead > 60000) load();
  });
  window.addEventListener("pageshow", (event) => {
    if (client && event.persisted) load();
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
