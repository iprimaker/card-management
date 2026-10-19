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
  panel.innerHTML = `<aside class="command-notice"><strong>実行前に確認してください</strong><p>リセット・解除は元に戻せません。確認は5分間有効です。確認後にデータが変わった場合は、もう一度確認してください。自分の記録だけが対象です。登録済みの所持数は減らしません。複数のコーデで共通するパーツは、他のだんの収集状況にも影響します。確認から実行までに別端末で変更した記録も、実行時点の内容が対象になります。</p></aside><div class="command-heading"><h1>コマンド</h1><button type="button" data-back>アルバムに戻る</button></div><article class="command-box"><h2>コマンド入力</h2><label for="command-input">コマンド</label><textarea id="command-input" rows="3" placeholder="set aikatsu ownership" spellcheck="false"></textarea><div class="command-actions"><button type="button" class="primary" data-execute>実行</button></div></article><article class="command-box"><h2>実行結果</h2><div class="command-result" role="status" aria-live="polite">まだ実行していません。</div></article><article class="command-box"><h2>入力補助</h2><div class="command-assist"><label>対象（広）<select data-scope></select></label><label>実行詳細<select data-type></select></label><label>実行種類<select data-action><option value="read">確認・お楽しみ</option><option value="set">登録・設定</option><option value="reset">リセット・解除</option><option value="check">件数確認（リセット対象）</option></select></label><label>対象（狭）<select data-series><option value="">すべてのだん</option></select></label></div><div class="command-actions"><button type="button" data-generate>入力欄に出力</button></div><p class="command-note">出力だけでは実行されません。上の入力欄を確認して「実行」を押してください。</p></article><details class="command-box command-list"><summary>コマンド一覧</summary><p class="command-note">末尾に弾の名前を付けると対象を限定できます。表記は一覧と同じ名前を指定してください。</p><div data-list></div></details>`;
  document.getElementById("collection").parentElement.append(panel);
  const $ = (s) => panel.querySelector(s),
    input = $("#command-input"),
    result = $(".command-result"),
    run = $("[data-execute]"),
    scope = $("[data-scope]"),
    type = $("[data-type]"),
    action = $("[data-action]");
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
            ["all", "verse-onegai", "verse-himitsu"].includes(scope.value),
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
      let items = [];
      if (scope.value === "all") {
        for (const key of Object.keys(defs.scopes).filter((x) => x !== "all"))
          items.push(...(await window.CARD_SHARE_HOST.scopeItems(key)));
      } else items = await window.CARD_SHARE_HOST.scopeItems(scope.value);
      if (id !== seriesRequest) return;
      const labels = new Set();
      for (const item of items) {
        const values =
          item.appearances?.map((x) => x.series) ||
          (Array.isArray(item.series) ? item.series : [item.series]);
        for (const value of values || [])
          if (typeof value === "string" && value) labels.add(value);
      }
      options(select, {
        "": "すべてのだん",
        ...Object.fromEntries(
          [...labels]
            .sort((a, b) => b.localeCompare(a, "ja", { numeric: true }))
            .map((x) => [x, x]),
        ),
      });
    } catch (e) {
      if (id === seriesRequest) {
        options(select, { "": "すべてのだん" });
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
    input.value = `${action.value} ${scope.value} ${type.value}${series ? " " + series : ""}`;
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
          !["all", "verse-onegai", "verse-himitsu"].includes(s)
        )
          continue;
        const row = document.createElement("div");
        row.className = "command-list-row";
        const code = document.createElement("code");
        code.textContent = `${key} ${s} ${t}`;
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
            result.textContent = e.message;
          }
        };
        row.append(code, help, b);
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
  function parse() {
    const m = input.value
      .trim()
      .match(/^(read|set|reset|check)\s+(\S+)\s+(\S+)(?:\s+(.+))?$/);
    const def = m && defs.actions[m[1] === "check" ? "reset" : m[1]];
    if (
      !m ||
      !Object.hasOwn(defs.scopes, m[2]) ||
      !Object.hasOwn(def.types, m[3])
    )
      throw Error("コマンド一覧または入力補助から選んでください。");
    let series = m[4]?.trim() || null;
    if (series?.startsWith('"') && series.endsWith('"'))
      series = series.slice(1, -1);
    return {
      action: m[1],
      def,
      args: { p_scope: m[2], p_type: m[3], p_series: series },
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
      const cmd = parse(),
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
      result.textContent = e.message || "失敗しました。";
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
        e.message || "失敗しました。";
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
  document.head.append(style);
})();
