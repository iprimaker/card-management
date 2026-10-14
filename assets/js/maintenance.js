(() => {
  "use strict";
  const nativeFetch = window.fetch.bind(window);
  let pending = null;
  let state = { maintenance: false };
  let notify = () => {};
  async function check() {
    if (pending) return pending;
    pending = (async () => {
      const config = window.APP_CONFIG;
      const response = await nativeFetch(config.supabaseUrl + "/rest/v1/rpc/card_album_site_status", {
        method: "POST", headers: { apikey: config.supabaseKey, "Content-Type": "application/json" },
        body: "{}", cache: "no-store",
      });
      if (!response.ok) throw new Error("メンテナンス設定を確認できません。ページを再読み込みしてください。");
      state = await response.json();
      if (!state || typeof state.maintenance !== "boolean") throw new Error("メンテナンス設定を確認できません。");
      notify(state);
      return state;
    })().finally(() => { pending = null; });
    return pending;
  }
  async function guardedFetch(input, options) {
    const url = typeof input === "string" ? input : input.url || String(input);
    if (!url.startsWith(window.APP_CONFIG.supabaseUrl + "/")) return nativeFetch(input, options);
    const status = await check();
    // Public catalogue remains available for the moving cards, including during maintenance.
    const publicRead = /\/rest\/v1\/(?:card_catalog(?:\?|$)|card_catalog_revision(?:\?|$)|rpc\/card_album_catalog_cached(?:\?|$)|rpc\/card_album_registration_status(?:\?|$))/.test(url);
    if (status.maintenance && !publicRead) {
      return new Response(JSON.stringify({ code: "42501", message: "CARD_ALBUM_MAINTENANCE" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }
    const response = await nativeFetch(input, options);
    if (!response.ok) {
      const text = await response.clone().text();
      if (text.includes("CARD_ALBUM_MAINTENANCE") || text.includes("user_banned")) await check();
    }
    return response;
  }
  window.CARD_MAINTENANCE = { check, fetch: guardedFetch, subscribe(fn) { notify = fn; }, get state() { return state; } };
})();
