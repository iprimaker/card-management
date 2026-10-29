/* Shared page components. Initialized once after templates are mounted. */
(() => {
  let initialized = false;
  window.CARD_SITE_COMMON = {
    init(page) {
      if (initialized) return;
      initialized = true;
      if (["album", "contact", "card-registration"].includes(page)) {
        /* site-info.js */
        window.SITE_INFO = {
  "terms": {
    "title": "利用規約",
    "body": "<p>制定日：2026年10月8日<br>最終改定日：2026年10月30日</p>\n<p>この規約は、「カードアルバム」（以下「本サイト」）の利用条件を定めます。</p>\n<h3>1. サービスについて</h3>\n<p>本サイトは、カードやコーデの検索、所持状況の記録、QRコードの保管などを目的とした、個人運営の非公式サービスです。</p>\n<p>カードの売買や、公式のゲームデータとの連携は行っていません。本サイトでの登録・変更が、実際のゲームのデータに反映されることはありません。</p>\n<h3>2. アカウントについて</h3>\n<p>アルバムIDとパスワードは、ご自身で大切に管理してください。他人のアカウントの利用、なりすまし、第三者の個人情報を含むニックネームの登録は禁止します。</p>\n<p>パスワードを忘れた場合、再設定やアカウントの復旧はできません。</p>\n<p>1か月間ログイン・利用がないアカウントは、所持記録などの関連データとともに自動削除します。ログイン状態を維持して本サイトを利用している場合も、利用日時を更新します。削除されたアルバムIDは再利用できません。</p>\n<p>運営状況により、新規登録を招待制としたり、受付を停止したりする場合があります。</p>\n<h3>3. QRコードの登録・利用について</h3>\n<p>ご自身が利用する権限を持つQRコードを登録してください。他人のQRコードの無断利用や、不正に入手したコードの登録は禁止します。</p>\n<p>QRコードは読み取ったデータを保存し、表示時に再生成します。元のQRコードと模様が異なる場合があり、すべての端末・ゲーム機での読み取りを保証するものではありません。元のカードやコードも、ご自身で保管してください。</p>\n<p>QRコードの登録上限は、運営状況やアルバムの利用状況などに応じて変更する場合があります。上限が現在の登録数を下回った場合も、超過を理由に登録済みのQRコードを削除することはありませんが、新たな登録はできなくなります。</p>\n<p>セーブコード・フレンドカードの登録には、別途案内する「QRコード登録規約」も適用します。</p>\n<h3>4. 共有機能について</h3>\n<p>所持状況などの共有機能を利用する際は、公開する範囲を確認してください。共有URLを知っている人は、設定された範囲の情報を閲覧できます。</p>\n<p>登録したQRコードの読み取りデータは、共有情報には含めません。</p>\n<h3>5. 禁止事項</h3>\n<ul>\n<li>不正アクセス、権限の回避、他人のアカウントやデータへの不正な操作</li>\n<li>自動処理などによって、本サイトに過度な負荷をかける行為</li>\n<li>他の利用者や権利者への迷惑行為、権利を侵害する行為</li>\n<li>本サイトや登録データを利用した違法行為</li>\n<li>第三者の個人情報や、利用する権限のない情報の登録</li>\n</ul>\n<p>違反への対応や安全な運営のため、必要に応じて利用制限、登録情報の削除、アカウントの停止・削除を行う場合があります。</p>\n<h3>6. 掲載情報と権利について</h3>\n<p>作品名、カード画像、コーデ画像、名称などの権利は、各権利者に帰属します。</p>\n<p>掲載情報には、誤りや更新の遅れが含まれる場合があります。ゲームの仕様、配布期間、利用条件などは、各公式サイトもあわせてご確認ください。</p>\n<h3>7. サービスの変更・停止と責任について</h3>\n<p>保守、障害、外部サービスの変更、運営上の事情などにより、機能の変更やサービスの停止・終了を行う場合があります。重要な情報は、ご自身でも控えを残してください。</p>\n<p>運営者は、掲載情報の完全な正確性や、サービスの継続提供、データが失われないことを保証するものではありません。</p>\n<h3>8. 規約の変更について</h3>\n<p>規約を変更する場合は、本サイトで変更内容と適用日を案内します。利用者に重要な影響を及ぼす変更は、内容に応じて事前に案内します。</p>\n<h3>9. お問い合わせ・修正・削除依頼について</h3>\n<p>サービスに関するご相談や、掲載情報の修正・削除依頼は、お問い合わせフォームからご連絡ください。</p>\n<p>修正・削除をご希望の場合は、対象の情報と理由をお知らせください。内容を確認し、権利侵害などへの対応が必要な場合は、速やかに対応します。確認のため、追加の情報をお願いする場合があります。</p>\n<p><a href=\"https://iprimaker.github.io/card-management/contact/\">お問い合わせフォームへ</a></p>"
  },
  "privacy": {
    "title": "プライバシーポリシー",
    "body": "<p>制定日：2026年10月8日<br>最終改定日：2026年10月30日</p>\n<p>カードアルバムの運営者は、本サイトの提供と安全な運営に必要な範囲で、利用者の情報を取り扱います。</p>\n<h3>1. 取り扱う情報</h3>\n<ul>\n<li>アルバムID、ニックネーム、登録日時、ログイン・利用日時、メールアドレス（登録されている場合）</li>\n<li>カード・コーデ・パーツの所持数、お気に入り、交換希望などの登録内容</li>\n<li>QRコードの読み取りデータ</li>\n<li>セーブコード・フレンドカードに登録したマイキャラ名、ID、誕生日、メモなど</li>\n<li>共有URLの設定と共有範囲</li>\n<li>お問い合わせの種類、内容、任意のお名前、返信先メールアドレス（未ログインの場合）、アルバムID（ログイン済みの場合）、返信内容</li>\n<li>認証、不正利用の防止、通信・障害対応に必要な情報</li>\n</ul>\n<p>誕生日などの任意項目は、入力しなくても利用できます。個人を特定できる情報や、第三者の個人情報を必要以上に登録しないでください。</p>\n<h3>2. 利用目的</h3>\n<p>取得した情報は、次の目的で利用します。</p>\n<ul>\n<li>アカウントの登録、本人の認証、ログイン状態の管理</li>\n<li>所持状況やQRコードなどの保存・表示</li>\n<li>利用者が設定した範囲での情報共有</li>\n<li>登録上限の管理や、利用状況に応じたサービス運営</li>\n<li>お知らせやお問い合わせへの返信</li>\n<li>不正利用の防止、障害対応、サービスの改善</li>\n<li>登録情報の修正・削除への対応</li>\n</ul>\n<h3>3. QRコードとカメラについて</h3>\n<p>QRコードの読み取りでは、端末のカメラを使用します。カメラの映像は読み取り処理に利用し、画像や動画としてサーバーに保存しません。</p>\n<p>保存するのは、読み取ったデータと、登録先などの関連情報です。QRコードの読み取りデータやセーブコード・フレンドカードの登録内容は、暗号化して保存します。</p>\n<p>これらの読み取りデータは、他の一般利用者や共有URLの閲覧者には公開しません。</p>\n<h3>4. 共有機能について</h3>\n<p>共有機能を有効にした場合、ニックネームや、選択した範囲の所持状況などが、共有URLを知っている人に表示されます。</p>\n<p>共有URLを第三者へ送る際は、共有する内容を確認してください。登録したQRコードの読み取りデータは共有対象に含めません。</p>\n<h3>5. ブラウザへの保存と外部サービスについて</h3>\n<p>ログイン状態の保持や表示の高速化のため、ブラウザのローカルストレージなどを使用します。共有端末では、利用後にログアウトしてください。</p>\n<p>本サイトは、認証・データ保存にSupabase、サイトの配信にGitHub Pagesを利用しています。また、公式サイトの画像を読み込む際や、Xなどの外部リンクを開いた際には、接続先にIPアドレスなどの通信情報が送信されます。</p>\n<h3>6. 安全管理と保存期間について</h3>\n<p>情報へのアクセスを権限に応じて制限し、認証基盤によるパスワードの保護や、対象データの暗号化など、安全管理のための措置を講じます。</p>\n<p>情報は、サービスの提供や安全な運営に必要な期間保存し、不要になった情報は適切に削除します。バックアップや、不正利用への対応・法令上必要な記録は、削除に時間を要する場合があります。</p>\n<p>発行済みのアルバムIDは、重複や再発行を防ぐため、アカウント削除後も使用済みのIDとして保持します。</p>\n<h3>7. 情報の変更・削除について</h3>\n<p>ニックネーム、所持記録、登録したQRコードなどは、本サイトの各機能から変更・削除できます。アカウントは、ログアウト確認画面の「アカウント情報を削除」から削除できます。</p>\n<p>1か月間ログイン・利用がない場合も、アカウントと関連する登録データを自動削除します。削除されたアルバムIDは再利用できません。</p>\n<p>ご自身の情報の開示、訂正、利用停止、削除などに関するご相談は、お問い合わせフォームからご連絡ください。必要な本人確認を行い、法令に従って対応します。</p>\n<h3>8. 第三者への提供について</h3>\n<p>本人の同意がある場合や、法令に基づく場合などを除き、利用者の個人情報を第三者へ提供しません。</p>\n<p>ただし、利用者自身が設定した共有機能による公開や、利用目的の達成に必要な範囲で外部サービスに取扱いを委託する場合があります。</p>\n<h3>9. ポリシーの変更・お問い合わせ</h3>\n<p>内容を変更する場合は、本サイトで変更内容と適用日を案内します。</p>\n<p>個人情報の取扱いに関するご相談は、お問い合わせフォームをご利用ください。</p>\n<p><a href=\"https://iprimaker.github.io/card-management/contact/\">お問い合わせフォームへ</a></p>"
  },
  "about": {
    "title": "このサイトについて",
    "body": "<p>カードアルバムは、アイカツ！アンコール・アイプリ・ワッチャプリマジ！のカードやコーデを探し、集めたものを記録するための、個人運営の非公式サイトです。</p>\n<h3>できること</h3>\n<ul>\n<li>カード・コーデの検索と絞り込み</li>\n<li>掲載されている表面・裏面やパーツ画像の閲覧</li>\n<li>所持数の記録、お気に入りの登録、取得率の確認</li>\n<li>交換希望の記録</li>\n<li>カード・コーデのQRコードの保管と表示</li>\n<li>セーブコード・フレンドカードの管理</li>\n<li>選択した範囲の所持状況の共有</li>\n</ul>\n<p>作品やカードの種類によって、利用できる機能は異なります。</p>\n<h3>公式サービスとの関係</h3>\n<p>本サイトは、各作品・ゲームの公式運営とは関係ありません。作品名、カード画像、コーデ画像などの権利は、各権利者に帰属します。</p>\n<p>本サイトでの操作が、公式のゲームデータに反映されることはありません。本サイトに関するお問い合わせは、公式運営ではなく、下記のフォームへお願いいたします。</p>\n<h3>掲載情報について</h3>\n<p>公式サイトなどの情報を確認しながら、掲載内容を更新しています。確認できない情報は、推測で補わず「未取得」などと表示します。</p>\n<p>未掲載、誤記、反映の遅れがある場合があります。ゲームの仕様や最新情報は、各公式サイトもあわせてご確認ください。</p>\n<p>シークレットや発売前のカード・コーデについては、一定の期間、画像などを非表示にする場合があります。</p>\n<h3>ご利用にあたって</h3>\n<p>登録の受付方法やQRコードの登録上限は、運営状況に応じて変更する場合があります。</p>\n<p>大切なカードや元のQRコード、アルバムID・パスワードは、ご自身でも保管してください。</p>\n<h3>お問い合わせ</h3>\n<p>不具合の報告、カード・コーデ情報の修正や追加のご依頼、ご意見などは、お問い合わせフォームからお寄せください。</p>\n<p>運営者：ここっと</p>\n<p><a href=\"https://iprimaker.github.io/card-management/contact/\">お問い合わせフォームへ</a></p>"
  }
};
      }
      if (["album", "shared", "browse"].includes(page)) {
        /* catalog-cache.js */
        (() => {
          window.PUBLIC_CATALOG_CACHE = {
            peek: () => window.CARD_VISIBILITY.cache(),
            invalidate() {},
            async load() {
              await window.CARD_VISIBILITY.refresh();
              return window.CARD_VISIBILITY.cache();
            },
          };
        })();
      }
      if (["album", "contact"].includes(page)) {
        /* maintenance.js */
        (() => {
          "use strict";
          const nativeFetch = window.fetch.bind(window);
          let pending = null;
  let freshUntil=0,retryAt=0,failures=0,lastError;
          let state = { maintenance: false };
          let notify = () => {};
          async function check({force=false}={}) {
  if (pending) return pending;
  if (Date.now()<retryAt) throw lastError;
  if (!force && Date.now()<freshUntil) return state;
  pending=(async()=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    try {
      const config=window.APP_CONFIG;
      const response=await nativeFetch(config.supabaseUrl+"/rest/v1/rpc/card_album_site_status",{
        method:"POST",headers:{apikey:config.supabaseKey,"Content-Type":"application/json"},
        body:"{}",cache:"no-store",signal:controller.signal
      });
      if(!response.ok)throw Error("接続が混み合っています。時間をおいて再度お試しください。");
      const data=await response.json();
      if(!data||typeof data.maintenance!=="boolean")throw Error("メンテナンス設定を確認できません。");
      state=data;freshUntil=Date.now()+30000*(1+Math.random()*.2);failures=0;retryAt=0;
      notify(state);return state;
    } finally {clearTimeout(timeout);}
  })().catch(error=>{
    lastError=error;failures=Math.min(failures+1,6);
    retryAt=Date.now()+Math.min(300000,15000*2**(failures-1))*(1+Math.random()*.2);
    throw error;
  }).finally(()=>{pending=null});
  return pending;
}
  async function guardedFetch(input, options) {
            const url =
              typeof input === "string" ? input : input.url || String(input);
            if (!url.startsWith(window.APP_CONFIG.supabaseUrl + "/"))
              return nativeFetch(input, options);
            const status = await check();

            const publicRead =
              /\/rest\/v1\/(?:card_catalog(?:\?|$)|card_catalog_revision(?:\?|$)|rpc\/card_album_catalog_cached(?:\?|$)|rpc\/card_album_registration_status(?:\?|$))/.test(
                url,
              );
            if (status.maintenance && !publicRead) {
              return new Response(
                JSON.stringify({
                  code: "42501",
                  message: "CARD_ALBUM_MAINTENANCE",
                }),
                {
                  status: 403,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
            const response = await nativeFetch(input, options);
            if (!response.ok) {
              const text = await response.clone().text();
              if (
                text.includes("CARD_ALBUM_MAINTENANCE") ||
                text.includes("user_banned")
              )
                await check({force:true});
            }
            return response;
          }
          window.CARD_MAINTENANCE = {
            check,
            fetch: guardedFetch,
            subscribe(fn) {
              notify = fn;
            },
            get state() {
              return state;
            },
          };
        })();
      }
      if (["album", "shared", "browse", "contact"].includes(page)) {
        /* dropdowns.js */
        (() => {
          "use strict";
          const enhanced = new WeakMap();
          let active = null;
          let serial = 0;
          let query = "";
          let queryTimer;

          function close(restoreFocus = false) {
            if (!active) return;
            const { button, menu } = active;
            active = null;
            if (typeof menu.hidePopover === "function") {
              try {
                menu.hidePopover();
              } catch (_) {}
            }
            menu.remove();
            button.setAttribute("aria-expanded", "false");
            button.removeAttribute("aria-activedescendant");
            if (restoreFocus && button.isConnected) button.focus();
            query = "";
            clearTimeout(queryTimer);
          }

          function sync(select) {
            const state = enhanced.get(select);
            if (!state) return;
            const value =
              select.selectedOptions[0]?.textContent || "選択してください";
            if (state.text.textContent !== value)
              state.text.textContent = value;
            if (state.button.disabled !== select.disabled)
              state.button.disabled = select.disabled;
            const label =
              select.getAttribute("aria-label") ||
              select.labels?.[0]?.querySelector(".filter-label")?.firstChild
                ?.textContent ||
              select.labels?.[0]?.firstChild?.textContent ||
              "選択項目";
            state.button.setAttribute(
              "aria-label",
              `${label.trim()}：${state.text.textContent}`,
            );
          }

          function highlight(index) {
            if (!active) return;
            active.index = index;
            active.items.forEach((item, i) =>
              item.classList.toggle("is-current", i === index),
            );
            const item = active.items[index];
            if (item) {
              active.button.setAttribute("aria-activedescendant", item.id);
              const menu=active.menu,top=item.offsetTop,bottom=top+item.offsetHeight;
              if(top<menu.scrollTop)menu.scrollTop=top;
              else if(bottom>menu.scrollTop+menu.clientHeight)menu.scrollTop=bottom-menu.clientHeight;
            }
          }

          function choose(index) {
            if (!active) return;
            const { select, options } = active;
            const option = options[index];
            if (!option || option.disabled || option.parentElement.disabled)
              return;
            const changed = select.selectedIndex !== option.index;
            select.selectedIndex = option.index;
            close(true);
            sync(select);
            if (changed) {
              select.dispatchEvent(new Event("input", { bubbles: true }));
              select.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }

          function open(select) {
            close();
            if (select.disabled) return;
            const { button } = enhanced.get(select);
            const options = Array.from(select.options);
            if (!options.length) return;
            const menu = document.createElement("div");
            menu.className = "album-select-menu";
            menu.id = button.getAttribute("aria-controls");
            menu.setAttribute("role", "listbox");
            menu.setAttribute("aria-label", button.getAttribute("aria-label"));
            const theme = getComputedStyle(select);
            for (const name of ["--accent", "--soft", "--line", "--muted"]) {
              menu.style.setProperty(name, theme.getPropertyValue(name));
            }
            let group = null;
            const items = options.map((option, i) => {
              if (
                option.parentElement.tagName === "OPTGROUP" &&
                group !== option.parentElement
              ) {
                group = option.parentElement;
                const heading = document.createElement("div");
                heading.className = "album-select-group";
                heading.textContent = group.label;
                heading.setAttribute("role", "presentation");
                menu.append(heading);
              }
              const item = document.createElement("div");
              item.id = `${menu.id}-${i}`;
              item.className = "album-select-option";
              item.setAttribute("role", "option");
              item.setAttribute("aria-selected", String(option.selected));
              item.setAttribute(
                "aria-disabled",
                String(option.disabled || !!option.parentElement.disabled),
              );
              item.textContent = option.textContent;
              item.addEventListener("pointermove", () => highlight(i));
              item.addEventListener("click", () => choose(i));
              menu.append(item);
              return item;
            });
            const ownerDialog = select.closest("dialog");
            (ownerDialog || document.body).append(menu);
            if (ownerDialog && typeof menu.showPopover === "function") {
              menu.setAttribute("popover", "manual");
              menu.showPopover();
            }
            const rect = button.getBoundingClientRect();
            const viewport = window.visualViewport;
            const leftEdge = viewport?.offsetLeft || 0;
            const topEdge = viewport?.offsetTop || 0;
            const width = viewport?.width || innerWidth;
            const height = viewport?.height || innerHeight;
            const menuWidth = Math.min(Math.max(rect.width, 180), width - 24);
            menu.style.width = `${menuWidth}px`;
            menu.style.left = `${Math.max(leftEdge + 12, Math.min(rect.left, leftEdge + width - menuWidth - 12))}px`;
            const below = topEdge + height - rect.bottom - 18;
            const above = rect.top - topEdge - 18;
            const upwards = below < 180 && above > below;
            const maxHeight = Math.max(
              80,
              Math.min(320, upwards ? above : below),
            );
            menu.style.maxHeight = `${maxHeight}px`;
            menu.style.top = `${upwards ? Math.max(topEdge + 12, rect.top - Math.min(menu.scrollHeight, maxHeight) - 6) : rect.bottom + 6}px`;
            active = {
              select,
              button,
              menu,
              options,
              items,
              index: select.selectedIndex,
            };
            button.setAttribute("aria-expanded", "true");
            highlight(select.selectedIndex);
          }

          function keydown(event, select) {
            const key = event.key;
            if (
              ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(
                key,
              )
            ) {
              event.preventDefault();
              if (!active || active.select !== select) {
                open(select);
                return;
              }
              if (key === "Enter" || key === " ") {
                choose(active.index);
                return;
              }
              const allowed = active.options
                .map((option, i) =>
                  option.disabled || option.parentElement.disabled ? -1 : i,
                )
                .filter((i) => i >= 0);
              if (!allowed.length) return;
              const current = allowed.indexOf(active.index);
              const index =
                key === "Home"
                  ? allowed[0]
                  : key === "End"
                    ? allowed.at(-1)
                    : allowed[
                        Math.max(
                          0,
                          Math.min(
                            allowed.length - 1,
                            current + (key === "ArrowDown" ? 1 : -1),
                          ),
                        )
                      ];
              highlight(index);
            } else if (key === "Escape") {
              event.preventDefault();
              close(true);
            } else if (key === "Tab") close();
            else if (
              key.length === 1 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            ) {
              if (!active) open(select);
              if (!active) return;
              query += key.toLocaleLowerCase();
              clearTimeout(queryTimer);
              queryTimer = setTimeout(() => {
                query = "";
              }, 650);
              const index = active.options.findIndex(
                (option) =>
                  !option.disabled &&
                  !option.parentElement.disabled &&
                  option.textContent
                    .trim()
                    .toLocaleLowerCase()
                    .startsWith(query),
              );
              if (index >= 0) highlight(index);
            }
          }

          function enhance(select) {
            if (enhanced.has(select) || select.multiple || select.size > 1)
              return;
            const wrapper = document.createElement("span");
            wrapper.className = "album-select";
            select.before(wrapper);
            wrapper.append(select);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "album-select-trigger";
            button.setAttribute("role", "combobox");
            button.setAttribute("aria-haspopup", "listbox");
            button.setAttribute("aria-expanded", "false");
            button.setAttribute(
              "aria-controls",
              `album-select-menu-${++serial}`,
            );
            if (select.getAttribute("aria-labelledby"))
              button.setAttribute(
                "aria-labelledby",
                select.getAttribute("aria-labelledby"),
              );
            const text = document.createElement("span");
            text.className = "album-select-value";
            const arrow = document.createElement("span");
            arrow.className = "album-select-chevron";
            arrow.setAttribute("aria-hidden", "true");
            button.append(text, arrow);
            wrapper.append(button);
            select.tabIndex = -1;
            select.setAttribute("aria-hidden", "true");
            enhanced.set(select, { button, text });
            sync(select);
            button.addEventListener("click", () =>
              active?.select === select ? close() : open(select),
            );
            button.addEventListener("keydown", (event) =>
              keydown(event, select),
            );
            select.addEventListener("change", () => sync(select));
            select.addEventListener("focus", () => button.focus());
            select.addEventListener("invalid", () => {
              button.focus();
            });
          }

          document.querySelectorAll("select").forEach(enhance);
          new MutationObserver((records) => {
            if (
              active &&
              (!active.select.isConnected ||
                active.select.disabled ||
                records.some((record) => active.select.contains(record.target)))
            )
              close();
            for (const record of records) {
              for (const node of record.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches("select")) enhance(node);
                node.querySelectorAll("select").forEach(enhance);
              }
              const select = record.target.closest?.("select");
              if (select) sync(select);
            }
            document.querySelectorAll(".album-select > select").forEach(sync);
          }).observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["disabled", "selected", "label", "value"],
          });
          document.addEventListener("pointerdown", (event) => {
            if (
              active &&
              !active.menu.contains(event.target) &&
              !active.button.contains(event.target)
            )
              close();
          });
          for(const type of ["wheel","touchmove"])document.addEventListener(type,event=>{
            if(active && event.target!==active.menu && !active.menu.contains(event.target))close();
          },{capture:true,passive:true});
          document.addEventListener(
            "close",
            (event) => {
              if (
                active &&
                event.target.matches?.("dialog") &&
                event.target.contains(active.select)
              )
                close();
            },
            true,
          );
          document.addEventListener(
            "cancel",
            (event) => {
              if (
                active &&
                event.target.matches?.("dialog") &&
                event.target.contains(active.select)
              ) {
                event.preventDefault();
                close(true);
              }
            },
            true,
          );
          window.addEventListener("resize", () => close());
          window.visualViewport?.addEventListener("resize", () => close());
          document.addEventListener("reset", (event) =>
            setTimeout(
              () => event.target.querySelectorAll("select").forEach(sync),
              0,
            ),
          );
        })();
      }
      if (["album", "shared", "browse"].includes(page)) {
        /* modal-scrollbar.js */
        (() => {
          "use strict";
          const desktop = matchMedia(
            "(min-width: 761px) and (hover: hover) and (pointer: fine)",
          );
          const root = document.documentElement;
          const rail = document.createElement("div");
          rail.id = "modal-scroll-rail";
          rail.setAttribute("popover", "manual");
          rail.setAttribute("role", "scrollbar");
          rail.setAttribute("aria-orientation", "vertical");
          rail.setAttribute("aria-label", "モーダルをスクロール");
          rail.tabIndex = 0;
          const thumb = document.createElement("span");
          thumb.className = "modal-scroll-thumb";
          thumb.setAttribute("aria-hidden", "true");
          rail.append(thumb);
          let modal = null,
            target = null,
            frame = 0,
            drag = null;
          let trackHeight = 0,
            thumbHeight = 0,
            thumbTop = 0,
            nextId = 0,
            sequence = 0;
          const order = new WeakMap();
          const canPopover = typeof rail.showPopover === "function";
          const resize = new ResizeObserver(schedule);
          function scrollable(node) {
            return (
              node instanceof HTMLElement &&
              node !== rail &&
              !rail.contains(node) &&
              node.clientHeight > 0 &&
              node.scrollHeight > node.clientHeight + 1 &&
              /auto|scroll/.test(getComputedStyle(node).overflowY)
            );
          }
          function hideRail() {
            if (target) target.classList.remove("external-modal-scroll");
            if (rail.isConnected && canPopover) {
              try {
                rail.hidePopover();
              } catch (_) {}
            }
            if (drag && rail.hasPointerCapture(drag.id))
              rail.releasePointerCapture(drag.id);
            drag = null;
          }
          function clear() {
            hideRail();
            resize.disconnect();
            rail.remove();
            modal = target = null;
          }
          function schedule() {
            if (!frame) frame = requestAnimationFrame(update);
          }
          function update() {
            frame = 0;
            const dialogs = [
              ...document.querySelectorAll("dialog[open]"),
            ].filter((d) => d.matches(":modal"));
            dialogs.forEach((d) => {
              if (!order.has(d)) order.set(d, ++sequence);
            });
            const active = dialogs
              .sort((a, b) => order.get(a) - order.get(b))
              .at(-1);
            root.classList.toggle("album-modal-open", Boolean(active));
            if (!active) {
              clear();
              return;
            }
            if (active !== modal) {
              clear();
              modal = active;
              resize.observe(active);
            }
            if (!canPopover) {
              hideRail();
              target = null;
              return;
            }
            const candidates = [active, ...active.querySelectorAll("*")].filter(
              scrollable,
            );
            const cardBody =
              active.id === "detail"
                ? active.querySelector(".modal-body")
                : null;
            const scroller = cardBody
              ? scrollable(cardBody)
                ? cardBody
                : null
              : scrollable(target) && active.contains(target)
                ? target
                : candidates.includes(active)
                  ? active
                  : candidates.sort(
                      (a, b) =>
                        b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight,
                    )[0];
            if (!scroller) {
              hideRail();
              target = null;
              return;
            }
            if (target !== scroller) {
              hideRail();
              resize.disconnect();
              target = scroller;
              resize.observe(active);
              if (target !== active) resize.observe(target);
              if (target.firstElementChild)
                resize.observe(target.firstElementChild);
            }
            // 内部のスクロール領域に追従し、画面内に収めます。
            const rect = target.getBoundingClientRect();
            const box = active.getBoundingClientRect();
            const vv = window.visualViewport;
            const left = vv?.offsetLeft || 0,
              top = vv?.offsetTop || 0;
            const width = vv?.width || innerWidth,
              height = vv?.height || innerHeight;
            const y = Math.max(top + 8, box.top + 8);
            const bottom = Math.min(top + height - 8, box.bottom - 8);
            trackHeight = Math.max(0, bottom - y);
            const max = Math.max(0, target.scrollHeight - target.clientHeight);
            if (!max || trackHeight < 40) {
              hideRail();
              return;
            }
            if (!rail.isConnected || rail.parentElement !== active)
              active.append(rail);
            rail.style.left =
              Math.max(left + 2, Math.min(left + width - 10, box.right + 8)) +
              "px";
            rail.style.top = y + "px";
            rail.style.height = trackHeight + "px";
            try {
              if (!rail.matches(":popover-open")) rail.showPopover();
            } catch (_) {
              hideRail();
              return;
            }
            // 表示に成功した場合だけ、その領域の標準バーを隠します。
            target.classList.add("external-modal-scroll");
            if (!target.id) target.id = "modal-scroll-target-" + ++nextId;
            rail.setAttribute("aria-controls", target.id);
            rail.setAttribute("aria-valuemin", "0");
            rail.setAttribute("aria-valuemax", String(Math.round(max)));
            rail.setAttribute(
              "aria-valuenow",
              String(Math.round(target.scrollTop)),
            );
            thumbHeight = Math.min(
              trackHeight,
              Math.max(
                28,
                (trackHeight * target.clientHeight) / target.scrollHeight,
              ),
            );
            thumbTop =
              (trackHeight - thumbHeight) *
              Math.min(1, Math.max(0, target.scrollTop / max));
            thumb.style.height = thumbHeight + "px";
            thumb.style.transform = "translateY(" + thumbTop + "px)";
          }
          function move(y, offset) {
            if (!target) return;
            const ratio =
              (y - rail.getBoundingClientRect().top - offset) /
              Math.max(1, trackHeight - thumbHeight);
            target.scrollTop =
              Math.max(0, Math.min(1, ratio)) *
              Math.max(0, target.scrollHeight - target.clientHeight);
            schedule();
          }
          rail.addEventListener("pointerdown", (e) => {
            if (e.button !== 0 || !target) return;
            e.preventDefault();
            rail.focus({ preventScroll: true });
            const y = e.clientY - rail.getBoundingClientRect().top;
            drag = {
              id: e.pointerId,
              offset:
                y >= thumbTop && y <= thumbTop + thumbHeight
                  ? y - thumbTop
                  : thumbHeight / 2,
            };
            rail.setPointerCapture(e.pointerId);
            move(e.clientY, drag.offset);
          });
          rail.addEventListener("pointermove", (e) => {
            if (drag?.id === e.pointerId) move(e.clientY, drag.offset);
          });
          for (const type of [
            "pointerup",
            "pointercancel",
            "lostpointercapture",
          ])
            rail.addEventListener(type, () => {
              drag = null;
            });
          rail.addEventListener(
            "wheel",
            (e) => {
              if (!target) return;
              e.preventDefault();
              target.scrollTop +=
                e.deltaY *
                (e.deltaMode === 1
                  ? 16
                  : e.deltaMode === 2
                    ? target.clientHeight
                    : 1);
              schedule();
            },
            { passive: false },
          );
          rail.addEventListener("keydown", (e) => {
            if (
              !target ||
              ![
                "ArrowUp",
                "ArrowDown",
                "PageUp",
                "PageDown",
                "Home",
                "End",
              ].includes(e.key)
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Home") target.scrollTop = 0;
            else if (e.key === "End") target.scrollTop = target.scrollHeight;
            else
              target.scrollTop +=
                (e.key.endsWith("Up") ? -1 : 1) *
                (e.key.startsWith("Page") ? target.clientHeight * 0.85 : 40);
            schedule();
          });
          new MutationObserver((records) => {
            let changed = false;
            for (const record of records) {
              if (record.target === rail || rail.contains(record.target))
                continue;
              if (
                record.attributeName === "open" &&
                record.target instanceof HTMLDialogElement
              ) {
                if (record.target.open) order.set(record.target, ++sequence);
                else order.delete(record.target);
              }
              changed = true;
            }
            if (changed) schedule();
          }).observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["open", "hidden"],
          });
          document.addEventListener(
            "scroll",
            (e) => {
              if (!modal) return;
              if (
                modal.contains(e.target) &&
                scrollable(e.target) &&
                e.target !== target
              ) {
                hideRail();
                target = e.target;
                resize.observe(target);
              }
              schedule();
            },
            true,
          );
          document.addEventListener(
            "load",
            () => {
              if (modal) schedule();
            },
            true,
          );
          document.addEventListener("close", schedule, true);
          addEventListener("resize", schedule, { passive: true });
          desktop.addEventListener("change", schedule);
          window.visualViewport?.addEventListener("resize", schedule, {
            passive: true,
          });
          window.visualViewport?.addEventListener("scroll", schedule, {
            passive: true,
          });
          schedule();
        })();
      }
      if (page === "card-registration")
        window.REGISTRATION_SITE_INFO = window.SITE_INFO;
    },
  };
})();
