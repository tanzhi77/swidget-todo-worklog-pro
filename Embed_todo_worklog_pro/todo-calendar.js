(function (global) {
  "use strict";

  const Todo = global.TodoPro;
  const Holidays = global.TodoHolidays;
  global.addEventListener("host-file-result", (event) => showToast(event.detail));
  const byId = (id) => document.getElementById(id);
  const dom = {
    loading: byId("calendarLoading"),
    app: byId("calendarApp"),
    summary: byId("calendarSummary"),
    monthTitle: byId("monthTitle"),
    search: byId("calendarSearch"),
    tagFilter: byId("calendarTagFilter"),
    grid: byId("monthGrid"),
    selectedTitle: byId("selectedDateTitle"),
    selectedSummary: byId("selectedDateSummary"),
    entryList: byId("dayEntryList"),
    form: byId("calendarWorkForm"),
    formTitle: byId("calendarWorkFormTitle"),
    title: byId("calendarWorkTitle"),
    date: byId("calendarWorkDate"),
    tags: byId("calendarWorkTags"),
    notes: byId("calendarWorkNotes"),
    deleteButton: byId("deleteCalendarWorkButton"),
    toast: byId("calendarToast"),
    toastMessage: byId("calendarToastMessage"),
    undoButton: byId("calendarUndoButton"),
  };

  const now = new Date();
  const ui = {
    year: now.getFullYear(),
    month: now.getMonth(),
    selectedDate: Todo.localDateKey(now),
    filter: "all",
    search: "",
    tag: "all",
    editingWorkId: null,
  };
  let controller = null;
  let undoState = null;
  let toastTimer = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function icon(name) {
    return `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  }

  function showToast(message, snapshot) {
    clearTimeout(toastTimer);
    undoState = snapshot || null;
    dom.toastMessage.textContent = message;
    dom.undoButton.hidden = !undoState;
    dom.toast.hidden = false;
    toastTimer = setTimeout(() => {
      dom.toast.hidden = true;
      undoState = null;
    }, snapshot ? 7000 : 3500);
  }

  async function updateState(mutator, message, undoable) {
    const snapshot = undoable ? Todo.clone(controller.state) : null;
    try {
      await controller.update(mutator);
      if (message) showToast(message, snapshot);
      return true;
    } catch (error) {
      if (error && error.code === "STATE_CONFLICT") {
        showToast("数据已在主窗口更新，表单内容已保留，请再次保存");
      } else {
        console.error(error);
        showToast(error && error.message ? error.message : "操作失败");
      }
      return false;
    }
  }

  function setTagOptions(tags) {
    const allowed = tags.filter((tag) => tag !== Todo.WORK_TAG);
    if (!allowed.includes(ui.tag)) ui.tag = "all";
    dom.tagFilter.replaceChildren();
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "全部标签";
    dom.tagFilter.appendChild(all);
    allowed.forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      dom.tagFilter.appendChild(option);
    });
    dom.tagFilter.value = ui.tag;
  }

  function entryBadges(entry) {
    if (entry.kind === "both") {
      return '<span class="entry-kind work-kind">工作项</span><span class="entry-kind done-kind">已办</span>';
    }
    if (entry.kind === "work") {
      return `<span class="entry-kind work-kind">工作项</span>${
        entry.source === "todo" ? '<span class="source-badge">' + (entry.pending ? "未完成" : "已完成") + '</span>' : ""
      }`;
    }
    return '<span class="entry-kind done-kind">已办</span>';
  }

  function dayEntryCard(entry) {
    const tags = entry.tags
      .map((tag) => `<span class="tag-chip">${icon("tag")}${escapeHtml(tag)}</span>`)
      .join("");
    const editable = entry.kind === "work" && entry.source === "manual" && entry.workItemId;
    return `<article class="day-entry-card ${escapeHtml(entry.kind)}">
      <div class="day-entry-heading"><div>${entryBadges(entry)}</div><strong>${escapeHtml(
        entry.title,
      )}</strong></div>
      ${entry.notes ? `<p>${escapeHtml(entry.notes)}</p>` : ""}
      ${tags ? `<div class="item-meta">${tags}</div>` : ""}
      ${
        editable
          ? `<div class="day-entry-actions"><button class="icon-button small" type="button" data-action="edit-work" data-id="${escapeHtml(
              entry.workItemId,
            )}" title="编辑" aria-label="编辑">${icon(
              "pencil",
            )}</button><button class="icon-button small danger-icon" type="button" data-action="delete-work" data-id="${escapeHtml(
              entry.workItemId,
            )}" title="删除" aria-label="删除">${icon("trash")}</button></div>`
          : ""
      }
    </article>`;
  }

  function renderGrid(entries) {
    const grouped = new Map();
    entries.forEach((entry) => {
      if (!grouped.has(entry.date)) grouped.set(entry.date, []);
      grouped.get(entry.date).push(entry);
    });
    const cells = Todo.getMonthGrid(ui.year, ui.month);
    dom.grid.innerHTML = cells
      .map((cell) => {
        const dayEntries = grouped.get(cell.date) || [];
        const holiday = Holidays.getDay(cell.date);
        const holidayDescription = holiday ? " · " + holiday.description : "";
        const previews = dayEntries
          .map(
            (entry) => `<span class="calendar-entry ${escapeHtml(entry.kind)}" title="${escapeHtml(
              entry.title,
            )}"><i></i><span class="calendar-entry-title">${escapeHtml(entry.title)}</span></span>`,
          )
          .join("");
        return `<button type="button" class="day-cell${cell.inMonth ? "" : " outside"}${
          cell.isToday ? " today" : ""
        }${cell.date === ui.selectedDate ? " selected" : ""}" data-date="${cell.date}" aria-label="${escapeHtml(
          Todo.formatDateLabel(cell.date, true) + holidayDescription,
        )}" title="${escapeHtml(Todo.formatDateLabel(cell.date, true) + holidayDescription)}">
          <span class="date-cell-heading"><span class="day-number">${cell.day}${cell.isToday ? "<em>今</em>" : ""}</span>${holiday ? '<span class="holiday-badge ' + holiday.type + '">' + holiday.label + '</span>' : ""}</span>
          ${holiday ? '<span class="holiday-name ' + holiday.type + '">' + escapeHtml(holiday.name) + '</span>' : ""}
          <span class="calendar-entry-stack">${previews}</span>
        </button>`;
      })
      .join("");
  }

  function renderDetail(entries) {
    const selectedEntries = entries.filter((entry) => entry.date === ui.selectedDate);
    dom.selectedTitle.textContent = Todo.formatDateLabel(ui.selectedDate, true);
    const holiday = Holidays.getDay(ui.selectedDate);
    dom.selectedSummary.textContent = `${selectedEntries.length} 条记录` + (holiday ? " · " + holiday.description : "");
    dom.entryList.innerHTML = selectedEntries.length
      ? selectedEntries.map(dayEntryCard).join("")
      : '<div class="empty-state compact"><span class="empty-symbol"><svg><use href="#icon-notebook"></use></svg></span><strong>暂无记录</strong><p>当前日期无工作项或已办</p></div>';
  }

  function render(state) {
    const holidaySource = Holidays.getSource(ui.year);
    byId("holidayScheduleStatus").textContent = holidaySource ? "休 假期 · 班 调休上班" : ui.year + " 年节假日数据未收录";
    byId("holidayScheduleStatus").title = holidaySource ? ui.year + "年中国大陆放假安排 · " + holidaySource.document : "当前离线数据包含 " + Holidays.years.join("、") + " 年";
    document.body.classList.toggle("wrap-entries", Boolean(state.settings.calendarWrap));
    byId("toggleWrapButton").setAttribute("aria-pressed", String(Boolean(state.settings.calendarWrap)));
    document.body.dataset.theme = state.settings.theme;
    document.body.dataset.density = state.settings.density;
    setTagOptions(Todo.getAllTags(state));
    global.SafeSelect?.syncAll();
    const entries = Todo.getCalendarEntries(state, {
      year: ui.year,
      month: ui.month,
      filter: ui.filter,
      search: ui.search,
      tag: ui.tag,
    });
    const dateCount = new Set(entries.map((entry) => entry.date)).size;
    dom.monthTitle.textContent = Todo.formatMonthTitle(ui.year, ui.month);
    dom.summary.textContent = `${entries.length} 条记录 · ${dateCount} 个有记录日期`;
    document.querySelectorAll("[data-calendar-filter]").forEach((button) => {
      const active = button.dataset.calendarFilter === ui.filter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    renderGrid(entries);
    renderDetail(entries);
  }

  function moveMonth(amount) {
    const target = new Date(ui.year, ui.month + amount, 1, 12, 0, 0, 0);
    ui.year = target.getFullYear();
    ui.month = target.getMonth();
    ui.selectedDate = Todo.localDateKey(target);
    closeWorkForm();
    render(controller.state);
  }

  function selectDate(dateKey) {
    const date = Todo.parseDateKey(dateKey);
    if (!date) return;
    if (date.getFullYear() !== ui.year || date.getMonth() !== ui.month) {
      ui.year = date.getFullYear();
      ui.month = date.getMonth();
    }
    ui.selectedDate = dateKey;
    if (ui.editingWorkId === null && !dom.form.hidden) dom.date.value = dateKey;
    render(controller.state);
  }

  function openWorkForm(workId) {
    ui.editingWorkId = workId || null;
    if (workId) {
      const item = controller.state.workItems.find((entry) => entry.id === workId);
      if (!item || item.source !== "manual") return;
      dom.formTitle.textContent = "编辑工作项";
      dom.title.value = item.title;
      dom.date.value = item.workDate;
      dom.tags.value = item.tags.join("，");
      dom.notes.value = item.notes;
      dom.deleteButton.hidden = false;
    } else {
      dom.formTitle.textContent = "补录工作项";
      dom.title.value = "";
      dom.date.value = ui.selectedDate;
      dom.tags.value = "";
      dom.notes.value = "";
      dom.deleteButton.hidden = true;
    }
    dom.form.hidden = false;
    setTimeout(() => dom.title.focus(), 0);
  }

  function closeWorkForm() {
    ui.editingWorkId = null;
    dom.form.hidden = true;
  }

  function normalizeAccent(color) {
    const value = String(color || "").trim();
    if (/^#[0-9a-f]{8}$/i.test(value)) return `#${value.slice(3)}${value.slice(1, 3)}`;
    return /^#[0-9a-f]{3,6}$/i.test(value) ? value : "#2563eb";
  }

  function bindEvents() {
    const report = byId("reportBackdrop");
    const reportStart = byId("reportStart"), reportEnd = byId("reportEnd");
    function updateReport() {
      try {
        const text = Todo.exportWorkReport(controller.state, reportStart.value, reportEnd.value);
        byId("reportPreview").value = text;
        byId("reportStatus").textContent = text ? text.split("\r\n").length + " 项工作项" : "所选日期范围内没有工作项";
        byId("saveReportButton").disabled = !text;
        byId("copyReportButton").disabled = !text;
      } catch (error) {
        byId("reportPreview").value = "";
        byId("reportStatus").textContent = error.message;
        byId("saveReportButton").disabled = true;
        byId("copyReportButton").disabled = true;
      }
    }
    function resetReportRange(currentWeek = 1) {
      const range = Todo.currentBiweek(new Date(), currentWeek);
      byId("reportFirstWeek").setAttribute("aria-pressed", String(currentWeek === 1));
      byId("reportSecondWeek").setAttribute("aria-pressed", String(currentWeek === 2));
      reportStart.value = range.start;
      reportEnd.value = range.end;
      reportStart.setCustomValidity("");
      reportEnd.setCustomValidity("");
      updateReport();
    }
    function closeReport() { global.SafeSelect?.closeAll(); report.hidden = true; byId("exportReportButton").focus(); }
    byId("exportReportButton").addEventListener("click", () => {
      resetReportRange(); report.hidden = false; reportStart.focus();
    });
    byId("reportFirstWeek").addEventListener("click", () => resetReportRange(1));
    byId("reportSecondWeek").addEventListener("click", () => resetReportRange(2));
    [reportStart, reportEnd].forEach((input) => input.addEventListener("input", () => {
      byId("reportFirstWeek").setAttribute("aria-pressed", "false");
      byId("reportSecondWeek").setAttribute("aria-pressed", "false");
      updateReport();
    }));
    byId("closeReportButton").addEventListener("click", closeReport);
    byId("cancelReportButton").addEventListener("click", closeReport);
    byId("copyReportButton").addEventListener("click", async () => {
      updateReport();
      if (byId("copyReportButton").disabled) return;
      const preview = byId("reportPreview");
      if (global.portableHost?.copyText) {
        try { await global.portableHost.copyText(preview.value); showToast("已复制双周报"); }
        catch (_error) { showToast("复制失败，请选中预览内容手动复制"); }
        return;
      }
      const start = preview.selectionStart, end = preview.selectionEnd;
      const scrollTop = preview.scrollTop;
      let copied = false;
      try {
        preview.focus();
        preview.select();
        copied = document.execCommand("copy");
      } catch (_error) {
        copied = false;
      } finally {
        preview.setSelectionRange(start, end);
        preview.scrollTop = scrollTop;
        byId("copyReportButton").focus();
      }
      if (!copied && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(preview.value);
          copied = true;
        } catch (_error) { copied = false; }
      }
      showToast(copied ? "已复制双周报" : "复制失败，请选中预览内容手动复制");
    });
    report.addEventListener("click", (event) => { if (event.target === report) closeReport(); });
    report.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); closeReport(); } });
    byId("reportForm").addEventListener("submit", (event) => {
      event.preventDefault();
      updateReport();
      if (byId("saveReportButton").disabled) return;
      Todo.downloadText("双周报-" + reportStart.value + "-至-" + reportEnd.value + ".txt",
        "\uFEFF" + byId("reportPreview").value + "\r\n", "text/plain;charset=utf-8");
      showToast("正在请求保存双周报 TXT");
    });
    byId("toggleWrapButton").addEventListener("click", () => updateState((draft) => {
      draft.settings.calendarWrap = !draft.settings.calendarWrap;
    }));
    byId("previousMonthButton").addEventListener("click", () => moveMonth(-1));
    byId("nextMonthButton").addEventListener("click", () => moveMonth(1));
    byId("todayMonthButton").addEventListener("click", () => {
      const today = new Date();
      ui.year = today.getFullYear();
      ui.month = today.getMonth();
      ui.selectedDate = Todo.localDateKey(today);
      closeWorkForm();
      render(controller.state);
    });

    document.querySelector(".calendar-filters").addEventListener("click", (event) => {
      const button = event.target.closest("[data-calendar-filter]");
      if (!button) return;
      ui.filter = button.dataset.calendarFilter;
      render(controller.state);
    });
    dom.search.addEventListener("input", () => {
      ui.search = dom.search.value.trim();
      render(controller.state);
    });
    dom.tagFilter.addEventListener("change", () => {
      ui.tag = dom.tagFilter.value;
      render(controller.state);
    });
    dom.grid.addEventListener("click", (event) => {
      const cell = event.target.closest("[data-date]");
      if (cell) selectDate(cell.dataset.date);
    });

    byId("addCalendarWorkButton").addEventListener("click", () => openWorkForm());
    byId("cancelCalendarWorkButton").addEventListener("click", closeWorkForm);
    dom.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const targetDate = dom.date.value || ui.selectedDate;
      const editingId = ui.editingWorkId;
      const saved = await updateState((draft) => {
        const input = {
          title: dom.title.value,
          workDate: targetDate,
          tags: Todo.tagsFromText(dom.tags.value),
          notes: dom.notes.value,
        };
        if (editingId) Todo.updateWorkItem(draft, editingId, input);
        else draft.workItems.unshift(Todo.createManualWorkItem(input));
      }, editingId ? "已保存工作项" : "已补录工作项");
      if (saved) {
        closeWorkForm();
        if (ui.filter === "completed") ui.filter = "all";
        selectDate(targetDate);
      }
    });
    dom.deleteButton.addEventListener("click", async () => {
      const id = ui.editingWorkId;
      if (!id) return;
      const saved = await updateState(
        (draft) => Todo.removeWorkItem(draft, id),
        "已删除工作项",
        true,
      );
      if (saved) closeWorkForm();
    });
    dom.entryList.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-action]");
      if (!action) return;
      if (action.dataset.action === "edit-work") openWorkForm(action.dataset.id);
      if (action.dataset.action === "delete-work") {
        await updateState(
          (draft) => Todo.removeWorkItem(draft, action.dataset.id),
          "已删除工作项",
          true,
        );
      }
    });

    byId("exportCsvButton").addEventListener("click", () => {
      const month = String(ui.month + 1).padStart(2, "0");
      Todo.downloadText(
        `worklog-${ui.year}-${month}.csv`,
        Todo.exportMonthCsv(controller.state, ui.year, ui.month),
        "text/csv;charset=utf-8",
      );
      showToast("正在请求保存当前月份 CSV");
    });

    byId("closeCalendarButton").addEventListener("click", async () => {
      const embedded = new URLSearchParams(global.location.search).get("embedded") === "1";
      if (embedded) {
        global.location.href = "todo.html";
        return;
      }
      try {
        await controller.closeCalendar();
        if (!global.qt && !global.opener) global.location.href = "todo.html";
      } catch (_error) {
        global.location.href = "todo.html";
      }
    });

    dom.undoButton.addEventListener("click", async () => {
      if (!undoState) return;
      const snapshot = undoState;
      undoState = null;
      try {
        await controller.replace(snapshot);
        showToast("已撤销上一步操作");
      } catch (error) {
        showToast(error && error.message ? error.message : "撤销失败");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dom.form.hidden) closeWorkForm();
    });
  }

  async function init() {
    if (!Todo) throw new Error("todo-core.js 未加载");
    controller = await Todo.createController();
    bindEvents();
    controller.subscribe(render);
    controller.onTheme((color) => {
      document.documentElement.style.setProperty("--accent", normalizeAccent(color));
    });
    render(controller.state);
    dom.loading.hidden = true;
    dom.app.hidden = false;
    global.__todoCalendarController = controller;
    global.__todoCalendarReady = true;
  }

  init().catch((error) => {
    console.error(error);
    dom.loading.textContent = `加载失败：${error.message || "未知错误"}`;
    dom.loading.classList.add("error");
  });
})(window);
