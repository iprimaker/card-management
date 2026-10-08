/* スマホの写真を端末内で文字読み取りし、確認したカードだけを所持登録します。 */
window.CardCamera = (() => {
  "use strict";
  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[‐‑‒–—−ー]/g, "-");
  function matchCards(text, cards) {
    const raw = normalize(text);
    const codes = [
      ...new Set(
        raw.match(/(?:APR\d+M?|AP\d+|OA\d+M?|OP|EP|E\d+|P)\s*-\s*\d{2,4}P?/g) ||
          [],
      ),
    ];
    const exact = cards.filter((card) =>
      codes
        .map((code) => code.replace(/\s/g, ""))
        .includes(normalize(card.code)),
    );
    if (exact.length) return { cards: exact, byCode: true };
    // 名前照合は確認用候補のみ。短い名前・コードだけの名前は使用しません。
    const compact = raw.replace(/[^A-Z0-9ぁ-んァ-ヶ一-龠々]/g, "");
    const names = cards.filter((card) => {
      const title = normalize(card.name).replace(
        /[^A-Z0-9ぁ-んァ-ヶ一-龠々]/g,
        "",
      );
      return (
        title.length >= 6 &&
        card.name !== card.code &&
        (compact.includes(title) ||
          (compact.length >= 4 && title.includes(compact)) ||
          (() => {
            const grams = [
              ...new Set(
                Array.from({ length: Math.max(0, title.length - 2) }, (_, i) =>
                  title.slice(i, i + 3),
                ),
              ),
            ];
            const matched = grams.filter((g) => compact.includes(g)).length;
            return matched >= 4 && matched / grams.length >= 0.55;
          })())
      );
    });
    return { cards: names, byCode: false };
  }
  function mobileAvailable(nav = navigator) {
    return (
      /Android|iPhone|iPad|iPod/i.test(nav.userAgent) ||
      (/Macintosh/i.test(nav.userAgent) && nav.maxTouchPoints > 1)
    );
  }
  function init(api) {
    const $ = (id) => document.getElementById(id);
    const modal = $("camera-dialog"),
      video = $("camera-video"),
      preview = $("camera-photo");
    let autoTimer = null,
      autoBusy = false,
      previousFrame = null,
      lastRegisteredFrame = null,
      stableFrames = 0;
    let corners = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      adjusting = false;
    let stream = null,
      revision = 0,
      busy = false,
      photo = null,
      matches = [];
    const message = (text) => {
      $("camera-status").textContent = text;
    };
    function stopStream() {
      clearInterval(autoTimer);
      autoTimer = null;
      previousFrame = null;
      stableFrames = 0;
      $("camera-guide").hidden = true;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
      video.hidden = true;
      $("camera-capture").hidden = true;
    }
    function resetPhoto() {
      photo = null;
      $("camera-photo-stage").hidden = true;
      $("camera-adjust").hidden = true;
      $("camera-crop-overlay").hidden = true;
      corners = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      adjusting = false;
      preview.removeAttribute("src");
      preview.hidden = true;
      $("camera-candidates").replaceChildren();
      $("camera-manual").value = "";
      drawCorners();
      $("camera-adjust").textContent = "カードの4隅を調整";
      matches = [];
    }
    function setBusy(value) {
      busy = value;
      $("camera-dialog").setAttribute("aria-busy", String(value));
      for (const id of [
        "camera-start",
        "camera-capture",
        "camera-read",
        "camera-manual",
        "camera-file",
        "camera-next",
        "camera-game",
        "camera-adjust",
      ])
        $(id).disabled = value;
      $("camera-read").disabled = value || (!photo && !stream);
      $("camera-dialog")
        .querySelectorAll("[data-camera-register]")
        .forEach((b) => {
          b.disabled = value || api.isOwned(b.dataset.cameraRegister);
        });
    }
    function clean() {
      revision++;
      stopStream();
      resetPhoto();
      $("camera-file").value = "";
      message("");
      $("camera-toast").hidden = true;
      $("camera-toast-image").removeAttribute("src");
    }
    function updateAccess() {
      const account = api.account();
      $("camera-add").hidden = !mobileAvailable() || !account;
      if ((!account || !mobileAvailable()) && modal.open) modal.close();
    }
    function renderCandidates(result) {
      matches = result.cards;
      $("camera-candidates").replaceChildren();
      if (!matches.length) {
        message(
          "一致するカードが見つかりませんでした。コードを入力するか、明るい場所でもう一度撮影してください。",
        );
        return;
      }
      message(
        result.byCode
          ? "カードコードが一致しました。画像と種類を確認して登録してください。"
          : result.visual
            ? "イラスト・衣装が近いカードです。画像と種類を確認してください。"
            : "カード名・衣装名から候補が見つかりました。コードと画像を確認してください。",
      );
      for (const card of matches.slice(0, 30)) {
        const tile = document.createElement("article");
        tile.className = "camera-candidate";
        const img = document.createElement("img");
        img.src = card.front;
        img.alt = card.name || card.code;
        img.loading = "lazy";
        img.onerror = () => {
          img.hidden = true;
        };
        const info = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = card.name || card.code;
        const text = document.createElement("p");
        const parallel = card.parallel || card.variant === "パラレル";
        text.textContent = [
          card.code,
          card.character,
          card.rarity,
          parallel ? "パラレル" : "通常",
        ]
          .filter(Boolean)
          .join(" ／ ");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "primary";
        button.dataset.cameraRegister = card.id;
        button.textContent = api.isOwned(card.id)
          ? "登録済み"
          : "このカードを登録";
        button.disabled = api.isOwned(card.id);
        button.onclick = () => saveCard(card);
        info.append(title, text, button);
        tile.append(img, info);
        $("camera-candidates").append(tile);
      }
    }
    async function saveCard(card) {
      if (busy || !modal.open || !api.account() || !mobileAvailable()) return;
      const current = revision,
        uid = api.account().id;
      setBusy(true);
      message("所持カードに保存中…");
      try {
        await api.register(card.id, uid);
        if (current !== revision || !modal.open) return;
        if (photo) lastRegisteredFrame = window.CardVisual.feature(photo);
        showRegistered(card);
        nextCard("次のカードを撮影してください。");
      } catch (error) {
        if (current === revision)
          message(
            error.message || "保存できませんでした。再度お試しください。",
          );
      } finally {
        setBusy(false);
      }
    }
    let toastTimer;
    function showRegistered(card) {
      const toast = $("camera-toast");
      const image = $("camera-toast-image");
      image.hidden = false;
      image.onerror = () => {
        image.hidden = true;
      };
      image.src = card.front;
      $("camera-toast-code").textContent = card.code;
      $("camera-toast-name").textContent = card.name || "";
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.hidden = true;
        image.removeAttribute("src");
      }, 4500);
    }
    function canvasFromImage(image) {
      const w = image.videoWidth || image.naturalWidth || image.width;
      const h = image.videoHeight || image.naturalHeight || image.height;
      if (!w || !h)
        throw Error("画像を取得できませんでした。もう一度撮影してください。");
      const scale = Math.min(1, 1800 / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas
        .getContext("2d")
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas;
    }
    function setPhoto(canvas) {
      photo = canvas;
      $("camera-photo-stage").hidden = false;
      $("camera-adjust").hidden = false;
      preview.src = canvas.toDataURL("image/jpeg", 0.9);
      preview.hidden = false;
      $("camera-read").disabled = false;
      $("camera-candidates").replaceChildren();
    }
    async function recognize(useText = false) {
      if (!photo || busy || !modal.open || !api.account() || !mobileAvailable())
        return;
      const current = revision;
      setBusy(true);
      $("camera-guide").hidden = true;
      message("イラスト・衣装を照合中…");
      try {
        const aligned = adjusting
          ? window.CardVisual.rectify(photo, corners)
          : photo;
        let visual = { cards: [], visual: true, autoId: null };
        try {
          visual = await window.CardVisual.compare(aligned, api.cards());
        } catch {
          useText = true;
        }
        let reading = { text: "", autoText: "" };
        if (useText || !visual.cards.length) {
          message("カード名・衣装名・コードを読み取り中…");
          reading = await api.recognize(aligned);
        }
        if (current !== revision || !modal.open || !api.account()) return;
        const words = matchCards(
          typeof reading === "string" ? reading : reading.text,
          api.cards(),
        );
        const conflict =
          words.byCode &&
          visual.cards.length &&
          !words.cards.some((a) => visual.cards.some((b) => a.id === b.id));
        const result = conflict
          ? {
              cards: [
                ...new Map(
                  [...words.cards, ...visual.cards].map((c) => [c.id, c]),
                ).values(),
              ],
              byCode: false,
              visual: true,
            }
          : words.cards.length
            ? words
            : visual;
        renderCandidates(result);
        const repeated = reading.autoText
          ? matchCards(reading.autoText, api.cards())
          : { cards: [] };
        const canAutoText =
          result.byCode &&
          result.cards.length === 1 &&
          repeated.byCode &&
          repeated.cards.length === 1 &&
          repeated.cards[0].id === result.cards[0].id &&
          api.canAutoRegister?.();
        const canAutoVisual =
          !words.cards.length && visual.autoId && api.canAutoRegister?.();
        if (canAutoText || canAutoVisual) {
          const card = canAutoVisual
            ? visual.cards.find((c) => c.id === visual.autoId)
            : result.cards[0];
          if (api.isOwned(card.id)) {
            nextCard(
              "このカードは登録済みです。次のカードを撮影してください。",
            );
          } else {
            setBusy(false);
            await saveCard(card);
          }
        }
      } catch (error) {
        if (current === revision)
          message(
            error.message ||
              "読み取りできませんでした。コードを入力して検索できます。",
          );
      } finally {
        setBusy(false);
      }
    }
    $("camera-add").onclick = () => {
      if (!mobileAvailable() || !api.account()) return;
      if (busy) {
        api.notify("前の読み取り処理が終わってからお試しください。");
        return;
      }
      clean();
      $("camera-game").value = api.defaultGroup?.() || "aikatsu";
      modal.showModal();
      setBusy(false);
      message(
        "画像照合データを準備しています。枠に表面を合わせると自動で照合します。",
      );
      $("camera-start").click();
    };
    $("camera-close").onclick = () => modal.close();
    modal.addEventListener("close", clean);
    modal.addEventListener("cancel", clean);
    $("camera-start").onclick = async () => {
      if (busy || !mobileAvailable() || !api.account()) return;
      stopStream();
      resetPhoto();
      const current = ++revision;
      if (!navigator.mediaDevices?.getUserMedia) {
        message(
          "カメラを利用できません。写真を撮影・選択するボタンをご利用ください。サイト内カメラにはHTTPS接続が必要です。",
        );
        return;
      }
      $("camera-start").disabled = true;
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (current !== revision || !modal.open || !api.account()) {
          next.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = next;
        video.srcObject = stream;
        video.hidden = false;
        await video.play();
        $("camera-capture").hidden = true;
        startAutoLoop();
        $("camera-read").disabled = false;
      } catch (error) {
        if (current === revision) {
          stopStream();
          message(
            error.name === "NotAllowedError"
              ? "カメラが許可されていません。端末の設定を確認するか、写真を撮影・選択してください。"
              : "カメラを起動できませんでした。写真を撮影・選択できます。",
          );
        }
      } finally {
        $("camera-start").disabled = busy;
      }
    };
    $("camera-capture").onclick = async () => {
      if (busy || !stream) return;
      try {
        setPhoto(canvasFromImage(video));
        video.hidden = true;
        $("camera-capture").hidden = true;
        await recognize();
      } catch (error) {
        message(error.message);
      }
    };
    $("camera-file").onchange = async (event) => {
      const file = event.target.files[0];
      if (!file || busy || !modal.open || !api.account() || !mobileAvailable())
        return;
      const current = ++revision;
      stopStream();
      resetPhoto();
      setBusy(true);
      let url;
      try {
        if (file.size > 25 * 1024 * 1024)
          throw Error("画像は25MB以内で選択してください。");
        url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;
        await img.decode();
        if (current !== revision || !modal.open) return;
        setPhoto(canvasFromImage(img));
      } catch (error) {
        if (current === revision)
          message(
            "画像を開けませんでした。JPEG・PNG等の画像でお試しください。",
          );
      } finally {
        if (url) URL.revokeObjectURL(url);
        setBusy(false);
        event.target.value = "";
      }
      if (current === revision && photo) await recognize();
    };
    function nextCard(text = "次のカードを撮影してください。") {
      revision++;
      resetPhoto();
      $("camera-read").disabled = !stream;
      if (
        stream &&
        stream.getVideoTracks().some((track) => track.readyState === "live")
      ) {
        video.hidden = false;
        $("camera-capture").hidden = true;
        startAutoLoop();
      } else {
        stopStream();
      }
      message(text);
    }
    $("camera-game").onchange = () => {
      lastRegisteredFrame = null;
      if (!busy) nextCard();
    };
    $("camera-next").onclick = () => {
      if (!busy) nextCard();
    };
    $("camera-read").onclick = () => {
      if (!photo && stream && !busy) {
        const frame = window.CardVisual.videoCard(video);
        if (frame) {
          setPhoto(frame);
          video.hidden = true;
        }
      }
      return recognize(true);
    };
    $("camera-adjust").onclick = () => {
      adjusting = !adjusting;
      $("camera-crop-overlay").hidden = !adjusting;
      $("camera-adjust").textContent = adjusting
        ? "調整を完了して照合"
        : "カードの4隅を調整";
      if (!adjusting) {
        photo = window.CardVisual.rectify(photo, corners);
        corners = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ];
        setPhoto(photo);
        recognize();
      } else message("丸い点をカードの4隅へ動かしてください。");
    };
    const svg = $("camera-crop-overlay");
    function drawCorners() {
      svg
        .querySelector("polygon")
        .setAttribute(
          "points",
          corners.map((p) => `${p[0] * 100},${p[1] * 100}`).join(" "),
        );
      svg.querySelectorAll("circle").forEach((circle, i) => {
        circle.setAttribute("cx", corners[i][0] * 100);
        circle.setAttribute("cy", corners[i][1] * 100);
      });
    }
    svg.querySelectorAll("circle").forEach((circle, i) => {
      circle.onpointerdown = (e) => {
        e.preventDefault();
        circle.setPointerCapture(e.pointerId);
        circle.dataset.drag = "yes";
      };
      circle.onpointermove = (e) => {
        if (circle.dataset.drag !== "yes") return;
        const r = svg.getBoundingClientRect();
        corners[i] = [
          Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
          Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
        ];
        drawCorners();
      };
      circle.onpointerup = circle.onpointercancel = () => {
        delete circle.dataset.drag;
      };
    });
    function startAutoLoop() {
      clearInterval(autoTimer);
      previousFrame = null;
      stableFrames = 0;
      const rect = video.getBoundingClientRect(),
        scale = Math.min(
          rect.width / video.videoWidth,
          rect.height / video.videoHeight,
        );
      const width = Math.min(
        video.videoWidth * 0.86,
        video.videoHeight * 0.86 * 0.7,
      );
      $("camera-guide").style.width = `${width * scale}px`;
      $("camera-guide").style.height = `${(width / 0.7) * scale}px`;
      $("camera-guide").hidden = false;
      const readyRevision = revision;
      message("画像照合データを準備中…初回は少し時間がかかります。");
      window.CardVisual.load()
        .then(() => {
          if (readyRevision === revision && modal.open && !photo && !busy)
            message(
              "枠にカード表面を合わせて静止してください。自動で照合します。",
            );
        })
        .catch(() => {
          if (readyRevision === revision && modal.open)
            message(
              "画像照合データを読み込めません。写真・名前・コードで照合できます。",
            );
        });
      autoTimer = setInterval(async () => {
        if (
          autoBusy ||
          busy ||
          photo ||
          !stream ||
          !modal.open ||
          document.hidden ||
          !api.account()
        )
          return;
        autoBusy = true;
        const current = revision;
        try {
          const frame = window.CardVisual.videoCard(video);
          if (!frame) return;
          const f = window.CardVisual.feature(frame);
          if (f.contrast < 0.06) {
            stableFrames = 0;
            previousFrame = f;
            return;
          }
          if (
            lastRegisteredFrame &&
            window.CardVisual.distance(f, lastRegisteredFrame) < 0.055
          ) {
            message("次のカードに入れ替えてください。");
            return;
          }
          stableFrames =
            previousFrame && window.CardVisual.distance(f, previousFrame) < 0.05
              ? stableFrames + 1
              : 0;
          previousFrame = f;
          if (stableFrames < 1) return;
          const candidate = await window.CardVisual.compare(frame, api.cards());
          if (current !== revision || busy || !stream || !modal.open) return;
          if (
            (candidate.distance > 0.23 && stableFrames < 4) ||
            !candidate.cards.length
          ) {
            message(
              "枠内にカード表面を大きく写してください。反射を避けると照合しやすくなります。",
            );
            return;
          }
          setPhoto(frame);
          video.hidden = true;
          $("camera-guide").hidden = true;
          await recognize(candidate.distance > 0.23);
        } catch (error) {
          if (current === revision)
            message(
              "照合できませんでした。写真を選択するか、名前・コードで探せます。",
            );
        } finally {
          autoBusy = false;
        }
      }, 900);
    }
    $("camera-manual").oninput = () => {
      if (busy || !mobileAvailable() || !api.account()) return;
      if ($("camera-manual").value.trim().length < 4) {
        $("camera-candidates").replaceChildren();
        return;
      }
      renderCandidates(matchCards($("camera-manual").value, api.cards()));
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopStream();
    });
    window.addEventListener("pagehide", stopStream);
    updateAccess();
    return { updateAccess };
  }
  return { init, matchCards, mobileAvailable };
})();
