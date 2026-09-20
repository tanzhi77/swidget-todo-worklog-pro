(function () {
  "use strict";
  const pad = (n) => String(n).padStart(2, "0");
  const key = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  let active = null;
  const panel = document.createElement("div");
  panel.className = "date-picker";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "日期时间选择");
  document.body.append(panel);
  function close() { panel.hidden = true; active = null; }
  function button(label, action) {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.addEventListener("click", action);
    return node;
  }
  function choose(value) {
    const input = active;
    input.value = value;
    input.setCustomValidity("");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    close();
    input.focus();
  }
  function position() {
    const rect = active.getBoundingClientRect();
    panel.style.left = Math.max(4, Math.min(rect.left, innerWidth - panel.offsetWidth - 4)) + "px";
    panel.style.top = Math.max(4, Math.min(rect.bottom + 4, innerHeight - panel.offsetHeight - 4)) + "px";
  }
  function calendar(date) {
    panel.replaceChildren();
    const header = document.createElement("div");
    header.className = "picker-header";
    header.append(button("‹", () => calendar(new Date(date.getFullYear(), date.getMonth() - 1, 1))));
    const title = document.createElement("strong");
    title.textContent = date.getFullYear() + "年" + (date.getMonth() + 1) + "月";
    header.append(title, button("›", () => calendar(new Date(date.getFullYear(), date.getMonth() + 1, 1))));
    header.firstChild.setAttribute("aria-label", "上个月");
    header.lastChild.setAttribute("aria-label", "下个月");
    panel.append(header);
    const grid = document.createElement("div");
    grid.className = "picker-grid";
    ["一", "二", "三", "四", "五", "六", "日"].forEach((label) => {
      const cell = document.createElement("span"); cell.textContent = label; grid.append(cell);
    });
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    for (let i = 0; i < 42; i++) {
      const day = new Date(date.getFullYear(), date.getMonth(), i - offset + 1);
      const cell = button(String(day.getDate()), () => choose(key(day)));
      cell.setAttribute("aria-label", key(day));
      if (day.getMonth() !== date.getMonth()) cell.classList.add("muted");
      if (key(day) === active.value) cell.classList.add("selected");
      grid.append(cell);
    }
    panel.append(grid);
    footer();
  }
  function footer() {
    const row = document.createElement("div");
    row.className = "picker-header";
    row.append(button("清空", () => choose("")), button("关闭", close));
    panel.append(row); position();
  }
  function open(input) {
    active = input; panel.hidden = false;
    if (input.dataset.picker === "date") {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? new Date(input.value + "T12:00:00") : new Date();
      calendar(Number.isNaN(date.getTime()) ? new Date() : date);
    } else {
      panel.replaceChildren();
      const row = document.createElement("div"); row.className = "picker-header";
      const values = (input.value || "09:00").split(":");
      const fields = [23, 59].map((max, i) => {
        const field = document.createElement("input");
        field.type = "number"; field.min = "0"; field.max = String(max); field.value = values[i];
        field.setAttribute("aria-label", i ? "分钟" : "小时"); row.append(field); return field;
      });
      row.append(button("确定", () => {
        if (fields.every((f) => f.value !== "" && f.checkValidity())) choose(fields.map((f) => pad(Number(f.value))).join(":"));
      }));
      panel.append(row); footer();
    }
  }
  document.querySelectorAll("input[data-picker]").forEach((input) => {
    input.autocomplete = "off";
    input.addEventListener("click", () => open(input));
    input.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); open(input); } });
    input.addEventListener("input", () => {
      const value = input.value;
      let valid = !value;
      if (input.dataset.picker === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const date = new Date(value + "T12:00:00"); valid = !Number.isNaN(date.getTime()) && key(date) === value;
      }
      if (input.dataset.picker === "time") valid = !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      input.setCustomValidity(valid ? "" : "请输入有效的" + (input.dataset.picker === "date" ? "日期 YYYY-MM-DD" : "时间 HH:mm"));
    });
  });
  document.addEventListener("pointerdown", (e) => { if (active && e.target !== active && !panel.contains(e.target)) close(); }, true);
  document.addEventListener("keydown", (e) => { if (active && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
  window.addEventListener("resize", close);
})();
