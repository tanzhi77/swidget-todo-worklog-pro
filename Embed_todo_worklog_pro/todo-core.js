(function (global) {
  "use strict";

  const SCHEMA_VERSION = 2;
  const WORK_TAG = "工作项";
  const STORAGE_KEY = "swidget.todo-worklog-pro.v2";
  const CHANNEL_NAME = "swidget.todo-worklog-pro.channel";
  let exportHost = null;
  const TASK_STATUSES = new Set(["active", "completed", "archived"]);
  const PRIORITIES = new Set(["none", "low", "medium", "high"]);
  const RECURRENCES = new Set(["none", "daily", "weekdays", "weekly", "monthly"]);

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function safeString(value, maxLength) {
    const result = value == null ? "" : String(value).trim();
    return typeof maxLength === "number" ? result.slice(0, maxLength) : result;
  }

  function validIso(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function uuid(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return `${prefix}_${global.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseDateKey(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function normalizeDateKey(value) {
    const date = parseDateKey(value);
    return date ? localDateKey(date) : null;
  }

  function normalizeTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
      ? `${pad(hour)}:${pad(minute)}`
      : null;
  }

  function dateKeyFromIso(value) {
    const iso = validIso(value);
    return iso ? localDateKey(new Date(iso)) : null;
  }

  function addDaysKey(value, amount) {
    const date = parseDateKey(value);
    if (!date) return null;
    date.setDate(date.getDate() + amount);
    return localDateKey(date);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeTags(tags) {
    const source = Array.isArray(tags) ? tags : [];
    const result = [];
    const seen = new Set();
    source.forEach((tag) => {
      const normalized = safeString(tag, 24);
      const key = normalized.toLocaleLowerCase();
      if (normalized && !seen.has(key) && result.length < 12) {
        seen.add(key);
        result.push(normalized);
      }
    });
    return result;
  }

  function tagsFromText(value) {
    return normalizeTags(String(value || "").split(/[,，;；\n]/));
  }

  function normalizeSubtasks(subtasks) {
    if (!Array.isArray(subtasks)) return [];
    return subtasks.slice(0, 50).reduce((result, item) => {
      const title = safeString(item && item.title, 160);
      if (!title) return result;
      result.push({
        id: safeString(item.id, 100) || uuid("subtask"),
        title,
        completed: Boolean(item.completed),
      });
      return result;
    }, []);
  }

  function defaultSettings() {
    return {
      theme: "system",
      density: "comfortable",
      defaultView: "today",
      sortMode: "manual",
    };
  }

  function createDefaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      revision: 0,
      tasks: [],
      workItems: [],
      settings: defaultSettings(),
      legacyImportDismissed: false,
    };
  }

  function normalizeTask(task, index) {
    const createdAt = validIso(task && task.createdAt) || nowIso();
    const status = TASK_STATUSES.has(task && task.status) ? task.status : "active";
    return {
      id: safeString(task && task.id, 100) || uuid("task"),
      title: safeString(task && task.title, 200) || "未命名待办",
      notes: safeString(task && task.notes, 2000),
      status,
      priority: PRIORITIES.has(task && task.priority) ? task.priority : "none",
      tags: normalizeTags(task && task.tags),
      subtasks: normalizeSubtasks(task && task.subtasks),
      dueDate: normalizeDateKey(task && task.dueDate),
      dueTime: normalizeTime(task && task.dueTime),
      recurrence: RECURRENCES.has(task && task.recurrence) ? task.recurrence : "none",
      order: Number.isFinite(Number(task && task.order)) ? Number(task.order) : index,
      createdAt,
      updatedAt: validIso(task && task.updatedAt) || createdAt,
      completedAt: validIso(task && task.completedAt),
      archivedAt: validIso(task && task.archivedAt),
      generatedFromId: safeString(task && task.generatedFromId, 100) || null,
      nextOccurrenceId: safeString(task && task.nextOccurrenceId, 100) || null,
    };
  }

  function normalizeWorkItem(item) {
    const createdAt = validIso(item && item.createdAt) || nowIso();
    const source = item && item.source === "todo" ? "todo" : "manual";
    return {
      id: safeString(item && item.id, 100) || uuid("work"),
      title: safeString(item && item.title, 200) || "未命名工作项",
      workDate: normalizeDateKey(item && item.workDate) || localDateKey(),
      tags: normalizeTags(item && item.tags).filter((tag) => tag !== WORK_TAG),
      notes: safeString(item && item.notes, 2000),
      source,
      sourceTodoId: source === "todo" ? safeString(item && item.sourceTodoId, 100) || null : null,
      createdAt,
      updatedAt: validIso(item && item.updatedAt) || createdAt,
    };
  }

  function normalizeSettings(settings) {
    const defaults = defaultSettings();
    const source = settings && typeof settings === "object" ? settings : {};
    const theme = ["system", "light", "dark"].includes(source.theme) ? source.theme : defaults.theme;
    const density = ["comfortable", "compact"].includes(source.density)
      ? source.density
      : defaults.density;
    const defaultView = ["today", "upcoming", "all", "completed", "archived"].includes(
      source.defaultView,
    )
      ? source.defaultView
      : defaults.defaultView;
    const sortMode = ["manual", "due", "priority", "created", "title"].includes(source.sortMode)
      ? source.sortMode
      : defaults.sortMode;
    return { theme, density, defaultView, sortMode, calendarWrap: source.calendarWrap === true };
  }

  function hasWorkTag(task) {
    return Array.isArray(task && task.tags) && task.tags.includes(WORK_TAG);
  }

  function reconcileLinkedWorkItems(state) {
    const manualItems = state.workItems.filter((item) => item.source !== "todo");
    const linkedByTask = new Map();
    state.workItems.forEach((item) => {
      if (item.source === "todo" && item.sourceTodoId && !linkedByTask.has(item.sourceTodoId)) {
        linkedByTask.set(item.sourceTodoId, item);
      }
    });

    const linkedItems = [];
    state.tasks.forEach((task) => {
      const completed = task.status === "completed" || task.status === "archived";
      const workDate = completed && hasWorkTag(task) ? dateKeyFromIso(task.completedAt) : null;
      if (!workDate) return;

      const existing = linkedByTask.get(task.id);
      linkedItems.push({
        id: existing ? existing.id : uuid("work"),
        title: task.title,
        workDate,
        tags: task.tags.filter((tag) => tag !== WORK_TAG),
        notes: task.notes,
        source: "todo",
        sourceTodoId: task.id,
        createdAt: existing ? existing.createdAt : task.completedAt,
        updatedAt: task.updatedAt,
      });
    });

    state.workItems = manualItems.concat(linkedItems);
    return state;
  }

  function normalizeState(value) {
    let source = value;
    if (typeof value === "string") {
      try {
        source = JSON.parse(value);
      } catch (_error) {
        source = null;
      }
    }
    if (!source || typeof source !== "object") source = createDefaultState();

    const state = {
      schemaVersion: SCHEMA_VERSION,
      revision: Number.isFinite(Number(source.revision)) ? Number(source.revision) : 0,
      tasks: Array.isArray(source.tasks) ? source.tasks.map(normalizeTask) : [],
      workItems: Array.isArray(source.workItems) ? source.workItems.map(normalizeWorkItem) : [],
      settings: normalizeSettings(source.settings),
      legacyImportDismissed: Boolean(source.legacyImportDismissed),
    };
    return reconcileLinkedWorkItems(state);
  }

  function createTask(input, order) {
    const createdAt = nowIso();
    return normalizeTask(
      {
        id: uuid("task"),
        title: input && input.title,
        notes: input && input.notes,
        status: "active",
        priority: (input && input.priority) || "none",
        tags: input && input.tags,
        subtasks: input && input.subtasks,
        dueDate: input && input.dueDate,
        dueTime: input && input.dueTime,
        recurrence: (input && input.recurrence) || "none",
        order: Number.isFinite(order) ? order : 0,
        createdAt,
        updatedAt: createdAt,
      },
      0,
    );
  }

  function createManualWorkItem(input) {
    const createdAt = nowIso();
    return normalizeWorkItem({
      id: uuid("work"),
      title: input && input.title,
      workDate: (input && input.workDate) || localDateKey(),
      tags: input && input.tags,
      notes: input && input.notes,
      source: "manual",
      createdAt,
      updatedAt: createdAt,
    });
  }

  function advanceRecurrence(date, recurrence, anchorDay) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
    if (recurrence === "daily") {
      result.setDate(result.getDate() + 1);
    } else if (recurrence === "weekdays") {
      do {
        result.setDate(result.getDate() + 1);
      } while (result.getDay() === 0 || result.getDay() === 6);
    } else if (recurrence === "weekly") {
      result.setDate(result.getDate() + 7);
    } else if (recurrence === "monthly") {
      const target = new Date(result.getFullYear(), result.getMonth() + 1, 1, 12, 0, 0, 0);
      const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(anchorDay, lastDay));
      return target;
    }
    return result;
  }

  function nextRecurrenceDate(dueDate, dueTime, recurrence, referenceDate) {
    const base = parseDateKey(dueDate);
    if (!base || recurrence === "none") return null;
    const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate || Date.now());
    const anchorDay = base.getDate();
    let candidate = advanceRecurrence(base, recurrence, anchorDay);
    let attempts = 0;

    function isFuture() {
      if (!dueTime) return localDateKey(candidate) > localDateKey(now);
      const time = normalizeTime(dueTime).split(":");
      const timed = new Date(
        candidate.getFullYear(),
        candidate.getMonth(),
        candidate.getDate(),
        Number(time[0]),
        Number(time[1]),
        0,
        0,
      );
      return timed.getTime() > now.getTime();
    }

    while (!isFuture() && attempts < 4000) {
      candidate = advanceRecurrence(candidate, recurrence, anchorDay);
      attempts += 1;
    }
    return localDateKey(candidate);
  }

  function minimumOrder(state) {
    if (!state.tasks.length) return 0;
    return Math.min.apply(
      null,
      state.tasks.map((task) => Number(task.order) || 0),
    ) - 1;
  }

  function generateNextOccurrence(state, task, completedAt) {
    if (task.recurrence === "none" || !task.dueDate) return;
    if (task.nextOccurrenceId && state.tasks.some((item) => item.id === task.nextOccurrenceId)) return;
    const nextDate = nextRecurrenceDate(task.dueDate, task.dueTime, task.recurrence, completedAt);
    if (!nextDate) return;

    const nextTask = createTask(
      {
        title: task.title,
        notes: task.notes,
        priority: task.priority,
        tags: task.tags,
        subtasks: task.subtasks.map((subtask) => ({ title: subtask.title, completed: false })),
        dueDate: nextDate,
        dueTime: task.dueTime,
        recurrence: task.recurrence,
      },
      minimumOrder(state),
    );
    nextTask.generatedFromId = task.id;
    nextTask.createdAt = completedAt;
    nextTask.updatedAt = completedAt;
    task.nextOccurrenceId = nextTask.id;
    state.tasks.unshift(nextTask);
  }

  function setTaskCompleted(state, taskId, completed, completedAt) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return state;
    const timestamp = validIso(completedAt) || nowIso();

    if (completed) {
      if (task.status === "active") {
        task.status = "completed";
        task.completedAt = timestamp;
        task.archivedAt = null;
        task.updatedAt = timestamp;
        generateNextOccurrence(state, task, timestamp);
      }
    } else if (task.status !== "active") {
      const next = task.nextOccurrenceId
        ? state.tasks.find((item) => item.id === task.nextOccurrenceId)
        : null;
      if (
        next &&
        next.status === "active" &&
        next.generatedFromId === task.id &&
        next.updatedAt === next.createdAt
      ) {
        state.tasks = state.tasks.filter((item) => item.id !== next.id);
        task.nextOccurrenceId = null;
      }
      task.status = "active";
      task.completedAt = null;
      task.archivedAt = null;
      task.updatedAt = timestamp;
    }
    return reconcileLinkedWorkItems(state);
  }

  function updateTask(state, taskId, patch) {
    const index = state.tasks.findIndex((item) => item.id === taskId);
    if (index < 0) return state;
    const current = state.tasks[index];
    state.tasks[index] = normalizeTask(
      Object.assign({}, current, patch, { id: current.id, updatedAt: nowIso() }),
      index,
    );
    return reconcileLinkedWorkItems(state);
  }

  function removeTask(state, taskId) {
    state.tasks = state.tasks.filter((item) => item.id !== taskId);
    state.tasks.forEach((item) => {
      if (item.nextOccurrenceId === taskId) item.nextOccurrenceId = null;
    });
    return reconcileLinkedWorkItems(state);
  }

  function archiveTask(state, taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (task && task.status === "completed") {
      task.status = "archived";
      task.archivedAt = nowIso();
      task.updatedAt = task.archivedAt;
    }
    return reconcileLinkedWorkItems(state);
  }

  function restoreTask(state, taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (task && task.status === "archived") {
      task.status = "completed";
      task.archivedAt = null;
      task.updatedAt = nowIso();
    }
    return reconcileLinkedWorkItems(state);
  }

  function updateWorkItem(state, workItemId, patch) {
    const index = state.workItems.findIndex((item) => item.id === workItemId);
    if (index < 0 || state.workItems[index].source !== "manual") return state;
    const current = state.workItems[index];
    state.workItems[index] = normalizeWorkItem(
      Object.assign({}, current, patch, {
        id: current.id,
        source: "manual",
        sourceTodoId: null,
        updatedAt: nowIso(),
      }),
    );
    return reconcileLinkedWorkItems(state);
  }

  function removeWorkItem(state, workItemId) {
    state.workItems = state.workItems.filter(
      (item) => item.id !== workItemId || item.source === "todo",
    );
    return state;
  }

  function searchMatches(item, query) {
    if (!query) return true;
    const haystack = [
      item.title,
      item.notes,
      ...(item.tags || []),
      ...((item.subtasks || []).map((subtask) => subtask.title)),
    ]
      .join("\n")
      .toLocaleLowerCase();
    return haystack.includes(query.toLocaleLowerCase());
  }

  function priorityRank(priority) {
    return { high: 0, medium: 1, low: 2, none: 3 }[priority] ?? 3;
  }

  function dueTimestamp(task) {
    if (!task.dueDate) return Number.POSITIVE_INFINITY;
    const date = parseDateKey(task.dueDate);
    const time = normalizeTime(task.dueTime);
    if (time) {
      const parts = time.split(":");
      date.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
    } else {
      date.setHours(23, 59, 59, 999);
    }
    return date.getTime();
  }

  function taskSort(mode) {
    return function (left, right) {
      if (mode === "due") {
        return dueTimestamp(left) - dueTimestamp(right) || priorityRank(left.priority) - priorityRank(right.priority);
      }
      if (mode === "priority") {
        return priorityRank(left.priority) - priorityRank(right.priority) || dueTimestamp(left) - dueTimestamp(right);
      }
      if (mode === "created") {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }
      if (mode === "title") {
        return left.title.localeCompare(right.title, "zh-CN");
      }
      return Number(left.order) - Number(right.order) || new Date(right.createdAt) - new Date(left.createdAt);
    };
  }

  function getTasksForView(state, options) {
    const opts = Object.assign(
      { view: "today", search: "", priority: "all", tag: "all", sortMode: state.settings.sortMode },
      options,
    );
    const today = localDateKey();
    const upcomingEnd = addDaysKey(today, 7);
    let tasks = state.tasks.filter((task) => {
      if (opts.view === "today") {
        return task.status === "active" && task.dueDate && task.dueDate <= today;
      }
      if (opts.view === "upcoming") {
        return (
          task.status === "active" &&
          task.dueDate &&
          task.dueDate > today &&
          task.dueDate <= upcomingEnd
        );
      }
      if (opts.view === "completed") return task.status === "completed";
      if (opts.view === "archived") return task.status === "archived";
      return task.status === "active";
    });

    tasks = tasks.filter((task) => {
      if (opts.priority !== "all" && task.priority !== opts.priority) return false;
      if (opts.tag !== "all" && !task.tags.includes(opts.tag)) return false;
      return searchMatches(task, opts.search);
    });

    if (opts.view === "completed" || opts.view === "archived") {
      return tasks.sort((left, right) => {
        const leftDate = left.archivedAt || left.completedAt || left.updatedAt;
        const rightDate = right.archivedAt || right.completedAt || right.updatedAt;
        return new Date(rightDate).getTime() - new Date(leftDate).getTime();
      });
    }
    return tasks.sort(taskSort(opts.sortMode));
  }

  function getDueState(task, referenceDate) {
    if (!task.dueDate) return "none";
    const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate || Date.now());
    const today = localDateKey(now);
    if (task.dueDate < today) return "overdue";
    if (task.dueDate > today) {
      return task.dueDate <= addDaysKey(today, 3) ? "soon" : "future";
    }
    if (task.dueTime && dueTimestamp(task) < now.getTime()) return "overdue";
    return "today";
  }

  function getAllTags(state) {
    const result = new Set();
    state.tasks.forEach((task) => task.tags.forEach((tag) => result.add(tag)));
    state.workItems.forEach((item) => item.tags.forEach((tag) => result.add(tag)));
    return Array.from(result).sort((left, right) => left.localeCompare(right, "zh-CN"));
  }

  function visibleWorkItems(state) {
    return state.workItems.concat(state.tasks
      .filter((task) => task.status === "active" && hasWorkTag(task))
      .map((task) => ({
        id: "pending:" + task.id, title: task.title, notes: task.notes,
        workDate: task.dueDate || dateKeyFromIso(task.createdAt),
        tags: task.tags.filter((tag) => tag !== WORK_TAG), source: "todo",
        sourceTodoId: task.id, pending: true, createdAt: task.createdAt,
      })));
  }

  function getWorkItemsForDate(state, dateKey, query, tag) {
    return visibleWorkItems(state)
      .filter((item) => item.workDate === dateKey)
      .filter((item) => (tag && tag !== "all" ? item.tags.includes(tag) : true))
      .filter((item) => searchMatches(item, query || ""))
      .sort((left, right) => {
        if (left.source !== right.source) return left.source === "manual" ? -1 : 1;
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      });
  }

  function getCompletedTasksForDate(state, dateKey) {
    return state.tasks
      .filter((task) => task.status !== "active" && dateKeyFromIso(task.completedAt) === dateKey)
      .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime());
  }

  function getCalendarEntries(state, options) {
    const opts = Object.assign(
      { year: new Date().getFullYear(), month: new Date().getMonth(), filter: "all", search: "", tag: "all" },
      options,
    );
    const monthPrefix = `${opts.year}-${pad(opts.month + 1)}-`;
    const linkedByTask = new Map();
    state.workItems.forEach((item) => {
      if (item.source === "todo" && item.sourceTodoId) linkedByTask.set(item.sourceTodoId, item);
    });
    const entries = [];

    if (opts.filter === "work" || opts.filter === "all") {
      visibleWorkItems(state).forEach((item) => {
        if (!item.workDate.startsWith(monthPrefix)) return;
        if (opts.filter === "all" && item.source === "todo" && !item.pending) return;
        entries.push({
          id: `work:${item.id}`,
          date: item.workDate,
          title: item.title,
          notes: item.notes,
          tags: item.tags,
          kind: "work",
          pending: Boolean(item.pending),
          workItemId: item.id,
          taskId: item.sourceTodoId,
          source: item.source,
          priority: "none",
        });
      });
    }

    if (opts.filter === "completed" || opts.filter === "all") {
      state.tasks.forEach((task) => {
        const date = dateKeyFromIso(task.completedAt);
        if (task.status === "active" || !date || !date.startsWith(monthPrefix)) return;
        const linked = linkedByTask.get(task.id);
        entries.push({
          id: `task:${task.id}`,
          date,
          title: task.title,
          notes: task.notes,
          tags: task.tags.filter((tag) => tag !== WORK_TAG),
          kind: opts.filter === "all" && linked ? "both" : "completed",
          workItemId: linked ? linked.id : null,
          taskId: task.id,
          source: "todo",
          priority: task.priority,
        });
      });
    }

    return entries
      .filter((entry) => (opts.tag !== "all" ? entry.tags.includes(opts.tag) : true))
      .filter((entry) => searchMatches(entry, opts.search))
      .sort((left, right) => {
        if (left.date !== right.date) return left.date.localeCompare(right.date);
        const kindRank = { both: 0, work: 1, completed: 2 };
        return kindRank[left.kind] - kindRank[right.kind] || left.title.localeCompare(right.title, "zh-CN");
      });
  }

  function getMonthGrid(year, month) {
    const first = new Date(year, month, 1, 12, 0, 0, 0);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - mondayOffset, 12, 0, 0, 0);
    return Array.from({ length: 42 }, (_unused, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        date: localDateKey(date),
        day: date.getDate(),
        inMonth: date.getMonth() === month,
        isToday: localDateKey(date) === localDateKey(),
      };
    });
  }

  function formatDateLabel(dateKey, includeYear) {
    const date = parseDateKey(dateKey);
    if (!date) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      year: includeYear ? "numeric" : undefined,
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }

  function formatMonthTitle(year, month) {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(
      new Date(year, month, 1),
    );
  }

  function exportStateJson(state) {
    return JSON.stringify(
      {
        type: "swidget-todo-worklog",
        exportedAt: nowIso(),
        state: normalizeState(state),
      },
      null,
      2,
    );
  }

  function parseImportedState(text) {
    const parsed = JSON.parse(text);
    return normalizeState(parsed && parsed.state ? parsed.state : parsed);
  }

  function newerItem(current, incoming) {
    if (!current) return incoming;
    const currentTime = new Date(current.updatedAt || current.createdAt || 0).getTime();
    const incomingTime = new Date(incoming.updatedAt || incoming.createdAt || 0).getTime();
    return incomingTime > currentTime ? incoming : current;
  }

  function mergeImportedState(currentState, importedState) {
    const current = normalizeState(currentState);
    const incoming = normalizeState(importedState);
    const tasks = new Map(current.tasks.map((item) => [item.id, item]));
    const workItems = new Map(current.workItems.map((item) => [item.id, item]));
    incoming.tasks.forEach((item) => tasks.set(item.id, newerItem(tasks.get(item.id), item)));
    incoming.workItems.forEach((item) => workItems.set(item.id, newerItem(workItems.get(item.id), item)));
    current.tasks = Array.from(tasks.values());
    current.workItems = Array.from(workItems.values());
    return reconcileLinkedWorkItems(current);
  }

  function replaceImportedState(currentState, importedState) {
    const replacement = normalizeState(importedState);
    replacement.revision = normalizeState(currentState).revision;
    return replacement;
  }

  function readLegacyTodos() {
    try {
      const value = global.localStorage && global.localStorage.getItem("todos");
      if (!value) return [];
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function importLegacyTodos(state, legacyTodos) {
    const existing = new Set(state.tasks.map((task) => task.id));
    legacyTodos.forEach((item, index) => {
      const title = safeString(item && (item.text || item.title), 200);
      if (!title) return;
      const legacyId = `legacy_${safeString(item.id, 80) || index}`;
      if (existing.has(legacyId)) return;
      const candidateDate = Number(item.id);
      const createdAt =
        Number.isFinite(candidateDate) && candidateDate > 946684800000 && candidateDate < 4102444800000
          ? new Date(candidateDate).toISOString()
          : nowIso();
      const task = normalizeTask(
        {
          id: legacyId,
          title,
          status: item.completed ? "completed" : "active",
          completedAt: item.completed ? createdAt : null,
          createdAt,
          updatedAt: createdAt,
          order: minimumOrder(state) - index,
        },
        state.tasks.length,
      );
      state.tasks.push(task);
      existing.add(legacyId);
    });
    state.legacyImportDismissed = true;
    return state;
  }

  function csvEscape(value) {
    const text = String(value == null ? "" : value).replace(/"/g, '""');
    return `"${text}"`;
  }

  function exportMonthCsv(state, year, month) {
    const entries = getCalendarEntries(state, { year, month, filter: "all" });
    const header = ["日期", "类型", "标题", "标签", "备注", "来源"];
    const rows = entries.map((entry) => [
      entry.date,
      entry.kind === "both" ? "工作项/已办" : entry.kind === "work" ? "工作项" : "已办",
      entry.title,
      entry.tags.join("、"),
      entry.notes,
      entry.source === "manual" ? "独立记录" : "待办",
    ]);
    return "\ufeff" + [header].concat(rows).map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  function currentBiweek(reference = new Date(), currentWeek = 1) {
    const start = addDaysKey(localDateKey(reference), -((reference.getDay() + 6) % 7) - (currentWeek === 2 ? 7 : 0));
    return { start, end: addDaysKey(start, 13) };
  }

  function exportWorkReport(state, start, end) {
    if (!parseDateKey(start) || !parseDateKey(end)) throw new Error("请输入有效的起止日期");
    if (start > end) throw new Error("开始日期不能晚于结束日期");
    const items = visibleWorkItems(state)
      .filter((item) => item.workDate >= start && item.workDate <= end)
      .sort((a, b) => a.workDate.localeCompare(b.workDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return items.map((item, index) => String(index + 1) + "、" + item.title.replace(/[\r\n]+/g, " ").trim()).join("\r\n");
  }

  function downloadText(filename, text, mimeType) {
    if (exportHost && exportHost.prepareExport) {
      exportHost.prepareExport(filename, text, mimeType || "text/plain;charset=utf-8");
      return;
    }
    downloadPreparedText(filename, text, mimeType);
  }

  function downloadPreparedText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
      reader.readAsText(file, "utf-8");
    });
  }

  function callRemote(target, methodName, args, timeout) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`${methodName} 调用超时`));
        }
      }, timeout || 3000);

      function done(value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }

      try {
        target[methodName].apply(target, (args || []).concat(done));
      } catch (error) {
        clearTimeout(timer);
        settled = true;
        reject(error);
      }
    });
  }

  class BridgeStore {
    constructor(host) {
      exportHost = host;
      this.host = host;
      this.stateListeners = new Set();
      this.themeListeners = new Set();
      if (host.stateChanged && host.stateChanged.connect) {
        host.stateChanged.connect((json) => {
          this.stateListeners.forEach((listener) => listener(json));
        });
      }
      if (host.themeChanged && host.themeChanged.connect) {
        host.themeChanged.connect((color) => {
          this.themeListeners.forEach((listener) => listener(color));
        });
      }
    }

    async waitUntilReady() {
      try {
        if (await callRemote(this.host, "isReady", [])) return;
      } catch (_error) {
        return;
      }
      await new Promise((resolve) => {
        let resolved = false;
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }, 1500);
        if (this.host.readyChanged && this.host.readyChanged.connect) {
          this.host.readyChanged.connect((ready) => {
            if (ready && !resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve();
            }
          });
        }
      });
    }

    load() {
      return callRemote(this.host, "getState", []);
    }

    commit(candidate, baseRevision) {
      return callRemote(this.host, "commitState", [JSON.stringify(candidate), baseRevision]);
    }

    subscribe(listener) {
      this.stateListeners.add(listener);
      return () => this.stateListeners.delete(listener);
    }

    onTheme(listener) {
      this.themeListeners.add(listener);
      return () => this.themeListeners.delete(listener);
    }

    getThemeColor() {
      return callRemote(this.host, "getThemeColor", []);
    }

    openCalendar() {
      return callRemote(this.host, "openCalendar", []);
    }

    closeCalendar() {
      return callRemote(this.host, "closeCalendar", []);
    }
  }

  class LocalStore {
    constructor() {
      this.stateListeners = new Set();
      this.themeListeners = new Set();
      this.channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL_NAME) : null;
      if (this.channel) {
        this.channel.addEventListener("message", (event) => {
          if (event.data && event.data.type === "state") this.emit(event.data.json);
        });
      }
      global.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY && event.newValue) this.emit(event.newValue);
      });
    }

    rawState() {
      try {
        const stored = global.localStorage.getItem(STORAGE_KEY);
        return stored ? normalizeState(stored) : createDefaultState();
      } catch (_error) {
        return createDefaultState();
      }
    }

    emit(json) {
      this.stateListeners.forEach((listener) => listener(json));
    }

    async waitUntilReady() {}

    async load() {
      return JSON.stringify(this.rawState());
    }

    async commit(candidate, baseRevision) {
      const current = this.rawState();
      if (Number(current.revision) !== Number(baseRevision)) return false;
      const next = normalizeState(candidate);
      next.revision = Number(baseRevision) + 1;
      const json = JSON.stringify(next);
      global.localStorage.setItem(STORAGE_KEY, json);
      this.emit(json);
      if (this.channel) this.channel.postMessage({ type: "state", json });
      return true;
    }

    subscribe(listener) {
      this.stateListeners.add(listener);
      return () => this.stateListeners.delete(listener);
    }

    onTheme(listener) {
      this.themeListeners.add(listener);
      return () => this.themeListeners.delete(listener);
    }

    async getThemeColor() {
      return "#3b82f6";
    }

    async openCalendar() {
      const popup = global.open(
        "work-calendar.html",
        "TodoWorklogCalendar",
        "popup=yes,width=1440,height=990,resizable=yes,scrollbars=no",
      );
      return Boolean(popup);
    }

    async closeCalendar() {
      if (global.opener) global.close();
      return true;
    }
  }

  function connectBridgeStore() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("WebChannel 初始化超时"));
        }
      }, 2000);
      try {
        new global.QWebChannel(global.qt.webChannelTransport, (channel) => {
          if (settled) return;
          const host = channel.objects && channel.objects.todoHost;
          if (!host) {
            settled = true;
            clearTimeout(timer);
            reject(new Error("todoHost 不可用"));
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(new BridgeStore(host));
        });
      } catch (error) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  let webChannelScriptPromise = null;

  function ensureWebChannelScript() {
    if (typeof global.QWebChannel === "function") return Promise.resolve();
    if (webChannelScriptPromise) return webChannelScriptPromise;
    webChannelScriptPromise = new Promise((resolve, reject) => {
      const script = global.document.createElement("script");
      script.src = "qrc:///qtwebchannel/qwebchannel.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("qwebchannel.js 加载失败"));
      global.document.head.appendChild(script);
    });
    return webChannelScriptPromise;
  }

  class PortableStore {
    constructor() {
      this.api = global.portableHost;
      exportHost = {
        prepareExport: (name, text, mime) => this.api.exportText(name, text, mime)
          .then((message) => global.dispatchEvent(new CustomEvent("host-file-result", { detail: message })))
          .catch((error) => global.dispatchEvent(new CustomEvent("host-file-result", { detail: "导出失败：" + error.message }))),
      };
    }
    async waitUntilReady() {}
    load() { return this.api.load(); }
    commit(candidate, revision) { return this.api.commit(JSON.stringify(candidate), revision); }
    subscribe(listener) { return this.api.onState(listener); }
    onTheme() { return () => {}; }
    async getThemeColor() { return "#2563eb"; }
    openCalendar() { return this.api.openCalendar(); }
    closeCalendar() { return this.api.closeCalendar(); }
  }

  async function connectStore() {
    if (global.portableHost) return new PortableStore();
    if (global.qt && global.qt.webChannelTransport) {
      await ensureWebChannelScript();
      return connectBridgeStore();
    }
    return new LocalStore();
  }

  class StateController {
    constructor(store) {
      this.store = store;
      this.state = createDefaultState();
      this.listeners = new Set();
      this.themeListeners = new Set();
      this.themeColor = "#3b82f6";
    }

    async init() {
      await this.store.waitUntilReady();
      this.state = normalizeState(await this.store.load());
      this.store.subscribe((json) => {
        const next = normalizeState(json);
        if (next.revision >= this.state.revision) {
          this.state = next;
          this.emit();
        }
      });
      this.store.onTheme((color) => {
        this.themeColor = safeString(color, 32) || this.themeColor;
        this.themeListeners.forEach((listener) => listener(this.themeColor));
      });
      try {
        this.themeColor = safeString(await this.store.getThemeColor(), 32) || this.themeColor;
      } catch (_error) {
        this.themeColor = "#3b82f6";
      }
      this.emit();
      return this;
    }

    emit() {
      this.listeners.forEach((listener) => listener(this.state));
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    onTheme(listener) {
      this.themeListeners.add(listener);
      listener(this.themeColor);
      return () => this.themeListeners.delete(listener);
    }

    async refresh() {
      this.state = normalizeState(await this.store.load());
      this.emit();
      return this.state;
    }

    async update(mutator) {
      const baseRevision = this.state.revision;
      const draft = clone(this.state);
      mutator(draft);
      const candidate = normalizeState(draft);
      candidate.revision = baseRevision;
      const accepted = await this.store.commit(candidate, baseRevision);
      if (!accepted) {
        await this.refresh();
        const error = new Error("数据已在其他窗口更新，请重试");
        error.code = "STATE_CONFLICT";
        throw error;
      }
      await this.refresh();
      return this.state;
    }

    async replace(candidate) {
      return this.update((draft) => {
        const replacement = normalizeState(candidate);
        Object.keys(draft).forEach((key) => delete draft[key]);
        Object.assign(draft, replacement, { revision: this.state.revision });
      });
    }

    openCalendar() {
      return this.store.openCalendar();
    }

    closeCalendar() {
      return this.store.closeCalendar();
    }
  }

  async function createController() {
    const store = await connectStore();
    return new StateController(store).init();
  }

  global.TodoPro = {
    SCHEMA_VERSION,
    WORK_TAG,
    addDaysKey,
    archiveTask,
    clone,
    createController,
    createDefaultState,
    createManualWorkItem,
    createTask,
    dateKeyFromIso,
    downloadText,
    downloadPreparedText,
    exportMonthCsv,
    currentBiweek,
    exportWorkReport,
    exportStateJson,
    formatDateLabel,
    formatMonthTitle,
    getAllTags,
    getCalendarEntries,
    getCompletedTasksForDate,
    getDueState,
    getMonthGrid,
    getTasksForView,
    getWorkItemsForDate,
    hasWorkTag,
    importLegacyTodos,
    localDateKey,
    mergeImportedState,
    minimumOrder,
    normalizeState,
    normalizeTags,
    parseDateKey,
    parseImportedState,
    readFileText,
    readLegacyTodos,
    reconcileLinkedWorkItems,
    removeTask,
    removeWorkItem,
    replaceImportedState,
    restoreTask,
    setTaskCompleted,
    tagsFromText,
    updateTask,
    updateWorkItem,
  };
})(window);
