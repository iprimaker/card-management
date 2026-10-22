(() => {
  "use strict";
  const version = "20261022-cards-verse-v4";
  const requested = new URLSearchParams(location.search).get("view");
  const page =
    ["shared", "browse", "contact", "card-registration"].includes(requested)
      ? requested
      : "album";
  const template = document.getElementById("page-" + (page === "card-registration" ? "album" : page === "browse" ? "shared" : page));
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
  const initialVisibility = document.body.style.visibility;
  document.body.style.visibility = "hidden";
  document.body.className = template.dataset.bodyClass;
  if (page === "browse") document.body.classList.add("guest-browse");
  document.body.replaceChildren(template.content.cloneNode(true));
  function script(file) {
    return new Promise((resolve, reject) => {
      const node = document.createElement("script");
      const assetVersion = version;
      node.src = new URL("assets/js/" + file + "?v=" + assetVersion, rootURL).href;
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
      ? ["album", "features", "card-registration"]
      : [page === "browse" ? "shared" : page]).map(stylesheet),
  );
  styles.then(
    () => {
      if (page !== "card-registration") document.body.style.visibility = initialVisibility;
    },
    () => {},
  );
  const dependencies = Promise.all([
    script("vendor/supabase.js"),
    script("config.js"),
  ]);
  const preview =
    page === "album"
      ? script("startup.js").then(() => {
          window.CARD_STARTUP_PREVIEW.paint(
            document.getElementById("auth-art"),
          );
        })
      : Promise.resolve();
  Promise.all([styles, dependencies, preview])
    .then(() => page === "card-registration"
      ? script("registration-site-info.js").then(() => script("card-registration.js"))
      : script((page === "browse" ? "shared" : page) + ".js"))
    .then(() =>
      page === "album"
        ? script("command-definitions.js").then(() =>
            script("settings-commands.js"),
          )
        : undefined,
    )
    .then(() => (page === "album" ? script("tutorial.js") : undefined))
    .then(() => (page === "album" ? script("card-registration.js") : undefined))
    .then(() => { document.body.style.visibility = initialVisibility; })
    .catch((error) => {
      document.body.style.visibility = initialVisibility;
      const status = document.createElement("p");
      status.setAttribute("role", "alert");
      status.textContent = error.message;
      document.body.prepend(status);
    });
})();
