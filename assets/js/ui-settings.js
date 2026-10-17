(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const key = "card-display-preferences-v1";
  const options = [
    ["grayscale", "非所持カードを白黒にする", "一覧の画像に適用します"],
    ["hideText", "一覧の文字情報を非表示にする", "画像と所持ボタンを中心に表示します"],
    ["hideRates", "取得率を非表示にする", "取得率と、その内訳を隠します"],
  ];
  let prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem(key) || "{}");
  } catch {}
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) prefs = {};
  const dialog = document.createElement("dialog");
  dialog.id = "display-settings-dialog";
  dialog.setAttribute("aria-labelledby", "display-settings-title");
  dialog.innerHTML = `<div class="modal-top"><h2 id="display-settings-title">詳細設定</h2><button type="button" id="display-settings-close" aria-label="閉じる">×</button></div><h3 class="display-settings-section-title">表示</h3><div class="display-settings-options">${options.map(([id, label, help]) => `<div><span class="display-setting-label"><span>${label}</span><small>${help}</small></span><button type="button" role="switch" data-display-setting="${id}" aria-label="${label}" aria-checked="false"><span aria-hidden="true"></span></button></div>`).join("")}</div><p class="display-settings-note">表示設定はこのブラウザーに保存され、ログアウト後も維持されます。</p><h3 class="display-settings-section-title">アカウント</h3><div class="display-account-actions"></div><p role="status" id="display-settings-status"></p>`;
  document.body.append(dialog);
  const actions = dialog.querySelector(".display-account-actions");
  actions.append($("edit-nickname"), $("logout"));
  function apply() {
    for (const [id] of options) {
      document.body.classList.toggle("display-" + id, prefs[id] === true);
      dialog
        .querySelector(`[data-display-setting="${id}"]`)
        .setAttribute("aria-checked", String(prefs[id] === true));
    }
  }
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-display-setting]");
    if (!button) return;
    prefs[button.dataset.displaySetting] = !prefs[button.dataset.displaySetting];
    apply();
    try {
      localStorage.setItem(key, JSON.stringify(prefs));
      $("display-settings-status").textContent = "";
    } catch {
      $("display-settings-status").textContent =
        "表示は変更しましたが、設定を保存できませんでした。";
    }
  });
  $("display-settings-open").onclick = () => {
    if (!window.CARD_SHARE_HOST?.session() || window.CARD_SHARE_HOST.maintenance()) return;
    window.CARD_SHARE_HOST.closeMenu();
    dialog.showModal();
    $("display-settings-close").focus({ preventScroll: true });
  };
  $("display-settings-close").onclick = () => dialog.close();
  for (const id of ["edit-nickname", "logout"])
    $(id).addEventListener("click", () => dialog.close(), { capture: true });
  window.CARD_UI_SETTINGS = {
    sync() {
      const active = !!window.CARD_SHARE_HOST?.session();
      $("display-settings-open").hidden = !active;
      if (!active && dialog.open) dialog.close();
    },
  };
  function theme() {
    try {
      sessionStorage.setItem(
        "card-active-theme",
        document.body.classList.contains("game-aipri") ? "aipri" : "aikatsu",
      );
    } catch {}
  }
  theme();
  new MutationObserver(theme).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  function contactLink(event) {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && /\/contact\/?$/.test(url.pathname)) {
      url.searchParams.set(
        "theme",
        document.body.classList.contains("game-aipri") ? "aipri" : "aikatsu",
      );
      link.href = url.href;
    }
  }
  document.addEventListener("pointerdown", contactLink, true);
  document.addEventListener("click", contactLink, true);
  apply();
  window.CARD_UI_SETTINGS.sync();
})();
