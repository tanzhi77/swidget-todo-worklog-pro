"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadTodoCore() {
  const context = {
    Blob,
    Intl,
    URL,
    console,
    crypto: crypto.webcrypto,
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "..", "todo-core.js"), "utf8"),
    context,
    { filename: "todo-core.js" },
  );
  return context.TodoPro;
}

const Todo = loadTodoCore();

function baseTask(overrides) {
  return Object.assign(
    {
      id: "task-1",
      title: "完成接口联调",
      notes: "完成主流程验证",
      status: "active",
      priority: "high",
      tags: ["工作项", "EAD"],
      subtasks: [],
      dueDate: "2026-09-04",
      dueTime: "18:00",
      recurrence: "none",
      order: 0,
      createdAt: "2026-09-01T01:00:00.000Z",
      updatedAt: "2026-09-01T01:00:00.000Z",
      completedAt: null,
      archivedAt: null,
    },
    overrides || {},
  );
}

function stateWith(tasks, workItems) {
  return Todo.normalizeState({
    schemaVersion: 2,
    revision: 0,
    tasks: tasks || [],
    workItems: workItems || [],
    settings: {},
  });
}

function test(name, callback) {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("带工作项标签的待办完成后按本地日期生成关联记录", () => {
  const state = stateWith([baseTask()]);
  Todo.setTaskCompleted(state, "task-1", true, "2026-09-04T00:30:00+08:00");
  assert.equal(state.workItems.length, 1);
  assert.equal(state.workItems[0].source, "todo");
  assert.equal(state.workItems[0].sourceTodoId, "task-1");
  assert.equal(state.workItems[0].workDate, "2026-09-04");
});

test("编辑源待办会同步关联工作记录", () => {
  const state = stateWith([baseTask()]);
  Todo.setTaskCompleted(state, "task-1", true, "2026-09-04T08:30:00+08:00");
  Todo.updateTask(state, "task-1", {
    title: "完成接口联调与回归",
    notes: "已覆盖异常分支",
    tags: ["工作项", "V9"],
  });
  assert.equal(state.workItems[0].title, "完成接口联调与回归");
  assert.equal(state.workItems[0].notes, "已覆盖异常分支");
  assert.deepEqual(Array.from(state.workItems[0].tags), ["V9"]);
});

test("重新打开、移除标签和删除待办都会移除关联记录", () => {
  const reopened = stateWith([baseTask()]);
  Todo.setTaskCompleted(reopened, "task-1", true, "2026-09-04T08:30:00+08:00");
  Todo.setTaskCompleted(reopened, "task-1", false);
  assert.equal(reopened.workItems.length, 0);

  const untagged = stateWith([baseTask()]);
  Todo.setTaskCompleted(untagged, "task-1", true, "2026-09-04T08:30:00+08:00");
  Todo.updateTask(untagged, "task-1", { tags: ["EAD"] });
  assert.equal(untagged.workItems.length, 0);

  const removed = stateWith([baseTask()]);
  Todo.setTaskCompleted(removed, "task-1", true, "2026-09-04T08:30:00+08:00");
  Todo.removeTask(removed, "task-1");
  assert.equal(removed.workItems.length, 0);
});

test("全部月历对关联待办去重并保留双重标记", () => {
  const state = stateWith([
    baseTask(),
    baseTask({
      id: "task-2",
      title: "提交测试用例清单",
      status: "completed",
      tags: ["测试"],
      completedAt: "2026-09-04T09:00:00+08:00",
    }),
  ]);
  state.workItems.push(
    Todo.createManualWorkItem({
      title: "整理测试报告",
      workDate: "2026-09-04",
      tags: ["测试"],
    }),
  );
  Todo.setTaskCompleted(state, "task-1", true, "2026-09-04T08:30:00+08:00");

  const all = Todo.getCalendarEntries(state, { year: 2026, month: 8, filter: "all" });
  const work = Todo.getCalendarEntries(state, { year: 2026, month: 8, filter: "work" });
  const completed = Todo.getCalendarEntries(state, {
    year: 2026,
    month: 8,
    filter: "completed",
  });
  assert.equal(all.length, 3);
  assert.equal(all.filter((entry) => entry.taskId === "task-1").length, 1);
  assert.equal(all.find((entry) => entry.taskId === "task-1").kind, "both");
  assert.equal(all.find((entry) => entry.taskId === "task-2").kind, "completed");
  assert.equal(work.length, 2);
  assert.equal(completed.length, 2);
});

test("月历始终生成周一开头的 6x7 网格并覆盖闰日", () => {
  const september = Todo.getMonthGrid(2026, 8);
  assert.equal(september.length, 42);
  assert.equal(september[0].date, "2026-08-31");
  assert.equal(september[41].date, "2026-10-11");

  const leapFebruary = Todo.getMonthGrid(2028, 1);
  assert.ok(leapFebruary.some((cell) => cell.date === "2028-02-29" && cell.inMonth));

  const december = Todo.getMonthGrid(2026, 11);
  assert.ok(december.some((cell) => cell.date.startsWith("2027-01-") && !cell.inMonth));
});

test("每天、工作日、每周和月末重复任务生成正确的下一次事项", () => {
  const daily = stateWith([
    baseTask({ recurrence: "daily", dueDate: "2026-09-04", dueTime: null }),
  ]);
  Todo.setTaskCompleted(daily, "task-1", true, "2026-09-06T18:00:00+08:00");
  const dailyNext = daily.tasks.find((task) => task.generatedFromId === "task-1");
  assert.equal(dailyNext.dueDate, "2026-09-07");

  const weekday = stateWith([
    baseTask({ recurrence: "weekdays", dueDate: "2026-09-04", dueTime: null }),
  ]);
  Todo.setTaskCompleted(weekday, "task-1", true, "2026-09-04T18:00:00+08:00");
  const weekdayNext = weekday.tasks.find((task) => task.generatedFromId === "task-1");
  assert.equal(weekdayNext.dueDate, "2026-09-07");

  const weekly = stateWith([
    baseTask({ recurrence: "weekly", dueDate: "2026-12-30", dueTime: null }),
  ]);
  Todo.setTaskCompleted(weekly, "task-1", true, "2027-01-01T18:00:00+08:00");
  const weeklyNext = weekly.tasks.find((task) => task.generatedFromId === "task-1");
  assert.equal(weeklyNext.dueDate, "2027-01-06");

  const monthly = stateWith([
    baseTask({ recurrence: "monthly", dueDate: "2028-01-31", dueTime: null }),
  ]);
  Todo.setTaskCompleted(monthly, "task-1", true, "2028-01-31T18:00:00+08:00");
  const monthlyNext = monthly.tasks.find((task) => task.generatedFromId === "task-1");
  assert.equal(monthlyNext.dueDate, "2028-02-29");

  Todo.setTaskCompleted(monthly, "task-1", false);
  assert.equal(monthly.tasks.some((task) => task.generatedFromId === "task-1"), false);
});

test("合并导入按更新时间保留较新的记录", () => {
  const current = stateWith([
    baseTask({ title: "旧标题", updatedAt: "2026-09-02T00:00:00.000Z" }),
  ]);
  const incoming = stateWith([
    baseTask({ title: "新标题", updatedAt: "2026-09-03T00:00:00.000Z" }),
  ]);
  const merged = Todo.mergeImportedState(current, incoming);
  assert.equal(merged.tasks.length, 1);
  assert.equal(merged.tasks[0].title, "新标题");
});

test("旧版已完成待办导入后具有可用于月历的完成日期", () => {
  const state = stateWith();
  Todo.importLegacyTodos(state, [{ id: 1788472800000, text: "旧版事项", completed: true }]);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].status, "completed");
  assert.ok(state.tasks[0].completedAt);
  assert.equal(Todo.dateKeyFromIso(state.tasks[0].completedAt), "2026-09-04");
});

