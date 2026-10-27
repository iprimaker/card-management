(() => {
  "use strict";
  const host = () => window.CARD_VERSE_HOST,
    db = () => host()?.client(),
    uid = () => host()?.session()?.user?.id;
  const series = {
    aikatsu: "アイカツ！アンコール",
    aipri: "アイプリ",
    friend: "フレカ",
  };
  const button = document.createElement("button");
  button.id = "save-codes-open";
  button.type = "button";
  button.className = "text-button save-codes-open";
  button.innerHTML = window.CARD_QR.icon + "<span>セーブ・フレカ</span>";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", "save-codes-dialog");
  button.hidden = true;
  let owner = uid(),
    request = 0,
    rows = [],
    rowsOwner = null,
    busy = false;
  const list = document.createElement("dialog");
  list.className = "save-codes-dialog";
  list.id = "save-codes-dialog";
  list.setAttribute("aria-labelledby", "save-codes-title");
  list.innerHTML =
    '<div class="save-codes-heading"><h2 id="save-codes-title">セーブ・フレカ</h2><button type="button" data-close aria-label="閉じる">×</button></div><div class="save-codes-toolbar"><p>セーブコード・フレンドカードを管理</p><button type="button" class="primary" data-new>新規登録</button></div><p data-status role="status" aria-live="polite"></p><div data-list></div>';
  document.body.append(list);
  let selectedType = "aikatsu";
  const tabs = document.createElement("div");
  tabs.className = "save-type-tabs";
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", "種別で絞り込み");
  for (const [value, label] of [
    ["aikatsu", "アイカツ"],
    ["aipri", "アイプリ"],
    ["friend", "フレカ"],
  ]) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.dataset.saveType = value;
    tab.textContent = label;
    tab.onclick = () => {
      selectedType = value;
      render();
    };
    tabs.append(tab);
  }
  list.querySelector(".save-codes-heading").after(tabs);

  const formDialog = document.createElement("dialog");
  formDialog.className = "save-codes-dialog save-codes-editor";
  formDialog.setAttribute("aria-labelledby", "save-code-add-title");
  formDialog.innerHTML =
    '<div class="save-codes-heading"><h2 id="save-code-add-title">セーブ・フレカを登録</h2><button type="button" data-close aria-label="閉じる">×</button></div><form><label>種別<select name="series"><option value="aikatsu">アイカツ！アンコール</option><option value="aipri">アイプリ</option><option value="friend">フレンドカード</option></select></label><label>マイキャラネーム<input name="character_name" maxlength="40" required autocomplete="off"></label><label data-manual hidden>ID（任意）<input name="display_id" maxlength="200" autocomplete="off" placeholder="わかる場合だけ入力"></label><label data-birthday hidden>マイキャラの誕生日（任意）<span class="save-birthday-fields"><select name="birth_month" aria-label="誕生月"><option value="">月</option></select><select name="birth_day" aria-label="誕生日の日"><option value="">日</option></select></span></label><label data-memo hidden>メモ（任意）<textarea name="memo" maxlength="1000" rows="3" placeholder="自由にメモを入力できます"></textarea></label><p data-help>アイカツはQRコードの読み取り結果をIDとして表示します。</p><section class="save-qr-consent" aria-label="QR登録規約への同意"><button type="button" class="save-qr-terms-link" data-qr-terms-open aria-haspopup="dialog" aria-controls="save-qr-terms-dialog">QRコード登録規約</button><label class="save-qr-consent-check"><input type="checkbox" name="qr_terms_consent" required><span>QRコード登録規約に同意する</span></label></section><p role="status" data-status aria-live="polite"></p><button type="submit" class="primary" disabled>QRコードを読み取る</button></form>';
  document.body.append(formDialog);
  const termsDialog = document.createElement("dialog");
  termsDialog.id = "save-qr-terms-dialog";
  termsDialog.className = "save-codes-dialog save-qr-terms-dialog";
  termsDialog.setAttribute("aria-labelledby", "save-qr-terms-title");
  termsDialog.innerHTML = '<div class="save-codes-heading"><h2 id="save-qr-terms-title">QRコード登録規約</h2><button type="button" data-close aria-label="閉じる">×</button></div><div class="save-qr-terms-body"><h3>1．登録できる情報</h3><p>ご自身が所有するセーブカード、または持ち主から登録の許可を得たフレンドカードのQRコードを登録してください。読み取り内容を直接入力する場合も同様です。</p><h3>2．禁止事項</h3><p>持ち主の許可のない登録、なりすまし、不正に入手した情報の登録は禁止します。また、登録情報の無断公開・配布・販売や、不正利用を禁止します。</p><h3>3．登録情報の保存</h3><p>QRコードの読み取り結果と、マイキャラネーム・ID・誕生日・メモなどの登録情報は、暗号化して保存します。撮影した画像は保存しません。登録したQRコードは、登録したアカウントからのみ表示できます。</p><h3>4．情報の取り扱い</h3><p>QRコードには、ゲームのデータやマイキャラに関する大切な情報が含まれる場合があります。画面の共有やスクリーンショットによる情報の流出にご注意ください。</p><p>不正利用がご心配な方は、誕生日などの任意項目を空欄のまま登録してください。また、パスワードや連絡先など、登録に不要な個人情報は入力しないでください。</p><h3>5．登録上限と削除</h3><p>登録件数は、カード・コーデなどのQRコードと共通の上限に含まれます。上限が現在の登録件数を下回っても、登録済みの情報を自動で削除することはありません。登録件数が上限未満になるまで、新しい登録はできません。不要になった情報は、ご自身で削除できます。</p><h3>6．ご利用にあたって</h3><p>本機能はQR情報を保管・表示するための補助機能です。ゲーム公式のサービスや、ゲームデータのバックアップ機能ではありません。元のカードは大切に保管してください。登録したQRコードのゲーム機などでの読み取りや動作を保証するものではありません。</p><p>以上の内容を確認し、同意したうえで登録してください。</p></div>';
  document.body.append(termsDialog);
  formDialog.querySelector("[data-qr-terms-open]").onclick = () => {
    if (!termsDialog.open) {
      termsDialog.showModal();
      termsDialog.scrollTop = 0;
    }
  };
  formDialog.addEventListener("close", () => {
    if (termsDialog.open) termsDialog.close();
  });
  const form = formDialog.querySelector("form"),
    f = form.elements,
    status = list.querySelector("[data-status]");
  for (const modal of [list, formDialog, termsDialog])
    modal.querySelector("[data-close]").onclick = () => modal.close();
  function place() {
    const anchor = document.getElementById(
      innerWidth <= 760 ? "menu-toggle" : "game-switch",
    );
    if (!anchor) return;
    if (innerWidth <= 760) {
      if (anchor.previousElementSibling !== button) anchor.before(button);
    } else if (anchor.nextElementSibling !== button) anchor.after(button);
  }
  function sync() {
    place();
    const show =
      !!uid() &&
      !document.getElementById("selection")?.hidden &&
      !host()?.maintenance();
    if (button.hidden === show) button.hidden = !show;
    const old = document.getElementById("verse-mobile-route");
    if (show && old && !old.hidden) old.hidden = true;
  }
  function error(e) {
    return /上限/.test(e?.message || "")
      ? "QRコードの登録上限に達しました。不要なQRコードを削除してください。"
      : "操作を完了できませんでした。通信状態を確認して、もう一度お試しください。";
  }
  async function reload() {
    const u = uid(),
      version = ++request;
    rows = [];
    list.querySelector("[data-list]").replaceChildren();
    status.textContent = "読み込んでいます…";
    if (!u) return;
    try {
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const r = await db().rpc("card_save_code_list", { p_offset: offset });
        if (r.error) throw r.error;
        if (!Array.isArray(r.data)) throw Error("登録情報を読み込めませんでした");
        all.push(...r.data);
        if (r.data.length < 500) break;
      }
      if (u !== uid() || version !== request) return;
      rowsOwner = u;
      rows = all;
      status.textContent = "";
      render();
    } catch (e) {
      if (u === uid() && version === request) status.textContent = error(e);
    }
  }
  async function copy(value) {
    if (!uid() || uid() !== rowsOwner || !value) return;
    try {
      await navigator.clipboard.writeText(value);
      status.textContent = "IDをコピーしました。";
    } catch {
      status.textContent =
        "コピーできませんでした。IDを長押ししてコピーしてください。";
    }
  }
  async function remove(row) {
    const u = uid();
    if (!u || u !== rowsOwner || busy) throw Error("ログインしてください");
    busy = true;
    try {
      const r = await db().rpc("card_save_code_delete", { p_id: row.id });
      if (r.error) throw r.error;
      if (uid() !== u) return;
      rows = rows.filter((x) => x.id !== row.id);
      render();
      document.dispatchEvent(new Event("private-qr-changed"));
    } finally {
      busy = false;
    }
  }
  const confirm = document.createElement("dialog");
  confirm.className = "save-codes-dialog save-code-confirm";
  confirm.setAttribute("aria-labelledby", "save-code-delete-title");
  confirm.innerHTML =
    '<div class="save-confirm-symbol" aria-hidden="true">×</div><h2 id="save-code-delete-title">登録したQRコードを削除しますか？</h2><p data-name></p><p class="save-confirm-note">削除後は再度QRコードの読み取りが必要です。</p><div class="save-confirm-actions"><button data-cancel type="button">キャンセル</button><button data-confirm type="button">削除する</button></div>';
  document.body.append(confirm);
  function confirmDelete(row) {
    if (confirm.open || uid() !== rowsOwner) return Promise.resolve(false);
    confirm.querySelector("[data-name]").textContent = row.character_name;
    confirm.showModal();
    return new Promise((resolve) => {
      let yes = false;
      const onClose = () => {
        confirm.removeEventListener("close", onClose);
        resolve(yes);
      };
      confirm.addEventListener("close", onClose);
      confirm.querySelector("[data-cancel]").onclick = () => confirm.close();
      confirm.querySelector("[data-confirm]").onclick = () => {
        yes = true;
        confirm.close();
      };
    });
  }
  function normalizedType(value) {
    return value === "friend"
      ? "friend"
      : value === "aikatsu"
        ? "aikatsu"
        : "aipri";
  }
  function render() {
    const root = list.querySelector("[data-list]");
    root.replaceChildren();
    tabs.style.setProperty(
      "--save-type-index",
      ["aikatsu", "aipri", "friend"].indexOf(selectedType),
    );
    for (const tab of tabs.children)
      tab.setAttribute(
        "aria-pressed",
        String(tab.dataset.saveType === selectedType),
      );
    if (!rows.some((row) => normalizedType(row.series) === selectedType)) {
      const p = document.createElement("p");
      p.className = "save-codes-empty";
      p.textContent = "この種別のQRコードはまだ登録されていません。";
      root.append(p);
      return;
    }
    for (const [key, label] of Object.entries(series).filter(
      ([key]) => key === selectedType,
    )) {
      const items = rows.filter((r) => normalizedType(r.series) === key);
      if (!items.length) continue;
      const section = document.createElement("section");
      section.className = "save-code-group";
      const h = document.createElement("h3");
      h.textContent = label;

      for (const row of items) {
        const article = document.createElement("article");
        article.className = "save-code-row";
        const top = document.createElement("div");
        top.className = "save-code-line";
        const tag = document.createElement("span");
        tag.className = "save-code-series";
        tag.dataset.series = key;
        tag.textContent =
          key === "friend"
            ? "フレカ"
            : key === "aikatsu"
              ? "アイカツ"
              : "アイプリ";
        const name = document.createElement("strong");
        name.textContent = row.character_name;
        const qr = document.createElement("button");
        qr.type = "button";
        qr.className = "private-qr-button is-registered";
        qr.innerHTML = window.CARD_QR.icon;
        qr.setAttribute("aria-label", row.character_name + "のQRコードを表示");
        qr.onclick = () => {
          if (uid() !== rowsOwner) return;
          window.CARD_QR.display(row.payload, row.character_name, async () => {
            if (!(await confirmDelete(row))) return false;
            await remove(row);
            return true;
          });
        };
        const del = document.createElement("button");
        del.type = "button";
        del.className = "save-code-delete";
        del.textContent = "削除";
        del.onclick = async () => {
          del.disabled = true;
          try {
            if (await confirmDelete(row)) await remove(row);
          } catch (e) {
            status.textContent = error(e);
          } finally {
            del.disabled = false;
          }
        };
        top.append(tag, name, qr, del);
        const id = key === "aikatsu" ? row.payload : row.display_id;
        const idButton = document.createElement("button");
        idButton.type = "button";
        idButton.className = "save-code-id";
        idButton.textContent = id ? "ID：" + id : "ID：未登録";
        idButton.disabled = !id;
        idButton.title = id ? "タップしてコピー" : "";
        idButton.onclick = () => copy(id);
        article.append(top);
        if (key === "friend") {
          const memo = document.createElement("p");
          memo.className = "save-code-memo";
          memo.textContent = row.memo || "メモ：未登録";
          article.append(memo);
        } else article.append(idButton);
        if (key === "aipri") {
          const birthday = document.createElement("button");
          birthday.type = "button";
          birthday.className = "save-code-birthday";
          birthday.textContent = row.birthday
            ? "誕生日：" +
              Number(row.birthday.slice(0, 2)) +
              "月" +
              Number(row.birthday.slice(3)) +
              "日"
            : "誕生日を設定";
          birthday.setAttribute(
            "aria-label",
            row.character_name + "の誕生日を変更",
          );
          birthday.onclick = () => editBirthday(row);
          article.append(birthday);
        }
        section.append(article);
      }
      root.append(section);
    }
  }
  button.onclick = () => {
    if (!uid()) return;
    list.showModal();
    reload();
  };
  list.querySelector("[data-new]").onclick = () => {
    form.reset();
    form.querySelector("[type=submit]").disabled = true;
    f.birth_day.setCustomValidity("");
    f.series.value = selectedType;
    f.series.dispatchEvent(new Event("change"));
    formDialog.querySelector("[data-status]").textContent = "";
    formDialog.showModal();
  };
  f.series.onchange = () => {
    const type = f.series.value;
    f.birth_day.setCustomValidity("");
    form.querySelector("[data-manual]").hidden = type !== "aipri";
    form.querySelector("[data-birthday]").hidden = type !== "aipri";
    form.querySelector("[data-memo]").hidden = type !== "friend";
    form.querySelector("[data-help]").textContent =
      type === "friend"
        ? "フレンドカードのQRコードを読み取って登録します。"
        : type === "aikatsu"
          ? "アイカツはQRコードの読み取り結果をIDとして表示します。"
          : "アイプリのIDは任意です。QRの読み取り結果からIDを推測・変換しません。";
  };
  f.qr_terms_consent.onchange = () => {
    form.querySelector("[type=submit]").disabled = busy || !f.qr_terms_consent.checked;
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy || !uid() || !f.qr_terms_consent.checked || !form.reportValidity()) return;
    const u = uid(),
      name = f.character_name.value.trim();
    if (!name || (f.series.value === "aipri" && !validBirthday(f))) return;
    const details = {
      p_series: f.series.value,
      p_name: name,
      p_display_id: f.series.value === "aipri" ? f.display_id.value.trim() : "",
      p_memo: f.series.value === "friend" ? f.memo.value.trim() : "",
      p_birthday: f.series.value === "aipri" ? readBirthday(f) : null,
    };
    busy = true;
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    let saved = false;
    try {
      await window.CARD_QR.capture(async (payload) => {
        if (uid() !== u) throw Error("ログインしてください");
        if (!f.qr_terms_consent.checked) throw Error("QRコード登録規約への同意が必要です");
        const r = await db().rpc("card_save_code_add", {
          ...details,
          p_payload: payload,
        });
        if (r.error) throw r.error;
        saved = true;
        document.dispatchEvent(new Event("private-qr-changed"));
      }, { allowManualURL: true });
      if (saved && uid() === u) {
        selectedType = details.p_series;
        formDialog.close();
        await reload();
      }
    } catch (e) {
      formDialog.querySelector("[data-status]").textContent = error(e);
    } finally {
      busy = false;
      submit.disabled = !f.qr_terms_consent.checked;
    }
  };

  function setupBirthday(form) {
    const fields = form.elements;
    for (const [field, count] of [
      [fields.birth_month, 12],
      [fields.birth_day, 31],
    ]) {
      for (let n = 1; n <= count; n++)
        field.add(new Option(String(n), String(n)));
      field.onchange = () => fields.birth_day.setCustomValidity("");
    }
  }
  function readBirthday(fields) {
    return fields.birth_month.value && fields.birth_day.value
      ? fields.birth_month.value.padStart(2, "0") +
          "-" +
          fields.birth_day.value.padStart(2, "0")
      : null;
  }
  function validBirthday(fields) {
    const m = Number(fields.birth_month.value),
      d = Number(fields.birth_day.value);
    const valid =
      (!m && !d) || (m && d && new Date(2000, m - 1, d).getMonth() === m - 1);
    fields.birth_day.setCustomValidity(
      valid ? "" : "誕生日の月日を確認してください。",
    );
    if (!valid) fields.birth_day.reportValidity();
    return !!valid;
  }
  setupBirthday(form);
  const birthdayDialog = document.createElement("dialog");
  birthdayDialog.className = "save-codes-dialog save-codes-editor";
  birthdayDialog.setAttribute("aria-labelledby", "save-birthday-title");
  birthdayDialog.innerHTML =
    '<div class="save-codes-heading"><h2 id="save-birthday-title">マイキャラの誕生日</h2><button type="button" data-close aria-label="閉じる">×</button></div><form><p data-name></p><label>誕生日（任意）<span class="save-birthday-fields"><select name="birth_month" aria-label="誕生月"><option value="">月</option></select><select name="birth_day" aria-label="誕生日の日"><option value="">日</option></select></span></label><p data-status role="status"></p><button type="submit" class="primary">保存</button></form>';
  document.body.append(birthdayDialog);
  const birthdayForm = birthdayDialog.querySelector("form");
  setupBirthday(birthdayForm);
  let editing = null;
  birthdayDialog.querySelector("[data-close]").onclick = () =>
    birthdayDialog.close();
  birthdayDialog.addEventListener("close", () => {
    editing = null;
    birthdayForm.reset();
  });
  function editBirthday(row) {
    if (uid() !== rowsOwner || busy) return;
    editing = row;
    birthdayForm.reset();
    birthdayForm.elements.birth_day.setCustomValidity("");
    birthdayForm.elements.birth_month.value = row.birthday
      ? String(Number(row.birthday.slice(0, 2)))
      : "";
    birthdayForm.elements.birth_day.value = row.birthday
      ? String(Number(row.birthday.slice(3)))
      : "";
    birthdayForm.querySelector("[data-name]").textContent = row.character_name;
    birthdayForm.querySelector("[data-status]").textContent = "";
    birthdayDialog.showModal();
  }
  birthdayForm.onsubmit = async (event) => {
    event.preventDefault();
    if (
      busy ||
      !editing ||
      uid() !== rowsOwner ||
      !validBirthday(birthdayForm.elements)
    )
      return;
    const row = editing,
      u = uid(),
      birthday = readBirthday(birthdayForm.elements);
    busy = true;
    const submit = birthdayForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const result = await db().rpc("card_save_code_birthday", {
        p_id: row.id,
        p_birthday: birthday,
      });
      if (result.error) throw result.error;
      if (uid() !== u || editing !== row) return;
      row.birthday = birthday;
      render();
      birthdayDialog.close();
    } catch (e) {
      if (uid() === u)
        birthdayForm.querySelector("[data-status]").textContent = error(e);
    } finally {
      busy = false;
      submit.disabled = false;
    }
  };

  new MutationObserver(sync).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  window.addEventListener("resize", sync);
  setInterval(() => {
    const u = uid();
    if (owner !== u) {
      owner = u;
      request++;
      rowsOwner = null;
      rows = [];
      list.querySelector("[data-list]").replaceChildren();
      if (list.open) list.close();
      if (formDialog.open) formDialog.close();
      form.reset();
      if (confirm.open) confirm.close();
      if (birthdayDialog.open) birthdayDialog.close();
    }
    sync();
  }, 500);
  db()?.auth?.onAuthStateChange((event, session) => {
    if (session?.user?.id !== rowsOwner) {
      request++;
      rows = [];
      rowsOwner = null;
      list.querySelector("[data-list]").replaceChildren();
      if (list.open) list.close();
      if (formDialog.open) formDialog.close();
      form.reset();
      if (confirm.open) confirm.close();
      if (birthdayDialog.open) birthdayDialog.close();
    }
  });
  sync();
})();
