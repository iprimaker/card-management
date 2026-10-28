(() => {
  let latestDialog = null;
  function hide(node) {
    try {
      node.hidePopover?.();
    } catch {}
    node.style.removeProperty("display");
  }
  function raise(node) {
    if (!node || node.hidden) return;
    const dialogs = [...document.querySelectorAll("dialog[open]")];
    const host = latestDialog?.open
      ? latestDialog
      : dialogs.at(-1) || document.body;
    // Place the notification inside the active modal's non-inert subtree first.
    if (node.parentElement !== host) host.append(node);
    Object.assign(node.style, {
      inset: "auto",
      bottom: "25px",
      left: "50%",
      margin: "0",
      border: "0",
      pointerEvents: "none",
      zIndex: "2147483647",
    });
    if (typeof node.showPopover === "function") {
      node.setAttribute("popover", "manual");
      try {
        if (!node.matches(":popover-open")) node.showPopover();
        return;
      } catch {}
    }
    // A failed popover must not retain the browser's default display:none.
    node.removeAttribute("popover");
    node.style.display = "block";
  }
  window.CARD_TOAST_LAYER = Object.freeze({ raise, hide });
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.target.tagName === "DIALOG" && record.target.open)
        latestDialog = record.target;
    }
    const node = document.getElementById("toast");
    if (node && !node.hidden) {
      hide(node);
      raise(node);
    }
  }).observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
})();
(() => {
  "use strict";
  const safe = new Set([
    " 一覧への反映に失敗しました。アルバムに戻る前に再読み込みしてください。",
    "2〜8文字で入力してください。",
    "IDを取得できませんでした。時間をおいてお試しください。",
    "IDを発行できませんでした。",
    "IDを確認できませんでした",
    "URLを発行できませんでした。",
    "お問い合わせ内容と同意欄を確認してください",
    "この組み合わせは使用できません。入力補助から選んでください。",
    "しばらく時間をおいてからお試しください。",
    "だんの候補を取得できませんでした。もう一度対象を選んでください。",
    "アルバムIDを入力してください。",
    "アルバムIDを確認してください。",
    "アルバムIDを確認できません。再ログインしてください。",
    "アルバムIDを確認できませんでした。",
    "カード情報を取得できませんでした。時間をおいてお試しください",
    "カード情報を表示できません",
    "カード情報を読み込めませんでした。時間をおいて再度お試しください。",
    "コピーできませんでした。",
    "コピーできませんでした。表示されたIDを保存してください。",
    "コーデの所持状況を確認できませんでした。",
    "コーデデータを確認できませんでした。",
    "コーデ情報を取得できませんでした。",
    "ニックネームを2〜8文字で入力してください。",
    "パスワードは8文字以上で入力してください。",
    "パスワードを8〜128文字で入力してください。",
    "パスワードを入力してください。",
    "メンテナンス中は実行できません。",
    "メールを確認できませんでした",
    "メールアドレスの形式を確認してください。",
    "ログインしてください",
    "交換希望を取得できませんでした。",
    "以前のURLはこの画面に再表示できません。以前のURLを貼り付けると、同じURLを引き継げます。",
    "保存できませんでした。通信状態をご確認ください。",
    "個人情報を含まないことを確認してください。",
    "入力を確認してください",
    "公開するだん数を確認できませんでした。",
    "公開状態を確認できませんでした。",
    "公開設定の保存に失敗しました",
    "公開設定を保存できませんでした。変更を元に戻しました。",
    "共有URLを削除しました。以前のURLは使用できません。",
    "共有できませんでした。コピーをご利用ください。",
    "内容と同意欄を確認してください。",
    "再ログインしてください",
    "再ログインしてください。",
    "初期化できませんでした。",
    "削除できませんでした。",
    "受付を確認できませんでした。",
    "失敗しました",
    "失敗しました。",
    "所持状況を取得できませんでした。再読み込みしてください。",
    "所持状況を確認できませんでした。",
    "所持率を確認できませんでした。",
    "所持率を確認できませんでした。画面を開き直してください。",
    "接続できませんでした。通信状態を確認してください。",
    "更新できませんでした。",
    "画像を作成できませんでした",
    "画像を作成できませんでした。もう一度お試しください。",
    "確認を完了できませんでした。",
    "確認メールのリンクを開いてからログインしてください。",
    "確認リンクの有効期限が切れているか、すでに使用されています。確認済みの場合はログインしてください。未確認の場合は確認メールを再送してください。",
    "確認リンクを利用できませんでした。ログイン画面から確認メールを再送してください。",
    "返信を読み込めませんでした。再度お試しください。",
    "送信回数が多いため、時間をおいてお試しください。",
    "通信できませんでした。時間をおいて再度お試しください。",
    "過去の情報を読み込めませんでした。もう一度お試しください。",
  ]);
  function message(error) {
    const text =
      typeof error === "string" ? error : String(error?.message || "");
    const code = String(error?.code || "");
    if (/Invalid login credentials/i.test(text))
      return "アルバムIDまたはパスワードが正しくありません。";
    if (/Email not confirmed/i.test(text))
      return "確認メールのリンクを開いてからログインしてください。";
    if (
      /rate.?limit|too many|送信回数|リクエスト.*多/i.test(text) ||
      code === "429"
    )
      return "操作が集中しています。しばらく時間をおいてからお試しください。";
    if (
      /timeout|timed.?out|abort|タイムアウト/i.test(text) ||
      error?.name === "AbortError"
    )
      return "通信に時間がかかっています。時間をおいて、もう一度お試しください。";
    if (
      /load.?failed|failed.?to.?load|fetch|network|offline|lode.?falede/i.test(
        text,
      )
    )
      return "接続できませんでした。通信状態を確認して、もう一度お試しください。";
    if (/JWT|token.*expired|session.*expired|PGRST301/i.test(text + code))
      return "ログインの有効期限が切れました。もう一度ログインしてください。";
    if (
      /SQL|Supabase|DB|テーブル|版番号|Confirm email|permission|PGRST|schema|relation|constraint|stack|TypeError|ReferenceError/i.test(
        text,
      ) ||
      /^(?:42|23|PGRST)/.test(code)
    )
      return "情報を読み込めないか、操作を完了できませんでした。時間をおいて再度お試しください。改善しない場合はお問い合わせください。";
    if (safe.has(text))
      return text === "メールアドレスまたはパスワードが正しくありません。"
        ? "アルバムIDまたはパスワードが正しくありません。"
        : text;
    return "操作を完了できませんでした。時間をおいて、もう一度お試しください。";
  }
  window.CARD_ERROR = Object.freeze({ message });
})();
(() => {
  "use strict";
  const version = "20261029-invitation-v1";
  const requested = new URLSearchParams(location.search).get("view");
  const page = ["shared", "browse", "contact", "card-registration"].includes(
    requested,
  )
    ? requested
    : "album";
  const template = document.getElementById(
    "page-" +
      (page === "card-registration"
        ? "album"
        : page === "browse"
          ? "shared"
          : page),
  );
  const rootURL = new URL("./", location.href);
  document.title =
    page === "browse"
      ? "カード検索｜カードアルバム"
      : page === "shared"
        ? "共有アルバム｜カードアルバム"
        : page === "contact"
          ? "お問い合わせ｜カードアルバム"
          : page === "card-registration"
            ? "カード登録情報｜カードアルバム"
            : "カードアルバム";
  if (page === "shared" || page === "browse") {
    for (const [name, content] of [
      ["referrer", "no-referrer"],
      ["robots", "noindex,nofollow"],
    ]) {
      const meta = document.createElement("meta");
      meta.name = name;
      meta.content = content;
      document.head.append(meta);
    }
  }
  if (page === "contact") {
    try {
      document.documentElement.classList.toggle(
        "contact-aipri",
        new URLSearchParams(location.search).get("theme") === "aipri" ||
          (!new URLSearchParams(location.search).has("theme") &&
            sessionStorage.getItem("card-active-theme") === "aipri"),
      );
    } catch {}
  }
  if (page === "contact") {
    const theme = new URLSearchParams(location.search).get("theme") || (() => { try { return sessionStorage.getItem("card-active-theme"); } catch { return ""; } })();
    document.documentElement.classList.toggle("contact-primagi", theme === "primagi");
  }
  const initialVisibility = document.body.style.visibility;
  document.body.style.visibility = "hidden";
  document.body.className = template.dataset.bodyClass;
  if (page === "browse") document.body.classList.add("guest-browse");
  document.body.replaceChildren(template.content.cloneNode(true));
  function script(file) {
    return new Promise((resolve, reject) => {
      const node = document.createElement("script");
      const assetVersion = version;
      node.src = new URL(
        "assets/js/" + file + "?v=" + assetVersion,
        rootURL,
      ).href;
      node.async = false;
      node.onload = resolve;
      node.onerror = () =>
        reject(
          Error("ファイルを読み込めませんでした。再読み込みしてください。"),
        );
      document.head.append(node);
    });
  }
  function stylesheet(file) {
    return new Promise((resolve, reject) => {
      const node = document.createElement("link");
      node.rel = "stylesheet";
      node.href = new URL(
        "assets/css/" + file + ".css?v=" + version,
        rootURL,
      ).href;
      node.onload = resolve;
      node.onerror = () =>
        reject(
          Error("表示ファイルを読み込めませんでした。再読み込みしてください。"),
        );
      document.head.append(node);
    });
  }
  const styles = Promise.all(
    (page === "album" || page === "card-registration"
      ? [
          "album",
          "features",
          "card-registration",
          "private-qr",
          "login-position",
          "save-codes",
          "verse-search-hint",
        ]
      : [page === "browse" ? "shared" : page]
    ).concat("primagi").map(stylesheet),
  );
  styles.then(
    () => {
      if (page !== "card-registration")
        document.body.style.visibility = initialVisibility;
    },
    () => {},
  );
  const visibilityModule = Promise.all([
    script("vendor/supabase.js"),
    script("config.js"),
  ]).then(() => script("card-visibility.js"));
  const dependencies = visibilityModule.then(
    () => window.CARD_VISIBILITY.ready,
  );
  const preview =
    page === "album"
      ? visibilityModule
          .then(() => script("startup.js"))
          .then(() => {
            window.CARD_STARTUP_PREVIEW.paint(
              document.getElementById("auth-art"),
            );
          })
      : Promise.resolve();
  Promise.all([styles, dependencies, preview])
    .then(() => script("primagi.js"))
    .then(() => script("verse-catalog-cache.js"))
    .then(() => script("site-common.js"))
    .then(() => { window.CARD_SITE_COMMON.init(page); window.CARD_SHARED_PAGE_READY=page; })
    .then(() => (page === "album" ? script("private-qr.js") : undefined))
    .then(() =>
      page === "card-registration"
        ? script("card-registration.js")
        : script((page === "browse" ? "shared" : page) + ".js"),
    )
    .then(() =>
      page === "album"
        ? script("command-definitions.js").then(() =>
            script("settings-commands.js"),
          )
        : undefined,
    )
    .then(() => (page === "album" ? script("save-codes.js") : undefined))
    .then(() => (page === "album" ? script("tutorial.js") : undefined))
    .then(() => (page === "album" ? script("card-registration.js") : undefined))
    .then(() => {
      document.body.style.visibility = initialVisibility;
    })
    .catch((error) => {
      document.body.style.visibility = initialVisibility;
      const status = document.createElement("p");
      status.setAttribute("role", "alert");
      status.textContent = window.CARD_ERROR.message(error);
      document.body.prepend(status);
    });

})();
