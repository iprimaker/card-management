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
    busy = false,
    generation = 0;
  const dialog = document.createElement("dialog");
  dialog.id = "ownership-share-dialog";
  dialog.className = "ownership-share-dialog";
  dialog.innerHTML = `<button type="button" class="share-close" id="share-settings-close" aria-label="閉じる">×</button><span class="eyebrow">SHARE ALBUM</span><h2>所持状況を共有</h2><p class="share-settings-intro">公開する種類を選択してください。OFFの種類は閲覧できません。</p><div class="share-scope-settings">${Object.entries(
    labels,
  )
    .map(
      ([id, label]) =>
        `<div><span>${label}</span><button type="button" role="switch" aria-checked="false" data-share-scope="${id}" aria-label="${label}を公開"><span aria-hidden="true"></span></button></div>`,
    )
    .join(
      "",
    )}</div><p id="share-settings-status" role="status"></p><button type="button" id="share-issue" class="share-issue">所持状況を公開する</button><p class="share-url-note">URLを発行するたびに、以前のURLは使えなくなります。</p><div id="share-link-area" hidden><label>閲覧用URL<input id="share-link-value" readonly type="text"></label><div class="share-link-actions"><button type="button" id="share-link-copy">URLをコピー</button><a id="share-link-open" target="_blank" rel="noopener noreferrer">閲覧画面を開く</a></div></div>`;
  document.body.append(dialog);
  $("ownership-export-dialog")?.remove();
  $("ownership-export-open").textContent = "所持状況を共有";
  const current = () => host.session()?.user.id || null;
  function update() {
    dialog.querySelectorAll("[data-share-scope]").forEach((b) => {
      b.setAttribute("aria-checked", String(scopes.includes(b.dataset.shareScope)));
      b.disabled = busy;
    });
    $("share-issue").disabled = busy || !scopes.length;
    $("share-issue").textContent = hasLink ? "新しいURLを発行" : "所持状況を公開する";
  }
  function reset() {
    generation++;
    owner = null;
    scopes = [];
    hasLink = false;
    busy = false;
    $("share-link-value").value = "";
    $("share-link-area").hidden = true;
    $("share-link-open").removeAttribute("href");
    if (dialog.open) dialog.close();
  }
  function sync() {
    if (owner && owner !== current()) reset();
  }
  async function open() {
    if (!current() || host.maintenance()) return;
    host.closeMenu();
    reset();
    owner = current();
    const user = owner,
      g = generation;
    busy = true;
    update();
    $("share-settings-status").textContent = "公開設定を確認中…";
    dialog.showModal();
    try {
      const r = await host.client().rpc("card_album_share_settings");
      if (g !== generation || user !== current()) return;
      if (r.error || !Array.isArray(r.data?.scopes))
        throw Error("公開設定用SQLと通信状態を確認してください。");
      scopes = r.data.scopes.filter((s) => s in labels);
      hasLink = r.data.has_link === true;
      $("share-settings-status").textContent = hasLink
        ? "公開設定の変更は発行済みURLにも反映されます。"
        : "";
    } catch (error) {
      if (g === generation && user === current())
        $("share-settings-status").textContent = error.message;
    } finally {
      if (g === generation && user === current()) {
        busy = false;
        update();
      }
    }
  }
  dialog.addEventListener("click", async (event) => {
    const b = event.target.closest("[data-share-scope]");
    if (!b || busy || !current() || host.maintenance()) return;
    const before = [...scopes],
      enabled = !scopes.includes(b.dataset.shareScope),
      user = current(),
      g = generation;
    scopes = enabled
      ? [...scopes, b.dataset.shareScope]
      : scopes.filter((s) => s !== b.dataset.shareScope);
    busy = true;
    update();
    try {
      const r = await host
        .client()
        .rpc("card_album_share_set_scope", { p_scope: b.dataset.shareScope, p_enabled: enabled });
      if (g !== generation || user !== current()) return;
      if (r.error || !Array.isArray(r.data?.scopes))
        throw Error("公開設定を保存できませんでした。");
      scopes = r.data.scopes;
      hasLink = r.data.has_link === true;
      $("share-settings-status").textContent = enabled
        ? "公開設定にしました。URLを発行して共有できます。"
        : "非公開にしました。";
    } catch (error) {
      if (g === generation && user === current()) {
        scopes = before;
        $("share-settings-status").textContent = error.message;
      }
    } finally {
      if (g === generation && user === current()) {
        busy = false;
        update();
      }
    }
  });
  $("share-issue").onclick = async () => {
    if (busy || !current() || !scopes.length || host.maintenance()) return;
    const user = current(),
      g = generation;
    busy = true;
    update();
    try {
      const r = await host.client().rpc("card_album_share_issue");
      if (g !== generation || user !== current()) return;
      if (r.error || !/^[0-9a-f]{64}$/.test(r.data?.token || ""))
        throw Error("URLを発行できませんでした。");
      const base = new URL(host.base()),
        url = new URL("share/", base);
      url.hash = r.data.token;
      $("share-link-value").value = url.href;
      $("share-link-open").href = url.href;
      $("share-link-area").hidden = false;
      hasLink = true;
      $("share-settings-status").textContent =
        "閲覧用URLを発行しました。以前のURLは使用できません。";
    } catch (error) {
      if (g === generation && user === current())
        $("share-settings-status").textContent = error.message;
    } finally {
      if (g === generation && user === current()) {
        busy = false;
        update();
      }
    }
  };
  $("share-link-copy").onclick = async () => {
    if (!current() || current() !== owner) return;
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
