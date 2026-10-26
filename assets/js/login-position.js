(() => {
  const auth = document.getElementById("auth"),
    intro = auth?.querySelector(".intro");
  if (!intro) return;
  let frame;
  function update() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (
        auth.hidden ||
        getComputedStyle(auth).display === "none" ||
        innerWidth <= 760
      )
        return;
      const h = intro.getBoundingClientRect().height,
        authTop = auth.getBoundingClientRect().top + scrollY,
        viewport = document.documentElement.clientHeight;
      const header = document.querySelector("body>header"),
        safe = Math.max(16, (header?.getBoundingClientRect().height || 0) + 16);
      const top = Math.max(safe, (viewport - h) / 2),
        margin = Math.max(0, top - authTop);
      auth.style.setProperty("--intro-top", top + "px");
      auth.style.setProperty("--intro-margin", margin + "px");
      auth.style.setProperty(
        "--auth-min-height",
        Math.max(h + margin, viewport - authTop - 30) + "px",
      );
    });
  }
  new ResizeObserver(update).observe(intro);
  new MutationObserver(update).observe(auth, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  window.addEventListener("resize", update);
  document.fonts?.ready.then(update);
  update();
})();
