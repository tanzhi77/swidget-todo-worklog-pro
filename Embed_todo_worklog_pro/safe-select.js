(function (global) {
  "use strict";

  const instances = new Set();
  const bySelect = new WeakMap();
  let openInstance = null;
  let nextId = 0;

  function createIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", `#icon-${name}`);
    svg.appendChild(use);
    return svg;
  }

  function visibleOptions(instance) {
    return Array.from(instance.select.options).filter((option) => !option.hidden);
  }

  function selectedOption(instance) {
    const selected = instance.select.options[instance.select.selectedIndex];
    return selected && !selected.hidden ? selected : null;
  }

  function updateTrigger(instance) {
    const selected = selectedOption(instance);
    instance.value.textContent = selected
      ? selected.textContent
      : instance.select.getAttribute("data-placeholder") ||
        instance.select.getAttribute("aria-label") ||
        "请选择";
    instance.trigger.disabled = instance.select.disabled;
    instance.wrapper.classList.toggle("disabled", instance.select.disabled);
    if (instance.open) renderOptions(instance);
  }

  function optionButton(instance, option, index) {
    const button = document.createElement("button");
    const label = document.createElement("span");
    const selected = option === selectedOption(instance);
    button.type = "button";
    button.className = "safe-select-option";
    button.dataset.optionIndex = String(index);
    button.dataset.value = option.value;
    button.disabled = option.disabled;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(selected));
    button.classList.toggle("selected", selected);
    label.textContent = option.textContent;
    button.appendChild(label);
    if (selected) button.appendChild(createIcon("check"));
    button.addEventListener("click", () => {
      if (option.disabled) return;
      const changed = instance.select.value !== option.value;
      instance.select.value = option.value;
      updateTrigger(instance);
      close(instance, true);
      if (changed) {
        instance.select.dispatchEvent(new Event("input", { bubbles: true }));
        instance.select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    return button;
  }

  function renderOptions(instance) {
    const options = visibleOptions(instance);
    instance.menu.replaceChildren(
      ...options.map((option, index) => optionButton(instance, option, index)),
    );
    if (!options.length) {
      const empty = document.createElement("span");
      empty.className = "safe-select-empty";
      empty.textContent = "暂无选项";
      instance.menu.appendChild(empty);
    }
  }

  function positionMenu(instance) {
    if (!instance.open) return;
    const rect = instance.trigger.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      close(instance, false);
      return;
    }
    const margin = 6;
    const gap = 4;
    const width = Math.min(Math.max(rect.width, 120), Math.max(120, innerWidth - margin * 2));
    const estimatedHeight = Math.min(
      Math.max(visibleOptions(instance).length, 1) * 32 + 8,
      Math.max(120, innerHeight - margin * 2),
    );
    let left = Math.min(Math.max(rect.left, margin), innerWidth - width - margin);
    let top = rect.bottom + gap;
    if (top + estimatedHeight > innerHeight - margin && rect.top - estimatedHeight - gap >= margin) {
      top = rect.top - estimatedHeight - gap;
    }
    top = Math.min(Math.max(top, margin), Math.max(margin, innerHeight - estimatedHeight - margin));
    instance.menu.style.left = `${Math.round(left)}px`;
    instance.menu.style.top = `${Math.round(top)}px`;
    instance.menu.style.width = `${Math.round(width)}px`;
    instance.menu.style.maxHeight = `${Math.round(Math.max(120, innerHeight - margin * 2))}px`;
  }

  function enabledItems(instance) {
    return Array.from(instance.menu.querySelectorAll(".safe-select-option:not(:disabled)"));
  }

  function focusOption(instance, direction) {
    const items = enabledItems(instance);
    if (!items.length) return;
    const selectedIndex = items.findIndex((item) => item.getAttribute("aria-selected") === "true");
    const index = direction < 0 ? (selectedIndex >= 0 ? selectedIndex : items.length - 1) : Math.max(0, selectedIndex);
    items[index].focus();
  }

  function open(instance, direction) {
    if (instance.select.disabled) return;
    if (openInstance && openInstance !== instance) close(openInstance, false);
    updateTrigger(instance);
    renderOptions(instance);
    instance.open = true;
    openInstance = instance;
    instance.menu.hidden = false;
    instance.wrapper.classList.add("open");
    instance.trigger.setAttribute("aria-expanded", "true");
    positionMenu(instance);
    requestAnimationFrame(() => focusOption(instance, direction));
  }

  function close(instance, restoreFocus) {
    if (!instance || !instance.open) return;
    instance.open = false;
    instance.menu.hidden = true;
    instance.wrapper.classList.remove("open");
    instance.trigger.setAttribute("aria-expanded", "false");
    if (openInstance === instance) openInstance = null;
    if (restoreFocus && instance.trigger.isConnected) instance.trigger.focus();
  }

  function moveFocus(instance, amount) {
    const items = enabledItems(instance);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    const next = current < 0 ? 0 : (current + amount + items.length) % items.length;
    items[next].focus();
  }

  function bindKeyboard(instance) {
    instance.trigger.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      if (instance.open) close(instance, false);
      else open(instance, event.key === "ArrowUp" ? -1 : 1);
    });
    instance.menu.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(instance, event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const items = enabledItems(instance);
        if (items.length) items[event.key === "Home" ? 0 : items.length - 1].focus();
      } else if (event.key === "Tab") {
        close(instance, false);
      }
    });
  }

  function enhance(select) {
    if (!(select instanceof HTMLSelectElement)) return null;
    if (bySelect.has(select)) return bySelect.get(select);

    const wrapper = document.createElement("div");
    const trigger = document.createElement("button");
    const value = document.createElement("span");
    const menu = document.createElement("div");
    const menuId = `safe-select-menu-${++nextId}`;
    wrapper.className = "safe-select";
    wrapper.dataset.selectId = select.id || "";
    trigger.type = "button";
    trigger.className = "safe-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", menuId);
    value.className = "safe-select-value";
    menu.id = menuId;
    menu.className = "safe-select-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;
    trigger.append(value, createIcon("chevron-down"));
    wrapper.appendChild(trigger);
    select.classList.add("safe-select-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    select.insertAdjacentElement("afterend", wrapper);
    document.body.appendChild(menu);

    const instance = { select, wrapper, trigger, value, menu, open: false, observer: null };
    bySelect.set(select, instance);
    instances.add(instance);
    trigger.addEventListener("click", () => {
      if (instance.open) close(instance, false);
      else open(instance, 1);
    });
    select.addEventListener("change", () => updateTrigger(instance));
    select.addEventListener("focus", () => trigger.focus());
    bindKeyboard(instance);
    instance.observer = new MutationObserver(() => updateTrigger(instance));
    instance.observer.observe(select, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
    updateTrigger(instance);
    return instance;
  }

  function enhanceAll(root) {
    const target = root || document;
    if (target instanceof HTMLSelectElement) enhance(target);
    target.querySelectorAll?.("select").forEach(enhance);
  }

  function syncAll() {
    instances.forEach((instance) => {
      if (!instance.select.isConnected) {
        close(instance, false);
        instance.observer.disconnect();
        instance.menu.remove();
        instances.delete(instance);
        return;
      }
      updateTrigger(instance);
    });
  }

  function closeAll() {
    if (openInstance) close(openInstance, false);
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!openInstance) return;
      if (openInstance.wrapper.contains(event.target) || openInstance.menu.contains(event.target)) return;
      close(openInstance, false);
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (!openInstance || event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close(openInstance, true);
    },
    true,
  );
  window.addEventListener("resize", () => {
    if (openInstance) positionMenu(openInstance);
  });
  window.addEventListener(
    "scroll",
    () => {
      if (openInstance) positionMenu(openInstance);
    },
    true,
  );
  window.addEventListener("blur", closeAll);

  global.SafeSelect = Object.freeze({ enhanceAll, syncAll, closeAll });
  enhanceAll(document);
})(window);
