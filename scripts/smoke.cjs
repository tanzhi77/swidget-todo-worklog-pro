"use strict";
const { _electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const executablePath = path.join(root, "build/portable/TodoWorklogPro-win32-x64/TodoWorklogPro.exe");
const data = fs.mkdtempSync(path.join(root, "build/smoke-data-"));
const exportsDir = path.join(data, "exports");
fs.mkdirSync(exportsDir);
const errors = [];
let application;
async function launch() {
  application = await _electron.launch({ executablePath, env: {...process.env, TODO_WORKLOG_DATA_DIR: data}, timeout: 60000 });
  const page = await application.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => window.__todoAppReady === true);
  return page;
}
(async () => {
  try {
    let page = await launch();
    assert.equal(await page.evaluate(() => typeof require), "undefined");
    assert.equal(await page.evaluate(() => Boolean(window.portableHost)), true);
    await page.locator("#quickInput").fill("独立版重启恢复测试");
    await page.locator("#quickForm").press("Enter");
    await page.waitForFunction(() => window.__todoController.state.tasks.length === 1);
    await page.locator(".task-card .item-body").click();
    await page.locator("#taskWorkToggle").check();
    await page.locator("#taskForm button[type=submit]").click();
    const opened = application.waitForEvent("window");
    await page.locator("#openCalendarButton").click();
    const calendar = await opened;
    calendar.on("pageerror", (error) => errors.push(error.message));
    await calendar.waitForFunction(() => window.__todoCalendarReady === true);
    await page.locator('[data-action="toggle-task"]').click();
    await calendar.waitForFunction(() => window.__todoCalendarController.state.tasks[0].status === "completed");
    await page.locator("#openCalendarButton").click();
    assert.equal(application.windows().length, 2);
    await application.evaluate(({dialog}, dir) => {
      dialog.showSaveDialog = async (_owner, options) => ({canceled: false, filePath: dir + "/" + options.defaultPath.split(/[\\/]/).pop()});
    }, exportsDir);
    await page.locator("#openSettingsButton").click();
    await page.locator("#exportJsonButton").click();
    await page.waitForFunction(() => /已保存至|导出失败/.test(document.querySelector("#toastMessage").textContent));
    assert.match(await page.locator("#toastMessage").textContent(), /^已保存至：/);
    const jsonFile = fs.readdirSync(exportsDir).find((name) => name.endsWith(".json"));
    const backup = JSON.parse(fs.readFileSync(path.join(exportsDir, jsonFile), "utf8"));
    assert.equal((backup.state || backup).tasks.length, 1);
    await page.locator("#importFileInput").setInputFiles(path.join(exportsDir, jsonFile));
    await page.waitForFunction(() => document.querySelector("#settingsBackdrop").hidden);
    await calendar.locator("#exportCsvButton").click();
    await calendar.waitForFunction(() => document.querySelector("#calendarToastMessage").textContent.startsWith("已保存至："));
    assert.ok(fs.readdirSync(exportsDir).some((name) => name.endsWith(".csv")));
    await calendar.locator("#exportReportButton").click();
    await calendar.locator("#saveReportButton").click();
    await calendar.waitForFunction(() => document.querySelector("#calendarToastMessage").textContent.includes(".txt"));
    const txt = fs.readdirSync(exportsDir).find((name) => name.endsWith(".txt"));
    assert.ok(fs.readFileSync(path.join(exportsDir, txt), "utf8").includes("1、独立版重启恢复测试"));
    await calendar.locator("#closeReportButton").click();
    await calendar.screenshot({path: path.join(root, "build/calendar-preview.png")});
    await page.locator('[data-view="completed"]').click();
    await page.screenshot({path: path.join(root, "build/main-preview.png")});
    const before = JSON.parse(fs.readFileSync(path.join(data, "state.json"), "utf8"));
    await application.close();
    page = await launch();
    assert.equal(await page.evaluate(() => window.__todoController.state.tasks[0].title), "独立版重启恢复测试");
    assert.equal(await page.evaluate(() => window.__todoController.state.revision), before.revision);
    await page.locator("#openCalendarButton").click();
    const exited = new Promise((resolve) => application.process().once("exit", resolve));
    await page.close();
    await exited;
    application = null;
    assert.deepEqual(errors, []);
    console.log("Packaged EXE: persistence, IPC sync, single calendar, import and JSON/CSV/TXT disk export passed.");
  } finally {
    if (application && application.process().exitCode === null) await application.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
