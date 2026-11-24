/* Card Album: list.js. Original vendor notices: assets/licenses. */
(() => {
  // Keep the full accessible label while abbreviating only when its allotted width is too small.
  (() => {
    const shortLabels = { パラレル: "P", ミラクル: "M" };
    const escape = (value) =>
      String(value).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
      );
    window.CARD_RARITY_LABEL = (value, classes = "pill card-rarity") => {
      const label = String(value || "");
      const text = escape(label);
      const short = shortLabels[label];
      return short
        ? `<span class="${escape(classes)} rarity-fit-label" data-rarity-full="${text}" data-rarity-short="${short}" aria-label="${text}" title="${text}"><span class="rarity-label-measure" aria-hidden="true">${text}</span></span>`
        : `<span class="${escape(classes)}">${text}</span>`;
    };
    let frame = null;
    const observed = new Set();
    const number = (value) => parseFloat(value) || 0;
    const resize = new ResizeObserver(() => schedule());
    function fit() {
      frame = null;
      const grids = new Set(document.querySelectorAll("#cards, #all-cards"));
      for (const grid of observed)
        if (!grids.has(grid)) {
          resize.unobserve(grid);
          observed.delete(grid);
        }
      for (const grid of grids)
        if (!observed.has(grid)) {
          observed.add(grid);
          resize.observe(grid);
        }
      for (const label of document.querySelectorAll(
        "#cards .rarity-fit-label, #all-cards .rarity-fit-label",
      )) {
        const parent = label.parentElement;
        if (!label.getClientRects().length) continue;
        const parentStyle = getComputedStyle(parent);
        const available =
          parent.clientWidth - number(parentStyle.paddingLeft) - number(parentStyle.paddingRight);
        const style = getComputedStyle(label);
        const fullWidth =
          label.querySelector(".rarity-label-measure").getBoundingClientRect().width +
          number(style.paddingLeft) +
          number(style.paddingRight) +
          number(style.borderLeftWidth) +
          number(style.borderRightWidth);
        const limit = label.classList.contains("card-rarity") ? available * 0.4 : available;
        label.classList.toggle("is-abbreviated", fullWidth > limit + 0.5);
      }
    }
    function schedule() {
      if (frame === null) frame = requestAnimationFrame(fit);
    }
    new MutationObserver((records) => {
      if (records.some((record) => record.type === "childList" || record.target === document.body))
        schedule();
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    document.fonts?.ready.then(schedule);
    window.addEventListener("resize", schedule, { passive: true });
    schedule();
  })();
  const { modules, loadModule, ensureQRBundle, ensureQREncoder } = window.CARD_RUNTIME;
  modules["card-image-transform.js"] = function (sourceURL) {
    (() => {
      "use strict";

      const defaults = { x: 0, y: 0, zoom: 1, angle: 0 };
      const limits = {
        x: [-1000, 1000],
        y: [-1000, 1000],
        zoom: [0.25, 20],
        angle: [-180, 180],
      };
      const keys = Object.keys(defaults);
      function normalize(value) {
        if (!value || typeof value !== "object") return null;
        if (
          !keys.every((key) => {
            const [min, max] = limits[key];
            return Number.isFinite(value[key]) && value[key] >= min && value[key] <= max;
          })
        )
          return null;
        return Object.fromEntries(keys.map((key) => [key, value[key]]));
      }

      const css = ({ x, y, zoom, angle }) =>
        `translate(${x}%, ${y}%) scale(${zoom}) rotate(${angle}deg)`;
      function wrap(markup, transform) {
        const value = normalize(transform);
        return value
          ? `<span class="card-crop-frame" style="--card-crop:${css(value)}">${markup}</span>`
          : markup;
      }
      function apply(image, transform) {
        if (!image) return;
        const value = normalize(transform);
        let frame = image.parentElement;
        if (frame?.classList.contains("card-crop-frame")) {
          if (!value) {
            frame.replaceWith(image);
            return;
          }
        } else {
          if (!value) return;
          frame = document.createElement("span");
          frame.className = "card-crop-frame";
          image.before(frame);
          frame.append(image);
        }
        frame.style.setProperty("--card-crop", css(value));
      }

      window.CARD_IMAGE_TRANSFORM = Object.freeze({
        defaults: Object.freeze(defaults),
        normalize,
        wrap,
        apply,
      });
    })();
  };

  modules["coordinate-assets.js"] = function (sourceURL) {
    (() => {
      "use strict";
      const root = new URL("../images/", sourceURL);
      const version = "20261122-coordinate-idol-final-v108";
      const entries = [
        ["full", "フルコーデ", ["full", "フル", "フルコーデ", "coordinate"]],
        ["onepiece", "ワンピ", ["onepiece", "one-piece", "dress", "ワンピ", "ワンピース"]],
        ["tops", "トップス", ["tops", "top", "トップス"]],
        ["bottoms", "ボトムス", ["bottoms", "bottom", "ボトムス"]],
        ["shoes", "シューズ", ["shoes", "shoe", "シューズ", "くつ", "靴"]],
        ["accessory", "アクセサリー", ["accessory", "accessories", "アクセ", "アクセサリー"]],
      ];
      const aliases = new Map();
      for (const [kind, label, names] of entries) {
        const asset = Object.freeze({
          kind,
          label,
          url: new URL((kind === "full" ? "fullcode" : kind) + ".png?v=" + version, root).href,
        });
        for (const name of names) aliases.set(name, asset);
      }
      function resolve(slot = "full") {
        return (
          aliases.get(
            String(slot ?? "full")
              .normalize("NFKC")
              .trim()
              .toLowerCase(),
          ) || null
        );
      }
      const escape = (value) =>
        String(value).replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c],
        );
      function markup(slot = "full") {
        const asset = resolve(slot);
        if (!asset) return "";
        return (
          '<span class="coordinate-asset-placeholder" data-coordinate-asset="' +
          asset.kind +
          '" role="img" aria-label="' +
          escape(asset.label) +
          '：画像未登録"><img src="' +
          escape(asset.url) +
          '" width="320" height="400" alt="" aria-hidden="true" loading="lazy" decoding="async"></span>'
        );
      }
      let installed;
      function install() {
        const ui = window.CARD_UI;
        if (!ui || ui === installed) return;
        const previous = ui.coordinatePlaceholder;
        installed = Object.freeze({
          ...ui,
          coordinatePlaceholder(slot = "full") {
            return (
              markup(slot) ||
              (typeof previous === "function"
                ? previous.call(ui, slot)
                : '<span class="catalog-image-unavailable">画像なし</span>')
            );
          },
        });
        window.CARD_UI = installed;
      }
      window.CARD_COORDINATE_ASSETS = Object.freeze({
        resolve,
        markup,
        install,
      });
      install();
    })();
  };

  modules["multi-filter.js"] = function (sourceURL) {
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
        } catch {
          return [value];
        }
      }
      function pack(items) {
        const list = [...new Set(items.filter(Boolean))];
        return list.length > 1 ? prefix + JSON.stringify(list) : list[0] || "";
      }
      function edition(value) {
        return String(value ?? "").replace(
          /【?おねがいアイプリ\s*】?\s*(?:第)?([0-9０-９]+)\s*(?:だん|弾)】?/gu,
          (_, number) => number.normalize("NFKC") + "だん",
        );
      }
      function text(value, label = edition) {
        return values(value).map(label).join(" ／ ");
      }
      function matches(actual, selection) {
        const chosen = values(selection);
        return (
          !chosen.length ||
          chosen.some((v) => (Array.isArray(actual) ? actual : [actual]).includes(v))
        );
      }
      function retain(selection, options) {
        return pack(values(selection).filter((v) => options.includes(v)));
      }
      function optionsText(options, selection) {
        return text(selection, (v) =>
          edition(options.find((option) => option.value === v)?.text || v),
        );
      }
      window.CARD_MULTI_FILTER = Object.freeze({
        values,
        pack,
        text,
        matches,
        retain,
        optionsText,
        enhance,
        edition,
      });

      const selector = [
        "select[data-filter]",
        "select[data-all-filter]",
        "select[data-public-filter]",
        "#verse-series",
        "#verse-group",
        "#primagi-rarity",
        "#primagi-verse-compat",
        "#verse-collection-series",
        "#trade-series",
        "#trade-rarity",
        "#trade-group",
        "select[data-image-multiple]",
        "select[data-trade-multiple]",
      ].join(",");
      const controls = new WeakMap();
      let active = null;
      let serial = 0;

      function closeMenu(restoreFocus = false) {
        if (!active) return;
        const previous = active;
        active = null;
        if (previous.list.hasAttribute("popover")) {
          try {
            previous.list.hidePopover();
          } catch {}
        }
        previous.list.remove();
        previous.wrapper.removeAttribute("open");
        previous.button.setAttribute("aria-expanded", "false");
        if (restoreFocus && previous.button.isConnected)
          previous.button.focus({ preventScroll: true });
      }

      function positionMenu() {
        if (!active) return;
        const { button, list, select } = active;
        if (!button.isConnected || select.disabled) {
          closeMenu();
          return;
        }
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
        list.style.left =
          Math.max(leftEdge + 12, Math.min(rect.left, leftEdge + width - menuWidth - 12)) + "px";
        list.style.top =
          (upwards
            ? Math.max(topEdge + 12, rect.top - Math.min(list.scrollHeight, maxHeight) - 6)
            : rect.bottom + 6) + "px";
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
          try {
            list.showPopover();
          } catch {
            list.removeAttribute("popover");
          }
        }
        active = state;
        wrapper.setAttribute("open", "");
        button.setAttribute("aria-expanded", "true");
        positionMenu();
      }

      function enhance(select) {
        if (controls.has(select)) return;
        const initial = select.multiple
          ? pack([...select.selectedOptions].map((o) => o.value))
          : select.value;
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
        label
          ?.querySelectorAll("button, select, input, .album-select, .multi-filter")
          .forEach((node) => node.remove());
        const caption =
          select.getAttribute("aria-label") || label?.textContent.trim() || "絞り込み";
        list.setAttribute("role", "dialog");
        list.setAttribute("aria-label", caption + "を複数選択");
        select.before(wrapper);
        wrapper.append(button, select);
        select.classList.add("multi-filter-source");
        select.tabIndex = -1;
        select.setAttribute("aria-hidden", "true");
        Object.defineProperty(select, "value", {
          configurable: true,
          get() {
            return pack([...this.selectedOptions].map((o) => o.value));
          },
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
            ? chosen
                .map((v) => edition(available.find((o) => o.value === v)?.textContent || v))
                .join(" ／ ")
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
          get() {
            return active === state;
          },
          set(value) {
            if (value && active !== state) openMenu(state);
            else if (!value && active === state) closeMenu();
          },
        });
        button.addEventListener("click", () => (active === state ? closeMenu() : openMenu(state)));
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
      }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["disabled", "selected"],
      });
      document.querySelectorAll(selector).forEach(enhance);
      document.addEventListener("click", (event) => {
        if (active && !active.wrapper.contains(event.target) && !active.list.contains(event.target))
          closeMenu();
      });
      document.addEventListener(
        "keydown",
        (event) => {
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
              if (
                (event.shiftKey && event.target === inputs[0]) ||
                (!event.shiftKey && event.target === inputs.at(-1))
              )
                closeMenu(true);
            }
          }
        },
        true,
      );
      window.addEventListener("resize", positionMenu, { passive: true });
      window.visualViewport?.addEventListener("resize", positionMenu, {
        passive: true,
      });
      window.visualViewport?.addEventListener("scroll", positionMenu, {
        passive: true,
      });
      document.addEventListener(
        "scroll",
        (event) => {
          if (active && !active.list.contains(event.target)) closeMenu();
        },
        { capture: true, passive: true },
      );
      document.addEventListener(
        "close",
        (event) => {
          if (active && event.target.contains(active.select)) closeMenu();
        },
        true,
      );
    })();
  };
})();
