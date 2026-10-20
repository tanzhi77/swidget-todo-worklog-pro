(function (global) {
  "use strict";

  const Todo = global.TodoPro;
  global.addEventListener("host-file-result", (event) => showToast(event.detail));
  const byId = (id) => document.getElementById(id);
  const dom = {
    app: byId("app"),
    loading: byId("loadingState"),
    headerSummary: byId("headerSummary"),
    todoTab: byId("todoTab"),
    workTab: byId("workTab"),
    quickForm: byId("quickForm"),
    quickInput: byId("quickInput"),
    quickWorkDate: byId("quickWorkDate"),
    todoControls: byId("todoControls"),
    workControls: byId("workControls"),
    workViewDate: byId("workViewDate"),
    todoSearch: byId("todoSearch"),
    workSearch: byId("workSearch"),
    priorityFilter: byId("priorityFilter"),
    todoTagFilter: byId("todoTagFilter"),
    workTagFilter: byId("workTagFilter"),
    sortMode: byId("sortMode"),
    itemList: byId("itemList"),
    listSummary: byId("listSummary"),
    contextAction: byId("contextActionButton"),
    editorBackdrop: byId("editorBackdrop"),
    editorTitle: byId("editorTitle"),
    taskForm: byId("taskForm"),
    taskTitle: byId("taskTitle"),
    taskNotes: byId("taskNotes"),
    taskDueDate: byId("taskDueDate"),
    taskDueTime: byId("taskDueTime"),
    taskPriority: byId("taskPriority"),
    taskRecurrence: byId("taskRecurrence"),
    taskTags: byId("taskTags"),
    taskWorkToggle: byId("taskWorkToggle"),
    subtaskEditor: byId("subtaskEditor"),
    deleteTask: byId("deleteTaskButton"),
    workForm: byId("workForm"),
    workTitle: byId("workTitle"),
    workDate: byId("workDate"),
    workTags: byId("workTags"),
    workNotes: byId("workNotes"),
    deleteWork: byId("deleteWorkButton"),
    settingsBackdrop: byId("settingsBackdrop"),
    themeSetting: byId("themeSetting"),
    densitySetting: byId("densitySetting"),
    defaultViewSetting: byId("defaultViewSetting"),
    defaultSortSetting: byId("defaultSortSetting"),
    legacySection: byId("legacySection"),
    importFile: byId("importFileInput"),
    toast: byId("toast"),
    toastMessage: byId("toastMessage"),
    undoButton: byId("undoButton"),
  };

  let controller = null;
  let toastTimer = null;
  let importMode = "merge";
  let dragTaskId = null;
  let undoState = null;
  let menuTrigger = null;
  const taskMenu = document.createElement("div");
  taskMenu.id = "taskMoreMenu";
  taskMenu.className = "task-more-menu";
  taskMenu.setAttribute("role", "menu");
  taskMenu.setAttribute("aria-label", "待办更多操作");
  taskMenu.hidden = true;
  document.body.appendChild(taskMenu);

  function closeTaskMenu(restoreFocus = false) {
    if (menuTrigger) {
      menuTrigger.setAttribute("aria-expanded", "false");
      if (restoreFocus && menuTrigger.isConnected) menuTrigger.focus({ preventScroll: true });
    }
    taskMenu.hidden = true;
    menuTrigger = null;
  }

  function openTaskMenu(id) {
    const task = controller.state.tasks.find((item) => item.id === id);
    const trigger = Array.from(dom.itemList.querySelectorAll('[data-action="more-task"]')).find((button) => button.dataset.id === id);
    if (!task || !trigger) return;
    if (menuTrigger === trigger && !taskMenu.hidden) { closeTaskMenu(true); return; }
    closeTaskMenu();
    global.SafeSelect?.closeAll();
    menuTrigger = trigger;
    const options = task.status === "completed" ? [["archive-task", "归档", "archive"]]
      : task.status === "archived" ? [["restore-task", "恢复到已完成", "restore"]] : [];
    options.push(["delete-task", "删除", "trash"]);
    taskMenu.innerHTML = options.map(([action, label, symbol]) =>
      '<button type="button" role="menuitem" class="task-menu-item' + (action === "delete-task" ? ' danger-text-button' : '') + '" data-action="' + action + '" data-id="' + escapeHtml(id) + '">' + icon(symbol) + escapeHtml(label) + '</button>').join("");
    taskMenu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const box = trigger.getBoundingClientRect();
    taskMenu.style.left = Math.max(4, Math.min(box.right - taskMenu.offsetWidth, innerWidth - taskMenu.offsetWidth - 4)) + "px";
    taskMenu.style.top = Math.max(4, Math.min(box.bottom + 4, innerHeight - taskMenu.offsetHeight - 4)) + "px";
    taskMenu.querySelector("button").focus({ preventScroll: true });
  }

  document.addEventListener("pointerdown", (event) => {
    if (menuTrigger && !taskMenu.contains(event.target) && !menuTrigger.contains(event.target)) closeTaskMenu();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (menuTrigger && event.key === "Escape") {
      event.preventDefault(); event.stopImmediatePropagation(); closeTaskMenu(true);
    }
  }, true);
  taskMenu.addEventListener("keydown", (event) => {
    if (event.key === "Tab") { closeTaskMenu(true); return; }
    const buttons = Array.from(taskMenu.querySelectorAll("button"));
    let index = buttons.indexOf(document.activeElement);
    if (event.key === "ArrowDown") index = (index + 1) % buttons.length;
    else if (event.key === "ArrowUp") index = (index + buttons.length - 1) % buttons.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = buttons.length - 1;
    else return;
    event.preventDefault(); buttons[index].focus();
  });
  taskMenu.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    closeTaskMenu(true);
    handleItemAction(button.dataset.action, button.dataset.id);
  });
  global.addEventListener("resize", () => closeTaskMenu());
  global.addEventListener("scroll", () => closeTaskMenu(), true);
  const ui = {
    module: "todo",
    todoView: "today",
    todoSearch: "",
    todoPriority: "all",
    todoTag: "all",
    workDate: Todo.localDateKey(),
    workSearch: "",
    workTag: "all",
    editorType: null,
    editorId: null,
    subtaskDraft: [],
  };

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

  function replaceDraft(target, source) {
    Object.keys(target).forEach((key) => delete target[key]);
    Object.assign(target, Todo.clone(source));
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
        showToast("数据已被另一窗口更新，表单内容已保留，请再次保存");
      } else {
        console.error(error);
        showToast(error && error.message ? error.message : "操作失败");
      }
      return false;
    }
  }

  function applyAppearance(state) {
    document.body.dataset.theme = state.settings.theme;
    document.body.dataset.density = state.settings.density;
  }

  function setTagOptions(select, tags, selected, omitWorkTag) {
    const allowed = tags.filter((tag) => !(omitWorkTag && tag === Todo.WORK_TAG));
    const value = allowed.includes(selected) ? selected : "all";
    select.replaceChildren();
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "全部标签";
    select.appendChild(all);
    allowed.forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag;
      option.textContent = tag;
      select.appendChild(option);
    });
    select.value = value;
    return value;
  }

  function formatDue(task) {
    if (!task.dueDate) return "";
    const today = Todo.localDateKey();
    const labels = {
      overdue: "已逾期",
      today: "今天",
      soon: Todo.formatDateLabel(task.dueDate, false).replace(/星期./, ""),
      future: Todo.formatDateLabel(task.dueDate, false).replace(/星期./, ""),
    };
    const state = Todo.getDueState(task);
    let text = task.dueDate === today ? labels.today : labels[state];
    if (task.dueTime) text += ` ${task.dueTime}`;
    return `<span class="meta-chip due-${state}">${icon("clock")}${escapeHtml(text)}</span>`;
  }

  function priorityLabel(priority) {
    return { high: "高", medium: "中", low: "低", none: "" }[priority] || "";
  }

  function recurrenceLabel(recurrence) {
    return { daily: "每天", weekdays: "工作日", weekly: "每周", monthly: "每月" }[
      recurrence
    ];
  }

  function taskCard(task, canReorder) {
    const archived = task.status === "archived";
    const completed = task.status !== "active";
    const subtaskDone = task.subtasks.filter((item) => item.completed).length;
    const meta = [];
    if (task.priority !== "none") {
      meta.push(
        `<span class="meta-chip priority-${task.priority}">${escapeHtml(
          priorityLabel(task.priority),
        )}优先级</span>`,
      );
    }
    if (completed && task.completedAt) {
      const completedDate = new Date(task.completedAt);
      const time = String(completedDate.getHours()).padStart(2, "0") + ":" + String(completedDate.getMinutes()).padStart(2, "0");
      meta.push('<span class="meta-chip completed-time">' + icon("check") + "完成于 " + escapeHtml(Todo.localDateKey(completedDate) + " " + time) + "</span>");
    } else if (task.dueDate) meta.push(formatDue(task));
    if (task.recurrence !== "none") {
      meta.push(
        `<span class="meta-chip">${icon("repeat")}${escapeHtml(
          recurrenceLabel(task.recurrence),
        )}</span>`,
      );
    }
    if (task.subtasks.length) {
      meta.push(`<span class="meta-chip">${subtaskDone}/${task.subtasks.length} 子任务</span>`);
    }
    task.tags.forEach((tag) => {
      meta.push(
        `<span class="tag-chip${tag === Todo.WORK_TAG ? " work-tag" : ""}">${icon(
          "tag",
        )}${escapeHtml(tag)}</span>`,
      );
    });

    let leading = `<button class="status-toggle${completed ? " checked" : ""}" type="button" data-action="toggle-task" data-id="${escapeHtml(
      task.id,
    )}" aria-label="${completed ? "重新打开" : "标记完成"}" title="${
      completed ? "重新打开" : "标记完成"
    }"${archived ? " disabled" : ""}>${completed ? icon("check") : ""}</button>`;
    if (archived) {
      leading = `<span class="status-toggle checked muted" title="已归档">${icon("archive")}</span>`;
    }

    return `<article class="item-card task-card${canReorder ? " reorderable" : ""}${completed ? " completed" : ""}${
      archived ? " archived" : ""
    }" data-task-id="${escapeHtml(task.id)}" draggable="false">
      ${canReorder ? '<button class="drag-handle task-drag-strip" type="button" aria-label="拖动排序" title="拖动排序（方向键上移、下移）">' + icon("grip") + '</button>' : ""}
      <div class="task-leading">${leading}</div>
      <div class="item-body" role="button" tabindex="0" data-action="edit-task" data-id="${escapeHtml(
        task.id,
      )}">
        <div class="item-title-row"><strong>${escapeHtml(task.title)}</strong></div>
        ${task.notes ? `<p class="item-notes">${escapeHtml(task.notes)}</p>` : ""}
        ${meta.length ? `<div class="item-meta">${meta.join("")}</div>` : ""}
      </div>
      <div class="item-actions">
        <button class="icon-button small" type="button" data-action="copy-task-title" data-id="${escapeHtml(task.id)}" title="复制标题" aria-label="复制标题">${icon("copy")}</button>
        <button class="icon-button small" type="button" data-action="edit-task" data-id="${escapeHtml(
          task.id,
        )}" title="编辑" aria-label="编辑">${icon("pencil")}</button>
        <button class="icon-button small" type="button" data-action="more-task" data-id="${escapeHtml(task.id)}" title="更多操作" aria-label="更多操作" aria-haspopup="menu" aria-controls="taskMoreMenu" aria-expanded="false">${icon("more")}</button>
      </div>
    </article>`;
  }

  function workCard(item) {
    const linked = item.source === "todo";
    const meta = item.tags
      .map((tag) => `<span class="tag-chip">${icon("tag")}${escapeHtml(tag)}</span>`)
      .join("");
    return `<article class="item-card work-card${linked ? " linked" : ""}">
      <span class="work-marker">${icon(linked ? "check" : "notebook")}</span>
      <div class="item-body" role="button" tabindex="0" data-action="${
        linked ? "edit-linked-task" : "edit-work"
      }" data-id="${escapeHtml(linked ? item.sourceTodoId : item.id)}">
        <div class="item-title-row"><strong>${escapeHtml(item.title)}</strong><span class="source-badge">${
          linked ? (item.pending ? "未完成" : "已完成") : "独立记录"
        }</span></div>
        ${item.notes ? `<p class="item-notes">${escapeHtml(item.notes)}</p>` : ""}
        ${meta ? `<div class="item-meta">${meta}</div>` : ""}
      </div>
      <div class="item-actions">
        <button class="icon-button small" type="button" data-action="${
          linked ? "edit-linked-task" : "edit-work"
        }" data-id="${escapeHtml(linked ? item.sourceTodoId : item.id)}" title="${
          linked ? "查看源待办" : "编辑"
        }" aria-label="${linked ? "查看源待办" : "编辑"}">${icon("pencil")}</button>
        ${
          linked
            ? ""
            : `<button class="icon-button small danger-icon" type="button" data-action="delete-work" data-id="${escapeHtml(
                item.id,
              )}" title="删除" aria-label="删除">${icon("trash")}</button>`
        }
      </div>
    </article>`;
  }

  function emptyState(title, detail) {
    return `<div class="empty-state"><span class="empty-symbol">${icon("list")}</span><strong>${escapeHtml(
      title,
    )}</strong><p>${escapeHtml(detail)}</p></div>`;
  }

  function renderTodoList(state) {
    closeTaskMenu();
    const canReorder =
      ["today", "upcoming", "all"].includes(ui.todoView) &&
      state.settings.sortMode === "manual";
    const tasks = Todo.getTasksForView(state, {
      view: ui.todoView,
      search: ui.todoSearch,
      priority: ui.todoPriority,
      tag: ui.todoTag,
      sortMode: state.settings.sortMode,
    });
    dom.itemList.innerHTML = tasks.length
      ? tasks.map((task) => taskCard(task, canReorder)).join("")
      : emptyState(
          ui.todoView === "completed" || ui.todoView === "archived" ? "这里还没有记录" : "当前没有待办",
          ui.todoView === "today" ? "今天没有到期或逾期事项" : "没有符合当前条件的事项",
        );
    dom.listSummary.textContent = `${tasks.length} 项${canReorder ? " · 可拖动排序" : ""}`;
    dom.contextAction.hidden = !["completed", "archived"].includes(ui.todoView);
    dom.contextAction.textContent = ui.todoView === "completed" ? "归档全部" : "清空归档";
  }

  function renderWorkList(state) {
    closeTaskMenu();
    const items = Todo.getWorkItemsForDate(
      state,
      ui.workDate,
      ui.workSearch,
      ui.workTag,
    );
    dom.itemList.innerHTML = items.length
      ? items.map(workCard).join("")
      : emptyState("这一天还没有工作记录", "当前日期无独立记录或待办联动记录");
    const linkedCount = items.filter((item) => item.source === "todo").length;
    dom.listSummary.textContent = `${items.length} 项记录${linkedCount ? ` · ${linkedCount} 项来自待办` : ""}`;
    dom.contextAction.hidden = false;
    dom.contextAction.textContent = "打开月历";
  }

  function render(state) {
    applyAppearance(state);
    const tags = Todo.getAllTags(state);
    ui.todoTag = setTagOptions(dom.todoTagFilter, tags, ui.todoTag, false);
    ui.workTag = setTagOptions(dom.workTagFilter, tags, ui.workTag, true);
    dom.sortMode.value = state.settings.sortMode;
    dom.themeSetting.value = state.settings.theme;
    dom.densitySetting.value = state.settings.density;
    dom.defaultViewSetting.value = state.settings.defaultView;
    dom.defaultSortSetting.value = state.settings.sortMode;
    global.SafeSelect?.syncAll();

    const active = state.tasks.filter((task) => task.status === "active").length;
    const completedToday = Todo.getCompletedTasksForDate(state, Todo.localDateKey()).length;
    const todayWork = Todo.getWorkItemsForDate(state, Todo.localDateKey(), "", "all").length;
    dom.headerSummary.textContent = `${active} 项进行中 · 今日 ${todayWork} 项工作 / ${completedToday} 项已办`;

    const todoMode = ui.module === "todo";
    dom.todoTab.classList.toggle("active", todoMode);
    dom.todoTab.setAttribute("aria-selected", String(todoMode));
    dom.workTab.classList.toggle("active", !todoMode);
    dom.workTab.setAttribute("aria-selected", String(!todoMode));
    dom.todoControls.hidden = !todoMode;
    dom.workControls.hidden = todoMode;
    dom.quickWorkDate.hidden = todoMode;
    dom.quickInput.placeholder = todoMode ? "快速添加待办" : "记录一项工作";
    dom.quickWorkDate.value = ui.workDate;
    dom.workViewDate.value = ui.workDate;
    document.querySelectorAll("[data-view]").forEach((button) => {
      const activeView = button.dataset.view === ui.todoView;
      button.classList.toggle("active", activeView);
      button.setAttribute("aria-current", activeView ? "page" : "false");
    });

    if (todoMode) renderTodoList(state);
    else renderWorkList(state);

    const legacy = Todo.readLegacyTodos();
    dom.legacySection.hidden = state.legacyImportDismissed || legacy.length === 0;
  }

  function closeEditor() {
    ui.editorType = null;
    ui.editorId = null;
    ui.subtaskDraft = [];
    dom.editorBackdrop.hidden = true;
  }

  function renderSubtaskEditor() {
    dom.subtaskEditor.innerHTML = ui.subtaskDraft.length
      ? ui.subtaskDraft
          .map(
            (item, index) => `<div class="subtask-edit-row" data-index="${index}">
              <input type="checkbox" data-subtask-check="${index}" aria-label="子任务完成状态" ${
                item.completed ? "checked" : ""
              } />
              <input type="text" maxlength="160" data-subtask-title="${index}" value="${escapeHtml(
                item.title,
              )}" aria-label="子任务标题" />
              <button type="button" class="icon-button small danger-icon" data-remove-subtask="${index}" title="删除子任务" aria-label="删除子任务">${icon(
                "trash",
              )}</button>
            </div>`,
          )
          .join("")
      : `<p class="subtask-empty">暂无子任务</p>`;
  }

  function openTaskEditor(taskId) {
    const task = controller.state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    ui.editorType = "task";
    ui.editorId = task.id;
    ui.subtaskDraft = Todo.clone(task.subtasks);
    dom.editorTitle.textContent = task.status === "active" ? "编辑待办" : "查看与编辑已办";
    dom.taskTitle.value = task.title;
    dom.taskNotes.value = task.notes;
    dom.taskDueDate.value = task.dueDate || "";
    dom.taskDueTime.value = task.dueTime || "";
    dom.taskPriority.value = task.priority;
    dom.taskRecurrence.value = task.recurrence;
    dom.taskTags.value = task.tags.filter((tag) => tag !== Todo.WORK_TAG).join("，");
    dom.taskWorkToggle.checked = Todo.hasWorkTag(task);
    dom.taskForm.hidden = false;
    dom.workForm.hidden = true;
    renderSubtaskEditor();
    dom.editorBackdrop.hidden = false;
    setTimeout(() => dom.taskTitle.focus(), 0);
  }

  function openWorkEditor(workId) {
    const item = controller.state.workItems.find((entry) => entry.id === workId);
    if (!item) return;
    if (item.source === "todo") {
      openTaskEditor(item.sourceTodoId);
      return;
    }
    ui.editorType = "work";
    ui.editorId = item.id;
    dom.editorTitle.textContent = "编辑工作记录";
    dom.workTitle.value = item.title;
    dom.workDate.value = item.workDate;
    dom.workTags.value = item.tags.join("，");
    dom.workNotes.value = item.notes;
    dom.taskForm.hidden = true;
    dom.workForm.hidden = false;
    dom.editorBackdrop.hidden = false;
    setTimeout(() => dom.workTitle.focus(), 0);
  }

  async function handleItemAction(action, id) {
    if (action === "more-task") { openTaskMenu(id); return; }
    if (action === "edit-task" || action === "edit-linked-task") {
      openTaskEditor(id);
      return;
    }
    if (action === "edit-work") {
      openWorkEditor(id);
      return;
    }

    const task = controller.state.tasks.find((item) => item.id === id);
    if (action === "copy-task-title" && task) {
      const active = document.activeElement;
      const field = document.createElement("textarea");
      field.value = task.title;
      field.readOnly = true;
      field.tabIndex = -1;
      field.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;";
      document.body.appendChild(field);
      let copied = false;
      try {
        field.select();
        copied = document.execCommand("copy");
      } catch (_error) {
        copied = false;
      } finally {
        field.remove();
        if (active && active.isConnected) active.focus({ preventScroll: true });
      }
      if (!copied && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(task.title);
          copied = true;
        } catch (_error) { copied = false; }
      }
      showToast(copied ? "已复制待办标题" : "复制失败，请手动复制标题");
      return;
    }
    if (action === "toggle-task" && task) {
      await updateState(
        (draft) => Todo.setTaskCompleted(draft, id, task.status === "active"),
        task.status === "active" ? "已完成待办" : "已重新打开待办",
        true,
      );
    } else if (action === "archive-task") {
      await updateState((draft) => Todo.archiveTask(draft, id), "已归档", true);
    } else if (action === "restore-task") {
      await updateState((draft) => Todo.restoreTask(draft, id), "已恢复到已完成", true);
    } else if (action === "delete-task") {
      await updateState((draft) => Todo.removeTask(draft, id), "已删除待办", true);
    } else if (action === "delete-work") {
      await updateState((draft) => Todo.removeWorkItem(draft, id), "已删除工作记录", true);
    }
  }

  function switchModule(moduleName) {
    ui.module = moduleName === "work" ? "work" : "todo";
    render(controller.state);
    dom.quickInput.focus();
  }

  async function openCalendar() {
    try {
      const opened = await controller.openCalendar();
      if (!opened) global.location.href = "work-calendar.html?embedded=1";
    } catch (error) {
      console.warn(error);
      global.location.href = "work-calendar.html?embedded=1";
    }
  }

  async function updateSetting(key, value) {
    await updateState((draft) => {
      draft.settings[key] = value;
    });
  }

  function bindEvents() {
    dom.todoTab.addEventListener("click", () => switchModule("todo"));
    dom.workTab.addEventListener("click", () => switchModule("work"));

    dom.quickForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const title = dom.quickInput.value.trim();
      if (!title) return;
      let saved = false;
      if (ui.module === "todo") {
        saved = await updateState((draft) => {
          const dueDate = ui.todoView === "today" ? Todo.localDateKey() : null;
          draft.tasks.unshift(
            Todo.createTask({ title, dueDate }, Todo.minimumOrder(draft)),
          );
        }, "已添加待办");
      } else {
        saved = await updateState((draft) => {
          draft.workItems.unshift(
            Todo.createManualWorkItem({ title, workDate: ui.workDate }),
          );
        }, "已记录工作项");
      }
      if (saved) dom.quickInput.value = "";
    });

    document.querySelector(".view-tabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");
      if (!button) return;
      ui.todoView = button.dataset.view;
      render(controller.state);
    });

    dom.todoSearch.addEventListener("input", () => {
      ui.todoSearch = dom.todoSearch.value.trim();
      renderTodoList(controller.state);
    });
    dom.workSearch.addEventListener("input", () => {
      ui.workSearch = dom.workSearch.value.trim();
      renderWorkList(controller.state);
    });
    dom.priorityFilter.addEventListener("change", () => {
      ui.todoPriority = dom.priorityFilter.value;
      renderTodoList(controller.state);
    });
    dom.todoTagFilter.addEventListener("change", () => {
      ui.todoTag = dom.todoTagFilter.value;
      renderTodoList(controller.state);
    });
    dom.workTagFilter.addEventListener("change", () => {
      ui.workTag = dom.workTagFilter.value;
      renderWorkList(controller.state);
    });
    dom.workViewDate.addEventListener("change", () => {
      ui.workDate = dom.workViewDate.value || Todo.localDateKey();
      dom.quickWorkDate.value = ui.workDate;
      renderWorkList(controller.state);
    });
    dom.quickWorkDate.addEventListener("change", () => {
      ui.workDate = dom.quickWorkDate.value || Todo.localDateKey();
      dom.workViewDate.value = ui.workDate;
      renderWorkList(controller.state);
    });
    dom.sortMode.addEventListener("change", () => updateSetting("sortMode", dom.sortMode.value));

    dom.itemList.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (target) handleItemAction(target.dataset.action, target.dataset.id);
    });
    dom.itemList.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target.closest("[data-action]");
      if (!target) return;
      event.preventDefault();
      handleItemAction(target.dataset.action, target.dataset.id);
    });

    async function moveTask(sourceId, targetId) {
      if (!sourceId || sourceId === targetId) return;
      const ordered = Todo.getTasksForView(controller.state, {
        view: "all",
        sortMode: "manual",
      }).map((task) => task.id);
      const from = ordered.indexOf(sourceId);
      const to = ordered.indexOf(targetId);
      if (from < 0 || to < 0) return;
      const moved = ordered.splice(from, 1)[0];
      ordered.splice(to, 0, moved);
      await updateState((draft) => {
        ordered.forEach((id, index) => {
          const task = draft.tasks.find((item) => item.id === id);
          if (task && task.order !== index) {
            task.order = index;
            task.updatedAt = new Date().toISOString();
          }
        });
      }, "已调整排序", true);
    }
    let pointerId = null;
    let dropTarget = null;
    let startY = 0;
    function clearDrag() {
      dom.itemList.querySelectorAll(".dragging,.drag-target").forEach((card) => card.classList.remove("dragging", "drag-target"));
      dragTaskId = null;
      dropTarget = null;
      pointerId = null;
    }
    dom.itemList.addEventListener("pointerdown", (event) => {
      const handle = event.target.closest(".drag-handle");
      if (!handle || event.button !== 0) return;
      event.preventDefault();
      clearDrag();
      dragTaskId = handle.closest(".task-card").dataset.taskId;
      pointerId = event.pointerId;
      startY = event.clientY;
      handle.setPointerCapture(event.pointerId);
    });
    dom.itemList.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId || !dragTaskId || Math.abs(event.clientY - startY) < 4) return;
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".task-card");
      dom.itemList.querySelectorAll(".task-card").forEach((card) => {
        card.classList.toggle("dragging", card.dataset.taskId === dragTaskId);
        card.classList.toggle("drag-target", card === target && card.dataset.taskId !== dragTaskId);
      });
      dropTarget = target?.querySelector(".drag-handle") ? target.dataset.taskId : null;
      const box = dom.itemList.getBoundingClientRect();
      if (event.clientY < box.top + 30) dom.itemList.scrollTop -= 20;
      if (event.clientY > box.bottom - 30) dom.itemList.scrollTop += 20;
    });
    dom.itemList.addEventListener("pointerup", (event) => {
      if (event.pointerId !== pointerId) return;
      const source = dragTaskId, target = dropTarget;
      clearDrag();
      if (target) moveTask(source, target);
    });
    dom.itemList.addEventListener("pointercancel", clearDrag);
    dom.itemList.addEventListener("lostpointercapture", clearDrag);
    dom.itemList.addEventListener("keydown", (event) => {
      const handle = event.target.closest(".drag-handle");
      if (!handle || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const card = handle.closest(".task-card");
      const neighbor = event.key === "ArrowUp" ? card.previousElementSibling : card.nextElementSibling;
      if (neighbor) moveTask(card.dataset.taskId, neighbor.dataset.taskId);
    });

    byId("openCalendarButton").addEventListener("click", openCalendar);
    dom.contextAction.addEventListener("click", async () => {
      if (ui.module === "work") {
        await openCalendar();
      } else if (ui.todoView === "completed") {
        await updateState((draft) => {
          draft.tasks
            .filter((task) => task.status === "completed")
            .forEach((task) => Todo.archiveTask(draft, task.id));
        }, "已归档全部已完成待办", true);
      } else if (ui.todoView === "archived") {
        await updateState((draft) => {
          draft.tasks = draft.tasks.filter((task) => task.status !== "archived");
          Todo.reconcileLinkedWorkItems(draft);
        }, "已清空归档", true);
      }
    });

    byId("closeEditorButton").addEventListener("click", closeEditor);
    byId("cancelTaskButton").addEventListener("click", closeEditor);
    byId("cancelWorkButton").addEventListener("click", closeEditor);
    dom.editorBackdrop.addEventListener("mousedown", (event) => {
      if (event.target === dom.editorBackdrop) closeEditor();
    });

    byId("addSubtaskButton").addEventListener("click", () => {
      ui.subtaskDraft.push({
        id: `subtask_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        title: "",
        completed: false,
      });
      renderSubtaskEditor();
      const inputs = dom.subtaskEditor.querySelectorAll("[data-subtask-title]");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    dom.subtaskEditor.addEventListener("input", (event) => {
      const index = Number(event.target.dataset.subtaskTitle);
      if (Number.isInteger(index) && ui.subtaskDraft[index]) {
        ui.subtaskDraft[index].title = event.target.value;
      }
    });
    dom.subtaskEditor.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.subtaskCheck);
      if (Number.isInteger(index) && ui.subtaskDraft[index]) {
        ui.subtaskDraft[index].completed = event.target.checked;
      }
    });
    dom.subtaskEditor.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-subtask]");
      if (!button) return;
      ui.subtaskDraft.splice(Number(button.dataset.removeSubtask), 1);
      renderSubtaskEditor();
    });

    dom.taskForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const tags = Todo.tagsFromText(dom.taskTags.value).filter(
        (tag) => tag !== Todo.WORK_TAG,
      );
      if (dom.taskWorkToggle.checked) tags.unshift(Todo.WORK_TAG);
      const dueDate = dom.taskDueDate.value || null;
      const saved = await updateState((draft) => {
        Todo.updateTask(draft, ui.editorId, {
          title: dom.taskTitle.value,
          notes: dom.taskNotes.value,
          dueDate,
          dueTime: dueDate ? dom.taskDueTime.value || null : null,
          priority: dom.taskPriority.value,
          recurrence: dueDate ? dom.taskRecurrence.value : "none",
          tags,
          subtasks: ui.subtaskDraft.filter((item) => item.title.trim()),
        });
      }, "已保存待办");
      if (saved) closeEditor();
    });
    dom.deleteTask.addEventListener("click", async () => {
      const id = ui.editorId;
      const saved = await updateState((draft) => Todo.removeTask(draft, id), "已删除待办", true);
      if (saved) closeEditor();
    });

    dom.workForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const saved = await updateState((draft) => {
        Todo.updateWorkItem(draft, ui.editorId, {
          title: dom.workTitle.value,
          workDate: dom.workDate.value,
          tags: Todo.tagsFromText(dom.workTags.value),
          notes: dom.workNotes.value,
        });
      }, "已保存工作记录");
      if (saved) closeEditor();
    });
    dom.deleteWork.addEventListener("click", async () => {
      const id = ui.editorId;
      const saved = await updateState(
        (draft) => Todo.removeWorkItem(draft, id),
        "已删除工作记录",
        true,
      );
      if (saved) closeEditor();
    });

    byId("openSettingsButton").addEventListener("click", () => {
      dom.settingsBackdrop.hidden = false;
    });
    byId("closeSettingsButton").addEventListener("click", () => {
      global.SafeSelect?.closeAll();
      dom.settingsBackdrop.hidden = true;
    });
    dom.settingsBackdrop.addEventListener("mousedown", (event) => {
      if (event.target === dom.settingsBackdrop) {
        global.SafeSelect?.closeAll();
        dom.settingsBackdrop.hidden = true;
      }
    });
    dom.themeSetting.addEventListener("change", () => updateSetting("theme", dom.themeSetting.value));
    dom.densitySetting.addEventListener("change", () =>
      updateSetting("density", dom.densitySetting.value),
    );
    dom.defaultViewSetting.addEventListener("change", () =>
      updateSetting("defaultView", dom.defaultViewSetting.value),
    );
    dom.defaultSortSetting.addEventListener("change", () =>
      updateSetting("sortMode", dom.defaultSortSetting.value),
    );

    byId("exportJsonButton").addEventListener("click", () => {
      Todo.downloadText(
        `todo-worklog-${Todo.localDateKey()}.json`,
        Todo.exportStateJson(controller.state),
        "application/json;charset=utf-8",
      );
      showToast("正在请求保存 JSON 备份");
    });
    byId("mergeImportButton").addEventListener("click", () => {
      importMode = "merge";
      dom.importFile.value = "";
      dom.importFile.click();
    });
    byId("replaceImportButton").addEventListener("click", () => {
      importMode = "replace";
      dom.importFile.value = "";
      dom.importFile.click();
    });
    dom.importFile.addEventListener("change", async () => {
      const file = dom.importFile.files && dom.importFile.files[0];
      if (!file) return;
      try {
        const imported = Todo.parseImportedState(await Todo.readFileText(file));
        const next =
          importMode === "merge"
            ? Todo.mergeImportedState(controller.state, imported)
            : Todo.replaceImportedState(controller.state, imported);
        const saved = await updateState(
          (draft) => replaceDraft(draft, next),
          importMode === "merge" ? "已合并导入数据" : "已覆盖导入数据",
          true,
        );
        if (saved) dom.settingsBackdrop.hidden = true;
      } catch (error) {
        showToast(`导入失败：${error.message || "文件格式无效"}`);
      }
    });
    byId("importLegacyButton").addEventListener("click", async () => {
      const legacy = Todo.readLegacyTodos();
      await updateState((draft) => Todo.importLegacyTodos(draft, legacy), "已导入旧版待办", true);
    });
    byId("dismissLegacyButton").addEventListener("click", async () => {
      await updateState((draft) => {
        draft.legacyImportDismissed = true;
      });
    });
    byId("archiveCompletedButton").addEventListener("click", async () => {
      await updateState((draft) => {
        draft.tasks
          .filter((task) => task.status === "completed")
          .forEach((task) => Todo.archiveTask(draft, task.id));
      }, "已归档全部已完成待办", true);
    });
    byId("clearArchiveButton").addEventListener("click", async () => {
      await updateState((draft) => {
        draft.tasks = draft.tasks.filter((task) => task.status !== "archived");
        Todo.reconcileLinkedWorkItems(draft);
      }, "已清空归档", true);
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
      if (event.key !== "Escape") return;
      if (!dom.editorBackdrop.hidden) closeEditor();
      else if (!dom.settingsBackdrop.hidden) {
        global.SafeSelect?.closeAll();
        dom.settingsBackdrop.hidden = true;
      }
    });
  }

  function normalizeAccent(color) {
    const value = String(color || "").trim();
    if (/^#[0-9a-f]{8}$/i.test(value)) {
      return `#${value.slice(3)}${value.slice(1, 3)}`;
    }
    return /^#[0-9a-f]{3,6}$/i.test(value) ? value : "#2563eb";
  }

  async function init() {
    if (!Todo) throw new Error("todo-core.js 未加载");
    controller = await Todo.createController();
    ui.todoView = controller.state.settings.defaultView;
    bindEvents();
    controller.subscribe(render);
    controller.onTheme((color) => {
      document.documentElement.style.setProperty("--accent", normalizeAccent(color));
    });
    render(controller.state);
    dom.loading.hidden = true;
    dom.app.hidden = false;
    global.__todoController = controller;
    global.__todoAppReady = true;
  }

  init().catch((error) => {
    console.error(error);
    dom.loading.textContent = `加载失败：${error.message || "未知错误"}`;
    dom.loading.classList.add("error");
  });
})(window);
