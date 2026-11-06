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
      bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
      left: "50%",
      margin: "0",
      pointerEvents: "auto",
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
    node.style.display = node.classList.contains("card-notice")
      ? "grid"
      : "block";
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
    "IDまたはパスワードが異なります。",
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
  const notices = Object.freeze({
    network: [
      "通信エラーが発生しました。",
      "接続を確認して、もう一度お試しください。",
    ],
    offline: [
      "インターネットに接続されていません。",
      "接続後にもう一度お試しください。",
    ],
    timeout: [
      "応答に時間がかかっています。",
      "時間をおいて、もう一度お試しください。",
    ],
    busy: [
      "操作が集中しています。",
      "しばらく時間をおいてからお試しください。",
    ],
    server: [
      "サービスに接続できませんでした。",
      "時間をおいて、もう一度お試しください。",
    ],
    session: [
      "ログインの有効期限が切れました。",
      "もう一度ログインしてください。",
    ],
    credentials: [
      "IDまたはパスワードが異なります。",
      "入力内容を確認してください。",
    ],
    permission: [
      "この操作を行う権限がありません。",
      "ログイン状態を確認してください。",
    ],
    generic: [
      "操作を完了できませんでした。",
      "時間をおいて、もう一度お試しください。",
    ],
  });
  function fields(error) {
    const chain = [];
    const seen = new Set();
    for (
      let item = error;
      item && chain.length < 4 && !seen.has(item);
      item = item.cause
    ) {
      seen.add(item);
      chain.push(item);
    }
    return {
      text: chain
        .map((item) =>
          typeof item === "string"
            ? item
            : [item.message, item.details].filter(Boolean).join(" "),
        )
        .join(" "),
      code: String(chain.find((item) => item.code)?.code || ""),
      status: Number(
        chain.find((item) => item.status || item.statusCode)?.status ||
          chain.find((item) => item.statusCode)?.statusCode ||
          0,
      ),
      names: chain.map((item) => item.name || "").join(" "),
    };
  }
  function classify(error) {
    const { text, code, status, names } = fields(error);
    if (
      code === "invalid_credentials" ||
      /Invalid login credentials|ID(?:または|か)パスワードが(?:正しくありません|異なります)/i.test(
        text,
      )
    )
      return "credentials";
    if (code === "email_not_confirmed" || /Email not confirmed/i.test(text))
      return "confirmation";
    if (
      status === 429 ||
      /^(429|over_request_rate_limit|over_email_send_rate_limit)$/.test(code) ||
      /rate.?limit|too many|送信回数|操作回数.*多|操作が集中|リクエスト.*多/i.test(
        text,
      )
    )
      return "busy";
    if (
      code === "57014" ||
      /AbortError|TimeoutError/.test(names) ||
      /timeout|timed.?out|タイムアウト|通信に時間|応答に時間|statement.*cancel/i.test(
        text,
      )
    )
      return "timeout";
    if (
      status === 401 ||
      /^(PGRST30[123]|session_expired|refresh_token_not_found|refresh_token_already_used)$/.test(
        code,
      ) ||
      /JWT|token.*expired|session.*expired|ログインの有効期限/i.test(text)
    )
      return "session";
    if (
      status >= 500 ||
      /^(57P0[123]|53300|PGRST00[012])$/.test(code) ||
      /database system is shutting down|service unavailable|bad gateway|gateway timeout|サービスに接続できません/i.test(
        text,
      )
    )
      return "server";
    if (
      /インターネットに接続されていません|通信に接続されていません|offline/i.test(
        text,
      )
    )
      return "offline";
    if (
      /load[\s_-]*fail(?:ed)?|lode[\s_-]*fail(?:ed|ede)?|lode.?falede|failed[\s_-]*to[\s_-]*(?:fetch|load)|network(?:error| request| connection)?|ERR_(?:NETWORK|INTERNET|CONNECTION)|通信エラー|接続できません|通信できません|通信状態を確認して再度/i.test(
        text,
      ) ||
      /^08/.test(code) ||
      /AuthRetryableFetchError/.test(names)
    )
      return navigator.onLine === false ? "offline" : "network";
    if (safe.has(text)) return "known";
    if (
      status === 403 ||
      code === "42501" ||
      /permission denied|row.level security/i.test(text)
    )
      return "permission";
    if (navigator.onLine === false) return "offline";
    return "generic";
  }
  function describe(error) {
    const kind = classify(error);
    if (kind === "confirmation")
      return {
        kind: "session",
        title: "メールの確認が必要です。",
        detail: "確認メールのリンクを開いてからログインしてください。",
        message: "確認メールのリンクを開いてからログインしてください。",
      };
    if (kind === "known") {
      const text = fields(error).text;
      if (/^(失敗しました[。]?|初期化できませんでした[。]?)$/.test(text))
        return describe(null);
      return {
        kind: "generic",
        title: "操作をご確認ください",
        detail: text,
        message: text,
      };
    }
    const [title, detail] = notices[kind] || notices.generic;
    return {
      kind,
      title,
      detail,
      message: kind === "credentials" ? title : title + detail,
    };
  }
  function message(error) {
    return describe(error).message;
  }
  const iconPaths = {
    network:
      '<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0"/><path d="m4 3 16 18"/>',
    offline:
      '<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0"/><path d="m4 3 16 18"/>',
    timeout: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    success: '<path d="m5 12 4 4L19 6"/>',
    generic: '<circle cx="12" cy="12" r="8"/><path d="M12 7v6m0 3v.1"/>',
  };
  function renderToast(node, error, isError) {
    const info = isError
      ? describe(error)
      : { kind: "success", title: String(error ?? ""), detail: "" };
    node.replaceChildren();
    node.classList.add("card-notice");
    node.classList.toggle("is-error", isError);
    node.dataset.feedbackKind = info.kind;
    node.setAttribute("role", isError ? "alert" : "status");
    node.setAttribute("aria-atomic", "true");
    const icon = document.createElement("span");
    icon.className = "card-notice-icon";
    icon.setAttribute("aria-hidden", "true");
    // Only constant, local SVG paths are inserted as markup.
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      (iconPaths[info.kind] || iconPaths.generic) +
      "</svg>";
    const copy = document.createElement("div");
    copy.className = "card-notice-copy";
    const title = document.createElement("strong");
    title.textContent = info.title;
    copy.append(title);
    if (info.detail) {
      const detail = document.createElement("span");
      detail.textContent = info.detail;
      copy.append(detail);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "card-notice-close";
    close.setAttribute("aria-label", "通知を閉じる");
    close.textContent = "×";
    close.onclick = () => {
      window.CARD_TOAST_LAYER.hide(node);
      node.hidden = true;
    };
    node.append(icon, copy, close);
  }
  // Status text is also used for loading and success. Decorate only error messages,
  // and remove the decoration as soon as the text changes or is cleared.
  function enhanceStatuses() {
    const selector =
      'p[role="status"], p[role="alert"], .field-error, [data-status], [data-error], #all-status, #command-result';
    function sync(node) {
      if (node.closest("#toast")) return;
      const text = node.textContent.trim();
      const failure =
        !text.startsWith("以前のURLはこの画面に再表示できません") &&
        text &&
        /できません|できなかった|失敗|エラー|異なります|有効期限|接続されていません|時間がかか|操作が集中|確認してください|入力してください|上限に達/.test(
          text,
        );
      node.classList.toggle("card-feedback", Boolean(failure));
      if (failure) node.dataset.feedbackKind = classify(text);
      else delete node.dataset.feedbackKind;
    }
    const pending = new Set();
    let queued = false;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const el =
          record.target.nodeType === 1
            ? record.target
            : record.target.parentElement;
        if (!el || el.closest("#toast")) continue;
        const own = el.closest(selector);
        if (own) pending.add(own);
        for (const added of record.addedNodes)
          if (added.nodeType === 1) {
            if (added.matches(selector)) pending.add(added);
            added
              .querySelectorAll(selector)
              .forEach((node) => pending.add(node));
          }
      }
      if (!queued && pending.size) {
        queued = true;
        queueMicrotask(() => {
          queued = false;
          pending.forEach(sync);
          pending.clear();
        });
      }
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    document.querySelectorAll(selector).forEach(sync);
  }
  if (document.body) enhanceStatuses();
  else
    document.addEventListener("DOMContentLoaded", enhanceStatuses, {
      once: true,
    });
  window.CARD_ERROR = Object.freeze({ message, describe, renderToast });
})();
(() => {
  "use strict";
  const version = "20261106-qr-limit-policy-v40";
  const requested = new URLSearchParams(location.search).get("view");
  const invitationRoute = requested === "invite";
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
  if (page === "shared" || page === "browse" || invitationRoute) {
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
    const theme =
      new URLSearchParams(location.search).get("theme") ||
      (() => {
        try {
          return sessionStorage.getItem("card-active-theme");
        } catch {
          return "";
        }
      })();
    document.documentElement.classList.toggle(
      "contact-primagi",
      theme === "primagi",
    );
  }
  const initialVisibility = document.body.style.visibility;
  document.body.style.visibility = "hidden";
  document.body.className = template.dataset.bodyClass;
  if (page === "browse") document.body.classList.add("guest-browse");
  document.body.replaceChildren(template.content.cloneNode(true));
  if (page === "album" && !invitationRoute) {
    document.body.classList.add("auth-checking");
    const status = document.createElement("section");
    status.id = "auth-checking-status";
    status.className = "auth-checking-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.innerHTML =
      '<div class="album-loading-cards" aria-hidden="true"><span class="album-loading-card"></span><span class="album-loading-card"></span><span class="album-loading-card"><svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z"/></svg></span></div><h1 class="album-loading-title">アルバムを確認しています</h1><p class="album-loading-note">もう少しだけお待ちください</p><span class="album-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    document.querySelector("main").prepend(status);
  }
  if (page === "browse") {
    document.getElementById("public-status").textContent =
      "カード情報を読み込み中…";
    document.querySelector("footer p").textContent =
      "非公式のカード検索画面 · 画像・カード情報は各権利者に帰属します。";
  }
  // 招待URLは、この同期処理の時点で専用画面にする。後続JSを待つ間もログイン欄を見せない。
  if (invitationRoute) {
    document.body.classList.add("invitation-route");
    document.title = "招待からアルバムを作成｜カードアルバム";
    document
      .getElementById("auth-normal-panel")
      .querySelector("h2").textContent = "招待からアルバムを作成";
    document.getElementById("login-tab").parentElement.hidden = true;
    document.getElementById("auth-form").hidden = true;
    document.getElementById("signup-flow").hidden = false;
    document.getElementById("signup-registration-status").textContent =
      "招待登録画面を準備しています…";
    document.getElementById("issue-album-id").hidden = true;
    document.getElementById("guest-browse-link").hidden = true;
    document.querySelector('[data-signup-marker="id"]').textContent = "ID確認";
    const brand = document.querySelector(".wordmark");
    brand.removeAttribute("href");
    brand.setAttribute("aria-label", "カードアルバム");
  }
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
      ? ["album"]
      : [page === "browse" ? "shared" : page]
    )
      .concat("primagi", ...(page === "album" ? ["aikatsu-all"] : []))
      .map(stylesheet),
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
  ]).then(() => script("guest-access.js"))
    .then(() => window.CARD_GUEST_ACCESS.ready)
    .then(() => script("card-visibility.js"));
  const dependencies = visibilityModule.then(
    () => window.CARD_VISIBILITY.ready,
  );
  const preview =
    page === "album" && !invitationRoute
      ? visibilityModule
          .then(() => script("startup.js"))
          .then(() => {
            window.CARD_STARTUP_PREVIEW.paint(
              document.getElementById("auth-art"),
            );
          })
      : Promise.resolve();
  Promise.all([styles, dependencies, preview])
    .then(() => script("site-common.js"))
    .then(() => {
      window.CARD_SITE_COMMON.init(page);
      window.CARD_SHARED_PAGE_READY = page;
    })
    .then(() => (page === "album" ? script("private-qr.js") : undefined))
    .then(() =>
      page === "card-registration"
        ? script("card-registration.js")
        : script((page === "browse" ? "shared" : page) + ".js"),
    )
    .then(() => (page === "album" ? script("aikatsu-all.js") : undefined))
    .then(() => (page === "album" ? script("settings-commands.js") : undefined))
    .then(() => (page === "album" ? script("save-codes.js") : undefined))
    .then(() => (page === "album" ? script("card-registration.js") : undefined))
    .then(() => {
      document.body.style.visibility = initialVisibility;
    })
    .catch((error) => {
      if (error?.code === "GUEST_BROWSE_PAUSED" || error?.code === "GUEST_BROWSE_UNAVAILABLE") {
        window.CARD_GUEST_ACCESS.showStopped(error.code === "GUEST_BROWSE_UNAVAILABLE");
        return;
      }
      document.body.classList.remove("auth-checking");
      document.getElementById("auth-checking-status")?.remove();
      document.body.style.visibility = initialVisibility;
      if (invitationRoute) {
        const status = document.getElementById("signup-registration-status");
        status.hidden = false;
        status.textContent =
          "招待登録画面を準備できませんでした。通信状態をご確認ください。ページを閉じると手続きを再開できない場合があります。";
      } else {
        const status = document.createElement("p");
        status.setAttribute("role", "alert");
        status.textContent = window.CARD_ERROR.message(error);
        document.body.prepend(status);
      }
    });
})();
