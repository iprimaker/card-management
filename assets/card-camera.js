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
        title.length >= 6 && card.name !== card.code && compact.includes(title)
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
    let stream = null,
      revision = 0,
      busy = false,
      photo = null,
      matches = [];
    const message = (text) => {
      $("camera-status").textContent = text;
    };
    function stopStream() {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
      video.hidden = true;
      $("camera-capture").hidden = true;
    }
    function resetPhoto() {
      photo = null;
      preview.removeAttribute("src");
      preview.hidden = true;
      $("camera-candidates").replaceChildren();
      $("camera-manual").value = "";
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
      ])
        $(id).disabled = value;
      $("camera-read").disabled = value || !photo;
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
          : "カード名から候補が見つかりました。コードと画像を確認してください。",
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
      preview.src = canvas.toDataURL("image/jpeg", 0.9);
      preview.hidden = false;
      $("camera-read").disabled = false;
      $("camera-candidates").replaceChildren();
    }
    async function recognize() {
      if (!photo || busy || !modal.open || !api.account() || !mobileAvailable())
        return;
      const current = revision;
      setBusy(true);
      message("カードの文字を読み取り中…");
      try {
        const reading = await api.recognize(photo);
        if (current !== revision || !modal.open || !api.account()) return;
        const result = matchCards(
          typeof reading === "string" ? reading : reading.text,
          api.cards(),
        );
        renderCandidates(result);
        const repeated = reading.autoText
          ? matchCards(reading.autoText, api.cards())
          : { cards: [] };
        const canAuto =
          result.byCode &&
          result.cards.length === 1 &&
          repeated.byCode &&
          repeated.cards.length === 1 &&
          repeated.cards[0].id === result.cards[0].id &&
          api.canAutoRegister?.();
        if (canAuto) {
          const card = result.cards[0];
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
      modal.showModal();
      setBusy(false);
      message(
        "カード表面を大きく写してください。反射を避け、カードコードが読める明るさで撮影します。",
      );
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
        $("camera-capture").hidden = false;
        message("カード全体を画面いっぱいに写して、撮影してください。");
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
      $("camera-read").disabled = true;
      if (
        stream &&
        stream.getVideoTracks().some((track) => track.readyState === "live")
      ) {
        video.hidden = false;
        $("camera-capture").hidden = false;
      } else {
        stopStream();
      }
      message(text);
    }
    $("camera-next").onclick = () => {
      if (!busy) nextCard();
    };
    $("camera-read").onclick = recognize;
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
