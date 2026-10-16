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
    generation = 0;
  const dialog = document.createElement("dialog");
  dialog.id = "ownership-share-dialog";
  dialog.className = "ownership-share-dialog";
  dialog.innerHTML = `<button type="button" class="share-close" id="share-settings-close" aria-label="閉じる">×</button><span class="eyebrow">SHARE ALBUM</span><h2 id="share-settings-title" tabindex="-1">所持状況を共有</h2><p class="share-settings-intro">公開するアルバムを選んで、あなたのコレクションを共有。</p><details class="share-help"><summary>共有される情報と注意事項</summary><div><p>ニックネームと「〇〇のカードアルバム」、公開をONにした種類の所持状況・所持数が表示されます。</p><p>お気に入り・譲求・アルバムID・メールアドレスは共有されません。URLにもアルバムIDは含まれません。</p><p>URLを知っている方はログインせず閲覧できます。URLは削除するまで有効で、ログアウトしても失効しません。</p><p>公開設定と所持状況の変更は同じURLに反映されます。閲覧中の画面にも通信がつながっている間は自動反映されます。</p><p>非公開やURL削除後も、既に閲覧・保存された内容までは取り消せません。</p></div></details><div class="share-scope-settings">${Object.entries(
    labels,
  )
    .map(
      ([id, label]) =>
        `<div><span>${label}</span><button type="button" role="switch" aria-checked="false" data-share-scope="${id}" aria-label="${label}を公開"><span aria-hidden="true"></span></button></div>`,
    )
    .join(
      "",
    )}</div><p class="share-live-note">公開設定・所持状況は、発行済みのURLへ自動で反映されます。</p><p id="share-settings-status" role="status"></p><button type="button" id="share-issue" class="share-issue">所持状況を公開する</button><div id="share-link-area" hidden><label>閲覧用URL<input id="share-link-value" readonly type="text"></label><div class="share-link-actions"><button type="button" id="share-link-copy">URLをコピー</button><a id="share-link-open" target="_blank" rel="noopener noreferrer">閲覧画面を開く</a></div></div><div id="share-restore-area" hidden><label>以前の共有URL<input id="share-restore-input" type="url" placeholder="発行済みのURLを貼り付け" autocomplete="off"></label><button type="button" id="share-restore">このURLを引き継ぐ</button></div><button type="button" id="share-delete" hidden>共有URLを削除</button><div id="share-delete-confirm" hidden><strong>共有URLを削除しますか？</strong><p>このURLでは閲覧できなくなります。所持記録は削除されません。</p><div><button type="button" id="share-delete-cancel">キャンセル</button><button type="button" id="share-delete-yes">URLを削除</button></div></div>`;
  document.body.append(dialog);
  $("ownership-export-dialog")?.remove();
  $("ownership-export-open").textContent = "所持状況を共有";
  const current = () => host.session()?.user.id || null;
  function update() {
    dialog.querySelectorAll("[data-share-scope]").forEach((b) => {
      b.setAttribute("aria-checked", String(scopes.includes(b.dataset.shareScope)));
      b.disabled = busy;
    });
    $("share-issue").hidden = hasLink;
    $("share-issue").disabled = busy || !scopes.length;
    $("share-restore-area").hidden = !hasLink || !!token;
    $("share-restore").disabled = busy;
    $("share-delete").hidden = !hasLink;
    $("share-delete").disabled = busy;
    $("share-delete-yes").disabled = busy;
    $("share-delete-cancel").disabled = busy;
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
  function apply(data) {
    scopes = data.scopes.filter((s) => s in labels);
    hasLink = data.has_link === true;
    token = data.token || null;
    update();
  }
  function reset() {
    generation++;
    owner = null;
    scopes = [];
    hasLink = false;
    token = null;
    busy = false;
    $("share-delete-confirm").hidden = true;
    $("share-restore-input").value = "";
    update();
    if (dialog.open) dialog.close();
  }
  function sync() {
    if (owner && owner !== current()) reset();
  }
  async function run(name, args, onSuccess) {
    if (busy || !current() || host.maintenance()) return;
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
      if (g === generation && user === current())
        $("share-settings-status").textContent = error.message;
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
    reset();
    owner = current();
    dialog.showModal();
    $("share-settings-title").focus();
    $("share-settings-status").textContent = "公開設定を確認中…";
    await run("card_album_share_settings", {}, (data) => {
      if (!Array.isArray(data?.scopes)) throw Error("公開設定用SQLをご確認ください。");
      apply(data);
      $("share-settings-status").textContent =
        hasLink && !token
          ? "以前のURLはこの画面に再表示できません。以前のURLを貼り付けると、同じURLを引き継げます。"
          : "URLは削除するまで継続します。再ログイン後もここで確認できます。";
    });
  }
  dialog.addEventListener("click", (event) => {
    const b = event.target.closest("[data-share-scope]");
    if (!b) return;
    run(
      "card_album_share_set_scope",
      { p_scope: b.dataset.shareScope, p_enabled: !scopes.includes(b.dataset.shareScope) },
      (data) => {
        apply(data);
        $("share-settings-status").textContent =
          "公開設定を保存しました。発行済みURLへすぐに反映されます。";
      },
    );
  });
  $("share-issue").onclick = () => {
    if (hasLink || !scopes.length) return;
    run("card_album_share_issue", {}, (data) => {
      if (!/^[0-9a-f]{64}$/.test(data?.token || "")) throw Error("URLを発行できませんでした。");
      token = data.token;
      hasLink = true;
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
    $("share-delete-confirm").hidden = false;
  };
  $("share-delete-cancel").onclick = () => {
    $("share-delete-confirm").hidden = true;
  };
  $("share-delete-yes").onclick = () =>
    run("card_album_share_delete", {}, () => {
      token = null;
      hasLink = false;
      $("share-delete-confirm").hidden = true;
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
