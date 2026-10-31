(() => {
  "use strict";

  const rootURL = new URL("./", location.href);
  const pageURL = new URL(rootURL);
  pageURL.searchParams.set("view", "card-registration");
  const isPage = new URLSearchParams(location.search).get("view") === "card-registration";

  if (!isPage) {
    const selection = document.getElementById("selection");
    if (!selection || document.getElementById("card-registration-open")) return;
    const link = document.createElement("a");
    link.id = "card-registration-open";
    link.className = "registration-fab";
    link.href = pageURL.href;
    link.setAttribute("aria-label", "カード登録情報を見る");
    link.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="5" width="12" height="15" rx="2"/><path d="M9 2h9a2 2 0 0 1 2 2v12M8 10h4m-4 4h4"/></svg><span>カード<br>登録情報</span>';
    document.body.append(link);
    const update = () => {
      link.hidden = selection.hidden;
    };
    new MutationObserver(update).observe(selection, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
    update();
    return;
  }

  // routerが展開した一般サイトの共通部分をそのまま使います。
  const sharedHeader = document.querySelector("body > header");
  const sharedFooter = document.querySelector("body > footer");
  const sharedInfoDialog = document.getElementById("info-dialog");
  if (!sharedHeader || !sharedFooter || !sharedInfoDialog) {
    throw new Error("共通ヘッダー・フッターを読み込めませんでした。再読み込みしてください。");
  }
  sharedHeader.remove();
  sharedFooter.remove();
  sharedInfoDialog.remove();
  document.body.className = "registration-page";
  document.body.innerHTML = `
    <main class="registration-main">
      <div class="registration-heading"><span class="registration-eyebrow">登録状況とこれまでの追加記録</span><h1>カード登録情報</h1></div>
      <section class="registration-stats" aria-label="現在の登録数" aria-busy="true">
        <div class="registration-total"><span>通常アルバムの登録カード数</span><strong id="registration-total">—</strong><span>枚</span></div>
        <div id="registration-counts" class="registration-counts"></div>
        <p class="registration-count-note">アンコール・おねがいアイプリ・ひみつのアイプリの合計です。パラレルなどの別種を含み、アイカツALLの旧カードは含みません。バース・プリマジのコーデとパーツは別集計です。</p>
      </section>
      <section class="registration-history" aria-labelledby="registration-history-title">
        <div class="registration-section-heading"><h2 id="registration-history-title">登録履歴</h2><span>新しい順</span></div>
        <p id="registration-status" role="status">登録情報を読み込んでいます…</p>
        <div id="registration-entries"></div>
        <button id="registration-more" class="registration-more" type="button" hidden>過去の登録情報を表示</button>
        <button id="registration-retry" class="registration-more" type="button" hidden>もう一度読み込む</button>
      </section>
    </main>
    `;
  const backLink = document.createElement("a");
  backLink.className = "registration-top-link";
  backLink.href = rootURL.href;
  backLink.innerHTML = '<span aria-hidden="true"></span>トップに戻る';
  sharedHeader.append(backLink);
  document.body.prepend(sharedHeader);
  document.body.append(sharedFooter, sharedInfoDialog);

  const infoTitle = document.getElementById("info-title");
  document.querySelectorAll("[data-info]").forEach((button) => {
    button.addEventListener("click", () => {
      const info = window.REGISTRATION_SITE_INFO?.[button.dataset.info];
      if (!info) return;
      infoTitle.textContent = info.title;
      const body = document.getElementById("info-body");
      body.innerHTML = info.body;
      body.querySelectorAll("[data-contact]").forEach((element) => {
        const link = document.createElement("a");
        link.href = new URL("contact/", rootURL).href;
        link.textContent = "お問い合わせフォームへ";
        element.replaceChildren(link);
      });
      sharedInfoDialog.showModal();
      infoTitle.setAttribute("tabindex", "-1");
      infoTitle.focus({ preventScroll: true });
      body.scrollTop = 0;
    });
  });
  document.getElementById("legal-close").addEventListener("click", () => sharedInfoDialog.close());

  const config = window.APP_CONFIG;
  const status = document.getElementById("registration-status");
  const more = document.getElementById("registration-more");
  const retry = document.getElementById("registration-retry");
  let db;
  let cursor = null;
  let loading = false;
  let initialized = false;
  const shown = new Set();
  const number = (value) =>
    Number.isSafeInteger(Number(value)) && Number(value) >= 0
      ? new Intl.NumberFormat("ja-JP").format(Number(value))
      : "—";

  function renderCounts(counts) {
    document.getElementById("registration-total").textContent = number(counts.cards);
    const root = document.getElementById("registration-counts");
    root.replaceChildren();
    for (const [label, key, unit] of [
      ["アイカツ！アンコール", "aikatsu", "枚"],
      ["おねがいアイプリ", "onegai", "枚"],
      ["ひみつのアイプリ", "himitsu", "枚"],
      ["おねがいバース", "verse_onegai", "コーデ"],
      ["ひみつバース", "verse_himitsu", "コーデ"],
      ["バース構成パーツ", "verse_parts", "点"],
      ["ワッチャプリマジ！", "primagi", "コーデ"],
      ["プリマジ構成パーツ", "primagi_parts", "点"],
    ]) {
      const item = document.createElement("div");
      item.dataset.series = key;
      const name = document.createElement("span");
      const amount = document.createElement("strong");
      name.textContent = label;
      amount.textContent = number(counts[key]) + " " + unit;
      item.append(name, amount);
      root.append(item);
    }
    document.querySelector(".registration-stats").setAttribute("aria-busy", "false");
  }

  function renderEntry(entry) {
    const details = document.createElement("details");
    details.className = "registration-entry";
    const summary = document.createElement("summary");
    const titleText = String(entry.summary || "カード情報を更新");
    const badge = document.createElement("span");
    badge.className = "registration-entry-kind";
    const kind = titleText.includes("既存登録分")
      ? "existing"
      : titleText.includes("更新")
        ? "updated"
        : /追加|登録（/.test(titleText)
          ? "added"
          : "notice";
    details.dataset.kind = kind;
    badge.textContent = {
      existing: "既存登録",
      updated: "情報更新",
      added: "追加登録",
      notice: "お知らせ",
    }[kind];
    const meta = document.createElement("span");
    meta.className = "registration-entry-meta";
    const id = document.createElement("span");
    id.className = "registration-entry-id";
    id.textContent = "REG-" + String(entry.display_number ?? entry.id).padStart(6, "0");
    const time = document.createElement("time");
    const date = new Date(entry.updated_on);
    if (Number.isFinite(date.getTime())) {
      time.dateTime = date.toISOString();
      time.textContent = new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    } else time.textContent = "日付未設定";
    meta.append(time, id, badge);
    const title = document.createElement("strong");
    title.className = "registration-entry-title";
    title.textContent = titleText;
    const arrow = document.createElement("span");
    arrow.className = "registration-chevron";
    arrow.setAttribute("aria-hidden", "true");
    const expand = document.createElement("span");
    expand.className = "registration-entry-expand";
    expand.textContent = "詳細";
    expand.append(arrow);
    summary.append(meta, title, expand);
    const content = document.createElement("div");
    content.className = "registration-entry-content";
    for (const text of Array.isArray(entry.details) ? entry.details : []) {
      const paragraph = document.createElement("p");
      paragraph.textContent = String(text);
      content.append(paragraph);
    }
    if (!content.childNodes.length) content.textContent = "詳細はありません。";
    details.append(summary, content);
    document.getElementById("registration-entries").append(details);
  }

  async function load() {
    if (loading) return;
    loading = true;
    more.disabled = true;
    retry.hidden = true;
    status.hidden = false;
    status.textContent = "登録情報を読み込んでいます…";
    try {
      if (!config?.supabaseUrl || !config?.supabaseKey || !window.supabase?.createClient)
        throw new Error("configuration");
      db ||= window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
        auth: {
          storageKey: "card-registration-anonymous",
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      const { data, error } = await db.rpc("card_album_registration_feed", {
        p_before: cursor,
        p_limit: 20,
      });
      if (error || !data || !Array.isArray(data.updates)) throw error || new Error("response");
      const counts = { ...(data.counts || {}) };
      const primagi = await db.rpc("card_primagi_catalog_counts");
      if (!primagi.error && primagi.data) Object.assign(counts, primagi.data);
      renderCounts(counts);
      for (const entry of data.updates) {
        if (shown.has(String(entry.id))) continue;
        renderEntry(entry);
        shown.add(String(entry.id));
      }
      cursor = data.next_before ?? null;
      more.hidden = cursor === null;
      initialized = true;
      status.hidden = shown.size > 0;
      status.textContent = "登録履歴はまだありません。";
    } catch {
      status.textContent = "登録情報を読み込めませんでした。時間をおいて、もう一度お試しください。";
      retry.hidden = false;
      if (!initialized)
        document.querySelector(".registration-stats").setAttribute("aria-busy", "false");
    } finally {
      loading = false;
      more.disabled = false;
    }
  }

  more.addEventListener("click", load);
  retry.addEventListener("click", load);
  load();
})();
