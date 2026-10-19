(() => {
  "use strict";
  const version = "20261019-organized";
  const requested = new URLSearchParams(location.search).get("view");
  const page = requested === "shared" || requested === "contact" ? requested : "album";
  const template = document.getElementById("page-" + page);
  const rootURL = new URL("./", location.href);
  document.title =
    page === "shared"
      ? "共有アルバム｜カードアルバム"
      : page === "contact"
        ? "お問い合わせ｜カードアルバム"
        : "カードアルバム";
  if (page === "shared") {
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
  document.body.replaceChildren(template.content.cloneNode(true));
  function script(file) {
    return new Promise((resolve, reject) => {
      const node = document.createElement("script");
      node.src = new URL("assets/js/" + file + "?v=" + version, rootURL).href;
      node.async = false;
      node.onload = resolve;
      node.onerror = () =>
        reject(Error("ファイルを読み込めませんでした。再読み込みしてください。"));
      document.head.append(node);
    });
  }
  function stylesheet(file) {
    return new Promise((resolve, reject) => {
      const node = document.createElement("link");
      node.rel = "stylesheet";
      node.href = new URL("assets/css/" + file + ".css?v=" + version, rootURL).href;
      node.onload = resolve;
      node.onerror = () =>
        reject(Error("表示ファイルを読み込めませんでした。再読み込みしてください。"));
      document.head.append(node);
    });
  }
  const styles = Promise.all((page === "album" ? ["album", "features"] : [page]).map(stylesheet));
  styles.then(
    () => {
      document.body.style.visibility = initialVisibility;
    },
    () => {},
  );
  const dependencies = Promise.all([script("vendor/supabase.js"), script("config.js")]);
  const preview =
    page === "album"
      ? script("startup.js").then(() => {
          window.CARD_STARTUP_PREVIEW.paint(document.getElementById("auth-art"));
        })
      : Promise.resolve();
  Promise.all([styles, dependencies, preview])
    .then(() => script(page + ".js"))
    .catch((error) => {
      document.body.style.visibility = initialVisibility;
      const status = document.createElement("p");
      status.setAttribute("role", "alert");
      status.textContent = error.message;
      document.body.prepend(status);
    });
})();
