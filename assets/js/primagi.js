/* Official images and chapter labels. Stored filter values remain unchanged. */
(() => {
  "use strict";
  function chapterLabel(value) {
    return String(value ?? "").replace(/(?:プリティー)?オールスター第?([1１2２])章/g,
      (_,n)=>n==="1"||n==="１"?"スタジオ第9章":"スタジオ第10章");
  }
  function chapterRank(value) {
    const label=chapterLabel(value).normalize("NFKC"),n=Number(label.match(/(?:第)?(\d+)章/)?.[1]||0);
    return (label.includes("オールスター")?300:label.startsWith("スタジオ")?200:0)+n;
  }
  const unavailablePhotos=new Set(["https://makeshop-multi-images.akamaized.net/fullidol01/itemimages/0000000359562_cu0byqt.jpg", "https://makeshop-multi-images.akamaized.net/fullidol01/itemimages/0000000359572_ICgOHvD.jpg", "https://makeshop-multi-images.akamaized.net/fullidol01/itemimages/0000000359582_Tl3859N.jpg", "https://makeshop-multi-images.akamaized.net/fullidol01/itemimages/0000000407742_QymDqWg.jpg", "https://makeshop-multi-images.akamaized.net/fullidol01/itemimages/0000000407752_PffVobT.jpg", "https://makeshop-multi-images.akamaized.net/fullidol01/itemimages/0000000407762_XN8FFhT.jpg", "https://img.fril.jp/img/830361831/l/2857948683.jpg", "https://img.fril.jp/img/830779217/l/2859681357.jpg", "https://img.fril.jp/img/833541759/l/2870918479.jpg"]);
  function verseImage(value){return unavailablePhotos.has(String(value||"").split("?")[0])?"":value||"";}
  window.CARD_PRIMAGI=Object.freeze({image(value){return value||"";},verseImage,chapterLabel,chapterRank});
})();
