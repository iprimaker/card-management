(() => {
  "use strict";
  const assetBase = new URL(".", document.currentScript.src);
  let libraries;
  function ensureLibraries() {
    if (libraries) return libraries;
    return (libraries = (async () => {
      for (const name of ["qr-encoder.js", "qr-utf8.js", "qr-reader.js"])
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = new URL("vendor/" + name, assetBase);
          s.onload = resolve;
          s.onerror = reject;
          document.head.append(s);
        });
    })().catch((e) => {
      libraries = null;
      throw e;
    }));
  }
  const host = () => window.CARD_VERSE_HOST,
    db = () => host()?.client(),
    uid = () => host()?.session()?.user?.id;
  const filters = { card: "all", coordinate: "all" };
  let owner = null,
    rows = new Map(),
    loading = null,
    stream = null,
    scanToken = 0,
    targets = [],
    current = 0;
  const key = (t) => t.kind + ":" + t.id;
  const icon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6zM12 3v3M3 12h6M12 9v6M18 12h3M12 18v3"/></svg>';

  const dialog = document.createElement("dialog");
  dialog.className = "private-qr-dialog";
  dialog.setAttribute("aria-label", "QRコード");
  dialog.innerHTML =
    '<button class="qr-close" aria-label="閉じる">×</button><div data-content></div>';
  document.body.append(dialog);
  const content = dialog.querySelector("[data-content]");
  const captureFooter = document.createElement("div");
  captureFooter.className = "qr-capture-footer";
  dialog.append(captureFooter);
  dialog.querySelector(".qr-close").onclick = () => dialog.close();
  function stop() {
    scanToken++;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  dialog.addEventListener("close", () => { stop(); captureFooter.replaceChildren(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && stream) dialog.close();
  });
  function sync() {
    mountFilters();
    for (const b of document.querySelectorAll("[data-private-qr]")) {
      let t;
      try {
        t = JSON.parse(b.dataset.privateQr);
      } catch {
        continue;
      }
      const yes = owner === uid() && rows.has(key(t));
      b.classList.toggle("is-registered", yes);
      b.setAttribute("aria-label", yes ? "QRコードを表示" : "QRコードを登録");
      b.title = yes ? "QRコードを表示" : "QRコードを登録";
      b.hidden = !uid();
    }
  }
  async function load() {
    const u = uid();
    if (u !== owner) {
      owner = u;
      rows.clear();
      filters.card = filters.coordinate = "all";
    }
    sync();
    if (!u) return;
    if (loading) return loading;
    loading = (async () => {
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const r = await db()
          .from("card_private_qr")
          .select("kind,target_id,payload")
          .eq("user_id", u)
          .range(offset, offset + 499);
        if (r.error) throw r.error;
        all.push(...r.data);
        if (r.data.length < 500) break;
      }
      if (uid() !== u) return;
      rows = new Map(all.map((r) => [r.kind + ":" + r.target_id, r.payload]));
      sync();
      document.dispatchEvent(new Event("private-qr-changed"));
    })().finally(() => (loading = null));
    return loading;
  }
  function button(kind, id, name, group = []) {
    const t = { kind, id: String(id), name, group };
    const b = document.createElement("button");
    b.type = "button";
    b.className = "private-qr-button";
    b.dataset.privateQr = JSON.stringify(t);
    b.innerHTML = icon;
    b.setAttribute("aria-label", "QRコードを登録");
    return b.outerHTML;
  }
  function message(s) {
    content.replaceChildren();
    const p = document.createElement("p");
    p.setAttribute("role", "status");
    p.textContent = s;
    content.append(p);
  }
  function err(e) {
    return /上限/.test(e?.message || "")
      ? "QRコードの登録上限に達しました。不要なQRコードを削除してください。"
      : /ログイン/.test(e?.message || "")
        ? "ログインしてからお試しください。"
        : "QRコードの操作を完了できませんでした。通信状態を確認してお試しください。";
  }
  function show(t) {
    targets =
      t.kind === "part" ? (t.group || []).filter((x) => rows.has(key(x))) : [t];
    if (!targets.length) targets = [t];
    current = Math.max(
      0,
      targets.findIndex((x) => key(x) === key(t)),
    );
    draw();
  }
  function draw() {
    const t = targets[current],
      payload = rows.get(key(t));
    if (!payload) {
      dialog.close();
      return;
    }
    content.innerHTML =
      '<div data-code></div><p data-name></p><div class="qr-navigation"><button data-prev aria-label="前のQR">‹</button><span data-position></span><button data-next aria-label="次のQR">›</button></div><button data-delete>QRコードを削除</button><p role="status"></p>';
    const code = content.querySelector("[data-code]");
    try {
      const q = qrcode(0, "M");
      q.addData(payload, "Byte");
      q.make();
      code.innerHTML = q.createSvgTag({
        cellSize: 6,
        margin: 24,
        scalable: true,
      });
      code.querySelector("svg")?.setAttribute("aria-label", "登録したQRコード");
    } catch {
      code.textContent =
        "このQR情報は表示できません。削除して再登録してください。";
    }
    content.querySelector("[data-name]").textContent = t.name;
    content.querySelector("[data-position]").textContent =
      current + 1 + " / " + targets.length;
    content.querySelector(".qr-navigation").hidden = targets.length < 2;
    const move = (d) => {
      current = (current + d + targets.length) % targets.length;
      draw();
    };
    content.querySelector("[data-prev]").onclick = () => move(-1);
    content.querySelector("[data-next]").onclick = () => move(1);
    let x;
    code.addEventListener("touchstart", (e) => (x = e.touches[0].clientX), {
      passive: true,
    });
    code.addEventListener(
      "touchend",
      (e) => {
        const d = e.changedTouches[0].clientX - x;
        if (Math.abs(d) > 50 && targets.length > 1) move(d < 0 ? 1 : -1);
      },
      { passive: true },
    );
    content.querySelector("[data-delete]").onclick = async (e) => {
      e.target.disabled = true;
      try {
        const r = await db().rpc("card_qr_delete", {
          p_kind: t.kind,
          p_target: t.id,
        });
        if (r.error) throw r.error;
        rows.delete(key(t));
        sync();
        document.dispatchEvent(new Event("private-qr-changed"));
        targets = targets.filter((x) => key(x) !== key(t));
        if (!targets.length) dialog.close();
        else {
          current = Math.min(current, targets.length - 1);
          draw();
        }
      } catch (error) {
        content.querySelector("[role=status]").textContent = err(error);
        e.target.disabled = false;
      }
    };
  }
  async function scan(t, onRead) {
    const u = uid(), token = ++scanToken;
    if (!u || !dialog.open) return;
    const status = await db().rpc("card_qr_status");
    if (uid() !== u || token !== scanToken || !dialog.open) return;
    if (status.error) throw status.error;
    if (status.data?.limit !== null && status.data.count >= status.data.limit) {
      message(
        "QRコードの登録上限に達しました。不要なQRコードを削除してください。",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      message(
        "カメラを使用できません。HTTPSで開き、カメラに対応したブラウザでお試しください。",
      );
      return;
    }
    content.innerHTML =
      '<p>QRコードを枠内に映してください</p><div class="qr-camera-frame"><video autoplay playsinline muted></video><span class="qr-camera-guide" aria-hidden="true"></span></div><p role="status"></p>';
    const video = content.querySelector("video");
    try {
      const incoming = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (uid() !== u || token !== scanToken || !dialog.open) {
        incoming.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = incoming;
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas"),
        ctx = canvas.getContext("2d", { willReadFrequently: true });
      let last = 0;
      const tick = async (time) => {
        if (token !== scanToken || !dialog.open) return;
        if (time - last < 160 || !video.videoWidth) {
          requestAnimationFrame(tick);
          return;
        }
        last = time;
        const scale = Math.min(1, 960 / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height),
          result = jsQR(pixels.data, canvas.width, canvas.height, {
            inversionAttempts: "attemptBoth",
          });
        if (result?.data) {
          captureFooter.replaceChildren();
          stop();
          message("QRコードを保存しています…");
          try {
            if (uid() !== u) throw Error("ログイン");
            if (onRead) {
              await onRead(result.data);
              if (uid() === u) dialog.close();
              return;
            }
            const r = await db().rpc("card_qr_save", {
              p_kind: t.kind,
              p_target: t.id,
              p_payload: result.data,
            });
            if (r.error) throw r.error;
            if (uid() !== u) return;
            rows.set(key(t), result.data);
            sync();
            document.dispatchEvent(new Event("private-qr-changed"));
            show(t);
          } catch (e) {
            message(err(e));
          }
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      if (uid() !== u || token !== scanToken || !dialog.open) return;
      stop();
      message(
        e?.name === "NotAllowedError"
          ? "カメラの使用が許可されていません。ブラウザの設定をご確認ください。"
          : "カメラを起動できませんでした。他のアプリのカメラを閉じてお試しください。",
      );
    }
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-private-qr]");
    if (!b) return;
    e.preventDefault();
    if (!uid()) return;
    const t = JSON.parse(b.dataset.privateQr);
    dialog.showModal();
    message("確認しています…");
    try {
      await ensureLibraries();
      await load();
      if (rows.has(key(t))) show(t);
      else await scan(t);
    } catch (error) {
      message(err(error));
    }
  });
  new MutationObserver(sync).observe(document.body, {
    childList: true,
    subtree: true,
  });
  setInterval(() => {
    if (owner !== uid()) {
      stop();
      if (dialog.open) dialog.close();
      load().catch(() => {});
    }
  }, 1000);
  function matches(kind, id, parts = []) {
    if (!uid() || filters[kind] === "all") return true;
    const yes =
      owner === uid() &&
      (rows.has(kind + ":" + id) ||
        (kind === "coordinate" && parts.some((p) => rows.has("part:" + p))));
    return filters[kind] === "yes" ? yes : !yes;
  }
  function mountFilters() {
    for (const [kind, selector] of [
      ["card", "#filters"],
      ["coordinate", "#verse .verse-filter-grid"],
    ]) {
      for (const root of document.querySelectorAll(selector)) {
        let select = root.querySelector('[data-qr-filter="' + kind + '"]');
        let label = select?.closest("label");
        if (!select) {
          label = document.createElement("label");
          label.innerHTML =
            '<span class="filter-label">QRコード<button type="button" class="filter-clear" data-qr-clear="' +
            kind +
            '">解除</button></span><select data-qr-filter="' +
            kind +
            '"><option value="all">すべて</option><option value="yes">QR登録済み</option><option value="no">QR未登録</option></select>';
          select = label.querySelector("select");
          if (kind === "coordinate") label.id = "verse-qr-filter";
          root.append(label);
        }
        if (!label) continue;
        if (!select.id)
          select.id =
            kind === "coordinate" ? "verse-qr-select" : "card-qr-select";
        if(label.htmlFor !== select.id) label.htmlFor = select.id;
        const hidden = !uid();
        if (label.hidden !== hidden) label.hidden = hidden;
        if(select.disabled !== hidden) select.disabled = hidden;
        if(select.value !== filters[kind]) select.value = filters[kind];
        select.onchange = () => {
          if (!uid()) return;
          filters[kind] = select.value;
          document.dispatchEvent(new Event("private-qr-changed"));
        };
        const clear = label.querySelector("[data-qr-clear],.filter-clear");
        if (clear) {
          const disabled=hidden || filters[kind] === "all";
          if(clear.disabled !== disabled) clear.disabled = disabled;
          clear.onclick = () => {
            filters[kind] = "all";
            select.value = "all";
            document.dispatchEvent(new Event("private-qr-changed"));
          };
        }
      }
    }
  }
  document.addEventListener(
    "click",
    (e) => {
      if (e.target.closest("#reset")) {
        filters.card = "all";
        for (const s of document.querySelectorAll("[data-qr-filter=card]"))
          s.value = "all";
        document.dispatchEvent(new Event("private-qr-changed"));
      }
    },
    true,
  );
  let remainingRequest = 0;
  const manager = document.createElement("dialog");
  manager.className = "qr-manager-dialog";
  manager.setAttribute("aria-labelledby", "qr-manager-title");
  manager.innerHTML =
    '<div class="qr-manager-heading"><h2 id="qr-manager-title">登録済みQRコード</h2><button type="button" data-close aria-label="閉じる">×</button></div><div class="qr-manager-filters" role="group" aria-label="タグで絞り込み"></div><p data-status role="status" aria-live="polite"></p><div data-entries></div><div class="qr-manager-footer"><button type="button" data-delete-all disabled>一括削除（セーブ・フレカを除く）</button><p>カード・コーデ・パーツのQRコードを削除します。</p><details class="qr-limit-help"><summary>QRコードの登録上限を増やすには</summary><p>アルバムを継続してご利用いただいている方など、アルバムの利用状況に応じて登録上限を増やす場合があります。利用状況が高いほど上限増加の対象となる場合がありますが、自動的な増加をお約束するものではありません。上限を変更した際は、個別のお知らせでご案内します。</p></details></div>';
  document.body.append(manager);
  manager.querySelector("[data-close]").onclick = () => manager.close();
  const confirmation = document.createElement("dialog");
  confirmation.className = "qr-manager-dialog qr-manager-confirm";
  confirmation.setAttribute("aria-labelledby", "qr-manager-confirm-title");
  confirmation.innerHTML =
    '<h2 id="qr-manager-confirm-title">QRコードを削除しますか？</h2><p data-description></p><p>削除後は再度QRコードの登録が必要です。</p><div class="qr-manager-confirm-actions"><button type="button" data-cancel>キャンセル</button><button type="button" data-confirm>削除する</button></div>';
  document.body.append(confirmation);
  let managedRows = [],
    managerOwner = null,
    managerRequest = 0,
    managing = false;
  function confirmRemoval(description) {
    if (confirmation.open) return Promise.resolve(false);
    confirmation.querySelector("[data-description]").textContent = description;
    confirmation.showModal();
    return new Promise((resolve) => {
      let yes = false;
      confirmation.addEventListener("close", () => resolve(yes), {
        once: true,
      });
      confirmation.querySelector("[data-cancel]").onclick = () =>
        confirmation.close();
      confirmation.querySelector("[data-confirm]").onclick = () => {
        yes = true;
        confirmation.close();
      };
    });
  }
  const managerStatus = manager.querySelector("[data-status]");
  async function removeManaged(row) {
    const user = uid();
    if (!user || user !== managerOwner || managing) return false;
    if (!(await confirmRemoval(row.name)) || uid() !== user) return false;
    managing = true;
    try {
      const result =
        row.kind === "save"
          ? await db().rpc("card_save_code_delete", { p_id: row.target_id })
          : await db().rpc("card_qr_delete", {
              p_kind: row.kind,
              p_target: row.target_id,
            });
      if (result.error) throw result.error;
      if (uid() !== user) return false;
      await load();
      await reloadManager();
      return true;
    } finally {
      managing = false;
    }
  }
  let managerFilter = "all";
  function tagKey(row) {
    if (row.kind === "save")
      return row.series === "friend"
        ? "friend"
        : row.series === "aikatsu"
          ? "aikatsu-save"
          : "aipri-save";
    const family =
      row.series === "おねがい"
        ? "onegai"
        : row.series === "ひみつ"
          ? "himitsu"
          : row.series;
    return row.kind === "coordinate" || row.kind === "part"
      ? family + "-verse"
      : family;
  }
  const tagLabels = {
    aikatsu: "アイカツ",
    onegai: "おねがい",
    himitsu: "ひみつ",
    aipri: "アイプリ",
    "onegai-verse": "おねがいV",
    "himitsu-verse": "ひみつV",
    "aipri-verse": "アイプリV",
    "aikatsu-save": "アイカツセーブ",
    "aipri-save": "アイプリセーブ",
    friend: "フレカ",
  };
  function renderManager() {
    const root = manager.querySelector("[data-entries]");
    root.replaceChildren();
    const available = [...new Set(managedRows.map(tagKey))];
    if (managerFilter !== "all" && !available.includes(managerFilter))
      managerFilter = "all";
    const filterRoot = manager.querySelector(".qr-manager-filters");
    filterRoot.replaceChildren();
    for (const value of ["all", ...available]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent =
        value === "all" ? "すべて" : tagLabels[value] || "未取得";
      button.dataset.qrTagFilter = value;
      button.setAttribute("aria-pressed", String(value === managerFilter));
      button.onclick = () => {
        managerFilter = value;
        renderManager();
      };
      filterRoot.append(button);
    }
    const visibleRows = managedRows.filter(
      (row) => managerFilter === "all" || tagKey(row) === managerFilter,
    );
    for (const row of visibleRows) {
      const item = document.createElement("div");
      item.className = "qr-manager-row";
      const text = document.createElement("span");
      text.textContent = row.name;
      const qr = document.createElement("button");
      qr.type = "button";
      qr.className = "private-qr-button is-registered";
      qr.innerHTML = icon;
      qr.setAttribute("aria-label", row.name + "のQRコードを表示");
      qr.onclick = () => {
        if (uid() !== managerOwner || managing) return;
        display(row.payload, row.name, () => removeManaged(row));
      };
      const del = document.createElement("button");
      del.type = "button";
      del.className = "qr-manager-delete";
      del.textContent = "削除";
      del.setAttribute("aria-label", row.name + "のQRコードを削除");
      del.onclick = async () => {
        del.disabled = true;
        try {
          await removeManaged(row);
        } catch (e) {
          if (uid() === managerOwner) managerStatus.textContent = err(e);
        } finally {
          del.disabled = false;
        }
      };
      const tag = document.createElement("small");
      tag.className = "qr-manager-tag";
      const series = tagKey(row);
      tag.textContent = tagLabels[series] || "シリーズ未取得";
      tag.dataset.series = series;
      const label = document.createElement("div");
      label.className = "qr-manager-label";
      label.append(tag, text);
      item.append(label, qr, del);
      root.append(item);
    }
    if (!visibleRows.length) {
      const empty = document.createElement("p");
      empty.className = "qr-manager-empty";
      empty.textContent = "QRコードはまだ登録されていません。";
      root.append(empty);
    }
    manager.querySelector("[data-delete-all]").disabled = !managedRows.some(
      (r) => r.kind !== "save",
    );
  }
  async function reloadManager() {
    const user = uid(),
      request = ++managerRequest;
    if (!user || !manager.open) return;
    managerStatus.textContent = "読み込んでいます…";
    manager.querySelector("[data-delete-all]").disabled = true;
    try {
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const r = await db().rpc("card_qr_registered_list", {
          p_offset: offset,
        });
        if (r.error || !Array.isArray(r.data)) throw r.error || Error();
        all.push(...r.data);
        if (uid() !== user || request !== managerRequest || !manager.open)
          return;
        if (r.data.length < 500) break;
      }
      if (uid() !== user || request !== managerRequest || !manager.open) return;
      managerOwner = user;
      managedRows = all.map((row) => {
        if (row.kind !== "card" || !window.CARD_VISIBILITY?.mask) return row;
        const masked = window.CARD_VISIBILITY.mask([
          { id: row.target_id, name: row.name },
        ])[0];
        return { ...row, name: masked?.name || "カード（非公開）" };
      });
      renderManager();
      managerStatus.textContent = "";
    } catch (e) {
      if (uid() === user && request === managerRequest) {
        managedRows = [];
        managerOwner = null;
        manager.querySelector("[data-entries]").replaceChildren();
        managerStatus.textContent = err(e);
      }
    }
  }
  manager.addEventListener("close", () => {
    managerRequest++;
    managerFilter = "all";
    managedRows = [];
    managerOwner = null;
    manager.querySelector("[data-entries]").replaceChildren();
  });
  manager.querySelector("[data-delete-all]").onclick = async (event) => {
    const user = uid();
    if (!user || user !== managerOwner || managing) return;
    if (
      !(await confirmRemoval(
        "セーブコード・フレカを除く、すべての登録済みQRコードを削除します。絞り込みに関係なく削除します。所持記録・セーブコード・フレカは残ります。",
      )) ||
      uid() !== user
    )
      return;
    managing = true;
    event.target.disabled = true;
    try {
      const result = await db().rpc("card_qr_delete_all");
      if (result.error) throw result.error;
      if (uid() !== user) return;
      await load();
      await reloadManager();
      managerStatus.textContent =
        "セーブコード・フレカを除くQRコードを削除しました。";
    } catch (e) {
      if (uid() === user) managerStatus.textContent = err(e);
    } finally {
      managing = false;
      if (uid() === managerOwner) renderManager();
    }
  };
  function mountRemaining() {
    const settings = document.getElementById("display-settings-dialog");
    if (!settings || settings.querySelector("[data-qr-remaining]")) return;
    const account = settings.querySelector(".display-account-actions");
    if (!account) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.qrRemaining = "";
    button.className = "qr-remaining-row";
    button.setAttribute("aria-haspopup", "dialog");
    button.textContent = "QRコード登録残高　確認中…";
    button.onclick = () => {
      if (!uid()) return;
      manager.showModal();
      reloadManager();
    };
    account.prepend(button);
    if (settings.open) refreshRemaining();
  }
  async function refreshRemaining() {
    const settings = document.getElementById("display-settings-dialog"),
      p = settings?.querySelector("[data-qr-remaining]");
    if (!p || !settings.open) return;
    const user = uid(),
      request = ++remainingRequest;
    p.disabled = !user;
    if (!user) {
      p.textContent = "QRコード登録残高　ログインしてください";
      return;
    }
    p.textContent = "QRコード登録残高　確認中…";
    try {
      const result = await db().rpc("card_qr_status");
      if (request !== remainingRequest || user !== uid()) return;
      if (
        result.error ||
        !result.data ||
        !Number.isFinite(result.data.save_count)
      )
        throw Error();
      const n = (value) => Number(value).toLocaleString("ja-JP");
      const balance =
        result.data.limit === null
          ? "上限なし"
          : n(Math.max(0, result.data.limit - result.data.count)) + "件";
      p.replaceChildren();
      const primary = document.createElement("span"),
        detail = document.createElement("small");
      primary.textContent = "QRコード登録残高　" + balance;
      detail.textContent =
        "（" +
        n(result.data.count) +
        "件登録中　うち" +
        n(result.data.save_count) +
        "件セーブコード" +
        (result.data.friend_count
          ? "・" + n(result.data.friend_count) + "件フレカ"
          : "") +
        "）";
      p.append(primary, detail);
    } catch {
      if (request === remainingRequest && user === uid())
        p.textContent = "QRコード登録残高　取得できませんでした";
    }
  }
  new MutationObserver((records) => {
    mountRemaining();
    if (
      records.some(
        (r) =>
          r.type === "attributes" && r.target.id === "display-settings-dialog",
      )
    )
      refreshRemaining();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  document.addEventListener("private-qr-changed", () => {
    refreshRemaining();
    if (manager.open) reloadManager();
  });
  let managerUser = uid();
  setInterval(() => {
    if (managerUser === uid()) return;
    managerUser = uid();
    remainingRequest++;
    managerRequest++;
    managerFilter = "all";
    managedRows = [];
    managerOwner = null;
    manager.querySelector("[data-entries]").replaceChildren();
    if (confirmation.open) confirmation.close();
    if (manager.open) manager.close();
    refreshRemaining();
  }, 500);
  mountRemaining();
  function badge(kind, id, parts = []) {
    return uid() &&
      owner === uid() &&
      (rows.has(kind + ":" + id) ||
        (kind === "coordinate" && parts.some((p) => rows.has("part:" + p))))
      ? '<span class="private-qr-tag" aria-label="QR登録済み" title="QR登録済み">' +
          icon +
          "</span>"
      : "";
  }
  function entry(kind) {
    return uid() && filters[kind] !== "all"
      ? {
          key: "qr",
          label: "QRコード",
          value: filters[kind] === "yes" ? "登録済み" : "未登録",
        }
      : null;
  }
  function clear(kind) {
    filters[kind] = "all";
    for (const select of document.querySelectorAll(
      '[data-qr-filter="' + kind + '"]',
    ))
      select.value = "all";
  }
  async function capture(onRead, options = {}) {
    const user = uid();
    if (!user) throw Error("ログインしてください");
    dialog.showModal();
    message("カメラを準備しています…");
    const operation = ++scanToken;
    captureFooter.replaceChildren();
    if (options.allowManualURL === true) {
      const fallback = document.createElement("button");
      fallback.type = "button";
      fallback.className = "qr-manual-link";
      fallback.textContent = "読み取れない場合はこちら";
      captureFooter.append(fallback);
      fallback.onclick = () => {
        if (uid() !== user || !dialog.open) return;
        stop();
        captureFooter.replaceChildren();
        content.innerHTML = '<h2>URLを直接入力</h2><p>QRコードに含まれるURLを入力してください。</p><form class="qr-manual-form"><label>URL<textarea name="url" rows="3" maxlength="2048" required inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://"></textarea></label><p role="status" aria-live="polite"></p><button type="submit">登録する</button></form>';
        const form = content.querySelector("form"), input = form.elements.url;
        let saving = false;
        form.onsubmit = async (event) => {
          event.preventDefault();
          if (saving || uid() !== user || !dialog.open) return;
          const payload = input.value.trim(), status = form.querySelector('[role="status"]');
          try {
            const url = new URL(payload);
            if (!/^https?:$/.test(url.protocol) || !url.hostname || /[\s\u0000-\u001f\u007f]/.test(payload) || payload.length > 2048) throw Error();
          } catch {
            status.textContent = "http:// または https:// で始まるURLを入力してください。";
            input.focus();
            return;
          }
          saving = true;
          const button = form.querySelector('[type="submit"]');
          button.disabled = true;
          status.textContent = "登録しています…";
          try {
            await onRead(payload);
            if (uid() === user && dialog.open) dialog.close();
          } catch (error) {
            if (uid() === user && dialog.open && form.isConnected) status.textContent = err(error);
          } finally {
            saving = false;
            button.disabled = false;
          }
        };
        input.focus();
      };
    }
    const closed = new Promise((resolve) =>
      dialog.addEventListener("close", resolve, { once: true }),
    );
    const prepare = (async () => {
    try {
      await load();
      if (uid() === user && operation === scanToken && dialog.open) {
        await ensureLibraries();
        if (uid() === user && operation === scanToken && dialog.open) await scan(null, onRead);
      }
    } catch (e) {
      if (uid() === user && (scanToken === operation || scanToken === operation + 1) && dialog.open) message(err(e));
    }
    })();
    await Promise.race([prepare, closed]);
    await closed;
  }
  async function display(payload, title, onDelete) {
    const user = uid();
    if (!user) return;
    dialog.showModal();
    message("QRコードを準備しています…");
    try {
      await load();
      await ensureLibraries();
      if (uid() !== user || !dialog.open) return;
      content.innerHTML = "<div data-code></div><p data-name></p>";
      const q = qrcode(0, "M");
      q.addData(payload, "Byte");
      q.make();
      content.querySelector("[data-code]").innerHTML = q.createSvgTag({
        cellSize: 6,
        margin: 24,
        scalable: true,
      });
      content.querySelector("[data-name]").textContent = title;
      if (onDelete) {
        const b = document.createElement("button");
        b.dataset.delete = "";
        b.textContent = "削除";
        b.onclick = async () => {
          b.disabled = true;
          try {
            const removed = await onDelete();
            if (removed !== false) dialog.close();
            else b.disabled = false;
          } catch (e) {
            message(err(e));
          }
        };
        content.append(b);
      }
    } catch (e) {
      message(err(e));
    }
  }
  window.CARD_QR = {
    button,
    load,
    sync,
    matches,
    mountFilters,
    badge,
    entry,
    clear,
    capture,
    display,
    icon,
  };
})();

// 個別上限の変更通知：公開お知らせと分けて本人分だけ取得。
(() => {
  let owner = null,
    token = 0,
    loading = false,
    last = 0;
  const host = () => window.CARD_VERSE_HOST;
  async function refresh(force = false) {
    const user = host()?.session()?.user?.id;
    let box = document.getElementById("album-qr-limit-notices");
    if (user !== owner) {
      owner = user;
      token++;
      loading = false;
      last = 0;
      box?.replaceChildren();
      if (box) box.dataset.noticeOwner = user || "";
    }
    if (
      !user ||
      host()?.maintenance() ||
      document.getElementById("selection")?.hidden
    )
      return;
    const anchor = document.getElementById("album-contact-replies");
    if (!anchor) return;
    if (!box) {
      box = document.createElement("div");
      box.id = "album-qr-limit-notices";
      box.dataset.noticeOwner = user;
      anchor.before(box);
    }
    if (loading || (!force && Date.now() - last < 60000)) return;
    loading = true;
    const request = ++token;
    try {
      const all = [];
      for (let offset = 0; ; offset += 100) {
        const r = await host()
          .client()
          .from("card_qr_limit_notices")
          .select("id,title,body,created_at")
          .eq("recipient_id", user)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 99);
        if (request !== token || user !== host()?.session()?.user?.id) return;
        if (r.error) throw r.error;
        all.push(...r.data);
        if (r.data.length < 100) break;
      }
      box.replaceChildren();
      for (const row of all) {
        const item = document.createElement("details");
        item.className = "album-news-item";
        const summary = document.createElement("summary"),
          time = document.createElement("time"),
          title = document.createElement("span"),
          body = document.createElement("p");
        time.dateTime = row.created_at;
        time.textContent = new Date(row.created_at).toLocaleDateString(
          "ja-JP",
          { timeZone: "Asia/Tokyo" },
        );
        const tag = document.createElement("small");
        tag.className = "contact-reply-tag qr-limit-notice-tag";
        tag.textContent = "通知";
        title.append(tag, document.createTextNode(row.title));
        body.textContent = row.body;
        body.style.whiteSpace = "pre-wrap";
        const arrow = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        arrow.setAttribute("viewBox", "0 0 20 20");
        arrow.setAttribute("aria-hidden", "true");
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        path.setAttribute("d", "m6 8 4 4 4-4");
        arrow.append(path);
        summary.append(time, title, arrow);
        item.append(summary, body);
        box.append(item);
      }
      last = Date.now();
    } catch {
      if (request === token && !box.children.length) {
        box.textContent =
          "個別のお知らせを読み込めませんでした。時間をおいて再度お試しください。";
      }
    } finally {
      if (request === token) loading = false;
    }
  }
  setInterval(() => refresh(), 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh(true);
  });
})();

