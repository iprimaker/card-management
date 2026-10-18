(() => {
  "use strict";
  const cache = new Map();
  const CAPACITY = 36;
  const WIDTH = 1080;
  const MARGIN = 24;
  const GAP = 6;
  const COLS = 6;
  const CELL_WIDTH = (WIDTH - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
  const CELL_HEIGHT = 238;
  const HEADER = 108;
  let dialog = null,
    objectURL = null;

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(
        () => finish(Error("画像の読み込みがタイムアウトしました。")),
        25000,
      );
      function finish(error) {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        if (error) {
          image.src = "";
          reject(error);
        } else resolve(image);
      }
      image.crossOrigin = "anonymous";
      image.referrerPolicy = "no-referrer";
      image.onload = () =>
        image.naturalWidth && image.naturalHeight
          ? finish()
          : finish(Error("画像を読み込めませんでした。"));
      image.onerror = () => finish(Error("画像を読み込めませんでした。"));
      image.src = url;
    });
  }

  function exportImage(source) {
    const url = new URL(source, location.href);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      return Promise.reject(Error("画像URLを確認してください。"));
    if (cache.has(url.href)) {
      const value = cache.get(url.href);
      cache.delete(url.href);
      cache.set(url.href, value);
      return value;
    }
    // 外部サイトのCORS制限を避け、出力時だけ公開画像を縮小変換します。
    // アルバムID・所持数・交換設定・認証情報は変換サービスに送信しません。
    const publicRemote =
      url.protocol === "https:" &&
      url.origin !== location.origin &&
      ![...url.searchParams.keys()].some((key) =>
        /token|signature|credential|authorization|api.?key|^sig$|^key$/i.test(
          key,
        ),
      );
    const proxy = new URL("https://wsrv.nl/");
    proxy.search = new URLSearchParams({
      url: url.href,
      w: "240",
      h: "336",
      fit: "inside",
      we: "",
      output: "webp",
      q: "65",
    }).toString();
    const task = loadImage(publicRemote ? proxy.href : url.href).catch(
      (error) => {
        cache.delete(url.href);
        throw error;
      },
    );
    cache.set(url.href, task);
    while (cache.size > 64) cache.delete(cache.keys().next().value);
    return task;
  }

  function rounded(context, x, y, width, height, radius, color) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fillStyle = color;
    context.fill();
  }
  function text(context, value, x, y, size, color, maxWidth, weight = 500) {
    let fontSize = size;
    context.textAlign = "left";
    context.textBaseline = "middle";
    do {
      context.font = `${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans JP", sans-serif`;
      if (context.measureText(value).width <= maxWidth || fontSize <= 9) break;
      fontSize--;
    } while (fontSize > 0);
    context.fillStyle = color;
    context.fillText(value, x, y, maxWidth);
  }
  function drawImage(context, image, x, y, width, height, rotate) {
    const landscape = rotate && image.naturalWidth > image.naturalHeight;
    const iw = landscape ? image.naturalHeight : image.naturalWidth;
    const ih = landscape ? image.naturalWidth : image.naturalHeight;
    const scale = Math.min(width / iw, height / ih);
    context.save();
    context.translate(x + width / 2, y + height / 2);
    if (landscape) context.rotate(Math.PI / 2);
    context.drawImage(
      image,
      (-image.naturalWidth * scale) / 2,
      (-image.naturalHeight * scale) / 2,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );
    context.restore();
  }

  async function create(
    sheet,
    title,
    progress = () => {},
    current = () => true,
  ) {
    if (!sheet.cards?.length || sheet.cards.length > CAPACITY)
      throw Error("1画像に配置できるカードは1〜36枚です。");
    const cards = sheet.cards;
    const sources = [
      ...new Set(cards.flatMap((c) => (c.image ? [c.image] : c.collage || []))),
    ];
    if (cards.some((c) => !c.image && !c.collage?.length))
      throw Error(
        "画像が未登録のカードがあります。カード情報を確認してください。",
      );
    const images = new Map();
    let next = 0,
      done = 0;
    const assertCurrent = () => {
      if (!current()) throw Error("画像の作成を中止しました。");
    };
    await Promise.all(
      Array.from({ length: Math.min(4, sources.length) }, async () => {
        while (next < sources.length) {
          assertCurrent();
          const source = sources[next++];
          images.set(source, await exportImage(source));
          assertCurrent();
          progress(++done, sources.length);
        }
      }),
    );
    if (document.fonts?.ready) await document.fonts.ready;
    assertCurrent();
    const rows = Math.ceil(cards.length / COLS);
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height =
      HEADER + rows * CELL_HEIGHT + (rows - 1) * GAP + MARGIN + 38;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context)
      throw Error(
        "画像を作成できません。このブラウザでは画像出力を利用できません。",
      );
    try {
      context.fillStyle = "#fffafc";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "medium";
      const offer = sheet.side === "offer",
        accent = offer ? "#aa6c68" : "#4e8eae";
      text(
        context,
        `${title}　交換`,
        MARGIN,
        30,
        26,
        "#625961",
        WIDTH - MARGIN * 2,
        600,
      );
      text(
        context,
        offer ? "譲れるカード" : "欲しいカード",
        MARGIN,
        73,
        25,
        accent,
        620,
        600,
      );
      const page = `${sheet.page} / ${sheet.pages}　画像${sheet.number}枚目 · ${cards.length}枚`;
      text(context, page, WIDTH - 335, 73, 18, "#8b8087", 310);
      cards.forEach((card, index) => {
        const x = MARGIN + (index % COLS) * (CELL_WIDTH + GAP);
        const y = HEADER + Math.floor(index / COLS) * (CELL_HEIGHT + GAP);
        rounded(context, x, y, CELL_WIDTH, CELL_HEIGHT, 6, "#fff");
        if (card.image)
          drawImage(
            context,
            images.get(card.image),
            x + 3,
            y + 3,
            CELL_WIDTH - 6,
            CELL_HEIGHT - 6,
            card.kind !== "coordinate",
          );
        else {
          const cols = card.collage.length === 1 ? 1 : 2;
          const rows = Math.ceil(card.collage.length / cols);
          card.collage.forEach((url, i) =>
            drawImage(
              context,
              images.get(url),
              x + ((i % cols) * CELL_WIDTH) / cols + 3,
              y + (Math.floor(i / cols) * CELL_HEIGHT) / rows + 3,
              CELL_WIDTH / cols - 6,
              CELL_HEIGHT / rows - 6,
              true,
            ),
          );
        }
        const quantity = `${card.quantity}枚`;
        context.font = "600 17px sans-serif";
        const badgeWidth = Math.min(
          CELL_WIDTH - 12,
          context.measureText(quantity).width + 20,
        );
        rounded(
          context,
          x + CELL_WIDTH - badgeWidth - 5,
          y + 5,
          badgeWidth,
          27,
          10,
          "#fffffff2",
        );
        text(
          context,
          quantity,
          x + CELL_WIDTH - badgeWidth + 5,
          y + 19,
          17,
          "#675861",
          badgeWidth - 20,
          600,
        );
        const serial = String(card.code || "コード記載なし");
        context.font = "500 14px sans-serif";
        const codeWidth = Math.min(
          CELL_WIDTH - 10,
          context.measureText(serial).width + 12,
        );
        rounded(
          context,
          x + 5,
          y + CELL_HEIGHT - 26,
          codeWidth,
          21,
          4,
          "#ffffffeb",
        );
        text(
          context,
          serial,
          x + 11,
          y + CELL_HEIGHT - 15,
          14,
          "#4f454c",
          codeWidth - 12,
        );
        if (card.priority) {
          context.beginPath();
          context.roundRect(x + 2, y + 2, CELL_WIDTH - 4, CELL_HEIGHT - 4, 5);
          context.strokeStyle = "#db4c60";
          context.lineWidth = 4;
          context.stroke();
        }
      });
      text(
        context,
        cards.some((c) => c.priority) ? "赤枠：優先して交換したいカード" : "",
        MARGIN,
        canvas.height - 24,
        16,
        "#aa6672",
        WIDTH - MARGIN * 2,
      );
      return await new Promise((resolve, reject) => {
        try {
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(Error("画像を作成できませんでした。")),
            "image/jpeg",
            0.7,
          );
        } catch {
          reject(
            Error(
              "画像の保存が制限されています。画像の配信設定をご確認ください。",
            ),
          );
        }
      });
    } finally {
      canvas.width = canvas.height = 1;
    }
  }

  function close() {
    if (dialog?.open) dialog.close();
  }
  function show(blob, filename, heading) {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "trade-export-dialog";
      dialog.setAttribute("aria-labelledby", "trade-export-dialog-title");
      dialog.innerHTML =
        '<div class="trade-export-dialog-heading"><h2 id="trade-export-dialog-title"></h2><button type="button" data-export-close aria-label="閉じる">×</button></div><p>低画質JPEGで作成しました。画像を保存して、交換希望の文章と一緒にご利用ください。</p><img alt="出力した交換希望の一覧"><div class="trade-actions"><a data-export-save>画像を保存</a><button type="button" data-export-share>画像を共有</button></div><small>保存できない場合は、画像を長押しして保存してください。</small><p data-export-error role="status"></p>';
      document.body.append(dialog);
      dialog.querySelector("[data-export-close]").onclick = close;
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) close();
      });
      dialog.addEventListener("close", () => {
        dialog.querySelector("img").removeAttribute("src");
        dialog.querySelector("[data-export-save]").removeAttribute("href");
        dialog.querySelector("[data-export-share]").onclick = null;
        if (objectURL) URL.revokeObjectURL(objectURL);
        objectURL = null;
      });
    }
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = URL.createObjectURL(blob);
    dialog.querySelector("h2").textContent = heading;
    dialog.querySelector("img").src = objectURL;
    const save = dialog.querySelector("[data-export-save]");
    save.href = objectURL;
    save.download = filename;
    const file = new File([blob], filename, { type: "image/jpeg" });
    const share = dialog.querySelector("[data-export-share]");
    share.hidden = !navigator.canShare?.({ files: [file] });
    dialog.querySelector("[data-export-error]").textContent = "";
    share.onclick = async () => {
      try {
        await navigator.share({ files: [file], title: heading });
      } catch (error) {
        if (error.name !== "AbortError")
          dialog.querySelector("[data-export-error]").textContent =
            "共有できませんでした。「画像を保存」をご利用ください。";
      }
    };
    dialog.showModal();
  }
  window.CARD_TRADE_IMAGE = { create, show, close };
})();
