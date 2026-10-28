(() => {
  const host = window.CARD_TRADE_HOST,
    defs = window.CARD_COMMANDS,
    settings = document.getElementById("display-settings-dialog");
  if (!host || !defs || !settings) return;
  const entry = document.createElement("button");
  entry.type = "button";
  entry.className = "command-entry";
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
  const reverse = (table, token) =>
    Object.keys(table).find((key) => table[key] === token);
  function commandText(action, scope, type, series = "S00") {
    return [
      codes.actions[action],
      codes.scopes[scope],
      codes.types[type],
      series,
    ].join(" ");
  }
  async function seriesChoices(target) {
    const labels = new Set();
    const keys =
      target === "all"
        ? Object.keys(defs.scopes).filter((x) => x !== "all")
        : [target];
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
    const definition =
      defs.actions[action.value === "check" ? "reset" : action.value];
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
          [...choices].map(([token, label]) => [
            token,
            label || "すべてのだん",
          ]),
        ),
      );
    } catch (e) {
      if (id === seriesRequest) {
        options(select, { S00: "すべてのだん" });
        result.textContent =
          "だんの候補を取得できませんでした。もう一度対象を選んでください。";
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
    input.value = commandText(
      action.value,
      scope.value,
      type.value,
      series || "S00",
    );
    input.focus();
    result.textContent =
      "コマンドを入力欄へ出力しました。まだ実行していません。";
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
    if (
      text.length > 100 ||
      !/^A[0-9]{2} T[0-9]{2} D[0-9]{2} S(?:00|[0-9A-F]{16})$/.test(text)
    )
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
      throw Error(
        "この組み合わせは使用できません。入力補助から選んでください。",
      );
    let series = null;
    if (seriesToken !== "S00") {
      const choices = await seriesChoices(scope);
      if (!choices.has(seriesToken))
        throw Error(
          "だんのコードが見つかりません。入力補助から選び直してください。",
        );
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
      scope === "all"
        ? Object.keys(defs.scopes).filter((x) => x !== "all")
        : [scope];
    for (const key of keys) {
      const items = await window.CARD_SHARE_HOST.scopeItems(key);
      for (const item of items) {
        const labels =
          item.appearances?.map((x) => x.series) ||
          (Array.isArray(item.series) ? item.series : [item.series]);
        if (!series || labels?.includes(series))
          catalog.push({ ...item, _scope: key });
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
      fullIds = new Set(
        catalog.filter((x) => x._scope.startsWith("verse-")).map((x) => x.id),
      );
    if (cmd.args.p_type === "random") {
      const c = catalog[Math.floor(Math.random() * catalog.length)];
      return c
        ? `今日の1枚：${c.code || ""} ${c.name || ""}`
        : "対象がありません。";
    }
    if (cmd.args.p_type === "favorites") {
      const a = cardIds.size ? await rows("card_favorites", "card_id") : [],
        b = fullIds.size
          ? await rows("card_verse_favorites", "coordinate_id")
          : [];
      return `お気に入り：${a.filter((x) => cardIds.has(x.card_id)).length + b.filter((x) => fullIds.has(x.coordinate_id)).length}件`;
    }
    if (cmd.args.p_type === "trade") {
      const a = (
        await rows("card_trade_requests", "kind,target_id,side,priority")
      ).filter((x) =>
        x.kind === "card"
          ? cardIds.has(x.target_id)
          : x.kind === "coordinate" && fullIds.has(x.target_id),
      );
      return `譲：${a.filter((x) => x.side === "offer").length}件 ／ 求：${a.filter((x) => x.side === "want").length}件 ／ 優先：${a.filter((x) => x.priority === 2).length}件`;
    }
    const a = cardIds.size
        ? await rows("card_ownership", "card_id,quantity")
        : [],
      b = fullIds.size
        ? await rows(
            "card_verse_coordinate_ownership",
            "coordinate_id,quantity",
          )
        : [];
    const owned = new Map([
      ...a
        .filter((x) => cardIds.has(x.card_id))
        .map((x) => [x.card_id, x.quantity]),
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
    if (execute && !cmd.confirmationToken)
      throw Error("内容を確認し直してください。");
    const name = execute
      ? "card_album_command_execute"
      : "card_album_command_prepare";
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
      dialog.querySelector("[data-error]").textContent =
        window.CARD_ERROR.message(e);
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
  const style = document.createElement("style");
  style.textContent = `.command-notice{margin:16px 0;padding:15px 18px;background:var(--soft,#fff5f8);border:1px solid var(--line,#eee);border-radius:15px}.command-notice strong{font-size:13px}.command-notice p{margin:6px 0 0;font-size:11px;line-height:1.9;color:var(--muted)}.command-assist label:nth-child(1){order:1}.command-assist label:nth-child(4){order:2}.command-assist label:nth-child(3){order:3}.command-assist label:nth-child(2){order:4}.command-box input,.command-box select,.command-box textarea{border:1px solid var(--line,#e6dee4);border-radius:10px;padding:12px;background:#fff;color:inherit}.command-box textarea{line-height:1.8}.command-box button{border-radius:10px}.command-result{background:var(--soft,#faf6fa);border-radius:12px;padding:14px}.command-entry{display:block;margin:20px 0 0 auto!important;padding:5px 0!important;font-size:11px!important;color:var(--muted)!important;background:none!important;border:0!important;box-shadow:none!important}#command-page{max-width:850px;margin:0 auto;padding-bottom:32px}.command-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.command-heading h1{font-size:22px}.command-box{display:block;padding:20px;margin:16px 0;background:white;border:1px solid var(--line,#eee);border-radius:18px}.command-box h2{font-size:15px;margin:0 0 14px}.command-box textarea{box-sizing:border-box;width:100%;font-size:16px;margin:8px 0 12px;resize:vertical}.command-assist{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}.command-assist label{display:grid;gap:6px;font-size:12px}.command-assist select,.command-assist input{width:100%;min-width:0;box-sizing:border-box;font-size:16px}.command-result{min-height:50px;line-height:1.9;white-space:pre-wrap;font-size:13px}.command-note{font-size:11px;line-height:1.8;color:var(--muted)}.command-list summary{cursor:pointer;font-size:13px;padding:6px 0}.command-list-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 12px;padding:12px 0;border-bottom:1px solid var(--line,#eee)}.command-list-row code{overflow-wrap:anywhere;font-size:12px}.command-list-row small{grid-column:1;color:var(--muted);line-height:1.6}.command-list-row button{grid-column:2;grid-row:1/3;align-self:center;font-size:11px;padding:6px 10px}.command-confirm{max-width:460px;width:calc(100% - 32px);box-sizing:border-box;border:0;border-radius:20px;padding:24px}.command-confirm p{line-height:1.8}.command-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}@media(max-width:500px){.command-assist{grid-template-columns:1fr}.command-box{padding:16px}.command-heading h1{font-size:20px}}`;
  style.textContent += `
.command-notice{background:var(--soft,#fff6f8);padding:0;overflow:hidden}
.command-notice summary{display:flex;align-items:center;gap:9px;list-style:none;padding:14px 16px;cursor:pointer;font-size:12px;color:var(--accent,#b7738b)}
.command-notice summary::-webkit-details-marker{display:none}.command-warning-icon{width:22px;height:22px;flex:none;color:#b48b48}
.command-notice summary i{margin-left:auto;width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .15s}.command-notice[open] summary i{transform:rotate(225deg)}
.command-notice>div{padding:0 18px 16px}.command-notice ul{margin:10px 0 0;padding-left:18px;font-size:11px;line-height:1.9;color:var(--muted)}
.command-list>[data-list]>details{border:1px solid var(--line,#eee);border-radius:12px;padding:8px 12px;margin-top:10px}
.command-list-row{background:var(--soft,#fcf8fa);border:0;border-radius:11px;margin:10px 0;padding:13px;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px}
.command-list-row code{font-size:12px;letter-spacing:.03em;color:var(--accent,#a86580);font-weight:600}.command-list-row small{font-size:11px}.command-list-row .command-explanation{grid-column:1/-1;font-size:11px;color:var(--muted);margin:0;line-height:1.85}.command-list-row button{grid-row:1/3;background:white}.command-box textarea{font-family:ui-monospace,monospace;letter-spacing:.04em}
`;
  document.head.append(style);
})();
