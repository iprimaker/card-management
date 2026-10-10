(() => {
  "use strict";
  const enhanced = new WeakMap();
  let active = null;
  let serial = 0;
  let query = "";
  let queryTimer;

  function close(restoreFocus = false) {
    if (!active) return;
    const { button, menu } = active;
    active = null;
    menu.remove();
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    if (restoreFocus && button.isConnected) button.focus();
    query = "";
    clearTimeout(queryTimer);
  }

  function sync(select) {
    const state = enhanced.get(select);
    if (!state) return;
    const value = select.selectedOptions[0]?.textContent || "選択してください";
    if (state.text.textContent !== value) state.text.textContent = value;
    if (state.button.disabled !== select.disabled)
      state.button.disabled = select.disabled;
    const label =
      select.getAttribute("aria-label") ||
      select.labels?.[0]?.querySelector(".filter-label")?.firstChild
        ?.textContent ||
      select.labels?.[0]?.firstChild?.textContent ||
      "選択項目";
    state.button.setAttribute(
      "aria-label",
      `${label.trim()}：${state.text.textContent}`,
    );
  }

  function highlight(index) {
    if (!active) return;
    active.index = index;
    active.items.forEach((item, i) =>
      item.classList.toggle("is-current", i === index),
    );
    const item = active.items[index];
    if (item) {
      active.button.setAttribute("aria-activedescendant", item.id);
      item.scrollIntoView?.({ block: "nearest" });
    }
  }

  function choose(index) {
    if (!active) return;
    const { select, options } = active;
    const option = options[index];
    if (!option || option.disabled || option.parentElement.disabled) return;
    const changed = select.selectedIndex !== option.index;
    select.selectedIndex = option.index;
    close(true);
    sync(select);
    if (changed) {
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function open(select) {
    close();
    if (select.disabled) return;
    const { button } = enhanced.get(select);
    const options = Array.from(select.options);
    if (!options.length) return;
    const menu = document.createElement("div");
    menu.className = "album-select-menu";
    menu.id = button.getAttribute("aria-controls");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", button.getAttribute("aria-label"));
    const theme = getComputedStyle(select);
    for (const name of ["--accent", "--soft", "--line", "--muted"]) {
      menu.style.setProperty(name, theme.getPropertyValue(name));
    }
    let group = null;
    const items = options.map((option, i) => {
      if (
        option.parentElement.tagName === "OPTGROUP" &&
        group !== option.parentElement
      ) {
        group = option.parentElement;
        const heading = document.createElement("div");
        heading.className = "album-select-group";
        heading.textContent = group.label;
        heading.setAttribute("role", "presentation");
        menu.append(heading);
      }
      const item = document.createElement("div");
      item.id = `${menu.id}-${i}`;
      item.className = "album-select-option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.setAttribute(
        "aria-disabled",
        String(option.disabled || !!option.parentElement.disabled),
      );
      item.textContent = option.textContent;
      item.addEventListener("pointermove", () => highlight(i));
      item.addEventListener("click", () => choose(i));
      menu.append(item);
      return item;
    });
    document.body.append(menu);
    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0;
    const topEdge = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const menuWidth = Math.min(Math.max(rect.width, 180), width - 24);
    menu.style.width = `${menuWidth}px`;
    menu.style.left = `${Math.max(leftEdge + 12, Math.min(rect.left, leftEdge + width - menuWidth - 12))}px`;
    const below = topEdge + height - rect.bottom - 18;
    const above = rect.top - topEdge - 18;
    const upwards = below < 180 && above > below;
    const maxHeight = Math.max(80, Math.min(320, upwards ? above : below));
    menu.style.maxHeight = `${maxHeight}px`;
    menu.style.top = `${upwards ? Math.max(topEdge + 12, rect.top - Math.min(menu.scrollHeight, maxHeight) - 6) : rect.bottom + 6}px`;
    active = {
      select,
      button,
      menu,
      options,
      items,
      index: select.selectedIndex,
    };
    button.setAttribute("aria-expanded", "true");
    highlight(select.selectedIndex);
  }

  function keydown(event, select) {
    const key = event.key;
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(key)) {
      event.preventDefault();
      if (!active || active.select !== select) {
        open(select);
        return;
      }
      if (key === "Enter" || key === " ") {
        choose(active.index);
        return;
      }
      const allowed = active.options
        .map((option, i) =>
          option.disabled || option.parentElement.disabled ? -1 : i,
        )
        .filter((i) => i >= 0);
      if (!allowed.length) return;
      const current = allowed.indexOf(active.index);
      const index =
        key === "Home"
          ? allowed[0]
          : key === "End"
            ? allowed.at(-1)
            : allowed[
                Math.max(
                  0,
                  Math.min(
                    allowed.length - 1,
                    current + (key === "ArrowDown" ? 1 : -1),
                  ),
                )
              ];
      highlight(index);
    } else if (key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (key === "Tab") close();
    else if (
      key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      if (!active) open(select);
      if (!active) return;
      query += key.toLocaleLowerCase();
      clearTimeout(queryTimer);
      queryTimer = setTimeout(() => {
        query = "";
      }, 650);
      const index = active.options.findIndex(
        (option) =>
          !option.disabled &&
          !option.parentElement.disabled &&
          option.textContent.trim().toLocaleLowerCase().startsWith(query),
      );
      if (index >= 0) highlight(index);
    }
  }

  function enhance(select) {
    if (enhanced.has(select) || select.multiple || select.size > 1) return;
    const wrapper = document.createElement("span");
    wrapper.className = "album-select";
    select.before(wrapper);
    wrapper.append(select);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "album-select-trigger";
    button.setAttribute("role", "combobox");
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", `album-select-menu-${++serial}`);
    if (select.getAttribute("aria-labelledby"))
      button.setAttribute(
        "aria-labelledby",
        select.getAttribute("aria-labelledby"),
      );
    const text = document.createElement("span");
    text.className = "album-select-value";
    const arrow = document.createElement("span");
    arrow.className = "album-select-chevron";
    arrow.setAttribute("aria-hidden", "true");
    button.append(text, arrow);
    wrapper.append(button);
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    enhanced.set(select, { button, text });
    sync(select);
    button.addEventListener("click", () =>
      active?.select === select ? close() : open(select),
    );
    button.addEventListener("keydown", (event) => keydown(event, select));
    select.addEventListener("change", () => sync(select));
    select.addEventListener("focus", () => button.focus());
    select.addEventListener("invalid", () => {
      button.focus();
    });
  }

  document.querySelectorAll("select").forEach(enhance);
  new MutationObserver((records) => {
    if (
      active &&
      (!active.select.isConnected ||
        active.select.disabled ||
        records.some((record) => active.select.contains(record.target)))
    )
      close();
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches("select")) enhance(node);
        node.querySelectorAll("select").forEach(enhance);
      }
      const select = record.target.closest?.("select");
      if (select) sync(select);
    }
    document.querySelectorAll(".album-select > select").forEach(sync);
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "selected", "label", "value"],
  });
  document.addEventListener("pointerdown", (event) => {
    if (
      active &&
      !active.menu.contains(event.target) &&
      !active.button.contains(event.target)
    )
      close();
  });
  document.addEventListener(
    "scroll",
    (event) => {
      if (
        active &&
        event.target !== active.menu &&
        !active.menu.contains(event.target)
      )
        close();
    },
    true,
  );
  window.addEventListener("resize", () => close());
  window.visualViewport?.addEventListener("resize", () => close());
  document.addEventListener("reset", (event) =>
    setTimeout(() => event.target.querySelectorAll("select").forEach(sync), 0),
  );
})();
