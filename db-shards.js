/* Multi-DB routing and primary catalog reads. Enable A only after its setup checks pass. */
((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CARD_SHARD_CORE = api;
})(typeof window === "undefined" ? globalThis : window, () => {
  "use strict";
  const config = Object.freeze({
    primary: "main",
    catalog: {
      url: "https://dwhlljqfredkiijrimwe.supabase.co",
      publicKey: "sb_publishable_DI0p9r9UnHDZXryphpWCxg_ZhO8Bc8u",
    },
    databases: [
      {
        key: "main",
        prefix: "",
        label: "本体",
        enabled: true,
        maxUsers: 2100,
        url: "https://lwbzwxoilpwouwnjgsed.supabase.co",
        publicKey: "sb_publishable_jlUX1NvdSld0LhweVMuUBg_nKQZ_xPG",
      },
      // Enable only after schema, permissions, quota and catalog-ID validation are verified.
      {
        key: "A",
        prefix: "A",
        label: "DB A",
        enabled: true,
        maxUsers: 2500,
        url: "https://jalviddujtkkjniawytl.supabase.co",
        publicKey: "sb_publishable_Q2Mvjn5JCjvA3ilgU1sSDQ_ZshVcevN",
      },
      // B and later: add one row with a unique key/prefix, URL and publishable key.
    ],
  });
  const catalogRPCs = new Set([
    "card_visibility_public_status",
    "card_visibility_display_catalog",
    "card_verse_catalog_cached",
    "card_verse_catalog_family_cached",
    "card_verse_catalog_related_count",
    "card_primagi_catalog_counts",
    "card_album_registration_feed",
    "card_guest_browse_status",
    "card_album_maintenance_warning_schedule",
  ]);
  const catalogTables = new Set([
    "card_catalog",
    "card_catalog_revision",
    "card_catalog_overrides",
    "card_verse_coordinates",
    "card_verse_parts",
    "card_announcements",
  ]);
  function create(settings, dependencies) {
    const { createClient, localStorage, sessionStorage, randomUUID } =
      dependencies;
    const registry = new Map();
    const prefixes = new Set();
    const origins = new Set();
    for (const source of settings.databases) {
      const url = new URL(source.url);
      if (
        !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw Error("DB接続先を確認してください。");
      if (
        !/^(main|[A-Z])$/.test(source.key) ||
        !/^(|[A-Z])$/.test(source.prefix) ||
        (source.key === settings.primary
          ? source.prefix !== ""
          : source.key !== source.prefix)
      )
        throw Error("DB識別子・接頭辞を確認してください。");
      if (
        registry.has(source.key) ||
        prefixes.has(source.prefix) ||
        origins.has(url.origin)
      )
        throw Error("DB設定が重複しています。");
      if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(source.publicKey))
        throw Error("公開キーを確認してください。");
      if (!Number.isSafeInteger(source.maxUsers) || source.maxUsers < 1)
        throw Error("登録者数の上限を確認してください。");
      const entry = Object.freeze({
        ...source,
        url: url.origin,
        project: url.hostname.split(".")[0],
      });
      registry.set(entry.key, entry);
      prefixes.add(entry.prefix);
      origins.add(url.origin);
    }
    if (!registry.has(settings.primary))
      throw Error("本体DBの設定がありません。");
    const primary = registry.get(settings.primary);
    const catalogSource = settings.catalog || primary;
    const catalogURL = new URL(catalogSource.url);
    if (
      catalogURL.protocol !== "https:" ||
      !/^[a-z0-9-]+\.supabase\.co$/.test(catalogURL.hostname) ||
      catalogURL.port ||
      catalogURL.username ||
      catalogURL.password ||
      catalogURL.pathname !== "/" ||
      catalogURL.search ||
      catalogURL.hash ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(catalogSource.publicKey)
    ) {
      throw Error("共通情報DBの公開接続先を確認してください。");
    }
    const catalog = Object.freeze({
      ...catalogSource,
      url: catalogURL.origin,
      project: catalogURL.hostname.split(".")[0],
    });
    const entries = [
      primary,
      ...[...registry.values()].filter((item) => item !== primary),
    ];
    const normalize = (value) =>
      String(value || "")
        .normalize("NFKC")
        .trim()
        .toUpperCase();
    function entry(key) {
      if (!registry.has(key)) throw Error("指定されたDBは登録されていません。");
      return registry.get(key);
    }
    function parse(value) {
      const text = normalize(value);
      let database = primary,
        id = text;
      if (text.length === 13) {
        database = entries.find(
          (item) => item.prefix === text[0] && item.prefix !== "",
        );
        if (!database) throw Error("アルバムIDを確認してください。");
        id = text.slice(1);
      }
      const pattern =
        database === primary
          ? /^(?:[A-HJ-NP-Z0-9]{8}|[A-HJ-NP-Z0-9]{12})$/
          : /^[A-HJ-NP-Z0-9]{12}$/;
      if (
        !pattern.test(id) ||
        [...new Set(id)].some(
          (character) => [...id].filter((c) => c === character).length > 3,
        )
      )
        throw Error("アルバムIDを確認してください。");
      return { database, id, display: database.prefix + id };
    }
    function display(key, value) {
      const database = entry(key),
        id = normalize(value);
      if (!/^(?:[A-HJ-NP-Z0-9]{8}|[A-HJ-NP-Z0-9]{12})$/.test(id))
        throw Error("アルバムIDを確認してください。");
      if (database.prefix && id.length !== 12)
        throw Error("追加DBのIDは12桁である必要があります。");
      return database.prefix + id;
    }
    function route(url, key, signup = false) {
      entry(key);
      const result = new URL(url);
      if (
        !["http:", "https:"].includes(result.protocol) ||
        result.username ||
        result.password
      )
        throw Error("画面のURLを確認してください。");
      // Only a public DB selector goes into the URL. Never identifiers, passwords or tokens.
      for (const name of [
        "password",
        "access_token",
        "refresh_token",
        "token",
        "album_id",
        "login_id",
      ])
        result.searchParams.delete(name);
      if (key === settings.primary) result.searchParams.delete("db");
      else result.searchParams.set("db", key);
      if (signup) {
        result.searchParams.delete("view");
        result.hash = "signup";
      } else result.hash = "";
      return result.href;
    }
    const anonymous = new Map();
    function publicClient(key) {
      const database = entry(key);
      if (!anonymous.has(key))
        anonymous.set(
          key,
          createClient(database.url, database.publicKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
              storageKey: "card-shard-anon:" + database.project,
            },
          }),
        );
      return anonymous.get(key);
    }
    let catalogAnonymous = null;
    function catalogClient() {
      if (!catalogAnonymous)
        catalogAnonymous = createClient(catalog.url, catalog.publicKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: "card-catalog-anon:" + catalog.project,
          },
        });
      return catalogAnonymous;
    }
    function personalClient(key, remember = true) {
      const database = entry(key);
      if (!database.enabled) throw Error(database.label + "は準備中です。");
      const baseKey = `sb-${database.project}-auth-token`;
      const area = remember ? localStorage : sessionStorage;
      const storageKey = remember
        ? baseKey
        : `${baseKey}-private-${randomUUID()}`;
      const savedKey = remember ? baseKey : `${baseKey}-session`;
      const mapKey = (value) => savedKey + value.slice(storageKey.length);
      return createClient(database.url, database.publicKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey,
          storage: {
            getItem: (key) => area.getItem(mapKey(key)),
            setItem: (key, value) => area.setItem(mapKey(key), value),
            removeItem: (key) => area.removeItem(mapKey(key)),
          },
        },
      });
    }
    const routedClients = new WeakMap();
    function wrap(personal) {
      if (routedClients.has(personal)) return routedClients.get(personal);
      const routed = new Proxy(personal, {
        get(target, property) {
          if (property === "rpc")
            return (name, ...args) =>
              (catalogRPCs.has(name) ? catalogClient() : target).rpc(
                name,
                ...args,
              );
          if (property === "from")
            return (table, ...args) => {
              if (!catalogTables.has(table)) return target.from(table, ...args);
              const source = catalogClient().from(table, ...args);
              return Object.freeze({
                select: (...selection) => source.select(...selection),
              });
            };
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      routedClients.set(personal, routed);
      routedClients.set(routed, routed);
      return routed;
    }
    function routedClient(url, publicKey, options) {
      const personal = createClient(url, publicKey, options);
      const origin = new URL(url).origin;
      return entries.some((database) => database.url === origin)
        ? wrap(personal)
        : personal;
    }
    async function signIn(identifier, password, options = {}) {
      const legacy = String(identifier || "").includes("@");
      const target = legacy
        ? { database: primary, id: null, display: null }
        : parse(identifier);
      if (
        legacy &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(identifier).trim())
      )
        throw Error("メールアドレスを確認してください。");
      if (
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128
      )
        throw Error("パスワードを確認してください。");
      if (!target.database.enabled)
        throw Error(target.database.label + "は準備中です。");
      const remember = options.remember !== false;
      const area = remember ? localStorage : sessionStorage;
      const baseKey = `sb-${target.database.project}-auth-token`;
      const probe = baseKey + ":storage-check:" + randomUUID();
      try {
        area.setItem(probe, "1");
        if (area.getItem(probe) !== "1") throw Error();
      } catch {
        throw Error(
          "ログイン状態を保存できません。ブラウザの保存設定を確認してください。",
        );
      } finally {
        try {
          area.removeItem(probe);
        } catch {}
      }
      // Authenticate in memory first. A failed identity check must never replace a saved session.
      const client = createClient(
        target.database.url,
        target.database.publicKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: "card-shard-login:" + randomUUID(),
          },
        },
      );
      try {
        const result = legacy
          ? { data: String(identifier).trim().toLowerCase() }
          : await client.rpc("card_album_login_identifier", {
              p_id: target.id,
              p_password: password,
            });
        if (result.error) throw result.error;
        if (result.data === "__CARD_ALBUM_DELETED__")
          throw Error("このアルバムは削除されています。");
        if (typeof result.data !== "string" || !result.data.includes("@"))
          throw Error("IDまたはパスワードが異なります。");
        const signed = await client.auth.signInWithPassword({
          email: result.data,
          password,
        });
        if (signed.error) throw signed.error;
        if (!signed.data?.session || !signed.data?.user)
          throw Error("ログイン状態を確認できませんでした。");
        const identity = await client
          .from("card_album_ids")
          .select("album_id")
          .eq("user_id", signed.data.user.id)
          .maybeSingle();
        if (
          identity.error ||
          !identity.data?.album_id ||
          (!legacy && identity.data.album_id !== target.id)
        )
          throw Error("アルバムIDを確認できませんでした。");
        target.display = display(target.database.key, identity.data.album_id);
        const savedKey = remember ? baseKey : baseKey + "-session";
        const updates = [
          [area, savedKey, JSON.stringify(signed.data.session)],
          [sessionStorage, baseKey + "-remember", String(remember)],
        ];
        if (remember)
          updates.push([localStorage, baseKey + "-remember", "true"]);
        const previous = [];
        try {
          for (const [storage, key, value] of updates) {
            previous.push([storage, key, storage.getItem(key)]);
            storage.setItem(key, value);
            if (storage.getItem(key) !== value) throw Error();
          }
        } catch {
          for (const [storage, key, old] of previous.reverse()) {
            try {
              if (old === null) storage.removeItem(key);
              else storage.setItem(key, old);
            } catch {}
          }
          throw Error(
            "ログイン状態を保存できません。ブラウザの保存設定を確認してください。",
          );
        }
        return { key: target.database.key, albumId: target.display };
      } finally {
        client.auth.stopAutoRefresh();
      }
    }
    async function status(key) {
      const database = entry(key);
      if (!database.enabled) return { key, state: "disabled", allowed: false };
      const result = await publicClient(key).rpc("card_album_shard_status_v1");
      if (result.error)
        throw Error(database.label + "の受付状況を確認できませんでした。");
      const value = result.data;
      if (
        !value ||
        value.prefix !== database.prefix ||
        typeof value.full !== "boolean" ||
        typeof value.allowed !== "boolean" ||
        typeof value.routing_blocked !== "boolean"
      )
        throw Error(database.label + "のDB設定が一致していません。");
      return { ...value, key };
    }
    async function registrationTarget() {
      for (const database of entries) {
        if (!database.enabled) continue;
        const current = await status(database.key);
        if (current.routing_blocked)
          return { key: null, reason: current.state || "closed" };
        const reservationWait =
          current.quota_configured === true &&
          current.allowed === false &&
          current.state === "reservation_wait";
        if (current.full || reservationWait) continue;
        // A cooldown, closed registration, missing quota or network error stops routing.
        if (!current.quota_configured || !current.allowed)
          return { key: null, reason: current.state || "closed" };
        return { key: database.key, reason: "available" };
      }
      return { key: null, reason: "all_full" };
    }
    return Object.freeze({
      entries: Object.freeze(entries),
      primary,
      parse,
      display,
      route,
      publicClient,
      catalogClient,
      personalClient,
      wrap,
      createClient: routedClient,
      signIn,
      status,
      registrationTarget,
    });
  }
  return Object.freeze({ config, create });
});

