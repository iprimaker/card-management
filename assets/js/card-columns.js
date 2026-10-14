// スマホ縦画面の列数設定。カードの再取得や一覧の再描画は不要です。
(() => {
  "use strict";
  const grid = document.getElementById("cards");
  const control = document.querySelector(".mobile-column-control");
  if (!grid || !control) return;
  const key = "card-album-mobile-columns";
  let columns = "3";
  try {
    const saved = localStorage.getItem(key);
    if (saved === "2" || saved === "3") columns = saved;
  } catch {
    /* 保存できない環境でも切り替え可能 */
  }
  function apply(value) {
    columns = value === "3" ? "3" : "2";
    grid.dataset.mobileColumns = columns;
    control.querySelectorAll("[data-card-columns]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.cardColumns === columns),
      );
    });
  }
  control.addEventListener("click", (event) => {
    const button = event.target.closest("[data-card-columns]");
    if (!button || !control.contains(button)) return;
    apply(button.dataset.cardColumns);
    try {
      localStorage.setItem(key, columns);
    } catch {
      /* このページ内の設定は維持 */
    }
  });
  apply(columns);
})();
