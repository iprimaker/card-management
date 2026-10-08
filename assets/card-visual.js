/* 固定の表面画像特徴を端末内で比較。カメラ写真は送信しません。 */
window.CardVisual = (() => {
  "use strict";
  const WIDTH = 24,
    HEIGHT = 36;
  let indexPromise;
  function descriptor(bytes) {
    const gray = new Float32Array(WIDTH * HEIGHT);
    let light = 0;
    for (let i = 0; i < gray.length; i++) {
      gray[i] =
        (bytes[i * 3] * 0.299 +
          bytes[i * 3 + 1] * 0.587 +
          bytes[i * 3 + 2] * 0.114) /
        255;
      light += gray[i];
    }
    light /= gray.length;
    const color = new Float32Array(bytes.length);
    for (let i = 0; i < color.length; i++)
      color[i] = Math.min(1.5, bytes[i] / 255 / Math.max(0.15, light)) / 1.5;
    const edge = new Float32Array((WIDTH - 1) * (HEIGHT - 1) * 2);
    let n = 0,
      energy = 0,
      contrast = 0;
    for (let y = 0; y < HEIGHT - 1; y++)
      for (let x = 0; x < WIDTH - 1; x++) {
        const i = y * WIDTH + x;
        const a = gray[i + 1] - gray[i],
          b = gray[i + WIDTH] - gray[i];
        edge[n++] = a;
        edge[n++] = b;
        energy += a * a + b * b;
      }
    for (const value of gray) contrast += (value - light) ** 2;
    const norm = Math.sqrt(energy) || 1;
    for (let i = 0; i < edge.length; i++) edge[i] /= norm;
    return { color, edge, contrast: Math.sqrt(contrast / gray.length), light };
  }
  function feature(canvas) {
    const small = document.createElement("canvas");
    small.width = WIDTH;
    small.height = HEIGHT;
    const ctx = small.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, WIDTH, HEIGHT);
    const rgba = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
    const bytes = new Uint8Array(WIDTH * HEIGHT * 3);
    for (let i = 0; i < WIDTH * HEIGHT; i++)
      for (let c = 0; c < 3; c++) bytes[i * 3 + c] = rgba[i * 4 + c];
    return descriptor(bytes);
  }
  function distance(a, b) {
    let colors = 0,
      dot = 0;
    for (let i = 0; i < a.color.length; i++)
      colors += (a.color[i] - b.color[i]) ** 2;
    for (let i = 0; i < a.edge.length; i++) dot += a.edge[i] * b.edge[i];
    return (
      0.45 * Math.sqrt(colors / a.color.length) +
      (0.55 * (1 - Math.max(-1, Math.min(1, dot)))) / 2
    );
  }
  async function load() {
    if (!indexPromise)
      indexPromise = fetch(
        new URL(
          "card-visual-index.json?v=20261009-visual",
          document.querySelector('script[src*="card-visual.js"]').src,
        ),
      )
        .then((r) => {
          if (!r.ok) throw Error("画像照合データを取得できませんでした。");
          return r.json();
        })
        .then((data) =>
          data.cards.map((item) => {
            const raw = atob(item.rgb),
              bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
            return {
              id: item.id,
              front: item.front,
              descriptor: descriptor(bytes),
            };
          }),
        )
        .catch((error) => {
          indexPromise = null;
          throw error;
        });
    return indexPromise;
  }
  async function compare(canvas, cards) {
    const refs = await load(),
      query = feature(canvas),
      allowed = new Map(cards.map((c) => [c.id, c]));
    if (query.contrast < 0.035 || query.light < 0.04)
      return { cards: [], byCode: false, visual: true, distance: 1 };
    const queries = [query];
    for (const angle of [90, 180, 270]) {
      const rotated = document.createElement("canvas");
      rotated.width = angle === 180 ? canvas.width : canvas.height;
      rotated.height = angle === 180 ? canvas.height : canvas.width;
      const ctx = rotated.getContext("2d");
      ctx.translate(rotated.width / 2, rotated.height / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
      queries.push(feature(rotated));
    }
    const ranked = [];
    for (const ref of refs) {
      const card = allowed.get(ref.id);
      if (card && card.front === ref.front)
        ranked.push({
          card,
          distance: Math.min(
            ...queries.map((q) => distance(q, ref.descriptor)),
          ),
        });
    }
    ranked.sort((a, b) => a.distance - b.distance);
    const top = ranked[0],
      second = ranked[1];
    if (!top || top.distance > 0.28)
      return { cards: [], visual: true, byCode: false, distance: 1 };
    const candidates = ranked
      .filter((r) => r.distance <= Math.min(0.28, top.distance + 0.075))
      .slice(0, 6);
    // 同じシリアルの通常／パラレルは、見た目だけで勝手に選ばない。
    const variants = cards.filter(
      (c) => c.game === top.card.game && c.code === top.card.code,
    );
    for (const card of variants)
      if (!candidates.some((r) => r.card.id === card.id))
        candidates.push({ card, distance: top.distance });
    const unique =
      variants.length === 1 &&
      top.distance < 0.055 &&
      (!second || second.distance - top.distance > 0.035);
    return {
      cards: candidates.map((r) => r.card),
      byCode: false,
      visual: true,
      distance: top.distance,
      autoId: unique ? top.card.id : null,
    };
  }
  // 正面で写せない写真は、4隅を指定して射影変換で補正する。
  function rectify(canvas, points, width = 420, height = 600) {
    let orientation = 0,
      area = 0;
    for (let i = 0; i < 4; i++) {
      const a = points[i],
        b = points[(i + 1) % 4],
        c = points[(i + 2) % 4];
      const cross =
        (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(cross) < 0.001 || (orientation && cross * orientation < 0))
        throw Error("4隅を交差させず、カード全体を囲んでください。");
      orientation = cross;
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (Math.abs(area) < 0.04)
      throw Error("カード全体を囲むように4隅を調整してください。");
    const source = canvas
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, canvas.width, canvas.height);
    const targets = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      rows = [];
    points.forEach((p, i) => {
      const [u, v] = targets[i],
        x = p[0] * canvas.width,
        y = p[1] * canvas.height;
      rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
      rows.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
    });
    for (let i = 0; i < 8; i++) {
      let pivot = i;
      for (let j = i + 1; j < 8; j++)
        if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
      [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
      if (Math.abs(rows[i][i]) < 1e-8)
        throw Error("カードの4隅を囲むように調整してください。");
      const divisor = rows[i][i];
      for (let k = i; k < 9; k++) rows[i][k] /= divisor;
      for (let j = 0; j < 8; j++)
        if (j !== i) {
          const factor = rows[j][i];
          for (let k = i; k < 9; k++) rows[j][k] -= factor * rows[i][k];
        }
    }
    const h = rows.map((r) => r[8]),
      out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d"),
      image = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const u = x / (width - 1),
          v = y / (height - 1),
          den = h[6] * u + h[7] * v + 1;
        const sx = Math.max(
            0,
            Math.min(canvas.width - 1, (h[0] * u + h[1] * v + h[2]) / den),
          ),
          sy = Math.max(
            0,
            Math.min(canvas.height - 1, (h[3] * u + h[4] * v + h[5]) / den),
          );
        const ix = Math.floor(sx),
          iy = Math.floor(sy),
          fx = sx - ix,
          fy = sy - iy;
        for (let c = 0; c < 3; c++) {
          const at = (dx, dy) =>
            source.data[
              (Math.min(canvas.height - 1, iy + dy) * canvas.width +
                Math.min(canvas.width - 1, ix + dx)) *
                4 +
                c
            ];
          image.data[(y * width + x) * 4 + c] =
            (1 - fy) * ((1 - fx) * at(0, 0) + fx * at(1, 0)) +
            fy * ((1 - fx) * at(0, 1) + fx * at(1, 1));
        }
        image.data[(y * width + x) * 4 + 3] = 255;
      }
    ctx.putImageData(image, 0, 0);
    return out;
  }
  function videoCard(video) {
    const w = video.videoWidth,
      h = video.videoHeight;
    if (!w || !h) return null;
    const width = Math.min(w * 0.86, h * 0.86 * 0.7),
      height = width / 0.7,
      canvas = document.createElement("canvas");
    canvas.width = 420;
    canvas.height = 600;
    canvas
      .getContext("2d")
      .drawImage(
        video,
        (w - width) / 2,
        (h - height) / 2,
        width,
        height,
        0,
        0,
        420,
        600,
      );
    return canvas;
  }
  return { load, compare, feature, descriptor, distance, rectify, videoCard };
})();