test("CSV 导出使用全部视图去重结果", () => {
  const state = stateWith([baseTask()]);
  Todo.setTaskCompleted(state, "task-1", true, "2026-09-04T08:30:00+08:00");
  const csv = Todo.exportMonthCsv(state, 2026, 8);
  assert.match(csv, /工作项\/已办/);
  assert.equal(csv.split("\r\n").length, 2);
});

test("未完成工作项在工作记录和月历回显但不计入已办", () => {
  const state = stateWith([baseTask({ dueDate: "2026-09-04" })]);
  const work = Todo.getWorkItemsForDate(state, "2026-09-04", "", "all");
  assert.equal(work.length, 1);
  assert.equal(work[0].pending, true);
  const options = { year: 2026, month: 8 };
  assert.equal(Todo.getCalendarEntries(state, { ...options, filter: "all" }).length, 1);
  assert.equal(Todo.getCalendarEntries(state, { ...options, filter: "completed" }).length, 0);
  Todo.setTaskCompleted(state, "task-1", true, "2026-09-04T08:30:00+08:00");
  assert.equal(Todo.getCalendarEntries(state, { ...options, filter: "all" }).length, 1);
});
console.log("todo-core tests passed");
test("双周报日期边界、编号、关联去重和非法范围", () => {
  const range = Todo.currentBiweek(new Date(2026, 11, 31, 12));
  assert.equal(range.start, "2026-12-28");
  assert.equal(range.end, "2027-01-10");
  const second = Todo.currentBiweek(new Date(2027, 0, 3, 12), 2);
  assert.equal(second.start, "2026-12-21");
  assert.equal(second.end, "2027-01-03");
  const state = stateWith([baseTask({dueDate: "2026-09-04"})]);
  Todo.setTaskCompleted(state, "task-1", true, "2026-09-04T08:30:00+08:00");
  state.workItems.push(Todo.createManualWorkItem({title: "独立工作\n第二行", workDate: "2026-09-05"}));
  const report = Todo.exportWorkReport(state, "2026-09-04", "2026-09-05");
  assert.equal(report.split("\r\n").length, 2);
  assert.ok(report.startsWith("1、"));
  assert.ok(report.includes("2、独立工作 第二行"));
  assert.equal(Todo.exportWorkReport(state, "2026-09-06", "2026-09-07"), "");
  assert.throws(() => Todo.exportWorkReport(state, "2026-09-06", "2026-09-04"));
  assert.throws(() => Todo.exportWorkReport(state, "2026-02-30", "2026-09-04"));
});
