(() => {
  "use strict";
  const exporterURL = new URL("./trade-image-export.js?v=20261118-ownership-image-v65", document.currentScript.src);
  const columns = 10;
  const imageConcurrency = 12;
  const imageLoadShare = 0.95;
  const desktopSave = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const size = 100;
  const width = 1600;
  const cellWidth = 140;
  const themes = {
    rose: { accent: "#8a4166", dark: "#503344", light: "#fff7fb", canvas: "#fffafd", border: "#eedce8", muted: "#755466", wash: "#f5dfeb", badge: "#f2dbeb" },
    blue: { accent: "#306398", dark: "#294767", light: "#f6fbff", canvas: "#f8fbff", border: "#dce8f5", muted: "#4b6886", wash: "#e0edfb", badge: "#dceafb" },
    yellow: { accent: "#805915", dark: "#503d20", light: "#fffaf0", canvas: "#fffdf6", border: "#efe1b9", muted: "#70582d", wash: "#fbedbe", badge: "#f6e8b7" },
  };
  const left = 36;
  const issueDateFormat = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric",
  });
  const siteURL = "https://iprimaker.github.io/card-management";
  // QR matrix for the site's /#signup registration tab.
  const signupQR = [
    "111111101110011001100110001111111",
    "100000100111000010000100101000001",
    "101110101110010011010101001011101",
    "101110100010100000000111001011101",
    "101110100101110100010100101011101",
    "100000101010000100010000101000001",
    "111111101010101010101010101111111",
    "000000000101101110011011100000000",
    "101000110100000010000000100100101",
    "110011011001011111111001101001001",
    "101001100110100100010011001001101",
    "110001000011010111000010010111010",
    "100010111010010001001000101100000",
    "100011010110110000000101001101111",
    "010000101101010101011011100000101",
    "010000001010111000100010111101000",
    "101000110011111110011001101101010",
    "011001010100010100011101101001001",
    "011110100110111101110111100101111",
    "000101001011111110111011010011000",
    "110011111011011011110001001100001",
    "010000001000011010111001101100001",
    "110110100100110010110101110010101",
    "001000000111010110001011110001011",
    "110110110110000010111000111111011",
    "000000001111011111011011100010001",
    "111111101100100100011000101011101",
    "100000100101110001011011100011001",
    "101110100111000001000001111110011",
    "101110100100100001011000010111111",
    "101110101100100100011011100111011",
    "100000100100011000011000110111000",
    "111111101100000110001010101111001",
  ];
  let exporter, encoder, dialog, snapshot, authorized, sharedPage, previewTimer, previewURL, batchURL, request = 0;

  function loadExporter() {
    if (window.CARD_TRADE_IMAGE?.loadPublicImage) return Promise.resolve(window.CARD_TRADE_IMAGE);
    if (!exporter) {
      exporter = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = exporterURL.href;
        script.onload = () => window.CARD_TRADE_IMAGE?.loadPublicImage
          ? resolve(window.CARD_TRADE_IMAGE)
          : reject(Error("画像読み込み機能を利用できませんでした。"));
        script.onerror = () => reject(Error("画像読み込み機能を利用できませんでした。"));
        document.head.append(script);
      }).catch((error) => {
        exporter = null;
        throw error;
      });
    }
    return exporter;
  }

  function pictureStyle(item, display, partsOnly) {
    if (display.fadeUnownedCards && !item.collected) {
      return { opacity: 0.32, grayscale: false };
    }
    return {
      opacity: !display.allColor && !display.reverse && partsOnly ? 0.46 : 1,
      grayscale: !display.allColor && (display.reverse ? item.collected : !item.collected && !partsOnly),
    };
  }

  function drawPicture(ctx, img, item, x, y, w, h) {
    const transform = window.CARD_IMAGE_TRANSFORM?.normalize(item.transform);
    const landscape = !transform && item.rotate && img.naturalWidth > img.naturalHeight;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const fit = Math.min(w / (landscape ? ih : iw), h / (landscape ? iw : ih));
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
    else ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x + w / 2 + w * (transform?.x || 0) / 100, y + h / 2 + h * (transform?.y || 0) / 100);
    ctx.rotate((landscape ? 90 : transform?.angle || 0) * Math.PI / 180);
    const scale = fit * (transform?.zoom || 1);
    ctx.drawImage(img, -iw * scale / 2, -ih * scale / 2, iw * scale, ih * scale);
    ctx.restore();
  }

  function wrapText(ctx, text, maxWidth, font) {
    ctx.font = font + " sans-serif";
    const lines = [];
    let line = "";
    for (const character of text) {
      if (ctx.measureText(line + character).width > maxWidth) {
        lines.push(line.trimEnd());
        line = character.trimStart();
      } else {
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function loadQREncoder() {
    if (typeof window.qrcode === "function") return Promise.resolve(window.qrcode);
    if (!encoder) {
      encoder = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = new URL("./vendor/qr-encoder.js", exporterURL).href;
        const fail = () => {
          script.remove();
          reject(Error("共有ページのQRコードを作成できませんでした。"));
        };
        script.onload = () => typeof window.qrcode === "function" ? resolve(window.qrcode) : fail();
        script.onerror = fail;
        document.head.append(script);
      }).catch((error) => {
        encoder = null;
        throw error;
      });
    }
    return encoder;
  }

  async function sharedQR(url) {
    if (!url) return null;
    const makeQR = await loadQREncoder();
    const qr = makeQR(0, "M");
    qr.addData(url, "Byte");
    qr.make();
    const count = qr.getModuleCount();
    return Array.from({ length: count }, (_, row) =>
      Array.from({ length: count }, (_, column) => qr.isDark(row, column) ? "1" : "0").join(""));
  }

  function drawQR(ctx, matrix, x, y) {
    const margin = 4;
    const frame = 164;
    const side = matrix.length + 2 * margin;
    const moduleSize = Math.max(1, Math.floor(frame / side));
    const offset = Math.floor((frame - side * moduleSize) / 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, frame, frame);
    ctx.fillStyle = "#000";
    matrix.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === "1") {
          ctx.fillRect(x + offset + (c + margin) * moduleSize,
            y + offset + (r + margin) * moduleSize, moduleSize, moduleSize);
        }
      }
    });
  }

  async function loadPageImages(items, current, onProgress) {
    const images = new Map();
    const urls = [...new Set(items.map((item) => item.image).filter(Boolean))];
    onProgress(0, urls.length);
    if (!current() || !urls.length) return images;
    const loader = await loadExporter();
    let next = 0, completed = 0;
    await Promise.all(Array.from({ length: Math.min(imageConcurrency, urls.length) }, async () => {
      while (next < urls.length && current()) {
        const url = urls[next++];
        try {
          images.set(url, await loader.loadPublicImage(url));
        } catch {
          // The image request has failed or reached its own timeout.
        }
        completed++;
        if (current()) onProgress(completed, urls.length);
      }
    }));
    return images;
  }

  function showProgress(visible = false, { value, max, image = 1, pages = 1 } = {}) {
    const region = dialog.querySelector("[data-generation-progress]");
    const bar = region.querySelector("progress");
    region.hidden = !visible;
    const count = region.querySelector("[data-generation-count]");
    count.hidden = pages < 2;
    count.textContent = pages > 1 ? `${image} / ${pages}` : "";
    if (max > 0) {
      bar.max = max;
      bar.value = value;
    } else {
      bar.removeAttribute("value");
    }
  }

  function completeProgress(current, { image, pages }) {
    const region = dialog.querySelector("[data-generation-progress]");
    if (region.hidden) return;
    const max = region.querySelector("progress").max;
    showProgress(true, { value: max, max, image, pages });
    setTimeout(() => {
      if (current()) keepSettingsPosition(() => showProgress());
    }, 200);
  }

  async function create(sections, { heading, caption, conditions, edition, theme, issueDate, page, pages, pageQR, display }, current, onProgress) {
    const items = sections.flatMap(({ rows }) => rows);
    const [images, qr] = await Promise.all([loadPageImages(items, current, onProgress), pageQR]);
    if (!current()) return null;
    onProgress();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("共有用画像を作成できませんでした。");
    try {
      const filterX = 660;
      const filterWidth = width - left - filterX;
      const detailsX = filterX + 275;
      const conditionsPerColumn = 4;
      const maxConditions = conditionsPerColumn * 4;
      const visibleConditions = conditions.length > maxConditions
        ? [...conditions.slice(0, maxConditions - 1), `ほか${conditions.length - maxConditions + 1}件`]
        : conditions;
      const columnCount = Math.max(1, Math.ceil(visibleConditions.length / conditionsPerColumn));
      const columnWidth = (filterWidth - 307) / columnCount;
      const conditionFont = "18px";
      const conditionWidth = columnWidth - 14;
      const detailLines = visibleConditions.map((condition) => {
        const lines = wrapText(ctx, condition.replace(/\s+/g, " "), conditionWidth, conditionFont);
        if (lines.length <= 1) return lines[0] || "";
        const first = [...lines[0]];
        while (ctx.measureText(first.join("") + "…").width > conditionWidth) first.pop();
        return first.join("").trimEnd() + "…";
      });
      const editionLeft = filterX + 64;
      const editionRight = detailsX - 24;
      const editionWidth = editionRight - editionLeft;
      const splitEdition = edition.match(/^(リング|おねがい|スタジオ)\s*((?:第)?[0-9０-９]+(?:だん|弾|章))$/);
      const editionLines = splitEdition ? splitEdition.slice(1) : wrapText(ctx, edition, editionWidth, "bold 25px");
      const headerHeight = Math.max(184, 58 + editionLines.length * 35);
      const editionRowHeight = (headerHeight - 54) / editionLines.length;
      const cellHeight = 218 + 26 * (Number(Boolean(display.serial)) + Number(Boolean(display.showNames)));
      const top = headerHeight + 28;
      let nextRowY = top;
      const layout = sections.map((section) => {
        const y = nextRowY;
        nextRowY += (section.label ? 38 : 0) + Math.ceil(section.rows.length / columns) * cellHeight;
        return { ...section, y };
      });
      const footer = nextRowY + 4;
      canvas.height = footer + 210;
      const box = (color, x, y, w, h, radius = 0) => {
        ctx.fillStyle = color;
        if (radius && ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, radius);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, w, h);
        }
      };
      const label = (string, x, y, font, color, maxWidth) => {
        ctx.font = font + " sans-serif";
        ctx.fillStyle = color;
        ctx.fillText(String(string), x, y, maxWidth);
      };

      box(theme.canvas, 0, 0, width, canvas.height);
      const header = ctx.createLinearGradient(left, 14, width - left, headerHeight);
      header.addColorStop(0, theme.wash);
      header.addColorStop(1, theme.light);
      box(theme.border, left, 14, width - 2 * left, headerHeight - 14, 28);
      box(header, left + 1, 15, width - 2 * left - 2, headerHeight - 16, 27);
      const summaryX = left + 36;
      const summaryWidth = filterX - summaryX - 34;
      const maxHeadingSize = 56;
      ctx.font = `bold ${maxHeadingSize}px sans-serif`;
      const headingSize = Math.floor(maxHeadingSize * Math.min(1, summaryWidth / ctx.measureText(heading).width));
      label(heading, summaryX, 86, `bold ${headingSize}px`, theme.dark, summaryWidth);

      if (display.hideRate) {
        box(theme.badge, summaryX, 112, 176, 32, 16);
        label("コレクション", summaryX + 17, 135, "bold 18px", theme.accent, 144);
      } else {
        const [rate, count] = caption.split("　");
        box(theme.badge, summaryX, 112, 80, 32, 16);
        ctx.textAlign = "center";
        label("所持率", summaryX + 40, 135, "bold 18px", theme.accent, 64);
        ctx.textAlign = "left";
        label(rate, summaryX + 98, 146, "bold 52px", theme.accent, 218);
        label(count, summaryX + 340, 143, "bold 25px", theme.dark, summaryWidth - 340);
        const progressWidth = summaryWidth * Number.parseFloat(rate) / 100;
        box(theme.badge, summaryX, 160, summaryWidth, 7, 3.5);
        if (progressWidth > 0) {
          box(theme.accent, summaryX, 160, progressWidth, 7, Math.min(3.5, progressWidth / 2));
        }
      }

      box(theme.border, filterX, 24, filterWidth - 12, headerHeight - 34, 20);
      box("#fff", filterX + 1, 25, filterWidth - 14, headerHeight - 36, 19);
      const filterCenter = (headerHeight + 14) / 2;
      box(theme.wash, filterX + 15, filterCenter - 56, 43, 112, 14);
      ctx.textAlign = "center";
      [..."絞り込み"].forEach((character, i) =>
        label(character, filterX + 36.5, filterCenter - 27 + 21 * i, "bold 17px", theme.accent, 30));
      ctx.textBaseline = "middle";
      editionLines.forEach((line, i) => {
        const maxFontSize = Math.floor(editionRowHeight * .92);
        ctx.font = `bold ${maxFontSize}px sans-serif`;
        const measuredWidth = ctx.measureText(line).width;
        const fontSize = Math.floor(maxFontSize * Math.min(1, editionWidth / measuredWidth));
        const rowCenter = filterCenter + (i - (editionLines.length - 1) / 2) * editionRowHeight;
        label(line, (editionLeft + editionRight) / 2, rowCenter,
          `bold ${fontSize}px`, theme.accent, editionWidth);
      });
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      box(theme.border, detailsX - 18, 45, 1, headerHeight - 78);
      if (!detailLines.length) label("絞り込みなし", detailsX, filterCenter + 7, "20px", theme.muted, 440);
      detailLines.forEach((line, index) => {
        const x = detailsX + Math.floor(index / conditionsPerColumn) * columnWidth;
        const y = filterCenter - 30 + index % conditionsPerColumn * 24;
        label(line, x, y, conditionFont, theme.dark, conditionWidth);
      });

      layout.forEach((section) => {
        if (section.label) {
          box(theme.wash, left, section.y - 4, width - 2 * left, 28, 9);
          label(section.label, left + 13, section.y + 16, "bold 18px", theme.dark, width - 2 * left - 24);
        }
        section.rows.forEach((item, i) => {
          const x = left + 4 + (i % columns) * 154;
          const y = section.y + (section.label ? 38 : 0) + Math.floor(i / columns) * cellHeight;
          const img = images.get(item.image);
          box(theme.border, x - 4, y - 4, cellWidth + 8, cellHeight - 5, 12);
          box("#fff", x - 3, y - 3, cellWidth + 6, cellHeight - 7, 11);
          box(theme.light, x, y, cellWidth, 204, 8);
          const ownedParts = item.ownedParts || [];
          const partsOnly = !item.collected && ownedParts.length > 0;
          const { opacity, grayscale } = pictureStyle(item, display, partsOnly);
          ctx.globalAlpha = opacity;
          if (img) drawPicture(ctx, img, item, x, y, cellWidth, 204);
          ctx.globalAlpha = 1;
          if (grayscale) {
            ctx.globalCompositeOperation = "saturation";
            box("#808080", x, y, cellWidth, 204, 8);
            ctx.globalCompositeOperation = "source-over";
          }
          if (!img) label(item.name, x + 5, y + 104, "16px", theme.dark, cellWidth - 10);
          if (display.showNames) {
            ctx.textAlign = "center";
            label(item.name, x + cellWidth / 2, y + 225, "16px", theme.dark, cellWidth - 8);
          }
          if (display.serial && item.code) {
            ctx.textAlign = "center";
            label(item.code, x + cellWidth / 2, y + (display.showNames ? 249 : 225), "17px", item.collected ? theme.dark : theme.muted, cellWidth - 8);
          }
          const badges = partsOnly
            ? (display.hidePartTags ? [] : ownedParts)
            : item.collected
              ? [item.quantity > 0 && !display.hideQuantity ? String(item.quantity) : "✓"]
              : display.allColor ? ["0"] : [];
          if (display.showRarity && item.rarity) {
            ctx.textAlign = "left";
            box(theme.light, x + 4, y + 179, cellWidth - 8, 21, 6);
            label(item.rarity, x + 9, y + 194, "bold 14px", theme.dark, cellWidth - 18);
          }
          const badgeFont = partsOnly ? "bold 14px" : "bold 19px";
          const badgeHeight = partsOnly ? 22 : 30;
          ctx.textAlign = "center";
          badges.forEach((badge, index) => {
            ctx.font = badgeFont + " sans-serif";
            const badgeWidth = Math.min(cellWidth - 8, Math.max(32, Math.ceil(ctx.measureText(badge).width) + 16));
            const badgeX = x + cellWidth - badgeWidth - 4;
            const badgeY = y + 4 + index * (badgeHeight + 3);
            box("#fff", badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
            box(theme.badge, badgeX + 1, badgeY + 1, badgeWidth - 2, badgeHeight - 2, badgeHeight / 2 - 1);
            label(badge, badgeX + badgeWidth / 2, badgeY + (partsOnly ? 16 : 22),
              badgeFont, theme.dark, badgeWidth - 9);
          });
          ctx.textAlign = "left";
        });
      });

      box(theme.border, left, footer + 7, width - 2 * left, 196, 24);
      box(theme.light, left + 1, footer + 8, width - 2 * left - 2, 194, 23);
      label("カードアルバムで作成", left + 33, footer + 55, "bold 23px", theme.dark, 1130);
      label(siteURL, left + 33, footer + 87, "22px", theme.accent, 1130);
      label("カードアルバムは非公式のコレクション記録サイトです。", left + 33, footer + 130, "20px", theme.muted, 1130);
      label("作品名やカード画像などの権利は、各権利者に帰属します。", left + 33, footer + 159, "20px", theme.muted, 1130);
      const panelX = 930;
      const textX = panelX + 25;
      const qrX = width - left - 190;
      box(theme.wash, panelX, footer + 12, width - left - panelX - 10, 185, 18);
      box("#fff", panelX + 1, footer + 13, width - left - panelX - 12, 183, 17);
      box(theme.border, qrX - 13, footer + 30, 1, 142);
      const [title, line1, line2, note] = pageQR ? [
        "公開中のアルバムを見る",
        "公開設定で選ばれたカードやコーデの",
        "所持状況を確認できます。",
        "アカウント登録・ログインは不要です。",
      ] : [
        "カードアルバムをはじめる",
        "集めたカードやコーデを記録して、",
        "自分だけのアルバムを作れます。",
        "新規登録のご案内はQRコードから。",
      ];
      label("QRコードでアクセス", textX, footer + 53, "bold 17px", theme.muted, 395);
      label(title, textX, footer + 87, "bold 26px", theme.accent, 395);
      label(line1, textX, footer + 121, "18px", theme.dark, 395);
      label(line2, textX, footer + 145, "18px", theme.dark, 395);
      label(note, textX, footer + 168, "18px", theme.muted, 395);
      drawQR(ctx, qr || signupQR, qrX, footer + 14);
      ctx.textAlign = "center";
      label(`発行日　${issueDate}`, qrX + 82, footer + 191, "13px", theme.muted, 164);
      ctx.textAlign = "right";
      if (pages > 1) label(`${page + 1} / ${pages}`, 904, footer + 175, "18px", theme.muted, 150);
      const encode = (type, quality) => new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(Error("画像を保存できませんでした。")), type, quality);
      });
      const png = items.length >= 80 ? null : await encode("image/png");
      const blob = png && png.size <= 4718592 ? png : await encode("image/jpeg", 0.88);
      return { blob, height: canvas.height, missing: items.filter((item) => !images.has(item.image)).length,
        retryable: items.some((item) => item.image && !images.has(item.image)) };
    } finally {
      canvas.width = canvas.height = 1;
    }
  }

  function keepSettingsPosition(change) {
    const settings = dialog.querySelector("[data-image-settings]");
    const before = settings.getBoundingClientRect();
    const viewport = dialog.getBoundingClientRect();
    const visible = settings.open && before.bottom > viewport.top && before.top < viewport.bottom;
    change();
    if (visible) {
      dialog.scrollTop += settings.getBoundingClientRect().top - before.top;
    }
  }

  function clearPreview({ keep = false } = {}) {
    const preview = dialog.querySelector("[data-preview]");
    const share = dialog.querySelector("[data-share]");
    const save = dialog.querySelector("[data-save]");
    if (!keep) {
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = null;
      preview.removeAttribute("src");
      preview.hidden = true;
      share.hidden = true;
      save.hidden = true;
    }
    save.disabled = true;
    save.onclick = null;
    preview.classList.toggle("is-updating", keep && !preview.hidden);
    if (batchURL) URL.revokeObjectURL(batchURL);
    batchURL = null;
    share.textContent = "画像を共有";
    share.disabled = true;
    share.onclick = null;
  }

  function arrangePages(rows, { display, completeEditions, editionLabels, selectedEdition, editionLabel }) {
    if (!display.byEdition && !display.byCharacter && !display.byRarity && !display.markComplete) {
      return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
        [{ label: "", rows: rows.slice(index * size, (index + 1) * size) }]);
    }
    const byEdition = display.byEdition || display.markComplete;
    const groups = new Map();
    for (const row of rows) {
      const edition = selectedEdition || row.editions?.[0];
      const name = editionLabels.get(edition) || edition || `${editionLabel}不明`;
      const editionTitle = completeEditions.has(edition) ? `${name}（コンプ）` : name;
      const label = [
        byEdition ? editionTitle : "",
        display.byCharacter ? row.character || "キャラ名未登録" : "",
        display.byRarity ? row.rarity || "レアリティ未登録" : "",
      ].filter(Boolean).join(" ／ ").replace(/[【】]/g, "");
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    }
    const pages = [];
    let sections = [], used = 0;
    const cellHeight = 218 + 26 * (Number(Boolean(display.serial)) + Number(Boolean(display.showNames)));
    // A heading consumes vertical space, so grouped pages may contain fewer than 100 entries.
    const pageHeight = cellHeight * (size / columns);
    for (const [label, group] of groups) {
      for (let offset = 0; offset < group.length;) {
        let availableRows = Math.floor((pageHeight - used - 38) / cellHeight);
        if (availableRows < 1) {
          pages.push(sections);
          sections = [];
          used = 0;
          availableRows = Math.floor((pageHeight - 38) / cellHeight);
        }
        const chunk = group.slice(offset, offset + availableRows * columns);
        sections.push({ label, rows: chunk });
        used += 38 + Math.ceil(chunk.length / columns) * cellHeight;
        offset += chunk.length;
      }
    }
    if (sections.length) pages.push(sections);
    return pages;
  }

  const settingsTable = "card_album_ownership_image_settings";
  const settingWrites = new Map();
  let settingsState;

  function settingsAccount() {
    return window.CARD_SHARE_HOST?.session()?.user?.id;
  }

  function readDisplaySettings() {
    return Object.fromEntries([...dialog.querySelectorAll("[data-image-display]")]
      .map((input) => [input.dataset.imageDisplay, input.checked]));
  }

  function applyDisplaySettings(options, disabled = false) {
    const allColor = options.allColor === true;
    const ownedOnly = options.ownedOnly === true;
    const conflicts = { reverse: allColor, hideQuantity: allColor, unownedOnly: ownedOnly };
    for (const input of dialog.querySelectorAll("[data-image-display]")) {
      const key = input.dataset.imageDisplay;
      input.checked = options[key] === true && !conflicts[key];
      input.disabled = disabled || (key === "hideQuantity" && allColor);
    }
  }

  async function restoreDisplaySettings(state) {
    let options = {};
    let failed = false;
    try {
      await settingWrites.get(state.user);
      if (settingsState !== state || !dialog.open || state.user !== settingsAccount()) return;
      const { data, error } = await window.CARD_SHARE_HOST.client().from(settingsTable)
        .select("options").eq("user_id", state.user).maybeSingle();
      if (error) throw error;
      options = data?.options ?? {};
      state.writable = true;
    } catch {
      failed = true;
    }
    if (settingsState !== state || !dialog.open || !authorized?.() || state.user !== settingsAccount()) return;
    state.loading = false;
    applyDisplaySettings(options);
    update({ delay: 0 });
    if (failed) notify("保存済みの詳細設定を読み込めませんでした");
  }

  function saveDisplaySettings() {
    const state = settingsState;
    if (!state?.user || state.user !== settingsAccount()) return;
    if (!state.writable) {
      notify("この変更はアカウントに保存されませんでした");
      return;
    }
    const options = readDisplaySettings();
    const write = Promise.resolve(settingWrites.get(state.user)).then(async () => {
      if (state.user !== settingsAccount()) return;
      const { error } = await window.CARD_SHARE_HOST.client().from(settingsTable)
        .upsert({ user_id: state.user, options }, { onConflict: "user_id" });
      if (error) throw error;
    }).catch(() => {
      if (state.user === settingsAccount() && dialog.open && authorized?.()) {
        notify("詳細設定を保存できませんでした");
      }
    }).finally(() => {
      if (settingWrites.get(state.user) === write) settingWrites.delete(state.user);
    });
    settingWrites.set(state.user, write);
  }

  function selection() {
    const local = Object.fromEntries([...dialog.querySelectorAll("[data-image-filter]")]
      .map((input) => [input.dataset.imageFilter, input.value]));
    const display = readDisplaySettings();
    display.fadeUnownedCards = snapshot.unit !== "コーデ" && display.fadeUnownedCards;
    if (display.allColor) display.hideQuantity = false;
    const allEditions = local.series === "" || local.series === "all";
    if (allEditions) local.series = "";
    const { filtered: shown, rateBase, conditions, edition: rawEdition } = snapshot.select?.(local) || snapshot;
    const acquired = rateBase.filter((row) => row.collected).length;
    const percent = rateBase.length ? (100 * acquired / rateBase.length).toFixed(1) : "0.0";
    const caption = `${percent}%　${acquired} / ${rateBase.length} ${snapshot.unit}`;
    const edition = allEditions
      ? ({ "章": "全章", "収録区分": "全収録区分" })[snapshot.editionLabel] || "全弾"
      : rawEdition?.replace(/[【】]/g, "").trim();
    const chosen = display.ownedOnly ? shown.filter((row) => row.collected)
      : display.unownedOnly ? shown.filter((row) => !row.collected) : shown;
    const completeEditions = new Set();
    if (display.markComplete) {
      const defaults = Object.fromEntries(snapshot.controls.map(({ key, options }) => [key, options?.[0]?.value || ""]));
      const missing = new Set();
      for (const row of snapshot.select({ ...defaults, series: "" }).rateBase) {
        for (const raw of row.editions || []) {
          if (row.collected) completeEditions.add(raw);
          else missing.add(raw);
        }
      }
      for (const raw of missing) completeEditions.delete(raw);
    }
    const editionOptions = snapshot.controls.find(({ key }) => key === "series")?.options || [];
    const editionLabels = new Map(editionOptions.map(({ value, text }) => [value, text]));
    const pageSections = edition ? arrangePages(chosen, {
      display, completeEditions, editionLabels, selectedEdition: local.series, editionLabel: snapshot.editionLabel,
    }) : [];
    const imageConditions = display.ownedOnly ? [...conditions, "所持済みのみ"]
      : display.unownedOnly ? [...conditions, "未所持のみ"] : conditions;
    return { pageSections, caption, conditions: imageConditions, edition, display, pages: pageSections.length };
  }

  function renderPagination(row, page, total) {
    row.hidden = total < 2;
    row.dataset.selectedPage = page;
    row.dataset.totalPages = total;
    if (row.hidden) return;
    const compact = dialog.clientWidth < 440;
    const limit = compact ? 3 : 5;
    const current = page + 1;
    const start = Math.max(2, Math.min(current - Math.floor((limit - 2) / 2), total - limit + 2));
    const numbers = total <= limit
      ? Array.from({ length: total }, (_, index) => index + 1)
      : [1, ...Array.from({ length: limit - 2 }, (_, index) => start + index), total];
    const previous = row.querySelector("[data-page-prev]");
    const next = row.querySelector("[data-page-next]");
    previous.textContent = compact ? "前へ" : "前のページ";
    next.textContent = compact ? "次へ" : "次のページ";
    previous.disabled = page === 0;
    next.disabled = current === total;
    previous.dataset.imagePage = page - 1;
    next.dataset.imagePage = page + 1;
    const links = row.querySelector("[data-page-numbers]");
    const focused = document.activeElement;
    const numberFocused = links.contains(focused);
    links.innerHTML = numbers.map((number, index) => {
      const gap = index && number - numbers[index - 1] > 1
        ? '<span class="page-gap" aria-hidden="true">…</span>' : "";
      return `${gap}<button type="button" data-image-page="${number - 1}" aria-label="${number}枚目"${number === current ? ' aria-current="page"' : ""}>${number}</button>`;
    }).join("");
    if (numberFocused ||
      (focused === previous && previous.disabled) ||
      (focused === next && next.disabled)) {
      links.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
    }
  }

  const generatedPages = new Map();
  let batchActive = false;

  function resetGeneratedPages() {
    generatedPages.clear();
    batchActive = false;
  }

  function displayPreview(result) {
    const preview = dialog.querySelector("[data-preview]");
    if (!result) {
      preview.classList.add("is-updating");
      return;
    }
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = URL.createObjectURL(result.blob);
    preview.style.aspectRatio = `${width} / ${result.height}`;
    preview.src = previewURL;
    preview.hidden = false;
    preview.classList.remove("is-updating");
  }

  function displaySelectedPreview(index, result) {
    const row = dialog.querySelector("[data-page-row]");
    if (index === Number(row.dataset.selectedPage)) {
      keepSettingsPosition(() => displayPreview(result));
    }
  }

  function update({ resetPage = true, delay = 0, targetPage } = {}) {
    if (settingsState?.loading) return;
    clearTimeout(previewTimer);
    request++;
    const selected = selection();
    const { caption, edition, pages, display } = selected;
    if (targetPage === undefined) resetGeneratedPages();
    batchActive = pages > 1 && !display.currentOnly;
    const pageRow = dialog.querySelector("[data-page-row]");
    const requested = targetPage ?? (resetPage ? 0 : Number(pageRow.dataset.selectedPage ?? 0));
    const page = Math.max(0, Math.min(requested, pages - 1));
    keepSettingsPosition(() => {
      clearPreview({ keep: Boolean(pages) });
      dialog.querySelector(".ownership-image-metrics").hidden = display.hideRate;
      dialog.querySelector("[data-summary]").textContent = caption;
      renderPagination(pageRow, page, pages);
      const notice = dialog.querySelector("[data-multipage]");
      notice.hidden = pages < 2;
      notice.textContent = pages < 2 ? "" : display.currentOnly
        ? `共有用画像は全${pages}枚です。表示中の1枚を共有します。`
        : `共有用画像は全${pages}枚です。まとめて共有・保存できます。`;
      dialog.querySelector("[data-retry]").hidden = true;
      showProgress(pages > 0 && !generatedPages.has(page), { pages, image: display.currentOnly ? page + 1 : 1 });
      dialog.querySelector("[data-status]").textContent = !edition
        ? `プレビューを表示するには、${snapshot.editionLabel}を選んでください。`
        : pages ? "" : "該当する項目がありません。";
    });
    if (generatedPages.has(page)) void generate(selected, page);
    else if (pages) previewTimer = setTimeout(() => generate(selected, page), delay);
  }

  let toastTimer;
  function clearToast() {
    clearTimeout(toastTimer);
    const toast = dialog.querySelector("[data-image-toast]");
    if (toast.hasAttribute("popover")) toast.hidePopover();
    toast.textContent = "";
  }

  function positionToast() {
    const toast = dialog.querySelector("[data-image-toast]");
    if (!toast.textContent) return;
    const bounds = dialog.getBoundingClientRect();
    toast.style.setProperty("--toast-top", `${bounds.top + 12}px`);
    toast.style.setProperty("--toast-center", `${bounds.left + bounds.width / 2}px`);
    toast.style.setProperty("--toast-width", `${Math.max(0, bounds.width - 24)}px`);
  }

  function notify(message) {
    clearToast();
    const toast = dialog.querySelector("[data-image-toast]");
    toast.textContent = message;
    positionToast();
    if (typeof toast.showPopover === "function") {
      toast.setAttribute("popover", "manual");
      try { toast.showPopover(); }
      catch { toast.removeAttribute("popover"); }
    }
    toastTimer = setTimeout(clearToast, 2400);
  }

  function imageFilename(blob, page) {
    const extension = blob.type === "image/jpeg" ? "jpg" : "png";
    return `カードアルバム所持率_${page + 1}.${extension}`;
  }

  async function zipImages(files, current) {
    // JPEG and PNG are already compressed. Store their bytes directly in the ZIP.
    const entries = [], directory = [];
    const encoder = new TextEncoder();
    const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
      return value;
    });
    let offset = 0, directorySize = 0;
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!current()) return null;
      let crc = 0xffffffff;
      for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
      const name = encoder.encode(file.name);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(12, 33, true);
      local.setUint32(14, crc ^ 0xffffffff, true);
      local.setUint32(18, file.size, true);
      local.setUint32(22, file.size, true);
      local.setUint16(26, name.length, true);
      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      new Uint8Array(central.buffer, 6, 26).set(new Uint8Array(local.buffer, 4, 26));
      central.setUint32(42, offset, true);
      entries.push(local.buffer, name, file);
      directory.push(central.buffer, name);
      offset += local.byteLength + name.length + file.size;
      directorySize += central.byteLength + name.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, directorySize, true);
    end.setUint32(16, offset, true);
    return new Blob([...entries, ...directory, end.buffer], { type: "application/zip" });
  }

  function downloadImage(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    dialog.append(link);
    link.click();
    link.remove();
    notify("保存できました");
  }

  async function prepareBatch({ page, pages, result, imageForPage, text, current, share, save, status }) {
    if (!current()) return;
    share.disabled = true;
    share.onclick = null;
    let ready = false;
    const zipName = "カードアルバム所持率.zip";
    const prepareZip = async (files) => {
      if (batchURL) return batchURL;
      const zip = await zipImages(files, current);
      if (!current() || !zip) return null;
      return batchURL ??= URL.createObjectURL(zip);
    };
    const offerZipOnShareButton = async (files) => {
      const url = await prepareZip(files);
      if (!current() || !url) return;
      share.textContent = `全${pages}枚をZIP保存`;
      share.onclick = () => {
        if (current()) downloadImage(url, zipName);
      };
    };
    const recover = () => {
      if (!current()) return;
      share.onclick = null;
      batchActive = false;
      dialog.querySelector("[data-retry]").hidden = false;
      status.textContent = "すべての画像を作成できませんでした。もう一度お試しください。";
    };
    try {
      const files = [];
      let completed = 1;
      let missing = result.missing;
      let retryable = result.retryable;
      for (let index = 0; index < pages; index++) {
        const output = index === page ? result : await imageForPage(index, (loaded, total) => {
          const fraction = total ? loaded / total : Number(loaded === undefined);
          showProgress(true, {
            value: completed + imageLoadShare * fraction, max: pages, image: completed + 1, pages,
          });
        });
        if (!current() || !output) return;
        const image = output.blob;
        files.push(new File([image], imageFilename(image, index), { type: image.type }));
        if (index !== page) {
          completed++;
          missing += output.missing;
          retryable ||= output.retryable;
        }
      }
      status.textContent = missing ? "読み込めなかった画像は名称で表示しています。" : "";
      dialog.querySelector("[data-retry]").hidden = !retryable;
      const data = { files, title: "カードアルバム所持率", text };
      save.title = `全${pages}枚をZIPで保存`;
      save.onclick = async () => {
        if (!current() || save.disabled) return;
        save.disabled = true;
        try {
          const url = await prepareZip(files);
          if (current() && url) downloadImage(url, zipName);
        } catch {
          if (current()) status.textContent = "ZIPを保存できませんでした。もう一度お試しください。";
        } finally {
          if (current()) save.disabled = false;
        }
      };
      save.disabled = false;
      if (!navigator.share || !navigator.canShare?.(data)) {
        if (desktopSave()) {
          status.textContent = [status.textContent, "この端末では画像の共有メニューを利用できません。"].filter(Boolean).join(" ");
        } else {
          showProgress(true, { value: pages - (1 - imageLoadShare), max: pages, image: pages, pages });
          await offerZipOnShareButton(files);
        }
        ready = Boolean(share.onclick || (desktopSave() && save.onclick));
        return;
      }
      share.textContent = "画像を共有";
      share.onclick = async () => {
        if (!current()) return;
        share.disabled = true;
        try {
          await navigator.share(data);
          if (current()) notify("正常に完了しました");
        } catch (error) {
          if (current() && error.name !== "AbortError") {
            if (desktopSave()) status.textContent = "共有メニューを開けませんでした。";
            else {
              try { await offerZipOnShareButton(files); } catch { recover(); }
            }
          }
        } finally {
          if (current()) share.disabled = !share.onclick;
        }
      };
      ready = true;
    } catch {
      recover();
    } finally {
      if (current()) keepSettingsPosition(() => {
        if (ready) completeProgress(current, { image: pages, pages });
        else showProgress();
        share.disabled = !share.onclick;
      });
    }
  }

  async function generate({ pageSections, caption, conditions, edition, pages, display }, page) {
    if (!dialog.open || !authorized?.()) return;
    const run = ++request;
    const current = () => run === request && dialog.open && authorized?.();
    const status = dialog.querySelector("[data-status]");
    try {
      const hideSharedPage = dialog.querySelector("[data-hide-shared-page]").checked;
      let pageQR;
      if (!current()) return;
      const issueDate = issueDateFormat.format(new Date());
      const imageForPage = async (index, progress) => {
        const cached = generatedPages.get(index);
        if (cached) return cached;
        if (!hideSharedPage) pageQR ??= sharedPage.then(sharedQR);
        const output = await create(pageSections[index], {
          heading: snapshot.title, caption, conditions, edition, theme: themes[snapshot.theme] || themes.rose,
          issueDate, page: index, pages, pageQR, display,
        }, current, progress);
        if (current() && output) {
          generatedPages.set(index, output);
          if (batchActive) displaySelectedPreview(index, output);
        }
        return output;
      };
      const batch = pages > 1 && !display.currentOnly;
      const result = await imageForPage(page, (loaded, total) => {
        const fraction = total ? loaded / total : Number(loaded === undefined);
        showProgress(true, {
          value: imageLoadShare * fraction, max: batch ? pages : 1,
          image: batch ? 1 : page + 1, pages,
        });
      });
      if (!current() || !result) return;
      const { blob, missing } = result;
      const filename = imageFilename(blob, page);
      const share = dialog.querySelector("[data-share]");
      const save = dialog.querySelector("[data-save]");
      save.hidden = false;
      if (!batchActive) displaySelectedPreview(page, result);
      share.hidden = false;
      const file = typeof File === "function" ? new File([blob], filename, { type: blob.type }) : null;
      const [rate, count] = caption.split("　");
      const hashtag = snapshot.title.replace(/[^\p{L}\p{N}_]/gu, "");
      const text = [
        `${snapshot.title}\n${edition}${conditions.length ? "（絞り込みあり）" : ""}`,
        ...(display.hideRate ? [] : [`取得率 ${rate}（${count}）`]),
        `#${hashtag}`,
      ].join("\n\n");
      const shareData = file ? { files: [file], title: "カードアルバム所持率", text } : null;
      const canShare = !batch && Boolean(shareData && navigator.share && navigator.canShare?.(shareData));
      share.textContent = "画像を共有";
      share.disabled = !batch && !canShare;
      if (canShare) {
        share.onclick = async () => {
          if (!current()) return;
          try {
            await navigator.share(shareData);
            if (current()) notify("正常に完了しました");
          } catch (error) {
            if (current() && error.name !== "AbortError") status.textContent = "共有メニューを開けませんでした。";
          }
        };
      }
      if (!batch) {
        save.title = "表示中の画像を保存";
        save.disabled = false;
        save.onclick = () => {
          if (current()) downloadImage(previewURL, filename);
        };
      }
      if (!desktopSave() && !canShare && display.currentOnly && pages > 1) {
        share.textContent = "表示中の画像を保存";
        share.disabled = false;
        share.onclick = () => {
          if (!current()) return;
          downloadImage(previewURL, filename);
        };
      }
      dialog.querySelector("[data-retry]").hidden = !result.retryable;
      if (batch) {
        keepSettingsPosition(() => {
          status.textContent = missing ? "一部の画像は名称で表示しています。" : "";
        });
        await prepareBatch({ page, pages, result, imageForPage, text, current, share, save, status });
        return;
      }
      keepSettingsPosition(() => {
        completeProgress(current, { image: page + 1, pages });
        status.textContent = [
          missing ? "読み込めなかった画像は名称で表示しています。" : "",
          canShare || (!desktopSave() && display.currentOnly && pages > 1) ? "" : "この端末では画像の共有メニューを利用できません。",
        ].filter(Boolean).join(" ");
      });
    } catch (error) {
      if (current()) {
        keepSettingsPosition(() => {
          batchActive = false;
          clearPreview();
          showProgress();
          status.textContent = error.message || "共有用画像を作成できませんでした。";
          dialog.querySelector("[data-retry]").hidden = false;
        });
      }
    }
  }

  function mountFilters(controls) {
    const panel = dialog.querySelector("[data-filter-panel]");
    const grid = panel.querySelector(".filter-grid");
    const search = panel.querySelector("[data-filter-search]");
    search.replaceChildren();
    grid.replaceChildren();
    panel.hidden = !controls.length;
    panel.open = false;
    for (const control of controls) {
      const field = document.createElement("div");
      field.className = "ownership-image-filter-field";
      const heading = document.createElement("div");
      heading.className = "ownership-image-filter-heading";
      const title = document.createElement("label");
      const inputId = `ownership-image-filter-${control.key}`;
      title.htmlFor = inputId;
      title.textContent = control.key === "query" ? "フリーワード検索" : control.label;
      const input = document.createElement(control.options ? "select" : "input");
      const requiredEdition = control.key === "series";
      if (control.options) {
        const options = requiredEdition
          ? [{ text: "すべて", value: "" }, ...control.options.filter(({ value }) => value && value !== "all")]
          : control.options;
        input.replaceChildren(...options.map(({ text, value, disabled }) =>
          Object.assign(new Option(text, value), { disabled: Boolean(disabled) })));
      } else {
        input.type = "search";
        input.placeholder = control.placeholder || "";
      }
      input.id = inputId;
      input.dataset.imageFilter = control.key;
      input.dataset.imageDefault = control.options?.[0]?.value || "";
      input.value = requiredEdition ? (control.value === "all" ? "" : control.value || "") : control.value;
      input.disabled = Boolean(control.disabled);
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "filter-clear";
      clear.textContent = "解除";
      clear.setAttribute("aria-label", `${control.label}の絞り込みを解除`);
      const defaultValue = input.dataset.imageDefault;
      clear.disabled = input.disabled || input.value === defaultValue;
      clear.onclick = () => {
        input.value = defaultValue;
        input.dispatchEvent(new Event(control.options ? "change" : "input", { bubbles: true }));
      };
      input.addEventListener(control.options ? "change" : "input", () => {
        clear.disabled = input.value === defaultValue;
        update({ delay: control.options ? 0 : 180 });
      });
      heading.append(title);
      if (!requiredEdition) heading.append(clear);
      field.append(heading, input);
      (control.options ? grid : search).append(field);
    }
  }

  function open(data, isAuthorized, publicPage) {
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "trade-export-dialog ownership-image-dialog";
      dialog.autofocus = true;
      dialog.setAttribute("aria-labelledby", "ownership-image-title");
      dialog.innerHTML = `<div class="trade-export-dialog-heading"><h2 id="ownership-image-title">共有用画像を作成</h2><button type="button" data-close aria-label="閉じる"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
        <details class="filter-panel" data-filter-panel><summary>絞り込み</summary><div class="filter-content">
          <div data-filter-search></div><div class="filter-grid"></div>
        </div></details>
        <div class="ownership-image-details">
          <dl class="ownership-image-metrics">
            <div><dt>所持率</dt><dd data-summary></dd></div>
          </dl>
          <p class="ownership-image-multipage" data-multipage hidden></p>
          <div class="ownership-image-generation-progress" data-generation-progress hidden>
            <div class="ownership-image-progress-heading">
              <span>画像作成中…</span>
              <span data-generation-count hidden></span>
            </div>
            <progress aria-label="画像作成の進捗"></progress>
          </div>
          <div data-status role="status"></div>
        </div>
        <img data-preview hidden alt="所持率つきのカード・コーデ一覧" style="width:100%;height:auto;border-radius:0">
        <div class="pagination ownership-image-pagination" data-page-row role="group" aria-label="共有用画像のページ" hidden>
          <button type="button" data-page-prev aria-label="前の画像">前のページ</button>
          <div data-page-numbers></div>
          <button type="button" data-page-next aria-label="次の画像">次のページ</button>
        </div>
        <div class="ownership-image-toast" data-image-toast role="status"></div>
        <div class="ownership-image-footer">
          <button type="button" data-retry hidden>プレビューを再読み込み</button>
          <div class="ownership-image-actions">
            <label class="ownership-image-option" hidden><input type="checkbox" data-hide-shared-page>共有ページURLを表示しない</label>
            <button type="button" data-save hidden>保存</button>
            <button type="button" data-share hidden>画像を共有</button>
          </div>
        </div>
        <details class="ownership-image-settings filter-panel" data-image-settings>
          <summary>詳細設定</summary>
          <div class="ownership-image-settings-options">
            <fieldset class="ownership-image-settings-group">
              <legend>掲載対象</legend>
              <label><span>所持済みだけ載せる</span><input type="checkbox" role="switch" data-image-display="ownedOnly"></label>
              <label><span>未所持だけ載せる</span><input type="checkbox" role="switch" data-image-display="unownedOnly"></label>
            </fieldset>
            <fieldset class="ownership-image-settings-group">
              <legend>色</legend>
              <label><span>持っていないカード・コーデを色つきにする<small>持っているものは白黒で表示</small></span><input type="checkbox" role="switch" data-image-display="reverse"></label>
              <label><span>すべて色つきにする<small>所持数も表示</small></span><input type="checkbox" role="switch" data-image-display="allColor"></label>
              <label data-image-card-setting hidden><span>未所持のカードを薄く表示</span><input type="checkbox" role="switch" data-image-display="fadeUnownedCards"></label>
            </fieldset>
            <fieldset class="ownership-image-settings-group">
              <legend>区切り</legend>
              <label><span>弾・章ごとに区切る</span><input type="checkbox" role="switch" data-image-display="byEdition"></label>
              <label><span>キャラごとに区切る</span><input type="checkbox" role="switch" data-image-display="byCharacter"></label>
              <label><span>レアリティごとに区切る</span><input type="checkbox" role="switch" data-image-display="byRarity"></label>
            </fieldset>
            <fieldset class="ownership-image-settings-group">
              <legend>表示する情報</legend>
              <label><span>カード・コーデ名を表示する</span><input type="checkbox" role="switch" data-image-display="showNames"></label>
              <label><span>レアリティを表示する</span><input type="checkbox" role="switch" data-image-display="showRarity"></label>
              <label><span>シリアルを表示<small>カード・コーデ番号</small></span><input type="checkbox" role="switch" data-image-display="serial"></label>
              <label><span>所持数を非表示にする</span><input type="checkbox" role="switch" data-image-display="hideQuantity"></label>
              <label data-image-part-setting hidden><span>所持パーツのタグを非表示にする</span><input type="checkbox" role="switch" data-image-display="hidePartTags"></label>
              <label><span>所持率を非表示にする<small>共有文からも非表示</small></span><input type="checkbox" role="switch" data-image-display="hideRate"></label>
              <label><span>コンプした弾にマークを付ける<small>弾・章全体を揃えている場合に表示</small></span><input type="checkbox" role="switch" data-image-display="markComplete"></label>
            </fieldset>
            <fieldset class="ownership-image-settings-group">
              <legend>共有範囲</legend>
              <label><span>表示中の1枚だけ共有する</span><input type="checkbox" role="switch" data-image-display="currentOnly"></label>
            </fieldset>
          </div>
        </details>`;
      document.body.append(dialog);
      window.addEventListener("resize", positionToast);
      dialog.querySelector("[data-close]").onclick = close;
      const pages = dialog.querySelector("[data-page-row]");
      pages.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-image-page]");
        if (!button || button.disabled) return;
        const targetPage = Number(button.dataset.imagePage);
        if (targetPage === Number(pages.dataset.selectedPage)) return;
        if (batchActive) {
          keepSettingsPosition(() => {
            renderPagination(pages, targetPage, Number(pages.dataset.totalPages));
            displayPreview(generatedPages.get(targetPage));
          });
        } else {
          update({ targetPage });
        }
      });
      window.addEventListener("resize", () => {
        if (dialog.open && !pages.hidden) {
          renderPagination(pages, Number(pages.dataset.selectedPage), Number(pages.dataset.totalPages));
        }
      });
      dialog.querySelector("[data-hide-shared-page]").onchange = () => update({ resetPage: false, delay: 0 });
      dialog.querySelector("[data-retry]").onclick = () => update({ resetPage: false, delay: 0 });
      const settings = dialog.querySelector("[data-image-settings]");
      const reverse = settings.querySelector('[data-image-display="reverse"]');
      const allColor = settings.querySelector('[data-image-display="allColor"]');
      const hideQuantity = settings.querySelector('[data-image-display="hideQuantity"]');
      const ownedOnly = settings.querySelector('[data-image-display="ownedOnly"]');
      const unownedOnly = settings.querySelector('[data-image-display="unownedOnly"]');
      settings.addEventListener("change", (event) => {
        if (event.target === ownedOnly && ownedOnly.checked) unownedOnly.checked = false;
        if (event.target === unownedOnly && unownedOnly.checked) ownedOnly.checked = false;
        if (event.target === allColor && allColor.checked) reverse.checked = false;
        if (event.target === reverse && reverse.checked) allColor.checked = false;
        hideQuantity.disabled = allColor.checked;
        if (allColor.checked) hideQuantity.checked = false;
        saveDisplaySettings();
        update({ resetPage: false });
      });
      dialog.addEventListener("close", (event) => {
        if (event.target !== dialog || dialog.open) return;
        clearTimeout(previewTimer);
        clearToast();
        request++;
        resetGeneratedPages();
        clearPreview();
        snapshot = authorized = sharedPage = settingsState = null;
      });
    }
    snapshot = data;
    const settings = dialog.querySelector("[data-image-settings]");
    settings.open = false;
    const user = settingsAccount();
    settingsState = { user, loading: Boolean(user), writable: false };
    applyDisplaySettings({}, settingsState.loading);
    const isCoordinate = data.unit === "コーデ";
    settings.querySelector("[data-image-part-setting]").hidden = !isCoordinate;
    settings.querySelector("[data-image-card-setting]").hidden = isCoordinate;
    const { accent, dark, light, border, muted, wash } = themes[data.theme] || themes.rose;
    dialog.style.setProperty("--accent", accent);
    dialog.style.setProperty("--line", border);
    dialog.style.setProperty("--muted", muted);
    dialog.style.setProperty("--soft", wash);
    dialog.style.setProperty("--ownership-image-surface", light);
    dialog.style.setProperty("--ownership-image-ink", dark);
    authorized = isAuthorized;
    const hideSharedPage = dialog.querySelector("[data-hide-shared-page]");
    const shareOption = hideSharedPage.closest("label");
    hideSharedPage.checked = false;
    shareOption.hidden = true;
    dialog.querySelector("[data-page-row]").hidden = true;
    dialog.querySelector("[data-multipage]").hidden = true;
    dialog.querySelector("[data-retry]").hidden = true;
    dialog.querySelector(".ownership-image-metrics").hidden = true;
    dialog.querySelector("[data-status]").textContent = "";
    showProgress(true);
    void loadExporter().catch(() => {});
    const pageLookup = Promise.resolve().then(() => publicPage?.()).catch(() => null);
    sharedPage = pageLookup;
    pageLookup.then((url) => {
      if (sharedPage === pageLookup && dialog.open && authorized?.()) {
        shareOption.hidden = !url;
      }
    });
    mountFilters(data.controls || []);
    clearTimeout(previewTimer);
    request++;
    resetGeneratedPages();
    clearPreview();
    if (!dialog.open) dialog.showModal();
    if (settingsState.loading) void restoreDisplaySettings(settingsState);
    else update({ delay: 0 });
  }

  function close() { if (dialog?.open) dialog.close(); }
  window.CARD_OWNERSHIP_IMAGE = Object.freeze({ open, close });
})();
