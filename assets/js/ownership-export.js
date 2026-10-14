(() => {
  const get = (id) => document.getElementById(id);
  let outputText = "",
    outputOwner = null;
  const status = (text) => {
    get("ownership-export-status").textContent = text;
  };
  const seriesOf = (c) =>
    Array.isArray(c.series) ? c.series : c.series ? [c.series] : [];
  function clearOutput() {
    outputText = "";
    outputOwner = null;
    get("ownership-export-preview").textContent = "";
    get("ownership-export-preview").hidden = true;
    get("ownership-export-actions").hidden = true;
  }
  function validOutput() {
    return outputText && outputOwner === session?.user.id;
  }
  get("ownership-export-dialog").addEventListener("close", clearOutput);
  get("ownership-export-close").onclick = () =>
    get("ownership-export-dialog").close();
  get("ownership-export-open").onclick = () => {
    if (!session || !game) return;
    closeMenu();
    clearOutput();
    get("ownership-export-details").checked = false;
    const labels = [...new Set(albumCards().flatMap(seriesOf))].sort(
      (a, b) => seriesRank(b) - seriesRank(a) || a.localeCompare(b, "ja"),
    );
    get("ownership-export-series").replaceChildren(
      new Option("すべて", ""),
      ...labels.map((label) => new Option(label, label)),
    );
    status("弾数を選んで、所持状況の文章を作成できます。");
    get("ownership-export-dialog").showModal();
  };
  get("ownership-export-series").onchange = () => {
    clearOutput();
    status("選択した弾数で文章を作成してください。");
  };
  get("ownership-export-details").onchange = () => {
    clearOutput();
    status("設定を変更しました。「文章を作成」を押してください。");
  };
  get("ownership-export-create").onclick = () => {
    clearOutput();
    if (!session || !game || !ownershipReady) {
      status("所持データの読み込み完了後にお試しください。");
      return;
    }
    const chosen = get("ownership-export-series").value;
    const all = albumCards().filter(
      (c) => !chosen || seriesOf(c).includes(chosen),
    );
    const cards = all
      .filter((c) => owned.has(c.id))
      .sort((a, b) =>
        String(a.code || "").localeCompare(String(b.code || ""), "ja", {
          numeric: true,
        }),
      );
    const title =
      (game === "aikatsu"
        ? "アイカツアンコール"
        : aipriFamily === "おねがい"
          ? "おねがいアイプリ"
          : "ひみつのアイプリ") +
      "　" +
      (chosen || "すべて");
    const url = new URL(siteBase);
    url.search = "";
    url.hash = game;
    const time = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    outputText =
      title +
      "\n全" +
      all.length +
      "枚中 " +
      cards.length +
      "枚を取得しました！\n\n出力日時：" +
      time +
      "（日本時間）\n" +
      url.href +
      "\n\n" +
      (game === "aikatsu" ? "#アイカツアンコール" : "#アイプリ");
    if (get("ownership-export-details").checked && cards.length)
      outputText +=
        "\n\n持っているカード\n" +
        cards
          .map(
            (c) =>
              (c.code || "コード未取得") +
              "　" +
              (c.name || "カード名未取得") +
              "　" +
              (ownedCounts.get(c.id) || 1) +
              "枚",
          )
          .join("\n");
    outputOwner = session.user.id;
    get("ownership-export-preview").textContent = outputText;
    get("ownership-export-preview").hidden = false;
    get("ownership-export-actions").hidden = false;
    status("文章を作成しました。取得枚数はカードの種類数です。");
  };
  get("ownership-export-copy").onclick = async () => {
    if (!validOutput()) return;
    try {
      await navigator.clipboard.writeText(outputText);
      status("文章をコピーしました。");
    } catch {
      status(
        "コピーできませんでした。表示された文章を選択してコピーしてください。",
      );
    }
  };
  get("ownership-export-share").onclick = async () => {
    if (!validOutput()) return;
    if (!navigator.share) {
      status(
        "このブラウザでは直接共有できません。「文章をコピー」をご利用ください。",
      );
      return;
    }
    try {
      await navigator.share({ text: outputText });
    } catch (error) {
      if (error.name !== "AbortError")
        status("共有できませんでした。「文章をコピー」をご利用ください。");
    }
  };
  db?.auth.onAuthStateChange((_event, next) => {
    if (!next || (outputOwner && next.user.id !== outputOwner)) {
      clearOutput();
      get("ownership-export-dialog").close();
    }
  });
})();
