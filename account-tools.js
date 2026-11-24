/* Card Album: account-tools.js. Original vendor notices: assets/licenses. */
(() => {
  const { modules, loadModule, ensureQRBundle, ensureQREncoder } = window.CARD_RUNTIME;
  modules["card-registration.js"] = function (sourceURL) {
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
        <div class="registration-totals">
          <div class="registration-total"><span>総カード数</span><strong id="registration-total">—</strong><span>枚</span></div>
          <div class="registration-total"><span>総コーデ数</span><strong id="registration-coordinate-total">—</strong><span>コーデ</span></div>
        </div>
        <div id="registration-counts" class="registration-counts"></div>
        <p id="registration-count-status" role="status" hidden></p>
        <button id="registration-count-retry" class="registration-more" type="button" hidden>登録数をもう一度読み込む</button>
        <p class="registration-count-note">総カード数はアンコール・おねがいアイプリ・ひみつのアイプリ・旧アイカツカード（ALLの6系統）の合計です。パラレルなどの別種も含みます。総コーデ数は、おねがいバース・ひみつバース・プリマジの合計です。構成パーツは総数に含めず、別に表示しています。</p>
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
      document
        .getElementById("legal-close")
        .addEventListener("click", () => sharedInfoDialog.close());

      const config = window.APP_CONFIG;
      const status = document.getElementById("registration-status");
      const more = document.getElementById("registration-more");
      const retry = document.getElementById("registration-retry");
      let db;
      let cursor = null;
      let loading = false;
      let initialized = false;
      const shown = new Set();
      const validCount = (value) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        (typeof value === "number" || typeof value === "string") &&
        Number.isSafeInteger(Number(value)) &&
        Number(value) >= 0;
      const number = (value) =>
        validCount(value) ? new Intl.NumberFormat("ja-JP").format(Number(value)) : "—";
      const sum = (values) =>
        values.every(validCount) &&
        Number.isSafeInteger(values.reduce((total, value) => total + Number(value), 0))
          ? values.reduce((total, value) => total + Number(value), 0)
          : null;
      let archiveCountFlight = null;
      let lastCounts = null;
      let countFlight = null;
      async function archiveCount() {
        if (!archiveCountFlight)
          archiveCountFlight = (async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            let response;
            let manifest;
            try {
              response = await fetch(new URL("assets/aikatsu-all/manifest.json", rootURL), {
                signal: controller.signal,
              });
              if (response.ok) manifest = await response.json();
            } finally {
              clearTimeout(timer);
            }
            if (!response.ok)
              throw Object.assign(new Error("旧カードの登録数を取得できませんでした。"), {
                status: response.status,
              });
            const wanted = ["cardlist", "stars", "friends", "onparade", "planet", "academy"];
            const systems = manifest?.systems;
            if (
              !Array.isArray(systems) ||
              wanted.some((id) => systems.filter((system) => system.id === id).length !== 1)
            )
              throw Error("旧カードの登録数を確認できませんでした。");
            const total = sum(wanted.map((id) => systems.find((system) => system.id === id).count));
            if (total === null) throw Error("旧カードの登録数を確認できませんでした。");
            return total;
          })().catch((error) => {
            archiveCountFlight = null;
            throw error;
          });
        return archiveCountFlight;
      }
      async function loadCounts(counts) {
        if (countFlight) return countFlight;
        lastCounts = counts;
        const button = document.getElementById("registration-count-retry");
        const message = document.getElementById("registration-count-status");
        button.disabled = true;
        countFlight = (async () => {
          const [legacy, primagi] = await Promise.allSettled([
            archiveCount(),
            db.rpc("card_primagi_catalog_counts"),
          ]);
          const merged = {
            ...counts,
            aikatsu_all: legacy.status === "fulfilled" ? legacy.value : null,
          };
          const errors = [];
          if (legacy.status === "rejected") errors.push(legacy.reason);
          if (primagi.status === "fulfilled" && !primagi.value.error && primagi.value.data)
            Object.assign(merged, primagi.value.data);
          else
            errors.push(
              primagi.status === "rejected"
                ? primagi.reason
                : primagi.value.error || Error("集計できませんでした。"),
            );
          if (![merged.primagi, merged.primagi_parts].every(validCount) && !errors.length)
            errors.push(Error("プリマジの登録数を確認できませんでした。"));
          renderCounts(merged);
          message.hidden = !errors.length;
          message.textContent = errors.length
            ? "一部の登録数を確認できませんでした。" + window.CARD_ERROR.message(errors[0])
            : "";
          button.hidden = !errors.length;
        })().finally(() => {
          countFlight = null;
          button.disabled = false;
        });
        return countFlight;
      }
      document.getElementById("registration-count-retry").onclick = () => {
        if (lastCounts) void loadCounts(lastCounts);
      };

      function renderCounts(counts) {
        document.getElementById("registration-total").textContent = number(
          sum([counts.aikatsu, counts.onegai, counts.himitsu, counts.aikatsu_all]),
        );
        document.getElementById("registration-coordinate-total").textContent = number(
          sum([counts.verse_onegai, counts.verse_himitsu, counts.primagi]),
        );
        const root = document.getElementById("registration-counts");
        root.replaceChildren();
        for (const [label, key, unit] of [
          ["アイカツ！アンコール", "aikatsu", "枚"],
          ["旧アイカツカード", "aikatsu_all", "枚"],
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
          if (!config?.supabaseUrl || !config?.supabaseKey || !window.CARD_DB?.createClient)
            throw new Error("configuration");
          db ||= window.CARD_DB.createClient(config.supabaseUrl, config.supabaseKey, {
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
          await loadCounts({ ...(data.counts || {}) });
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
        } catch (error) {
          status.textContent = window.CARD_ERROR.message(error);
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
  };

  modules["settings-commands.js"] = function (sourceURL) {
    /* ===== assets/js/command-definitions.js ===== */
    // Add command definitions here. Database operations must also be permitted by the RPC.
    window.CARD_COMMANDS = {
      scopes: {
        all: "全シリーズ",
        aikatsu: "アイカツ",
        onegai: "おねがい",
        himitsu: "ひみつ",
        "verse-onegai": "おねがいバース",
        "verse-himitsu": "ひみつバース",
      },
      actions: {
        read: {
          label: "確認・お楽しみ（変更なし）",
          types: {
            summary: "収集サマリー",
            duplicates: "重複カードを確認",
            favorites: "お気に入り数を確認",
            trade: "譲・求の件数を確認",
            random: "今日のランダムカード",
            next: "次に集めるカードを抽選",
          },
        },
        reset: {
          label: "解除・リセット",
          rpc: "card_album_reset_records",
          types: {
            all: "所持・お気に入り・譲求",
            ownership: "所持記録",
            favorites: "お気に入り",
            trade: "譲・求",
            offer: "譲のみ",
            want: "求のみ",
          },
          warning:
            "元に戻せません。バースの共通パーツを削除すると、他のだんの収集状況にも反映されます。",
        },
        set: {
          label: "一括登録・設定",
          rpc: "card_album_set_records",
          types: {
            ownership: "持っているにする",
            parts: "バース全パーツを持っているにする",
            favorites: "お気に入りにする",
            offer: "譲にする",
            want: "求にする",
            "priority-offer": "優先譲にする",
            "priority-want": "優先求にする",
          },
          warning:
            "既存の所持数は減らさず、未所持を1枚にします。ownershipはバースのフルコーデだけ、partsはパーツだけを登録します。譲と求は入れ替わり、通常・優先も指定値に変更します。",
        },
      },
    };

    // Public command tokens are independent of database names and UI headings.
    window.CARD_COMMANDS.codes = {
      actions: { read: "A01", set: "A02", reset: "A03", check: "A04" },
      scopes: {
        all: "T00",
        aikatsu: "T01",
        onegai: "T02",
        himitsu: "T03",
        "verse-onegai": "T04",
        "verse-himitsu": "T05",
      },
      types: {
        all: "D00",
        ownership: "D01",
        parts: "D02",
        favorites: "D03",
        trade: "D04",
        offer: "D05",
        want: "D06",
        "priority-offer": "D07",
        "priority-want": "D08",
        summary: "D09",
        duplicates: "D10",
        random: "D11",
        next: "D12",
      },
    };
    window.CARD_COMMANDS.help = {
      set: {
        ownership:
          "未所持のカード・フルコーデを1枚として登録します。すでに1枚以上あるものの枚数は変えません。バースのパーツ数は変更しません。",
        parts:
          "対象のバース構成パーツを未所持なら1枚として登録します。フルコーデの枚数は変更しません。共通パーツは他のだんにも反映されます。",
        favorites: "対象をお気に入りに追加します。所持数・譲求は変更しません。",
        offer:
          "対象を通常の譲に設定します。求の設定は解除され、優先指定も通常になります。所持数は変更しません。",
        want: "対象を通常の求に設定します。譲の設定は解除され、優先指定も通常になります。所持数は変更しません。",
        "priority-offer":
          "対象を優先の譲に設定します。求の設定は解除されます。所持数は変更しません。",
        "priority-want":
          "対象を優先の求に設定します。譲の設定は解除されます。所持数は変更しません。",
      },
      reset: {
        all: "対象の所持記録・お気に入り・譲求をまとめて削除します。アカウントやカード情報は残ります。元に戻せません。",
        ownership:
          "対象の所持記録を削除して0枚にします。お気に入りと譲求は残ります。バースはフルコーデと構成パーツが対象です。",
        favorites: "対象のお気に入りだけを解除します。所持数と譲求は残ります。",
        trade: "対象の譲・求と優先指定を解除します。所持数とお気に入りは残ります。",
        offer: "対象の譲と優先譲だけを解除します。求・所持数・お気に入りは残ります。",
        want: "対象の求と優先求だけを解除します。譲・所持数・お気に入りは残ります。",
      },
      read: {
        summary:
          "対象の種類数・直接所持登録の種類数・合計枚数を確認します。バースはパーツからの収集判定を含みません。記録は変更しません。",
        duplicates:
          "2枚以上登録している種類数と、2枚目以降の合計枚数を確認します。バースはフルコーデの直接所持のみです。",
        favorites: "対象のお気に入り登録数を確認します。記録は変更しません。",
        trade:
          "対象の譲・求・優先指定の件数を確認します。バースはフルコーデのみです。記録は変更しません。",
        random: "対象の中からランダムに1件を表示します。所持やお気に入りへの登録は行いません。",
        next: "直接所持登録がないカード・フルコーデからランダムに収集候補を表示します。バースのパーツによる完成判定は含みません。",
      },
    };
    /* ===== assets/js/settings-commands.js ===== */
    (() => {
      const host = window.CARD_TRADE_HOST,
        defs = window.CARD_COMMANDS,
        settings = document.getElementById("display-settings-dialog");
      if (!host || !defs || !settings) return;
      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = "command-entry";
      entry.hidden = true; // Hide the entry while retaining the command system.
      entry.textContent = "コマンドを実行";
      settings.append(entry);
      const panel = document.createElement("section");
      panel.id = "command-page";
      panel.hidden = true;
      panel.innerHTML = `<div class="command-heading"><h1>コマンド実行</h1><button type="button" data-back>アルバムに戻る</button></div><details class="command-notice"><summary><svg class="command-warning-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.1 4.7a2.2 2.2 0 0 1 3.8 0l7.2 12.6a2.2 2.2 0 0 1-1.9 3.3H4.8a2.2 2.2 0 0 1-1.9-3.3Z" fill="currentColor" opacity=".14"/><path d="M10.1 4.7a2.2 2.2 0 0 1 3.8 0l7.2 12.6a2.2 2.2 0 0 1-1.9 3.3H4.8a2.2 2.2 0 0 1-1.9-3.3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 9v4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.1" fill="currentColor"/></svg><span>実行前の注意事項</span><i aria-hidden="true"></i></summary><div><p>リセット・解除で消した記録は元に戻せません。入力補助で対象と操作を選び、実行前に内容を確認してください。</p><ul><li>変更できるのは自分の記録だけです。アカウント・カード情報・共有URLは削除しません。</li><li>一括所持登録は未所持を1枚にします。例：0枚→1枚、3枚→3枚。リセットを選んだ場合は0枚になります。</li><li>譲と求は同時に設定できません。新しく選んだ側に切り替わります。</li><li>共通のバースパーツの変更は、そのパーツを使う他のだんにも反映されます。</li><li>確認は5分間有効です。確認後に記録やカード情報が変わったら、もう一度確認してください。</li><li>確認は1分10回、変更の実行は1分3回までです。HTMLやSQLは実行できません。</li></ul></div></details><article class="command-box"><h2>コマンド入力</h2><textarea id="command-input" rows="3" placeholder="例：A02 T01 D01 S00" aria-label="実行するコマンド" maxlength="100" autocapitalize="characters" autocomplete="off" spellcheck="false"></textarea><div class="command-actions"><button type="button" class="primary" data-execute>実行</button></div></article><article class="command-box"><h2>実行結果</h2><div class="command-result" role="status" aria-live="polite">まだ実行していません。</div></article><article class="command-box"><h2>入力補助</h2><div class="command-assist"><label>対象（広）<select data-scope></select></label><label>実行詳細<select data-type></select></label><label>実行種類<select data-action><option value="read">確認・お楽しみ</option><option value="set">登録・設定</option><option value="reset">リセット・解除</option><option value="check">件数確認（リセット対象）</option></select></label><label>対象（狭）<select data-series><option value="">すべてのだん</option></select></label></div><div class="command-actions"><button type="button" data-generate>入力欄に出力</button></div><p class="command-note">出力だけでは実行されません。上の入力欄を確認して「実行」を押してください。</p></article><details class="command-box command-list"><summary>コマンド一覧</summary><p class="command-note">各行は全だんを対象とするコマンドです。だんを限定する場合は入力補助から選択してください。</p><div data-list></div></details>`;
      document.getElementById("collection").parentElement.append(panel);
      const $ = (s) => panel.querySelector(s),
        input = $("#command-input"),
        result = $(".command-result"),
        run = $("[data-execute]"),
        scope = $("[data-scope]"),
        type = $("[data-type]"),
        action = $("[data-action]");
      const codes = defs.codes;
      const reverse = (table, token) => Object.keys(table).find((key) => table[key] === token);
      function commandText(action, scope, type, series = "S00") {
        return [codes.actions[action], codes.scopes[scope], codes.types[type], series].join(" ");
      }
      async function seriesChoices(target) {
        const labels = new Set();
        const keys =
          target === "all" ? Object.keys(defs.scopes).filter((x) => x !== "all") : [target];
        for (const key of keys)
          for (const item of await window.CARD_SHARE_HOST.scopeItems(key)) {
            const values =
              item.appearances?.map((x) => x.series) ||
              (Array.isArray(item.series) ? item.series : [item.series]);
            for (const value of values || [])
              if (typeof value === "string" && value) labels.add(value);
          }
        const choices = new Map([["S00", null]]);
        for (const label of [...labels].sort((a, b) =>
          b.localeCompare(a, "ja", { numeric: true }),
        )) {
          const bytes = new TextEncoder().encode(label);
          const hash = await crypto.subtle.digest("SHA-256", bytes);
          const token =
            "S" +
            [...new Uint8Array(hash)]
              .slice(0, 8)
              .map((x) => x.toString(16).padStart(2, "0"))
              .join("")
              .toUpperCase();
          if (choices.has(token) && choices.get(token) !== label)
            throw Error("だんコードの重複を検出しました。");
          choices.set(token, label);
        }
        return choices;
      }
      function options(select, values) {
        select.replaceChildren(
          ...Object.entries(values).map(([value, text]) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = text;
            return o;
          }),
        );
      }
      options(scope, defs.scopes);
      function fillTypes() {
        const definition = defs.actions[action.value === "check" ? "reset" : action.value];
        options(
          type,
          Object.fromEntries(
            Object.entries(definition.types).filter(
              ([k]) =>
                k !== "parts" ||
                ["all", "verse-onegai", "verse-himitsu", "verse-primagi"].includes(scope.value),
            ),
          ),
        );
      }
      action.onchange = fillTypes;
      let seriesRequest = 0;
      async function fillSeries() {
        const id = ++seriesRequest,
          select = $("[data-series]");
        select.disabled = true;
        select.replaceChildren(new Option("読み込み中…", ""));
        try {
          const choices = await seriesChoices(scope.value);
          if (id !== seriesRequest) return;
          options(
            select,
            Object.fromEntries(
              [...choices].map(([token, label]) => [token, label || "すべてのだん"]),
            ),
          );
        } catch (e) {
          if (id === seriesRequest) {
            options(select, { S00: "すべてのだん" });
            result.textContent = "だんの候補を取得できませんでした。もう一度対象を選んでください。";
          }
        } finally {
          if (id === seriesRequest) select.disabled = false;
        }
      }
      scope.onchange = () => {
        fillTypes();
        fillSeries();
      };
      fillTypes();
      $("[data-generate]").onclick = () => {
        const series = $("[data-series]").value.trim();
        if ($("[data-series]").disabled) {
          result.textContent = "だんの読み込みが終わるまでお待ちください。";
          return;
        }
        input.value = commandText(action.value, scope.value, type.value, series || "S00");
        input.focus();
        result.textContent = "コマンドを入力欄へ出力しました。まだ実行していません。";
      };
      async function copy(text) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          input.value = text;
          input.focus();
          input.select();
          throw Error("入力欄に表示しました。選択した文字列をコピーしてください。");
        }
      }
      const list = $("[data-list]");
      for (const key of ["read", "set", "reset", "check"]) {
        const def = defs.actions[key === "check" ? "reset" : key];
        const group = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = key === "check" ? "件数確認" : def.label;
        group.append(summary);
        for (const [s, label] of Object.entries(defs.scopes))
          for (const [t, description] of Object.entries(def.types)) {
            if (
              t === "parts" &&
              !["all", "verse-onegai", "verse-himitsu", "verse-primagi"].includes(s)
            )
              continue;
            const row = document.createElement("div");
            row.className = "command-list-row";
            const code = document.createElement("code");
            code.textContent = commandText(key, s, t);
            const help = document.createElement("small");
            help.textContent = `${label}：${description}${key === "check" ? "の対象件数を確認（変更なし）" : ""}`;
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = "コピー";
            b.onclick = async () => {
              try {
                await copy(code.textContent);
                b.textContent = "コピー済み";
                setTimeout(() => (b.textContent = "コピー"), 1500);
              } catch (e) {
                result.textContent = window.CARD_ERROR.message(e);
              }
            };
            const explanation = document.createElement("p");
            explanation.className = "command-explanation";
            explanation.textContent =
              key === "check"
                ? "この対象・種類でリセットした場合の件数だけを確認します。登録・削除は行いません。"
                : defs.help?.[key]?.[t] || "";
            row.append(code, help, explanation, b);
            group.append(row);
          }
        list.append(group);
      }
      const dialog = document.createElement("dialog");
      dialog.className = "command-confirm";
      dialog.innerHTML =
        '<h2>リセットを実行しますか？</h2><p data-target></p><p data-count></p><p data-warning></p><p role="status" data-error></p><div class="command-actions"><button type="button" data-cancel>キャンセル</button><button type="button" class="danger" data-confirm>リセットする</button></div>';
      document.body.append(dialog);
      let pending = null,
        busy = false;
      function auth() {
        if (!host.session()) {
          panel.hidden = true;
          host.toast("ログインしてください", "error");
          host.screen("auth");
          return false;
        }
        if (host.maintenance()) {
          result.textContent = "メンテナンス中は実行できません。";
          return false;
        }
        return true;
      }
      async function parse() {
        const text = input.value.trim().toUpperCase();
        if (text.length > 100 || !/^A[0-9]{2} T[0-9]{2} D[0-9]{2} S(?:00|[0-9A-F]{16})$/.test(text))
          throw Error(
            "専用の英数字コマンドを入力してください。HTML・SQL・スクリプトは使用できません。",
          );
        const [a, t, d, seriesToken] = text.split(" ");
        const action = reverse(codes.actions, a),
          scope = reverse(codes.scopes, t),
          type = reverse(codes.types, d);
        const definition = defs.actions[action === "check" ? "reset" : action];
        if (
          !scope ||
          !definition ||
          !Object.hasOwn(definition.types, type) ||
          (type === "parts" &&
            !["all", "verse-onegai", "verse-himitsu", "verse-primagi"].includes(scope))
        )
          throw Error("この組み合わせは使用できません。入力補助から選んでください。");
        let series = null;
        if (seriesToken !== "S00") {
          const choices = await seriesChoices(scope);
          if (!choices.has(seriesToken))
            throw Error("だんのコードが見つかりません。入力補助から選び直してください。");
          series = choices.get(seriesToken);
        }
        return {
          action,
          def: definition,
          args: { p_scope: scope, p_type: type, p_series: series },
        };
      }

      async function readCommand(cmd) {
        const scope = cmd.args.p_scope,
          series = cmd.args.p_series;
        let catalog = [];
        const keys =
          scope === "all" ? Object.keys(defs.scopes).filter((x) => x !== "all") : [scope];
        for (const key of keys) {
          const items = await window.CARD_SHARE_HOST.scopeItems(key);
          for (const item of items) {
            const labels =
              item.appearances?.map((x) => x.series) ||
              (Array.isArray(item.series) ? item.series : [item.series]);
            if (!series || labels?.includes(series)) catalog.push({ ...item, _scope: key });
          }
        }
        async function rows(table, columns) {
          const all = [];
          for (let offset = 0; ; offset += 1000) {
            const { data, error } = await host
              .client()
              .from(table)
              .select(columns)
              .eq("user_id", host.session().user.id)
              .order(columns.split(",")[0])
              .range(offset, offset + 999);
            if (error) throw error;
            all.push(...data);
            if (data.length < 1000) return all;
          }
        }
        const cardIds = new Set(
            catalog.filter((x) => !x._scope.startsWith("verse-")).map((x) => x.id),
          ),
          fullIds = new Set(catalog.filter((x) => x._scope.startsWith("verse-")).map((x) => x.id));
        if (cmd.args.p_type === "random") {
          const c = catalog[Math.floor(Math.random() * catalog.length)];
          return c ? `今日の1枚：${c.code || ""} ${c.name || ""}` : "対象がありません。";
        }
        if (cmd.args.p_type === "favorites") {
          const a = cardIds.size ? await rows("card_favorites", "card_id") : [],
            b = fullIds.size ? await rows("card_verse_favorites", "coordinate_id") : [];
          return `お気に入り：${a.filter((x) => cardIds.has(x.card_id)).length + b.filter((x) => fullIds.has(x.coordinate_id)).length}件`;
        }
        if (cmd.args.p_type === "trade") {
          const a = (await rows("card_trade_requests", "kind,target_id,side,priority")).filter(
            (x) =>
              x.kind === "card"
                ? cardIds.has(x.target_id)
                : x.kind === "coordinate" && fullIds.has(x.target_id),
          );
          return `譲：${a.filter((x) => x.side === "offer").length}件 ／ 求：${a.filter((x) => x.side === "want").length}件 ／ 優先：${a.filter((x) => x.priority === 2).length}件`;
        }
        const a = cardIds.size ? await rows("card_ownership", "card_id,quantity") : [],
          b = fullIds.size
            ? await rows("card_verse_coordinate_ownership", "coordinate_id,quantity")
            : [];
        const owned = new Map([
          ...a.filter((x) => cardIds.has(x.card_id)).map((x) => [x.card_id, x.quantity]),
          ...b
            .filter((x) => fullIds.has(x.coordinate_id))
            .map((x) => [x.coordinate_id, x.quantity]),
        ]);
        if (cmd.args.p_type === "next") {
          const missing = catalog.filter((x) => !(owned.get(x.id) > 0));
          const c = missing[Math.floor(Math.random() * missing.length)];
          return c
            ? `次の収集候補：${c.code || ""} ${c.name || ""}`
            : "対象の記録はすべて登録済みです。";
        }
        if (cmd.args.p_type === "duplicates")
          return `重複：${[...owned.values()].filter((x) => x >= 2).length}種類 ／ 2枚目以降：${[...owned.values()].reduce((n, x) => n + Math.max(0, x - 1), 0)}枚`;
        return `対象 ${catalog.length}種類 ／ 直接所持登録 ${[...owned.values()].filter((x) => x > 0).length}種類 ／ 合計 ${[...owned.values()].reduce((n, x) => n + x, 0)}枚
バースはフルコーデの直接登録数です。パーツからの収集判定は含みません。`;
      }
      async function rpc(cmd, execute) {
        if (execute && !cmd.confirmationToken) throw Error("内容を確認し直してください。");
        const name = execute ? "card_album_command_execute" : "card_album_command_prepare";
        const args = execute
          ? { p_token: cmd.confirmationToken }
          : { p_action: cmd.action, ...cmd.args };
        const { data, error } = await host.client().rpc(name, args);
        if (error) throw error;
        if (data?.error) {
          if (execute) cmd.confirmationToken = null;
          throw Error(data.error);
        }
        if (!execute) cmd.confirmationToken = data.confirmation_token || null;
        if (execute) cmd.confirmationToken = null;
        return data;
      }

      const counts = (d) =>
        `所持 ${d.ownership}件 ／ お気に入り ${d.favorites}件 ／ 譲求 ${d.trade}件`;
      async function execute(cmd, user) {
        if (!auth() || host.session()?.user.id !== user)
          throw Error("ログイン状態が変わりました。");
        const data = await rpc(cmd, true);
        if (host.session()?.user.id !== user) return;
        result.textContent = "実行しました。" + counts(data);
        pending = null;
        dialog.close();
        try {
          await host.refreshCommandData();
        } catch {
          result.textContent +=
            " 一覧への反映に失敗しました。アルバムに戻る前に再読み込みしてください。";
        }
      }
      run.onclick = async () => {
        if (busy || !auth()) return;
        busy = true;
        run.disabled = true;
        try {
          const cmd = await parse(),
            user = host.session().user.id;
          result.textContent = "確認中…";
          if (cmd.action === "read") {
            const text = await readCommand(cmd);
            if (host.session()?.user.id === user) result.textContent = text;
            return;
          }
          const data = await rpc(cmd, false);
          if (host.session()?.user.id !== user) return;
          result.textContent = counts(data);
          if (cmd.action === "check" || !data.total) {
            if (!data.total) result.textContent += " 変更対象はありません。";
            return;
          }
          if (cmd.action === "reset") {
            pending = { cmd, user };
            dialog.querySelector("[data-target]").textContent =
              `${defs.scopes[cmd.args.p_scope]} ／ ${cmd.def.types[cmd.args.p_type]} ／ ${cmd.args.p_series || "全だん"}`;
            dialog.querySelector("[data-count]").textContent = counts(data);
            dialog.querySelector("[data-warning]").textContent = cmd.def.warning;
            dialog.querySelector("[data-error]").textContent = "";
            dialog.showModal();
          } else {
            result.textContent = "実行中…";
            await execute(cmd, user);
          }
        } catch (e) {
          result.textContent = window.CARD_ERROR.message(e);
        } finally {
          busy = false;
          run.disabled = false;
        }
      };
      const confirm = dialog.querySelector("[data-confirm]");
      confirm.onclick = async () => {
        if (busy || !pending) return;
        busy = true;
        confirm.disabled = true;
        try {
          await execute(pending.cmd, pending.user);
        } catch (e) {
          dialog.querySelector("[data-error]").textContent = window.CARD_ERROR.message(e);
        } finally {
          busy = false;
          confirm.disabled = false;
        }
      };
      dialog.querySelector("[data-cancel]").onclick = () => {
        if (!busy) {
          pending = null;
          dialog.close();
        }
      };
      dialog.addEventListener("cancel", (e) => {
        if (busy) e.preventDefault();
        else pending = null;
      });
      entry.onclick = () => {
        if (!auth()) return;
        settings.close();
        host.screen("command-page");
        fillSeries();
      };
      $("[data-back]").onclick = () => {
        if (!busy) {
          panel.hidden = true;
          host.back();
        }
      };
    })();
  };
})();
