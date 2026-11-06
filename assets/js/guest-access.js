/* Guest browsing switch. Album sessions and shared links keep their existing flow. */
(() => {
  "use strict";
  const browse = new URLSearchParams(location.search).get("view") === "browse";
  const nativeFetch = window.fetch.bind(window);
  let enabled = false, flight = null, checkedAt = 0;
  const link = document.getElementById("guest-browse-link");
  function updateLink() {
    if (link) link.hidden = !enabled || document.body.classList.contains("invitation-route");
  }
  async function refresh() {
    if (flight) return flight;
    flight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const config = window.APP_CONFIG;
        const response = await nativeFetch(config.supabaseUrl + "/rest/v1/rpc/card_guest_browse_status", {
          method: "POST", headers: { apikey: config.supabaseKey, "Content-Type": "application/json" },
          body: "{}", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw Error("閲覧設定を確認できませんでした。");
        const data = await response.json();
        if (typeof data?.enabled !== "boolean") throw Error("閲覧設定を確認できませんでした。");
        enabled = data.enabled;
        checkedAt = Date.now();
        updateLink();
        return enabled;
      } finally { clearTimeout(timer); }
    })().catch((error) => { enabled = false; updateLink(); throw error; }).finally(() => { flight = null; });
    return flight;
  }
  function showStopped(unavailable = false) {
    document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close?.());
    document.body.classList.remove("auth-checking");
    document.getElementById("auth-checking-status")?.remove();
    document.body.style.visibility = "visible";
    const main = document.createElement("main");
    main.className = "guest-browse-stopped";
    main.innerHTML = `<section aria-labelledby="guest-stop-title"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="7" width="36" height="47" rx="9"/><path d="M22 22h12M22 30h9"/><circle cx="46" cy="46" r="13"/><path d="M42 41v10M50 41v10"/></svg><h1 id="guest-stop-title"></h1><p></p><div><button type="button">状態を更新</button><a href="./">ログイン画面へ</a></div></section>`;
    main.querySelector("h1").textContent = unavailable ? "通信状態をご確認ください" : "閲覧専用ページは一時停止中です";
    main.querySelector("p").textContent = unavailable ? "現在の利用状況を確認できませんでした。時間をおいて、もう一度お試しください。" : "ただいま「ログインせずに利用」をお休みしています。時間をおいて、またアクセスしてください。アルバムをお持ちの方はログインしてご利用いただけます。";
    main.querySelector("button").onclick = () => location.reload();
    document.body.replaceChildren(main);
    document.title = "閲覧専用ページ｜カードアルバム";
  }
  const task = refresh();
  const ready = browse ? task.then((allowed) => {
    if (!allowed) throw Object.assign(Error("閲覧専用ページは一時停止中です。"), { code: "GUEST_BROWSE_PAUSED" });
  }, () => { throw Object.assign(Error("閲覧設定を確認できませんでした。"), { code: "GUEST_BROWSE_UNAVAILABLE" }); }) : Promise.resolve();
  if (!browse) task.catch(() => {});
  if (link) link.addEventListener("click", async (event) => {
    event.preventDefault();
    try { if (await refresh()) location.assign(link.href); } catch {}
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - checkedAt > 60000) refresh().then((allowed) => {
      if (browse && !allowed) showStopped();
    }).catch(() => {});
  });
  if (browse) setInterval(() => {
    if (!document.hidden) refresh().then((allowed) => {
      if (!allowed) showStopped();
    }).catch(() => {});
  }, 60000);
  window.CARD_GUEST_ACCESS = Object.freeze({ ready, refresh, showStopped, get enabled() { return enabled; } });
})();