// App entry configuration; primary catalog clients never import private auth sessions.
if (typeof window !== "undefined")
  (() => {
    "use strict";
    const settings = window.CARD_SHARD_CORE.config;
    const initial = window.APP_CONFIG;
    const query = new URLSearchParams(location.search);
    const publicPage = ["shared", "browse"].includes(query.get("view"));
    const storageKey = "card-album-active-db-v1";
    let key = query.get("db");
    if (!key && !publicPage) {
      try {
        key =
          sessionStorage.getItem(storageKey) ||
          localStorage.getItem(storageKey);
      } catch {}
    }
    key ||= settings.primary;
    const primary = settings.databases.find(
      (row) => row.key === settings.primary,
    );
    const selected = settings.databases.find(
      (row) => row.key === key && row.enabled,
    );
    // Disabled/unknown query values must not initialize a private client on an unintended DB.
    const routeError = !selected
      ? Error("指定された登録先DBは準備中です。")
      : null;
    const current = selected || primary;
    const primaryConfig = Object.freeze({
      ...initial,
      supabaseUrl: new URL(primary.url).origin,
      supabaseKey: primary.publicKey,
    });
    const catalogConfig = Object.freeze({
      ...initial,
      supabaseUrl: settings.catalog.url,
      supabaseKey: settings.catalog.publicKey,
    });
    window.APP_CONFIG = Object.freeze({
      ...initial,
      supabaseUrl: new URL(current.url).origin,
      supabaseKey: current.publicKey,
    });
    let core,
      navigating = false;
    function persist(next) {
      try {
        sessionStorage.setItem(storageKey, next);
      } catch {}
      try {
        localStorage.setItem(storageKey, next);
      } catch {}
    }
    function navigate(next, signup = false) {
      if (!core || !core.entries.find((row) => row.key === next && row.enabled))
        throw Error("登録先DBは準備中です。");
      persist(next);
      navigating = true;
      location.replace(core.route(location.href, next, signup));
    }
    function display(value) {
      if (!value) return "";
      const normalized = String(value).normalize("NFKC").trim().toUpperCase();
      if (
        current.prefix &&
        normalized.length === 13 &&
        normalized.startsWith(current.prefix)
      )
        return normalized;
      return core.display(current.key, normalized);
    }
    function install() {
      if (routeError) throw routeError;
      if (core) return;
      const sdk = window.supabase;
      const native = sdk.createClient.bind(sdk);
      const storage = (name) => ({
        getItem: (key) => window[name].getItem(key),
        setItem: (key, value) => window[name].setItem(key, value),
        removeItem: (key) => window[name].removeItem(key),
      });
      core = window.CARD_SHARD_CORE.create(settings, {
        createClient: native,
        localStorage: storage("localStorage"),
        sessionStorage: storage("sessionStorage"),
        randomUUID: () => crypto.randomUUID(),
      });
      window.supabase = {
        ...sdk,
        createClient(url, publicKey, options) {
          return core.createClient(url, publicKey, options);
        },
      };
      if (!publicPage) persist(current.key);
    }
    window.CARD_DB = Object.freeze({
      key: current.key,
      primaryConfig,
      catalogConfig,
      catalogClient() {
        install();
        const client = core.catalogClient();
        return window.CARD_DIAGNOSTICS?.wrapClient(client, catalogConfig.supabaseUrl) || client;
      },
      install,
      createClient(url, publicKey, options) {
        install();
        const client = core.createClient(url, publicKey, options);
        return window.CARD_DIAGNOSTICS?.wrapClient(client, url) || client;
      },
      display,
      navigate,
      isNavigating: () => navigating,
      parse: (value) => core.parse(value),
      signIn: (...args) => core.signIn(...args),
      registrationTarget: () => core.registrationTarget(),
      shareURL(url) {
        const target = new URL(url, location.href);
        if (current.key !== settings.primary)
          target.searchParams.set("db", current.key);
        return target.href;
      },
    });
  })();
