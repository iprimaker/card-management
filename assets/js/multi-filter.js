(() => {
  "use strict";
  const prefix = "@multi:";
  function values(value) {
    if (Array.isArray(value)) return value.flatMap(values);
    if (typeof value !== "string" || !value) return [];
    if (!value.startsWith(prefix)) return [value];
    try {
      const parsed = JSON.parse(value.slice(prefix.length));
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string" && v) : [];
    } catch { return [value]; }
  }
  function pack(items) {
    const list = [...new Set(items.filter(Boolean))];
    return list.length > 1 ? prefix + JSON.stringify(list) : list[0] || "";
  }
  function edition(value) {
    return String(value ?? "").replace(/【?おねがいアイプリ\s*】?\s*(?:第)?([0-9０-９]+)\s*(?:だん|弾)】?/gu,
      (_, number) => number.normalize("NFKC") + "だん");
  }
  function text(value, label = edition) { return values(value).map(label).join(" ／ "); }
  function matches(actual, selection) {
    const chosen = values(selection);
    return !chosen.length || chosen.some((v) => (Array.isArray(actual) ? actual : [actual]).includes(v));
  }
  function retain(selection, options) { return pack(values(selection).filter((v) => options.includes(v))); }
  function optionsText(options, selection) {
    return text(selection, (v) => edition(options.find((option) => option.value === v)?.text || v));
  }
  window.CARD_MULTI_FILTER = Object.freeze({ values, pack, text, matches, retain, optionsText, enhance, edition });

  const selector = [
    "select[data-filter]", "select[data-all-filter]", "select[data-public-filter]",
    "#verse-series", "#verse-group", "#primagi-rarity", "#primagi-verse-compat",
    "#verse-collection-series", "#trade-series", "#trade-rarity", "#trade-group",
    "select[data-image-multiple]", "select[data-trade-multiple]",
  ].join(",");
  const controls = new WeakMap();
  let active = null;
  let serial = 0;

  function closeMenu(restoreFocus = false) {
    if (!active) return;
    const previous = active;
    active = null;
    if (previous.list.hasAttribute("popover")) {
      try { previous.list.hidePopover(); } catch {}
    }
    previous.list.remove();
    previous.wrapper.removeAttribute("open");
    previous.button.setAttribute("aria-expanded", "false");
    if (restoreFocus && previous.button.isConnected) previous.button.focus({ preventScroll: true });
  }

  function positionMenu() {
    if (!active) return;
    const { button, list, select } = active;
    if (!button.isConnected || select.disabled) { closeMenu(); return; }
    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0;
    const topEdge = viewport?.offsetTop || 0;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const menuWidth = Math.min(Math.max(rect.width, 180), width - 24);
    const below = topEdge + height - rect.bottom - 18;
    const above = rect.top - topEdge - 18;
    const upwards = below < 180 && above > below;
    const maxHeight = Math.max(60, Math.min(320, upwards ? above : below));
    list.style.width = menuWidth + "px";
    list.style.maxHeight = maxHeight + "px";
    list.style.left = Math.max(leftEdge + 12, Math.min(rect.left, leftEdge + width - menuWidth - 12)) + "px";
    list.style.top = (upwards ? Math.max(topEdge + 12, rect.top - Math.min(list.scrollHeight, maxHeight) - 6) : rect.bottom + 6) + "px";
  }

  function openMenu(state) {
    closeMenu();
    if (state.select.disabled || !state.select.options.length) return;
    state.sync();
    const { select, button, list, wrapper } = state;
    const theme = getComputedStyle(button);
    for (const name of ["--accent", "--soft", "--line", "--muted", "--ink"]) {
      list.style.setProperty(name, theme.getPropertyValue(name));
    }
    const owner = select.closest("dialog");
    (owner || document.body).append(list);
    if (typeof list.showPopover === "function") {
      list.setAttribute("popover", "manual");
      try { list.showPopover(); } catch { list.removeAttribute("popover"); }
    }
    active = state;
    wrapper.setAttribute("open", "");
    button.setAttribute("aria-expanded", "true");
    positionMenu();
  }

  function enhance(select) {
    if (controls.has(select)) return;
    const initial = select.multiple ? pack([...select.selectedOptions].map((o) => o.value)) : select.value;
    select.multiple = true;
    const wrapper = document.createElement("span");
    wrapper.className = "album-select multi-filter";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "album-select-trigger";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    const selectedText = document.createElement("span");
    selectedText.className = "album-select-value";
    const arrow = document.createElement("span");
    arrow.className = "album-select-chevron";
    arrow.setAttribute("aria-hidden", "true");
    button.append(selectedText, arrow);
    const list = document.createElement("div");
    list.className = "album-select-menu multi-filter-options";
    list.id = "multi-filter-menu-" + ++serial;
    button.setAttribute("aria-controls", list.id);
    const label = select.labels?.[0]?.cloneNode(true);
    label?.querySelectorAll("button, select, input, .album-select, .multi-filter").forEach((node) => node.remove());
    const caption = select.getAttribute("aria-label") || label?.textContent.trim() || "絞り込み";
    list.setAttribute("role", "dialog");
    list.setAttribute("aria-label", caption + "を複数選択");
    select.before(wrapper);
    wrapper.append(button, select);
    select.classList.add("multi-filter-source");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    Object.defineProperty(select, "value", {
      configurable: true,
      get() { return pack([...this.selectedOptions].map((o) => o.value)); },
      set(value) {
        const chosen = values(value);
        for (const option of this.options) option.selected = chosen.includes(option.value);
        sync();
      },
    });
    let optionKey = "";
    const checks = new Map();
    function sync() {
      const chosen = values(select.value);
      const available = [...select.options];
      selectedText.textContent = chosen.length
        ? chosen.map((v) => edition(available.find((o) => o.value === v)?.textContent || v)).join(" ／ ")
        : available.find((o) => !o.value)?.textContent || "すべて";
      button.title = selectedText.textContent;
      button.setAttribute("aria-label", caption + "を複数選択・" + selectedText.textContent);
      button.disabled = select.disabled;
      if (select.disabled && active?.select === select) closeMenu();
      const key = JSON.stringify(available.map((o) => [o.value, o.textContent, o.disabled]));
      if (key !== optionKey) {
        optionKey = key;
        checks.clear();
        list.replaceChildren();
        for (const option of available) {
          const label = document.createElement("label");
          label.className = "album-select-option";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = option.value;
          const title = document.createElement("span");
          title.textContent = edition(option.textContent);
          label.append(input, title);
          list.append(label);
          checks.set(option.value, input);
          input.addEventListener("change", () => {
            const next = new Set(values(select.value));
            if (!option.value) next.clear();
            else if (input.checked) next.add(option.value);
            else next.delete(option.value);
            select.value = pack([...next]);
            select.dispatchEvent(new Event("change", { bubbles: true }));
          });
        }
      }
      for (const option of available) {
        const input = checks.get(option.value);
        if (!input) continue;
        input.checked = option.value ? chosen.includes(option.value) : chosen.length === 0;
        input.disabled = select.disabled || option.disabled;
        input.closest("label").classList.toggle("is-current", input.checked);
      }
    }
    const state = { select, wrapper, button, list, sync };
    controls.set(select, state);
    Object.defineProperty(wrapper, "open", {
      get() { return active === state; },
      set(value) { if (value && active !== state) openMenu(state); else if (!value && active === state) closeMenu(); },
    });
    button.addEventListener("click", () => active === state ? closeMenu() : openMenu(state));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      if (active !== state) openMenu(state);
      const inputs = [...list.querySelectorAll("input:not(:disabled)")];
      (event.key === "ArrowUp" ? inputs.at(-1) : inputs[0])?.focus();
    });
    select.addEventListener("change", sync);
    select.value = initial;
  }
  const pending = new Set();
  let scheduled = false;
  function queue(select) {
    if (!select.matches(selector)) return;
    enhance(select);
    pending.add(select);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      for (const select of pending) {
        if (select.isConnected) {
          enhance(select);
          controls.get(select).sync();
        }
      }
      pending.clear();
    });
  }
  new MutationObserver((records) => {
    if (active && !active.select.isConnected) closeMenu();
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const select = target?.closest("select");
      if (select) queue(select);
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches("select")) queue(node);
        node.querySelectorAll("select").forEach(queue);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true,
    attributeFilter: ["disabled", "selected"] });
  document.querySelectorAll(selector).forEach(enhance);
  document.addEventListener("click", (event) => {
    if (active && !active.wrapper.contains(event.target) && !active.list.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (!active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    } else if (event.key === "Tab") {
      if (event.target === active.button && !event.shiftKey) {
        event.preventDefault();
        active.list.querySelector("input:not(:disabled)")?.focus();
      } else if (active.list.contains(event.target)) {
        const inputs = [...active.list.querySelectorAll("input:not(:disabled)")];
        if ((event.shiftKey && event.target === inputs[0]) || (!event.shiftKey && event.target === inputs.at(-1))) closeMenu(true);
      }
    }
  }, true);
  window.addEventListener("resize", positionMenu, { passive: true });
  window.visualViewport?.addEventListener("resize", positionMenu, { passive: true });
  window.visualViewport?.addEventListener("scroll", positionMenu, { passive: true });
  document.addEventListener("scroll", (event) => {
    if (active && !active.list.contains(event.target)) closeMenu();
  }, { capture: true, passive: true });
  document.addEventListener("close", (event) => {
    if (active && event.target.contains(active.select)) closeMenu();
  }, true);
})();