// お知らせ・返信・個別通知を合わせて、最新5件だけを初期表示する。
(() => {
  let owner,
    expanded = false,
    scheduled = false,
    section = null,
    output = null;
  const user = () => window.CARD_VERSE_HOST?.session()?.user?.id;
  const sources = () =>
    ["album-qr-limit-notices", "album-contact-replies", "album-notices"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
  function loaders() {
    return sources()
      .filter((source) => source.id === "album-notices" || source.dataset.noticeOwner === user())
      .flatMap((source) => [
        ...source.querySelectorAll("button.album-news-history"),
      ])
      .filter(
        (button) =>
          !button.hidden &&
          !button.disabled &&
          (button.hasAttribute("aria-expanded")
            ? button.getAttribute("aria-expanded") === "false"
            : !button.parentElement.hidden),
      );
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      render();
    });
  }
  function render() {
    const current = user();
    if (current !== owner) {
      owner = current;
      expanded = false;
      const list = output?.querySelector("[data-notice-items]");
      if (list) {
        list.replaceChildren();
        delete list.dataset.signature;
      }
    }
    if (output) output.hidden = !current;
    const anchor = document.getElementById("album-notices");
    if (!anchor || !current) return;
    section = anchor.closest(".album-news-box");
    if (!section) return;
    if (!output?.isConnected) {
      output = document.createElement("div");
      output.id = "album-combined-notices";
      const list = document.createElement("div");
      list.dataset.noticeItems = "";
      list.id = "album-combined-notice-history";
      const status = document.createElement("p");
      status.className = "album-news-empty";
      status.dataset.noticeStatus = "";
      status.setAttribute("role", "status");
      const more = document.createElement("button");
      more.type = "button";
      more.className = "album-news-history";
      more.dataset.noticeMore = "";
      more.textContent = "さらに過去の情報を確認する";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "album-news-history";
      toggle.dataset.noticeToggle = "";
      toggle.setAttribute("aria-controls", "album-combined-notice-history");
      for (const button of [more, toggle])
        button.style.cssText =
          "display:block;margin:10px 0 0 auto;padding:4px 0;border:0;background:transparent;color:var(--accent);font:inherit;font-size:11px;line-height:1.6;box-shadow:none";
      more.onclick = () => {
        for (const button of loaders()) button.click();
        schedule();
      };
      toggle.onclick = () => {
        expanded = !expanded;
        if (expanded) {
          const initial = document.querySelector(
            '#album-notices > button[aria-expanded="false"]',
          );
          if (initial && !initial.disabled) initial.click();
        }
        render();
      };
      output.append(list, status, more, toggle);
      section.querySelector("h2").after(output);
    }
    const feeds = sources();
    for (const source of feeds) if (!source.hidden) source.hidden = true;
    const nodes = feeds.filter((source) =>
      source.id === "album-notices" || source.dataset.noticeOwner === current
    ).flatMap((source) => [
      ...source.querySelectorAll(".album-news-item"),
    ]);
    nodes.sort(
      (a, b) =>
        (Date.parse(b.querySelector("time")?.dateTime) || 0) -
        (Date.parse(a.querySelector("time")?.dateTime) || 0),
    );
    const list = output.querySelector("[data-notice-items]");
    const key = (node) =>
      (node.querySelector("time")?.dateTime || "") + "|" + node.textContent;
    const opens = new Set([...list.querySelectorAll("details[open]")].map(key));
    const signature = nodes.map((node) => node.outerHTML).join("");
    if (list.dataset.signature !== signature) {
      list.dataset.signature = signature;
      list.replaceChildren(
        ...nodes.map((node) => {
          const clone = node.cloneNode(true);
          clone.open = opens.has(key(node));
          return clone;
        }),
      );
    }
    [...list.children].forEach((node, index) => {
      node.hidden = index >= 5 && !expanded;
    });
    const remaining = list.children.length > 5 || loaders().length > 0;
    const toggle = output.querySelector("[data-notice-toggle]"),
      more = output.querySelector("[data-notice-more]");
    toggle.hidden = !remaining;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "折りたたむ" : "過去の情報も確認する";
    more.hidden = !expanded || loaders().length === 0;
    const status = output.querySelector("[data-notice-status]");
    const errors = feeds
      .filter((source) => source.id === "album-notices" || source.dataset.noticeOwner === current)
      .flatMap((source) => [...source.querySelectorAll('[role="status"]')])
      .map((node) => node.textContent)
      .filter((text) => /できません|読み込めません/.test(text));
    status.textContent =
      errors.join("\n") || (!nodes.length ? "現在、掲載情報はありません" : "");
    status.hidden = !status.textContent;
  }
  new MutationObserver((records) => {
    if (records.some((record) => !output?.contains(record.target))) schedule();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden", "disabled", "aria-expanded"],
  });
  setInterval(() => {
    if (user() !== owner) schedule();
  }, 500);
  schedule();
})();
