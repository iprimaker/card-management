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
          terms: {
            title: "利用規約",
            body: `<p class="effective-date">制定日：2026年10月8日</p>
      <p>この規約は「カードアルバム」（以下、本サイト）の利用条件を定めます。</p>
      <h3>1. サービスについて</h3><p>本サイトは、カード情報の検索と、ご自身の所持カードの記録を目的とした非公式サービスです。カードの売買や公式のゲームデータとの連携は行いません。</p>
      <h3>2. アカウント</h3><p>アルバムIDとパスワードはご自身で管理してください。1か月間ログイン・利用がないアカウントは、所持記録とともに自動削除します。削除されたアルバムIDは再利用できません。他人のアカウントの利用、なりすまし、第三者の個人情報を含むニックネームの登録は禁止します。</p>
      <h3>3. 禁止事項</h3><ul><li>不正アクセス、権限の回避、サービスへの過度な負荷</li><li>他の利用者や権利者への迷惑行為</li><li>本サイトのデータを用いた違法な行為</li></ul>
      <h3>4. カード情報と権利</h3><p>カード画像、名称、作品名などの権利は各権利者に帰属します。掲載情報には誤りや更新の遅れが含まれる場合があります。ゲームの仕様や最新情報は公式サイトをご確認ください。</p>
      <h3>5. サービスの変更・停止</h3><p>保守、障害、外部サービスの変更などにより、機能を変更・停止する場合があります。重要な所持情報は、ご自身でも控えを残してください。</p>
      <h3>6. 責任について</h3><p>運営者は情報の正確性や継続提供を保証するものではありません。ただし、法令上免除できない責任を免除するものではありません。</p>
      <h3>7. 規約の変更</h3><p>変更時は本サイトで内容と変更日を案内します。利用者に重要な影響がある変更は、適切な方法で事前に案内します。</p>
      <h3>8. お問い合わせ</h3><p>カード情報の修正やサービスに関するご相談はお問い合わせフォームをご利用ください。サイトの削除依頼もお問い合わせよりお願いいたします。削除依頼があった場合は、遅滞なく削除いたします。</p><p data-contact></p>`,
          },
          privacy: {
            title: "プライバシーポリシー",
            body: `<p class="effective-date">制定日：2026年10月8日</p>
      <p>カードアルバムの運営者は、サービスの提供に必要な範囲で利用者の情報を取り扱います。</p>
      <h3>1. 取り扱う情報</h3><ul><li>アルバムID、ニックネーム、登録日時、最終ログイン日時、メールアドレス（登録されている場合）</li><li>所持カードの記録と、カード情報の補足データ</li><li>お問い合わせの返信先メールアドレス（未ログインの場合）、アルバムID（ログイン済みの場合）、任意のお名前、お問い合わせ内容</li><li>認証に必要な情報、通信・障害対応に必要なアクセス情報</li></ul><p>パスワードは認証基盤で保護して管理します。発行済みアルバムIDは、重複・再発行防止のためアカウント削除後も使用済みのIDとして保持します。</p>
      <h3>2. 利用目的</h3><p>登録・ログイン、確認メールや再設定メールの送信、所持記録の保存、情報の修正、不正利用の防止、障害対応、お問い合わせへの対応のために利用します。</p>

      <h3>3. ブラウザへの保存</h3><p>ログイン状態を保持するため、ブラウザのローカルストレージ等を使用します。共有端末では利用後にログアウトしてください。</p>
      <h3>4. 安全管理と保存期間</h3><p>情報へのアクセスを権限に応じて制限します。お問い合わせの入力内容は暗号化して保存します。情報はサービスの提供や安全な運営に必要な期間保存し、不要になった情報は適切に削除します。バックアップや法令上必要な記録は削除に時間を要する場合があります。</p>
      <h3>5. 登録情報の管理</h3><p>ニックネームと所持記録はサイト上で変更できます。アカウントはログアウト確認画面の「アカウント情報を削除」から削除できます。1か月間ログイン・利用がない場合もアカウントと所持記録を自動削除します。ログイン状態を維持してサイトを利用した場合も利用日時を更新します。削除されたIDは再利用できません。</p>
      <h3>6. ポリシーの変更</h3><p>変更した内容と日付は本サイトで案内します。</p>`,
          },
          about: {
            title: "このサイトについて",
            body: `<p>カードアルバムは、アイカツ！アンコールとアイプリのカードを探して、集めたカードを記録するための非公式サイトです。</p>
      <h3>できること</h3><ul><li>作品や種類ごとのカード検索・絞り込み</li><li>表面・裏面の閲覧</li><li>所持カードの登録と取得率の確認</li></ul>
      <h3>公式サービスとの関係</h3><p>本サイトは作品・ゲームの公式運営とは関係ありません。作品名、カード画像などの権利は各権利者に帰属します。掲載内容について公式運営へお問い合わせいただくことはお控えください。</p>
      <h3>情報の更新</h3><p>カード情報は定期的に更新します。未掲載・誤記・反映の遅れがある場合は、公式情報もあわせてご確認ください。</p>
      <h3>お問い合わせ</h3><p data-contact></p>`,
          },
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
          let state = { maintenance: false };
          let notify = () => {};
          async function check() {
            if (pending) return pending;
            pending = (async () => {
              const config = window.APP_CONFIG;
              const response = await nativeFetch(
                config.supabaseUrl + "/rest/v1/rpc/card_album_site_status",
                {
                  method: "POST",
                  headers: {
                    apikey: config.supabaseKey,
                    "Content-Type": "application/json",
                  },
                  body: "{}",
                  cache: "no-store",
                },
              );
              if (!response.ok)
                throw new Error(
                  "メンテナンス設定を確認できません。ページを再読み込みしてください。",
                );
              state = await response.json();
              if (!state || typeof state.maintenance !== "boolean")
                throw new Error("メンテナンス設定を確認できません。");
              notify(state);
              return state;
            })().finally(() => {
              pending = null;
            });
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
                await check();
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
