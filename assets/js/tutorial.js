(() => {
  "use strict";
  const host = window.CARD_TRADE_HOST;
  if (!host) return;
  const $ = (id) => document.getElementById(id);
  const version = 1;
  const key = () =>
    `card-album-tutorial-v${version}:${host.session()?.user.id || ""}`;
  let memory = {},
    active = false,
    chapter = "basic",
    index = 0,
    tick = null,
    timer = null;
  let target = null,
    lastTarget = null,
    owner = null,
    clickPending = false;
  const ring = document.createElement("div"),
    tip = document.createElement("section");
  ring.className = "album-tour-ring";
  ring.setAttribute("aria-hidden", "true");
  tip.className = "album-tour-tip";
  tip.setAttribute("aria-label", "操作ガイド");
  tip.setAttribute("role", "region");
  tip.innerHTML =
    '<div class="album-tour-top"><small data-tour-progress></small></div><h2 data-tour-title></h2><p data-tour-text></p><p class="album-tour-hint" data-tour-hint aria-live="polite"></p><div class="album-tour-actions"><button type="button" data-tour-chapters>終了</button><button type="button" data-tour-next>次へ</button></div>';
  for (const node of [ring, tip]) {
    node.hidden = true;
    node.setAttribute("popover", "manual");
    document.body.append(node);
  }
  const secondRing = ring.cloneNode();
  document.body.append(secondRing);
  const shade = document.createElement("div");
  shade.className = "album-tour-shade";
  shade.hidden = true;
  shade.setAttribute("popover", "manual");
  shade.setAttribute("aria-hidden", "true");
  shade.innerHTML =
    '<svg width="100%" height="100%"><path fill="#32233266" fill-rule="evenodd"/></svg>';
  document.body.append(shade);
  const exportControls = new Map();
  function lockImageExport(locked) {
    if (locked) {
      document
        .querySelectorAll("#trade-export-buttons button")
        .forEach((button) => {
          if (!exportControls.has(button))
            exportControls.set(button, button.disabled);
          button.disabled = true;
        });
    } else {
      for (const [button, disabled] of exportControls)
        button.disabled = disabled;
      exportControls.clear();
    }
  }
  const exportArea = $("trade-export-buttons");
  if (exportArea)
    new MutationObserver(() => {
      if (active) lockImageExport(true);
    }).observe(exportArea, { childList: true, subtree: true });
  let pendingAdvance = null;
  let manualPosition = null,
    dragging = null;
  let loadedUser = null,
    loadFlight = null,
    loadFailedUser = null,
    claiming = false;
  let saveTimer = null,
    saveFlight = null,
    queuedSave = null,
    saveWarning = false;
  const uid = () => host.session()?.user.id || null;
  function localState() {
    try {
      return JSON.parse(localStorage.getItem(key())) || {};
    } catch {
      return memory[key()] || {};
    }
  }
  const state = () => memory[key()] || localState();
  function cache(data) {
    memory[key()] = data;
    try {
      localStorage.setItem(key(), JSON.stringify(data));
    } catch {}
  }
  function args(data) {
    return {
      p_seen: !!data.seen || !!data.chapter || !!data.completed?.length,
      p_chapter: ["basic", "trade", "share"].includes(data.chapter)
        ? data.chapter
        : null,
      p_step:
        Number.isInteger(data.index) && data.index >= 0 && data.index <= 50
          ? data.index
          : 0,
      p_completed: [
        ...new Set(
          (Array.isArray(data.completed) ? data.completed : []).filter((x) =>
            ["basic", "trade", "share"].includes(x),
          ),
        ),
      ].sort(),
    };
  }
  async function ensureLoaded(retry = false) {
    const user = uid();
    if (!user || host.maintenance()) return false;
    if (loadedUser === user) return true;
    if (loadFlight?.user === user) return loadFlight.promise;
    if (loadFailedUser === user && !retry) return false;
    const task = { user, promise: null };
    task.promise = (async () => {
      try {
        const { data, error } = await host
          .client()
          .rpc("card_album_tutorial_load", args(localState()));
        if (error) throw error;
        if (uid() !== user) return false;
        cache(data);
        loadedUser = user;
        loadFailedUser = null;
        return true;
      } catch {
        if (uid() === user) {
          loadFailedUser = user;
          host.toast(
            "使い方の履歴を取得できませんでした。詳細設定から再試行できます。",
            "error",
          );
        }
        return false;
      } finally {
        if (loadFlight === task) loadFlight = null;
      }
    })();
    loadFlight = task;
    return task.promise;
  }
  async function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (saveFlight) return saveFlight;
    const task = queuedSave;
    if (
      !task ||
      uid() !== task.user ||
      loadedUser !== task.user ||
      host.maintenance()
    )
      return;
    queuedSave = null;
    saveFlight = (async () => {
      try {
        const { error } = await host
          .client()
          .rpc("card_album_tutorial_save", args(task.data));
        if (error) throw error;
        saveWarning = false;
      } catch {
        if (uid() === task.user) {
          if (!queuedSave) queuedSave = task;
          if (!saveWarning) {
            saveWarning = true;
            host.toast(
              "使い方の履歴をDBに保存できませんでした。この端末には保持しています。",
              "error",
            );
          }
        }
      } finally {
        saveFlight = null;
      }
    })();
    await saveFlight;
    // Retry only for a newer change, avoiding an automatic failure loop.
    if (queuedSave && queuedSave !== task && uid() === queuedSave.user) flush();
  }
  function save(data) {
    const next = { ...state(), ...data };
    cache(next);
    if (loadedUser !== uid() || !uid()) return;
    queuedSave = { user: uid(), data: next };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }
  const practice = new Map();
  let pendingOperations = 0,
    exitRequested = false,
    restoreBusy = false,
    reviewOwner = null;
  function remember(data) {
    if (data.targetType && data.targetType !== "card") return;
    const id = data.cardId || data.targetId;
    if (
      !id ||
      !["ownership", "favorite", "trade"].includes(data.kind) ||
      data.before === undefined
    )
      return;
    const after =
      data.kind === "ownership"
        ? data.quantity
        : data.kind === "favorite"
          ? data.enabled
          : data.after;
    if (after === undefined) return;
    const idKey = data.kind + ":" + id,
      previous = practice.get(idKey);
    const value = {
      id,
      kind: data.kind,
      before: previous ? previous.before : data.before,
      after,
    };
    if (JSON.stringify(value.before) === JSON.stringify(value.after))
      practice.delete(idKey);
    else practice.set(idKey, value);
  }
  const review = document.createElement("dialog");
  review.className = "album-tour-review";
  review.setAttribute("aria-labelledby", "album-tour-review-title");
  review.innerHTML =
    '<h2 id="album-tour-review-title">練習で変更した記録</h2><p data-review-count></p><p>元に戻すと、練習前からある枚数や設定は残し、今回の変更だけを取り消します。別の操作で変更されたものは取り消しません。</p><p role="status" data-review-status></p><div><button type="button" data-review-keep>そのまま残す</button><button type="button" class="primary" data-review-restore>練習前に戻す</button></div>';
  document.body.append(review);
  function reviewChanges() {
    reviewOwner = owner;
    stop(false);
    review.querySelector("[data-review-restore]").hidden = false;
    review.querySelector("[data-review-keep]").textContent = "そのまま残す";
    review.querySelector("[data-review-count]").textContent =
      `所持・お気に入り・譲求の変更が${practice.size}件あります。どうしますか？`;
    review.querySelector("[data-review-status]").textContent = "";
    review.showModal();
  }
  function finishReview() {
    practice.clear();
    review.close();
    chooseChapters();
  }
  review.querySelector("[data-review-keep]").onclick = () => {
    if (!restoreBusy) finishReview();
  };
  review.addEventListener("cancel", (event) => event.preventDefault());
  review.querySelector("[data-review-restore]").onclick = async () => {
    if (restoreBusy || host.session()?.user.id !== reviewOwner) return;
    restoreBusy = true;
    review
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = true));
    try {
      const { data, error } = await host
        .client()
        .rpc("card_album_tutorial_restore", {
          p_changes: [...practice.values()],
        });
      if (error || data?.error) throw error || Error(data.error);
      if (host.session()?.user.id !== reviewOwner) return;
      const skipped = data.skipped || 0;
      await host.refreshCommandData();
      // Refreshing records resets the trade panel; keep a visible album behind the chooser.
      if (host.game()) host.back();
      if (skipped) {
        practice.clear();
        review.querySelector("[data-review-status]").textContent =
          `${data.restored}件を戻しました。ほかで変更された${skipped}件はそのまま残しました。`;
        review.querySelector("[data-review-keep]").textContent = "確認して終了";
        review.querySelector("[data-review-restore]").hidden = true;
      } else finishReview();
    } catch (error) {
      review.querySelector("[data-review-status]").textContent =
        "記録を戻せませんでした。再試行するか、そのまま残すを選んでください。";
    } finally {
      restoreBusy = false;
      review
        .querySelectorAll("button")
        .forEach((button) => (button.disabled = false));
    }
  };
  const visible = (node) =>
    !!node &&
    !node.closest("[hidden]") &&
    node.getClientRects().length > 0 &&
    getComputedStyle(node).visibility !== "hidden";
  function find(selector) {
    return (
      [...document.querySelectorAll(selector || "__no_tour_target__")].find(
        visible,
      ) || null
    );
  }
  function menuTarget() {
    return find("#menu-toggle") ? "#menu-toggle" : "#header-other > summary";
  }
  const steps = {
    basic: [
      {
        title: "あなたのアルバムを使ってみましょう",
        text: "光る場所を押して、アルバムの使い方を体験しましょう。案内中は光る場所とこの説明だけ操作できます。練習の記録は最後に残すか元に戻すか選べます。",
        next: "始める",
      },
      {
        selector: "#selection [data-game]",
        multi: true,
        action: "#selection [data-game]",
        title: "アルバムを選ぶ",
        text: "アイカツかアイプリを選んでください。好きな方で練習できます。",
        skipIf: () => visible($("collection")) || visible($("verse")),
      },
      {
        selector: "#cards [data-detail]",
        action: "#cards [data-detail]",
        title: "カードを開く",
        text: "気になるカードをタップすると詳細が開きます。バースを開いている場合はカード一覧へ戻ってください。",
        ready: () => $("detail")?.open,
      },
      {
        selector: "#modal-owned",
        success: "ownership",
        action: "#modal-owned",
        title: "所持状況を登録",
        text: "「持っていない」を押すと1枚として登録します。「持っている」を押すと所持登録を解除します。練習するカードで操作してください。記録は終了時に元に戻せます。",
      },
      {
        selector: "#quantity-controls",
        success: "quantity",
        action: "#quantity-plus,#quantity-minus",
        title: "枚数を調整",
        text: "＋・−で枚数を管理できます。2枚以上なら一覧に重複タグが付きます。所持登録したカードで試してください。",
      },
      {
        selector: "#modal-favorite",
        success: "favorite",
        action: "#modal-favorite",
        title: "お気に入り",
        text: "☆でお気に入りを登録・解除できます。持っていないカードも登録できます。登録に成功すると次へ進みます。",
      },
      {
        selector: "#close",
        action: "#close",
        title: "一覧へ戻る",
        text: "×で詳細を閉じましょう。",
      },
      {
        selector: "#filter-panel > summary",
        action: "#filter-panel > summary",
        title: "探す条件を選ぶ",
        text: "絞り込みを開いてみましょう。だん・レアリティ・お気に入りなどで探せます。",
        ready: () => $("filter-panel")?.open,
      },
      {
        selector: "#filters",
        title: "条件はあとから解除できます",
        text: "条件を選ぶと適用中タグが表示されます。タグや各項目の解除で戻せます。基本操作はここまでです。",
        next: "基本操作を完了",
      },
    ],
    trade: [
      {
        selector: "#cards [data-detail]",
        action: "#cards [data-detail]",
        title: "交換したいカードを開く",
        text: "譲れるカードか、欲しいカードを選んで詳細を開いてください。",
        ready: () => $("detail")?.open,
      },
      {
        selector: "#detail [data-trade-control]",
        success: "trade",
        action: "#detail [data-trade-side]",
        title: "譲・求を設定",
        text: "譲れるものは「譲」、欲しいものは「求」。同じボタンをもう一度押すと優先、さらに押すと解除です。譲と求はどちらか一方だけです。練習の記録は終了時に元に戻せます。保存に成功すると次へ進みます。",
      },
      {
        selector: "#close",
        action: "#close",
        title: "詳細を閉じる",
        text: "登録した譲求を専用ページで確認しましょう。",
      },
      {
        selector: menuTarget,
        toTop: true,
        action: "#menu-toggle,#header-other > summary",
        title: "メニューを開く",
        text: "メニューから「交換希望」へ進みます。スマホでは右上のハンバーガーを開いてください。",
      },
      {
        selector: "#trade-open",
        toTop: true,
        action: "#trade-open",
        title: "交換希望へ",
        text: "登録した譲・求をまとめて確認できます。",
        skipIf: () => visible($("trade-page")),
      },
      {
        selector: "#trade-sheets",
        title: "① 譲・求を確認",
        text: "赤枠は優先指定です。絞り込みで画像に入れる範囲を調整できます。登録がなくても次へ進めます。",
      },
      {
        selector: "#trade-export-buttons",
        title: "② 交換画像を出力",
        text: "譲・求ごとに画像を出力できます。1画像に最大36枚、4画像以上でも出力可能です。作成後の画像は自分で保存してください。チュートリアル中は画像を出力できません。説明を確認して「次へ」を押してください。",
      },
      {
        selector: "#trade-copy-post",
        title: "③ 文章をコピー",
        text: "交換方法を入力し、文章をコピーして画像と一緒に使います。アプリ内で相手への送信や交換の成立は行いません。",
        next: "交換希望を完了",
      },
    ],
    share: [
      {
        selector: menuTarget,
        toTop: true,
        action: "#menu-toggle,#header-other > summary",
        title: "所持状況を共有してみる",
        text: "共有はログインなしで見られる閲覧専用ページを作る機能です。まずメニューを開いてください。",
      },
      {
        selector: "#ownership-export-open",
        toTop: true,
        action: "#ownership-export-open",
        title: "所持状況を共有",
        text: "公開する範囲を設定する画面を開きます。開くだけでは新しいURLは発行されません。",
        skipIf: () => $("ownership-share-dialog")?.open,
      },
      {
        selector: "#ownership-share-dialog .share-help",
        title: "何が見られるかを確認",
        text: "ニックネームと選択した範囲の所持状況・枚数が公開されます。アルバムIDやメール、お気に入り、譲求は表示されません。URLを知る人は誰でも閲覧できます。",
      },
      {
        selector: "#ownership-share-dialog .share-scope-settings",
        title: "シリーズとだんを選ぶ",
        text: "スイッチがONのシリーズが公開対象です。「細かく設定」で公開するだんを選べます。実際に切り替えると、既存URLがある場合も公開内容に反映されます。練習だけなら切り替える必要はありません。",
      },
      {
        selector: "#share-issue,#share-url",
        title: "URLを発行・共有",
        text: "公開したい場合だけ自分でURL発行を押してください。発行したURLはログアウト後も有効で、所持状況や公開範囲の変更が反映されます。共有設定・URLの変更は練習記録の取り消し対象外です。発行・コピー・送信は自動実行しません。",
      },
      {
        selector: "#share-delete,#share-issue",
        title: "公開を終えるには",
        text: "シリーズをOFFにするか、公開終了でURLを削除します。削除したURLは閲覧できなくなります。すでに相手が保存した画像や送信済み文章は回収できません。",
        next: "共有の説明を完了",
      },
    ],
  };
  steps.trade.unshift(steps.basic[1]);
  steps.share.unshift(steps.basic[1]);
  function selector(step) {
    return typeof step.selector === "function"
      ? step.selector()
      : step.selector;
  }
  function mountOverlay() {
    const modal = [...document.querySelectorAll("dialog[open]")].at(-1);
    const parent = modal || document.body;
    for (const node of [shade, ring, secondRing, tip]) {
      if (node.parentElement !== parent) {
        try {
          node.hidePopover?.();
        } catch {}
        parent.append(node);
      }
      node.hidden = false;
      if (node.showPopover && !node.matches(":popover-open")) {
        try {
          node.showPopover();
        } catch {}
      }
    }
  }
  function hideOverlay() {
    for (const node of [shade, ring, secondRing, tip]) {
      try {
        node.hidePopover?.();
      } catch {}
      node.hidden = true;
    }
  }
  function position() {
    tick = null;
    if (!active) return;
    if (
      !host.session() ||
      host.session().user.id !== owner ||
      host.maintenance()
    ) {
      stop(false);
      return;
    }
    const step = steps[chapter][index];
    if (step.skipIf?.()) {
      if (step.multi) host.prepareTutorial?.();
      advance();
      return;
    }
    lockImageExport(true);
    mountOverlay();
    target = find(selector(step));
    if (target && target !== lastTarget && !step.toTop) {
      lastTarget = target;
      target.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
    }
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop || 0,
      left = viewport?.offsetLeft || 0;
    const width = viewport?.width || innerWidth,
      height = viewport?.height || innerHeight;
    const rect = target?.getBoundingClientRect();
    const second = step.multi
      ? [...document.querySelectorAll(selector(step))].filter(visible)[1]
      : null;
    const holes = [rect, second?.getBoundingClientRect()].filter(Boolean);
    const outline = `M0 0H${innerWidth}V${innerHeight}H0Z`;
    shade
      .querySelector("path")
      .setAttribute(
        "d",
        outline +
          holes
            .map(
              (r) =>
                `M${r.left - 5} ${r.top - 5}h${r.width + 10}v${r.height + 10}h${-r.width - 10}Z`,
            )
            .join(""),
      );
    secondRing.style.display = second ? "block" : "none";
    if (second) {
      const r = second.getBoundingClientRect();
      Object.assign(secondRing.style, {
        left: `${r.left - 5}px`,
        top: `${r.top - 5}px`,
        width: `${r.width + 10}px`,
        height: `${r.height + 10}px`,
      });
    }

    ring.style.display = rect ? "block" : "none";
    if (rect)
      Object.assign(ring.style, {
        left: `${rect.left - 5}px`,
        top: `${rect.top - 5}px`,
        width: `${rect.width + 10}px`,
        height: `${rect.height + 10}px`,
      });
    tip.style.width = `${Math.min(340, width - 24)}px`;
    const tipHeight = tip.getBoundingClientRect().height;
    let y = rect ? rect.bottom + 16 : top + (height - tipHeight) / 2;
    if (step.multi)
      y =
        Math.max(
          rect?.bottom || 0,
          second?.getBoundingClientRect().bottom || 0,
        ) + 16;
    if (rect && y + tipHeight > top + height - 12)
      y = rect.top - tipHeight - 14;
    Object.assign(tip.style, {
      left: `${Math.max(left + 12, Math.min(rect?.left || left + (width - Math.min(340, width - 24)) / 2, left + width - Math.min(340, width - 24) - 12))}px`,
      top: `${Math.max(top + 12, Math.min(y, top + height - tipHeight - 12))}px`,
    });
    if (manualPosition)
      Object.assign(tip.style, {
        left: `${Math.max(left + 12, Math.min(manualPosition.x, left + width - tip.offsetWidth - 12))}px`,
        top: `${Math.max(top + 12, Math.min(manualPosition.y, top + height - tipHeight - 12))}px`,
      });
    tip.querySelector("[data-tour-hint]").textContent = step.action
      ? target
        ? "光っている場所を操作すると次へ進みます。"
        : "対象の表示を待っています。進めない場合は「終了」から案内を閉じて、画面を確認してください。"
      : "内容を確認したら次へ進んでください。";
  }
  function schedule() {
    if (active && tick === null) tick = requestAnimationFrame(position);
  }
  function show() {
    const step = steps[chapter][index];
    if (
      (step.success === "ownership" &&
        $("modal-owned")?.getAttribute("aria-pressed") === "true") ||
      (step.success === "favorite" &&
        $("modal-favorite")?.getAttribute("aria-pressed") === "true")
    ) {
      advance();
      return;
    }
    lastTarget = null;
    manualPosition = null;
    if (step.selector === menuTarget) host.closeTutorialMenu?.();
    if (step.toTop) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    save({
      pending: false,
      seen: true,
      chapter,
      index,
      completed: state().completed || [],
    });
    tip.querySelector("[data-tour-progress]").textContent =
      `${{ basic: "基本操作", trade: "交換希望", share: "所持状況の共有" }[chapter]} ${index + 1} / ${steps[chapter].length}`;
    tip.querySelector("[data-tour-title]").textContent = step.title;
    tip.querySelector("[data-tour-text]").textContent = step.text;
    const nextButton = tip.querySelector("[data-tour-next]");
    nextButton.textContent = step.next || "次へ";
    nextButton.hidden = !!step.action;
    nextButton.style.display = step.action ? "none" : "";
    tip
      .querySelector("[data-tour-next]")
      .classList.toggle("is-primary", !step.action || !!step.next);
    tip.querySelector("[data-tour-chapters]").disabled = pendingOperations > 0;
    tip.querySelector("[data-tour-next]").disabled = pendingOperations > 0;
    position();
  }
  function advance() {
    if (!active) return;
    if (++index < steps[chapter].length) show();
    else {
      save({
        completed: [...new Set([...(state().completed || []), chapter])],
        index: 0,
      });
      chooseChapters(true);
    }
  }
  function stop(markSkipped = true) {
    if (active && markSkipped) save({ pending: false, chapter, index });
    flush();
    active = false;
    setScrollBlocking(false);
    pendingAdvance = null;
    clickPending = false;
    clearTimeout(timer);
    timer = null;
    if (tick !== null) cancelAnimationFrame(tick);
    tick = null;
    lockImageExport(false);
    hideOverlay();
  }
  function start(which = "basic", at = 0) {
    if (!host.session() || host.maintenance()) return;
    chooser.close();
    $("display-settings-dialog")?.close();
    host.prepareTutorial?.();
    if (host.game()) host.back();
    owner = host.session().user.id;
    chapter = which;
    index = Math.max(0, Math.min(at, steps[which].length - 1));
    active = true;
    setScrollBlocking(true);
    show();
  }
  const chooser = document.createElement("dialog");
  chooser.className = "album-tour-chooser";
  chooser.setAttribute("aria-labelledby", "album-tour-choice-title");
  chooser.innerHTML =
    '<button type="button" class="album-tour-dismiss" aria-label="閉じる">×</button><h2 id="album-tour-choice-title">アルバムの使い方</h2><p>実際の画面を操作しながら説明します。いつでも終了でき、詳細設定から見直せます。練習で変更した所持・お気に入り・譲求は、終了時に残すか元に戻すか選べます。共有設定とURLの変更は元に戻す対象外です。</p><div class="album-tour-chapters"></div><button type="button" data-tour-resume hidden>前回の続きから</button><button type="button" data-tour-later>スキップ</button>';
  document.body.append(chooser);
  const labels = {
    basic: ["基本操作", "所持登録・枚数・お気に入り・絞り込み"],
    trade: ["交換希望", "譲求の設定から画像出力・文章コピーまで"],
    share: ["所持状況の共有", "公開範囲・共有URL・公開終了"],
  };
  for (const [id, [title, text]] of Object.entries(labels)) {
    const button = document.createElement("button");
    button.type = "button";
    const strong = document.createElement("strong"),
      small = document.createElement("small");
    strong.textContent = title;
    small.textContent = text;
    button.append(strong, small);
    button.dataset.tourChapter = id;
    button.onclick = () => start(id);
    chooser.querySelector(".album-tour-chapters").append(button);
  }
  function chooseChapters(fromTour = false) {
    if (!host.session() || host.maintenance()) return;
    if (pendingOperations) {
      exitRequested = true;
      tip.querySelector("[data-tour-hint]").textContent =
        "記録の保存が終わるまでお待ちください。";
      return;
    }
    if (practice.size) {
      reviewChanges();
      return;
    }
    exitRequested = false;
    stop(false);
    $("display-settings-dialog")?.close();
    // Avoid stacking the chapter chooser on a card or sharing dialog.
    for (const dialog of document.querySelectorAll("dialog[open]"))
      if (dialog !== chooser) dialog.close();
    const saved = state();
    for (const button of chooser.querySelectorAll("[data-tour-chapter]")) {
      const done = (saved.completed || []).includes(button.dataset.tourChapter);
      button.classList.toggle("is-complete", done);
      let check = button.querySelector(".album-tour-check");
      if (!check) {
        check = document.createElement("span");
        check.className = "album-tour-check";
        button.append(check);
      }
      check.textContent = done ? "✓ 確認済み" : "未確認";
    }
    const resume = chooser.querySelector("[data-tour-resume]");
    resume.hidden = !steps[saved.chapter] || !saved.index;
    resume.onclick = () => start(saved.chapter, saved.index);
    save({ pending: false, seen: true });
    chooser.showModal();
  }
  const closeChooser = () => {
    save({ pending: false, seen: true });
    chooser.close();
    flush();
  };
  chooser.querySelector(".album-tour-dismiss").onclick = closeChooser;
  chooser.querySelector("[data-tour-later]").onclick = closeChooser;
  chooser.addEventListener("cancel", () => save({ pending: false }));
  tip.querySelector("[data-tour-chapters]").onclick = () => chooseChapters();
  tip.querySelector("[data-tour-next]").onclick = () => {
    if (active && !steps[chapter][index].action && pendingOperations === 0)
      advance();
  };
  document.addEventListener(
    "keydown",
    (e) => {
      if (active && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        chooseChapters();
      }
    },
    true,
  );
  document.addEventListener("click", (event) => {
    if (!active || tip.contains(event.target)) return;
    const step = steps[chapter][index];
    if (
      step.success ||
      !step.action ||
      !event.target.closest(step.action) ||
      clickPending
    )
      return;
    clickPending = true;
    timer = setTimeout(() => {
      timer = null;
      clickPending = false;
      if (!active || steps[chapter][index] !== step) return;
      if (!step.ready || step.ready()) {
        if (step.multi) host.prepareTutorial?.();
        advance();
      } else schedule();
    }, 180);
  });
  document.addEventListener("card-album-operation-saved", (event) => {
    if (!active || host.session()?.user.id !== owner) return;
    const data = event.detail || {},
      step = steps[chapter][index];
    if (data.userId !== owner) return;
    remember(data);
    const expected = step.success;
    if (
      (expected === "ownership" &&
        data.kind === "ownership" &&
        data.quantity > 0) ||
      (expected === "quantity" && data.kind === "ownership") ||
      (expected === "favorite" && data.kind === "favorite" && data.enabled) ||
      (expected === "trade" && data.kind === "trade" && data.level > 0)
    ) {
      if (pendingOperations) pendingAdvance = step;
      else advance();
    }
  });
  document.addEventListener("card-album-operation-start", (event) => {
    if (active && event.detail?.userId === owner) {
      pendingOperations++;
      tip.querySelector("[data-tour-next]").disabled = true;
      tip.querySelector("[data-tour-chapters]").disabled = true;
    }
  });
  document.addEventListener("card-album-operation-finished", (event) => {
    if (event.detail?.userId !== owner) return;
    pendingOperations = Math.max(0, pendingOperations - 1);
    if (!pendingOperations) {
      tip.querySelector("[data-tour-next]").disabled = false;
      tip.querySelector("[data-tour-chapters]").disabled = false;
      if (exitRequested) chooseChapters();
      else if (active && pendingAdvance === steps[chapter][index]) {
        pendingAdvance = null;
        advance();
      }
    }
  });
  // Capture activation events before normal handlers; never invoke the selected control ourselves.
  function permitted(node) {
    if (!(node instanceof Element)) return false;
    if (node.closest("#trade-export-buttons")) return false;
    if (tip.contains(node)) return true;
    const step = steps[chapter]?.[index];
    const roots = [
      ...document.querySelectorAll(selector(step) || "__no_tour_target__"),
    ].filter(visible);
    if (roots.some((root) => root === node || root.contains(node))) return true;
    const menu = node.closest(".album-select-menu");
    return (
      !!menu &&
      roots.some((root) =>
        [root, ...root.querySelectorAll("[aria-controls]")].some(
          (control) => control.getAttribute("aria-controls") === menu.id,
        ),
      )
    );
  }
  function blockOutside(event) {
    if (!active || permitted(event.target)) return;
    if (event.type === "keydown" && event.key === "Escape") return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }
  for (const name of [
    "pointerdown",
    "click",
    "dblclick",
    "contextmenu",
    "keydown",
    "submit",
  ])
    document.addEventListener(name, blockOutside, true);
  // A non-passive document touchmove listener belongs only to an active tour.
  // Normal album/Verse scrolling must not wait for an inactive guide handler.
  function setScrollBlocking(enabled) {
    for (const name of ["wheel", "touchmove"]) {
      if (enabled)
        document.addEventListener(name, blockOutside, {
          capture: true,
          passive: false,
        });
      else document.removeEventListener(name, blockOutside, true);
    }
  }
  document.addEventListener(
    "focusin",
    (event) => {
      if (active && !permitted(event.target)) {
        const nextButton = tip.querySelector("[data-tour-next]");
        const focusTarget = nextButton.hidden
          ? tip.querySelector("[data-tour-chapters]")
          : nextButton;
        if (!focusTarget.disabled) focusTarget.focus({ preventScroll: true });
      }
    },
    true,
  );
  const grip = tip.querySelector(".album-tour-top");
  grip.title = "ドラッグして説明を移動";
  grip.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button") || e.button !== 0) return;
    const rect = tip.getBoundingClientRect();
    dragging = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      left: rect.left,
      top: rect.top,
    };
    grip.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  grip.addEventListener("pointermove", (e) => {
    if (dragging?.id !== e.pointerId) return;
    manualPosition = {
      x: dragging.left + e.clientX - dragging.x,
      y: dragging.top + e.clientY - dragging.y,
    };
    schedule();
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    grip.addEventListener(name, () => (dragging = null));
  function checkInitial() {
    if (owner && host.session()?.user.id !== owner) {
      stop(false);
      practice.clear();
      pendingOperations = 0;
      exitRequested = false;
      if (review.open) review.close();
      owner = null;
    }
    if (!host.session()) {
      if (active) stop(false);
      if (chooser.open) chooser.close();
      if (review.open) review.close();
      practice.clear();
      pendingOperations = 0;
      exitRequested = false;
      loadedUser = null;
      loadFailedUser = null;
      queuedSave = null;
      clearTimeout(saveTimer);
      return;
    }
    if (host.maintenance()) return;
    const albumVisible = visible($("selection")) || visible($("collection"));
    if (!albumVisible && !active) return;
    if (loadedUser !== uid()) {
      if (loadFailedUser !== uid())
        ensureLoaded().then((ok) => {
          if (ok) checkInitial();
        });
      return;
    }
    const saved = state();
    if (!active && !chooser.open && !saved.seen && !claiming && albumVisible) {
      claiming = true;
      const user = uid();
      host
        .client()
        .rpc("card_album_tutorial_claim")
        .then(({ data, error }) => {
          if (uid() !== user) return;
          if (error) {
            loadFailedUser = user;
            host.toast(
              "初回ガイドの開始状態を保存できませんでした。詳細設定から開始できます。",
              "error",
            );
            return;
          }
          cache({ ...state(), seen: true, pending: false });
          if (data === true) start("basic");
        })
        .catch(() => {
          if (uid() === user) {
            loadFailedUser = user;
            host.toast(
              "初回ガイドを開始できませんでした。詳細設定から再試行できます。",
              "error",
            );
          }
        })
        .finally(() => (claiming = false));
    }
    schedule();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush();
  });
  window.addEventListener("pagehide", () => flush());
  const observer = new MutationObserver(checkInitial);
  for (const id of [
    "selection",
    "collection",
    "verse",
    "auth",
    "detail",
    "ownership-share-dialog",
    "trade-page",
    "nav",
    "header-other",
  ])
    if ($(id))
      observer.observe($(id), {
        attributes: true,
        attributeFilter: ["hidden", "open", "class"],
      });
  document.addEventListener("load", schedule, true);
  document.addEventListener("scroll", schedule, {
    passive: true,
    capture: true,
  });
  window.addEventListener("resize", schedule, { passive: true });
  window.visualViewport?.addEventListener("resize", schedule, {
    passive: true,
  });
  document.addEventListener(
    "toggle",
    (event) => {
      if (
        active &&
        event.target?.id === "modal-scroll-rail" &&
        event.newState === "open"
      ) {
        requestAnimationFrame(() => {
          if (!active || tip.hidden || !tip.showPopover) return;
          try {
            tip.hidePopover();
            tip.showPopover();
          } catch {}
        });
      }
    },
    true,
  );
  const entry = document.createElement("button");
  entry.type = "button";
  entry.className = "album-tour-settings";
  entry.innerHTML =
    '<span class="album-tour-entry-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="3" width="16" height="18" rx="4"/><path d="m10 8 5 4-5 4Z"/></svg></span><span><strong>使い方を体験する</strong><small>実際の操作で、使い方を確認</small></span><span aria-hidden="true">›</span>';
  entry.onclick = async () => {
    if (await ensureLoaded(true)) chooseChapters();
  };
  $("display-settings-dialog")?.append(entry);
  window.CARD_TUTORIAL = {
    created(userId) {
      if (host.session()?.user.id === userId) {
        save({
          pending: true,
          seen: false,
          chapter: null,
          index: 0,
          completed: [],
        });
        checkInitial();
      }
    },
    start: async () => {
      if (await ensureLoaded(true)) chooseChapters();
    },
  };
  const style = document.createElement("style");
  style.textContent = `
.album-tour-shade{position:fixed;inset:0;margin:0;padding:0;width:100%;height:100%;max-width:none;max-height:none;border:0;background:transparent;pointer-events:none;z-index:2147482999}.album-tour-settings{display:flex!important;align-items:center;gap:12px!important}.album-tour-settings strong{display:block;font-size:12px;font-weight:600}.album-tour-settings small{display:block;font-size:10px;opacity:.72;margin-top:4px}.album-tour-settings>span:last-child{margin-left:auto;font-size:22px}.album-tour-entry-icon{display:grid;place-items:center;color:var(--accent,#cf7899)}
.album-tour-ring{position:fixed;inset:auto;margin:0;padding:0;border:3px solid var(--accent,#db83a0);border-radius:15px;background:transparent;box-shadow:none;pointer-events:none;z-index:2147483000;box-sizing:border-box;animation:album-tour-pulse 1.4s ease-in-out infinite}
.album-tour-tip{position:fixed;inset:auto;margin:0;padding:18px;box-sizing:border-box;border:1px solid var(--line,#ecdce4);border-radius:20px;background:#fff;color:var(--ink,#594651);box-shadow:0 10px 35px #34243730;z-index:2147483001;max-height:calc(100dvh - 24px);overflow:auto;font-family:inherit;animation:album-tour-appear .2s ease-out}
.album-tour-tip h2{font-size:16px;margin:6px 0 10px;line-height:1.5}.album-tour-tip p{font-size:12px;line-height:1.85;margin:0 0 10px}.album-tour-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.album-tour-top small{font-size:10px;color:var(--accent,#b86787)}.album-tour-top button,.album-tour-dismiss{border:0;background:none;font-size:23px;color:var(--muted,#8f7a86);padding:0 4px;box-shadow:none}.album-tour-actions{display:flex;justify-content:space-between;gap:8px;margin-top:12px}.album-tour-actions button{font:inherit;font-size:11px;border:1px solid var(--line,#eadce4);background:var(--soft,#fff4f8);border-radius:10px;padding:9px 11px;color:inherit}.album-tour-hint{color:var(--accent,#b86787);font-size:10px!important}.album-tour-settings{display:block;width:100%;margin-top:18px;padding:12px 14px;text-align:left;background:var(--soft,#fff5f8);border:1px solid var(--line,#eadce4);border-radius:12px;font-size:13px;color:inherit}.album-tour-chooser{width:min(460px,calc(100% - 28px));max-height:85dvh;overflow:auto;box-sizing:border-box;border:0;border-radius:24px;padding:26px;color:var(--ink,#594651)}.album-tour-chooser h2{font-size:20px;margin:0 24px 12px 0}.album-tour-chooser p{font-size:12px;line-height:1.85}.album-tour-dismiss{position:absolute;right:17px;top:14px}.album-tour-chapters{display:grid;gap:10px;margin:18px 0}.album-tour-chapters button{display:grid;gap:6px;text-align:left;background:var(--soft,#fff5f8);border:1px solid var(--line,#eadce4);padding:14px;border-radius:14px;color:inherit}.album-tour-chapters strong{font-size:14px}.album-tour-chapters small{font-size:11px;line-height:1.6}.album-tour-chooser>button:not(.album-tour-dismiss){font-size:12px;margin:6px 6px 0 0}.album-tour-tip [hidden],.album-tour-chooser [hidden]{display:none!important}
@keyframes album-tour-pulse{50%{border-color:var(--muted,#b78d9d);outline:5px solid #ffffff30}}@keyframes album-tour-appear{from{opacity:0;translate:0 5px}to{opacity:1;translate:0 0}}@media(prefers-reduced-motion:reduce){.album-tour-ring,.album-tour-tip{animation:none}}
`;
  style.textContent += `
.album-tour-tip{padding:18px 20px;border-radius:22px;background:linear-gradient(150deg,#fff,var(--soft,#fff7fa));box-shadow:0 12px 40px #422b4226}
.album-tour-top{cursor:grab;touch-action:none;user-select:none;padding-bottom:10px;border-bottom:1px solid var(--line,#eee)}.album-tour-top:active{cursor:grabbing}.album-tour-top small::after{content:" · ⋮⋮";opacity:.6}
.album-tour-actions{align-items:center;gap:12px}.album-tour-actions button{border:0;background:none;color:var(--muted,#8d7d89);font-size:11px;padding:10px 5px;box-shadow:none}.album-tour-actions button.is-primary{padding:11px 18px;border-radius:12px;background:var(--accent,#cf7899);color:#fff;font-weight:600;box-shadow:0 4px 12px #b77c9925}
.album-tour-chapters button{position:relative;padding-right:90px;border-radius:16px}.album-tour-check{position:absolute;right:13px;top:16px;font-size:10px;color:var(--muted,#999)}.album-tour-chapters button.is-complete{border-color:var(--accent,#c57d98)}.album-tour-chapters button.is-complete .album-tour-check{color:var(--accent,#b96888);font-weight:600}.album-tour-chooser [data-tour-later]{display:block;margin:14px 0 0 auto!important;background:none;border:0;color:var(--muted,#888);box-shadow:none}
`;
  style.textContent += `
.album-tour-top{min-height:18px}.album-tour-top small{padding-right:8px}.album-tour-actions button[data-tour-chapters]{color:var(--muted,#8d7d89);border:1px solid var(--line,#eee);border-radius:10px;padding:9px 13px}.album-tour-actions button:disabled{opacity:.5;cursor:wait}
.album-tour-review{width:min(460px,calc(100% - 28px));max-height:85dvh;overflow:auto;box-sizing:border-box;border:0;border-radius:24px;padding:25px;color:var(--ink,#594651)}.album-tour-review h2{font-size:18px;margin:0 0 15px}.album-tour-review p{font-size:12px;line-height:1.9}.album-tour-review>div{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:9px;margin-top:18px}.album-tour-review button{font-size:12px;border-radius:11px;padding:10px 14px}.album-tour-review .primary{background:var(--accent,#c57595);color:white}
`;
  document.head.append(style);
  checkInitial();
})();
