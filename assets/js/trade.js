(() => {
  "use strict";
  const host = window.CARD_TRADE_HOST;
  const exporterURL = new URL(
    "./trade-image-export.js?v=20261018",
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
  panel.innerHTML = `<div class="trade-heading"><div><span class="eyebrow">TRADE LIST</span><h1 id="trade-title">交換希望</h1><p class="trade-intro">登録した譲・求をまとめて、交換希望を作成できます。</p></div><button type="button" id="trade-back" class="text-button">一覧へ戻る</button></div>
 <details id="trade-filter-panel" class="trade-filter-panel"><summary><span class="trade-chevron" aria-hidden="true"></span><span>交換希望を絞り込む</span><small id="trade-filter-count"></small></summary><div class="trade-filters"><label>キーワード<input id="trade-query" type="search" placeholder="名前・コード"></label><label>だん数<select id="trade-series"></select></label><label id="trade-rarity-label">レアリティ<select id="trade-rarity"></select></label><label id="trade-group-label">ガチャ・キャンペーン<select id="trade-group"></select></label></div></details><p id="trade-load-status" role="status"></p>
 <section class="trade-step"><div class="trade-step-heading"><span class="trade-step-number">1</span><div><h2>譲・求のカードを確認</h2><p>絞り込みを使って、画像に入れるカードを確認してください。赤枠は優先のカードです。</p></div></div><div class="trade-totals" id="trade-output-count"></div><p id="trade-overflow" class="trade-error" role="status"></p><div id="trade-sheets"></div></section>
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
    for (const id of ["trade-post", "trade-text", "trade-method"])
      $(id).value = "";
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
        if (!Array.isArray(r.data))
          throw Error("交換希望を取得できませんでした。");
        rows.push(...r.data);
        if (r.data.length < 1000) break;
      }
      if (user !== uid() || g !== generation) return;
      records = new Set(rows.map((r) => key(r.kind, r.target_id, r.side)));
      priorities = new Map(
        rows.map((r) => [
          key(r.kind, r.target_id, r.side),
          r.priority === 2 ? 2 : 1,
        ]),
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
    return `<div class="trade-toggles" data-trade-control data-trade-kind="${esc(kind)}" data-trade-id="${esc(id)}" role="group" aria-label="交換希望">${["offer", "want"].map((side) => `<button type="button" data-trade-side="${side}" aria-pressed="${has(kind, id, side)}" data-priority="${level(kind, id, side) === 2}" title="タップで通常・優先・解除を切り替え" ${!ready ? "disabled" : ""}><strong>${level(kind, id, side) === 2 ? "優先" : ""}${side === "offer" ? "譲" : "求"}</strong><span>${label[side]}</span></button>`).join("")}</div>`;
  }
  function patch() {
    patchBadges();
    document.querySelectorAll("[data-trade-control]").forEach((node) => {
      for (const b of node.querySelectorAll("[data-trade-side]")) {
        b.setAttribute(
          "aria-pressed",
          String(
            has(
              node.dataset.tradeKind,
              node.dataset.tradeId,
              b.dataset.tradeSide,
            ),
          ),
        );
        const priority =
          level(
            node.dataset.tradeKind,
            node.dataset.tradeId,
            b.dataset.tradeSide,
          ) === 2;
        b.dataset.priority = String(priority);
        b.querySelector("strong").textContent =
          (priority ? "優先" : "") +
          (b.dataset.tradeSide === "offer" ? "譲" : "求");
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
        const kind = card.hasAttribute("data-verse-card")
          ? "coordinate"
          : "card";
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
    try {
      const r = await host.client().rpc("card_album_set_trade_priority", {
        p_kind: kind,
        p_target_id: String(id),
        p_side: side,
        p_level: next,
      });
      if (user !== uid() || g !== generation) return;
      if (r.error || r.data !== next) throw Error("save");
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
        (
          host.verse()?.coordinates.find((c) => c.id === id)?.part_ids || []
        ).some((p) => has("part", p, side)))
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
        .filter(
          (c) =>
            c.game === origin.game &&
            (c.game !== "aipri" || c.family === origin.family),
        )
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
      (c) => c.family === (origin.family === "ひみつ" ? "himitsu" : "onegai"),
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
          code: p.code || String(id),
          name: p.name || c.name,
          image: p.image,
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
        image: c.image || c.thumbnail,
        collage: c.part_ids.map((id) => partMap.get(id)?.image).filter(Boolean),
        series,
        groups,
        rarity: c.rarity || "",
      };
    });
    return [...full, ...parts.values()];
  }
  const values = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  function filtered() {
    const query = $("trade-query")
      .value.normalize("NFKC")
      .toLowerCase()
      .replace(/[\s-]/g, "");
    return items().filter(
      (c) =>
        (!query ||
          [c.code, c.name, c.character, ...values(c.songs)]
            .join(" ")
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[\s-]/g, "")
            .includes(query)) &&
        (!$("trade-series").value ||
          values(c.series).includes($("trade-series").value)) &&
        (!$("trade-rarity").value || c.rarity === $("trade-rarity").value) &&
        (!$("trade-group").value ||
          values(c.groups).includes($("trade-group").value)),
    );
  }
  function options(id, rows) {
    $(id).innerHTML =
      '<option value="">すべて</option>' +
      [...new Set(rows.filter(Boolean))]
        .sort((a, b) => b.localeCompare(a, "ja", { numeric: true }))
        .map((v) => `<option value="${esc(v)}">${esc(v)}</option>`)
        .join("");
  }
  function title() {
    return origin.game === "aikatsu"
      ? "アイカツアンコール"
      : (origin.family === "ひみつ" ? "ひみつのアイプリ" : "おねがいアイプリ") +
          (origin.kind === "coordinate" ? "バース" : "");
  }
  function layout() {
    const available =
      $("trade-sheets").clientWidth || Math.max(240, window.innerWidth - 64);
    const cols = available < 600 ? 4 : 6;
    const imageHeight = Math.ceil(
      (available - 24) / cols / (origin?.kind === "card" ? 0.714 : 1),
    );
    return { cols, capacity: 36, imageHeight, rowHeight: imageHeight + 18 };
  }

  const imageQueue = new Set();
  let imageFrame = null;
  function drawShotImage(img) {
    if (
      !img.isConnected ||
      !img.complete ||
      !img.naturalWidth ||
      !img.naturalHeight
    )
      return;
    const frame = img.closest(".trade-shot-image");
    if (!frame) return;
    const rotate =
      frame.dataset.rotate === "true" && img.naturalWidth > img.naturalHeight;
    const ratio = Math.min(
      1,
      240 / Math.max(img.naturalWidth, img.naturalHeight),
    );
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
      if (event.target.matches?.(".trade-shot-image>img"))
        queueShotImage(event.target);
    },
    true,
  );
  function image(c) {
    const frame = (url, rotate) =>
      `<span class="trade-shot-image" data-rotate="${rotate}"><img src="${esc(url)}" alt="${esc(c.name)}" loading="eager" decoding="async"></span>`;
    return c.image
      ? frame(c.image, c.kind !== "coordinate")
      : `<span class="trade-collage">${(c.collage || []).map((url) => frame(url, true)).join("")}</span>`;
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
      rank = (side) => (a, b) =>
        level(b.kind, b.id, side) - level(a.kind, a.id, side),
      offer = all.filter((c) => has(c.kind, c.id, "offer")).sort(rank("offer")),
      want = all.filter((c) => has(c.kind, c.id, "want")).sort(rank("want")),
      l = layout();
    const priorityNote =
      [...offer].some((c) => level(c.kind, c.id, "offer") === 2) ||
      want.some((c) => level(c.kind, c.id, "want") === 2)
        ? "※ 赤枠は優先して交換したいものです。"
        : "";
    const groups = [
        { side: "譲", rows: offer },
        { side: "求", rows: want },
      ],
      count = groups.reduce(
        (n, g) => n + Math.ceil(g.rows.length / l.capacity),
        0,
      ),
      sheets = [];
    exportSheets = [];
    let n = 0;
    const numbers = { 譲: [], 求: [] };
    for (const g of groups)
      for (let offset = 0; offset < g.rows.length; offset += l.capacity) {
        n++;
        numbers[g.side].push(n);
        const side = g.side === "譲" ? "offer" : "want";
        const cards = g.rows.slice(offset, offset + l.capacity).map((c) => ({
          ...c,
          quantity: Math.max(0, Number(host.quantity(c.kind, c.id)) || 0),
          priority: level(c.kind, c.id, side) === 2,
        }));
        const sheet = {
          side,
          cards,
          number: n,
          page: numbers[g.side].length,
          pages: Math.ceil(g.rows.length / l.capacity),
          total: count,
        };
        exportSheets.push(sheet);
        sheets.push(
          `<p class="trade-shot-caption">${g.side} ${sheet.page}枚目の内容（画像${n}枚目）</p><section class="trade-sheet" style="--trade-cols:${l.cols};--trade-row-height:${l.rowHeight}px;--trade-image-height:${l.imageHeight}px"><div class="trade-sheet-heading"><strong>${g.side}</strong><span>${esc(title())}</span><small>${n} / ${count}</small></div><div class="trade-sheet-grid">${g.rows
            .slice(offset, offset + l.capacity)
            .map(
              (c) =>
                `<article class="${level(c.kind, c.id, g.side === "譲" ? "offer" : "want") === 2 ? "is-priority" : ""}">${image(c)}<span>${esc(c.code || "コード記載なし")}</span></article>`,
            )
            .join("")}</div></section>`,
        );
      }
    $("trade-output-count").innerHTML =
      `<span><strong>譲</strong> ${offer.length}件</span><span><strong>求</strong> ${want.length}件</span>`;
    const overflow = count >= 4;
    $("trade-overflow").textContent = overflow
      ? `譲・求合わせて${count}画像になります。共有先の添付枚数をご確認ください。すべての画像を出力できます。`
      : "";
    $("trade-sheets").innerHTML =
      sheets.join("") ||
      '<p class="trade-empty">譲・求の登録がありません。モーダルから登録してください。</p>';
    $("trade-export-buttons").innerHTML = ["offer", "want"]
      .map((side) => {
        const rows = exportSheets
          .map((sheet, index) => ({ sheet, index }))
          .filter((r) => r.sheet.side === side);
        return `<div class="trade-export-group" data-side="${side}"><h3>${side === "offer" ? "譲れるカード" : "欲しいカード"}<small>${rows.length}画像</small></h3><div>${rows.length ? rows.map(({ sheet, index }) => `<button type="button" data-trade-export="${index}"><span>${sheet.page}枚目を出力</span><small>画像${sheet.number}枚目 · ${sheet.cards.length}枚</small></button>`).join("") : "<p>登録なし</p>"}</div></div>`;
      })
      .join("");
    $("trade-export-status").textContent = "";
    imageQueue.clear();
    for (const image of $("trade-sheets").querySelectorAll(
      ".trade-shot-image>img",
    ))
      if (image.complete) queueShotImage(image);
    const refs = (side) =>
      numbers[side].length
        ? "画像" + numbers[side].join("、") + "枚目"
        : "登録なし";
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
                  level(c.kind, c.id, g.side === "譲" ? "offer" : "want") === 2
                    ? "【優先】"
                    : "",
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
    if (window.CARD_TRADE_IMAGE)
      return Promise.resolve(window.CARD_TRADE_IMAGE);
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
    const version = outputVersion,
      user = uid(),
      g = generation;
    const current = () =>
      version === outputVersion &&
      user === uid() &&
      g === generation &&
      !panel.hidden &&
      !host.maintenance();
    const heading = title().replace(
      "アイカツアンコール",
      "アイカツ！アンコール",
    );
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
            $("trade-export-status").textContent =
              `画像を準備しています… ${done} / ${total}`;
        },
        current,
      );
      if (!current()) return;
      exporter.show(
        blob,
        `${heading}_${sheet.side === "offer" ? "譲" : "求"}_${sheet.page}.jpg`,
        `${sheet.side === "offer" ? "譲" : "求"} ${sheet.page}枚目（画像${sheet.number}枚目）`,
      );
      $("trade-export-status").textContent =
        "画像を作成しました。「画像を保存」から保存できます。";
    } catch (error) {
      if (current()) {
        $("trade-export-status").textContent =
          error.message ||
          "画像を作成できませんでした。もう一度お試しください。";
        host.toast("画像を作成できませんでした", "error");
      }
    } finally {
      if (current())
        buttons.forEach((b) => {
          b.disabled = false;
        });
    }
  }
  async function open() {
    if (!uid() || host.maintenance()) return;
    origin = {
      kind: host.isVerse() ? "coordinate" : "card",
      game: host.game(),
      family: host.family(),
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
        $("trade-load-status").textContent = error.message;
    }
  }
  function exportText(id) {
    return (
      $(id).value.trimEnd() + "\n\nhttps://iprimaker.github.io/card-management"
    );
  }
  async function copy(id) {
    let temporary;
    const previous = document.activeElement;
    try {
      const text = exportText(id);
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(text);
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
      window.CARD_VERSE.open(origin.family === "ひみつ" ? "himitsu" : "onegai");
    else host.back();
  };
  $("trade-query").oninput = renderOutput;
  $("trade-method").oninput = () => {
    for (const id of ["trade-post", "trade-text"]) {
      $(id).value = $(id).value.replace(
        /交換方法　[^\n]*/,
        () =>
          "交換方法　" +
          ($("trade-method").value.trim() || "（記載してください）"),
      );
    }
  };
  for (const id of ["trade-series", "trade-rarity", "trade-group"])
    $(id).onchange = renderOutput;
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
  let resizeTimer;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderOutput, 100);
    },
    { passive: true },
  );
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
            node.nodeType === 1 &&
            (node.matches("article") || node.querySelector("article")),
        ),
      )
    )
      patchBadges();
  });
  badgeObserver.observe($("collection"), { childList: true, subtree: true });
  if ($("verse-cards"))
    badgeObserver.observe($("verse-cards"), { childList: true, subtree: true });
  sync();
  host.changed();
})();
