(() => {
  "use strict";
  if (!HTMLElement.prototype.showPopover) return;
  const rail = document.createElement("div");
  rail.id = "modal-scroll-rail";
  rail.setAttribute("popover", "manual");
  rail.setAttribute("role", "scrollbar");
  rail.setAttribute("aria-orientation", "vertical");
  rail.setAttribute("aria-label", "モーダルをスクロール");
  rail.tabIndex = 0;
  const thumb = document.createElement("span");
  thumb.className = "modal-scroll-thumb";
  thumb.setAttribute("aria-hidden", "true");
  rail.append(thumb);
  let modal = null, target = null, frame = 0, trackHeight = 0, thumbHeight = 0, thumbTop = 0, drag = null, nextId = 0;
  let cachedScroller = null, needsScan = true;
  const resize = new ResizeObserver(() => { needsScan = true; schedule(); });
  function scrollable(node) {
    return node instanceof HTMLElement && !rail.contains(node) && node !== rail &&
      node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 1 &&
      /auto|scroll/.test(getComputedStyle(node).overflowY);
  }
  function findScroller(active) {
    if (active !== modal || needsScan || !cachedScroller?.isConnected) {
      const candidates = [active, ...active.querySelectorAll("*")].filter(scrollable);
      cachedScroller = candidates.includes(active) ? active : candidates.sort((a,b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] || active;
      needsScan = false;
    }
    return cachedScroller;
  }
  function clear() {
    try { rail.hidePopover(); } catch {}
    if (target) target.classList.remove("external-modal-scroll");
    resize.disconnect();
    modal = target = drag = null;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function update() {
    frame = 0;
    const dialogs = [...document.querySelectorAll("dialog[open]")].filter((node) => node.matches(":modal"));
    const active = dialogs.at(-1);
    if (!active) { clear(); return; }
    const scroller = findScroller(active);
    if (active !== modal || target !== scroller) {
      clear();
      modal = active;
      target = scroller;
      active.append(rail);
      resize.observe(active);
      if (target !== active) resize.observe(target);
    }
    const rect = active.getBoundingClientRect();
    trackHeight = Math.max(0, Math.min(rect.bottom, innerHeight - 12) - Math.max(12, rect.top) - 20);
    const max = Math.max(0, target.scrollHeight - target.clientHeight);
    if (!max || trackHeight < 40) {
      try { rail.hidePopover(); } catch {}
      return;
    }
    try { if (!rail.matches(":popover-open")) rail.showPopover(); }
    catch { clear(); return; }
    if (!target.classList.contains("external-modal-scroll")) target.classList.add("external-modal-scroll");
    if (!target.id) target.id = "modal-scroll-target-" + (++nextId);
    rail.setAttribute("aria-controls", target.id);
    rail.setAttribute("aria-valuemin", "0");
    rail.setAttribute("aria-valuemax", String(Math.round(max)));
    rail.setAttribute("aria-valuenow", String(Math.round(target.scrollTop)));
    rail.style.left = Math.min(innerWidth - 11, rect.right + 3) + "px";
    rail.style.top = Math.max(12, rect.top) + 10 + "px";
    rail.style.height = trackHeight + "px";
    thumbHeight = Math.min(trackHeight, Math.max(28, trackHeight * target.clientHeight / target.scrollHeight));
    thumbTop = (trackHeight - thumbHeight) * Math.min(1, Math.max(0, target.scrollTop / max));
    thumb.style.height = thumbHeight + "px";
    thumb.style.transform = "translateY(" + thumbTop + "px)";
  }
  function move(pointerY, offset) {
    if (!target) return;
    const max = target.scrollHeight - target.clientHeight;
    const top = pointerY - rail.getBoundingClientRect().top - offset;
    target.scrollTop = Math.max(0, Math.min(1, top / Math.max(1, trackHeight - thumbHeight))) * max;
    schedule();
  }
  rail.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !target) return;
    event.preventDefault();
    rail.focus({ preventScroll: true });
    const y = event.clientY - rail.getBoundingClientRect().top;
    drag = { id: event.pointerId, offset: y >= thumbTop && y <= thumbTop + thumbHeight ? y - thumbTop : thumbHeight / 2 };
    rail.setPointerCapture(event.pointerId);
    move(event.clientY, drag.offset);
  });
  rail.addEventListener("pointermove", (event) => { if (drag?.id === event.pointerId) move(event.clientY, drag.offset); });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) rail.addEventListener(type, () => { drag = null; });
  rail.addEventListener("wheel", (event) => {
    if (!target) return;
    event.preventDefault();
    target.scrollTop += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.clientHeight : 1);
    schedule();
  }, { passive: false });
  rail.addEventListener("keydown", (event) => {
    if (!target || !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Home") target.scrollTop = 0;
    else if (event.key === "End") target.scrollTop = target.scrollHeight;
    else target.scrollTop += (event.key.endsWith("Up") ? -1 : 1) * (event.key.startsWith("Page") ? target.clientHeight * .85 : 40);
    schedule();
  });
  new MutationObserver((records) => {
    if (records.some((record) => record.target !== rail && !rail.contains(record.target))) { needsScan = true; schedule(); }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "hidden"] });
  document.addEventListener("scroll", (event) => {
    if (modal?.contains(event.target) && scrollable(event.target)) { cachedScroller = event.target; needsScan = false; }
    schedule();
  }, true);
  document.addEventListener("load", () => { needsScan = true; schedule(); }, true);
  addEventListener("resize", () => { needsScan = true; schedule(); }, { passive: true });
  schedule();
})();
