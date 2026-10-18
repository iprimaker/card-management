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
      b.setAttribute(
        "aria-checked",
        String(scopes.includes(b.dataset.shareScope)),
      );
      b.disabled = !settingsLoaded || busy;
      const state = dialog.querySelector(
        `[data-share-state="${b.dataset.shareScope}"]`,
      );
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
    dialog
      .querySelectorAll("[data-share-details], [data-share-series-all]")
      .forEach((b) => {
        b.disabled = !settingsLoaded || busy;
      });
    $("share-issue").hidden = hasLink;
    $("share-issue").disabled = busy || mutations.length > 0 || !scopes.length;
    $("share-restore-area").hidden = !hasLink || !!token;
    $("share-restore").disabled = busy;
    $("share-delete").hidden = !hasLink;
    $("share-delete").disabled = busy || mutations.length > 0;
    $("share-send").disabled =
      busy ||
      mutations.length > 0 ||
      sharing ||
      !rates ||
      !token ||
      !scopes.length;
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
      if (revision !== rateGeneration || g !== generation || uid !== current())
        return;
      if (scopes.some((scope) => !Number.isFinite(Number(result[scope]))))
        throw Error("所持率を確認できませんでした。");
      rates = result;
    } catch (error) {
      if (revision === rateGeneration && g === generation && uid === current())
        $("share-settings-status").textContent =
          error.message ||
          "所持率を確認できませんでした。画面を開き直してください。";
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
        .map(
          (scope) =>
            shortLabels[scope] + "：" + Number(rates[scope]).toFixed(1) + "%",
        ),
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
        if (g === generation && uid === current())
          host.toast("共有用文章をコピーしました");
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
      data.series_filters && typeof data.series_filters === "object"
        ? data.series_filters
        : {};
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
      if (r.error)
        throw Error("保存できませんでした。通信状態をご確認ください。");
      onSuccess(r.data);
    } catch (error) {
      if (g === generation && user === current()) {
        $("share-settings-status").textContent = error.message;
        if (deleteDialog.open) deleteStatus.textContent = error.message;
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
    $("share-settings-close").focus({ preventScroll: true });
    $("share-settings-status").textContent = "公開設定を確認中…";
    await run("card_album_share_settings", {}, (data) => {
      if (!Array.isArray(data?.scopes))
        throw Error("公開設定用SQLをご確認ください。");
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
    if (
      !settingsLoaded ||
      busy ||
      !current() ||
      current() !== owner ||
      host.maintenance()
    ) {
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
            change.kind === "scope"
              ? "card_album_share_set_scope"
              : "card_album_share_set_series",
            change.kind === "scope"
              ? { p_scope: change.scope, p_enabled: change.value }
              : { p_scope: change.scope, p_series: change.value },
          );
        if (g !== generation || uid !== current()) return;
        if (result.error || !Array.isArray(result.data?.scopes)) throw Error();
        if (
          change.kind === "scope" &&
          result.data.scopes.includes(change.scope) !== change.value
        )
          throw Error("公開状態を確認できませんでした。");
        let data = result.data;
        if (
          change.kind === "series" &&
          !Object.prototype.hasOwnProperty.call(data, "series_filters")
        ) {
          const check = await host
            .client()
            .rpc("card_album_share_settings", {});
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
                JSON.stringify([...stored].sort()) !==
                  JSON.stringify([...change.value].sort())
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
        .sort((a, b) => b.localeCompare(a, "ja", { numeric: true }));
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
            document.createTextNode(value.replaceAll("弾", "だん")),
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
      if (g === generation && uid === current())
        panel.removeAttribute("aria-busy");
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
      Array.isArray(seriesFilters[scope])
        ? seriesFilters[scope]
        : seriesOptions.get(scope) || [],
    );
    if (input.checked) selected.add(input.value);
    else selected.delete(input.value);
    queueChange({ kind: "series", scope, value: [...selected] });
  });
  $("share-issue").onclick = () => {
    if (hasLink || !scopes.length) return;
    run("card_album_share_issue", {}, (data) => {
      if (!/^[0-9a-f]{64}$/.test(data?.token || ""))
        throw Error("URLを発行できませんでした。");
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
      if (url.origin !== base.origin || url.pathname !== base.pathname)
        throw Error();
      previous = url.hash.slice(1);
      if (!/^[0-9a-f]{64}$/.test(previous)) throw Error();
    } catch {
      $("share-settings-status").textContent =
        "以前の共有URLを貼り付けてください。";
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
    $("share-delete-cancel").focus({ preventScroll: true });
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
    if (dialog.open && hasLink && current() === owner)
      $("share-delete").focus({ preventScroll: true });
  });
  dialog.addEventListener("close", () => {
    if (deleteDialog.open) deleteDialog.close();
  });
  $("share-delete-yes").onclick = () =>
    run("card_album_share_delete", {}, () => {
      token = null;
      hasLink = false;
      deleteDialog.close();
      $("share-settings-status").textContent =
        "共有URLを削除しました。以前のURLは使用できません。";
    });
  $("share-link-copy").onclick = async () => {
    if (!current() || current() !== owner || !token) return;
    try {
      await navigator.clipboard.writeText($("share-link-value").value);
      host.toast("URLをコピーしました");
    } catch {
      $("share-link-value").focus();
      $("share-link-value").select();
      $("share-settings-status").textContent =
        "URLを選択してコピーしてください。";
    }
  };
  $("share-settings-close").onclick = () => dialog.close();
  $("ownership-export-open").onclick = open;
  window.CARD_SHARE = { sync, reset };
})();
