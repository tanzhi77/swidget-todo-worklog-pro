"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "todo.html" : pathname.replace(/^\/+/, "");
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root) || !fs.existsSync(filename) || fs.statSync(filename).isDirectory()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.setHeader("Content-Type", mimeTypes[path.extname(filename)] || "application/octet-stream");
    fs.createReadStream(filename).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function findBrowser() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((filename) => fs.existsSync(filename));
}

async function setTheme(page, calendar, theme) {
  await page.evaluate(async (value) => {
    await window.__todoController.update((state) => {
      state.settings.theme = value;
    });
  }, theme);
  await page.waitForFunction((value) => document.body.dataset.theme === value, theme);
  await calendar.waitForFunction((value) => document.body.dataset.theme === value, theme);
}

async function chooseSafeSelect(page, selectId, value) {
  const control = page.locator(`.safe-select[data-select-id="${selectId}"]`);
  await control.locator(".safe-select-trigger").click();
  await page
    .locator(`.safe-select-menu:not([hidden]) .safe-select-option[data-value="${value}"]`)
    .click();
}

async function checkMainLayout(page, width, height) {
  await page.setViewportSize({ width, height });
  const result = await page.evaluate(() => {
    const app = document.querySelector("#app").getBoundingClientRect();
    const content = document.querySelector("#contentArea").getBoundingClientRect();
    return {
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      overflowY: document.documentElement.scrollHeight > innerHeight + 1,
      appInside:
        app.left >= 0 && app.top >= 0 && app.right <= innerWidth + 1 && app.bottom <= innerHeight + 1,
      contentHeight: content.height,
    };
  });
  assert.equal(result.overflowX, false, `${width}x${height} 主页面横向溢出`);
  assert.equal(result.overflowY, false, `${width}x${height} 主页面纵向溢出`);
  assert.equal(result.appInside, true, `${width}x${height} 主页面超出视口`);
  assert.ok(result.contentHeight > 20, `${width}x${height} 主列表没有可用空间`);
}

async function checkCalendarLayout(calendar, width, height) {
  await calendar.setViewportSize({ width, height });
  const result = await calendar.evaluate(() => {
    const cells = Array.from(document.querySelectorAll(".day-cell"));
    return {
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      overflowY: document.documentElement.scrollHeight > innerHeight + 1,
      cells: cells.length,
      columns: new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().left))).size,
      rows: new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().top))).size,
    };
  });
  assert.equal(result.overflowX, false, `${width}x${height} 月历横向溢出`);
  assert.equal(result.overflowY, false, `${width}x${height} 月历纵向溢出`);
  assert.equal(result.cells, 42);
  assert.equal(result.columns, 7);
  assert.equal(result.rows, 6);
}

(async () => {
  const server = await startServer();
  const address = server.address();
  const executablePath = findBrowser();
  assert.ok(executablePath, "未找到 Chrome 或 Edge，可通过 PLAYWRIGHT_CHROME_PATH 指定浏览器");
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await page.goto(`${baseUrl}/todo.html`, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__todoAppReady === true);

    const safeSelectState = await page.evaluate(() => ({
      selectCount: document.querySelectorAll("select").length,
      enhancedCount: document.querySelectorAll(".safe-select").length,
      visibleNativeCount: Array.from(document.querySelectorAll("select")).filter(
        (select) => getComputedStyle(select).display !== "none",
      ).length,
    }));
    assert.equal(safeSelectState.enhancedCount, safeSelectState.selectCount);
    assert.equal(safeSelectState.visibleNativeCount, 0);

    await page.locator("#openSettingsButton").click();
    await chooseSafeSelect(page, "themeSetting", "dark");
    await page.waitForFunction(() => window.__todoController.state.settings.theme === "dark");
    assert.equal(await page.locator("#settingsBackdrop").isVisible(), true);
    await page.locator('.safe-select[data-select-id="densitySetting"] .safe-select-trigger').click();
    assert.equal(await page.locator('.safe-select-menu:not([hidden])').count(), 1);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator('.safe-select-menu:not([hidden])').count(), 0);
    assert.equal(await page.locator("#settingsBackdrop").isVisible(), true);
    await chooseSafeSelect(page, "densitySetting", "compact");
    await page.waitForFunction(() => window.__todoController.state.settings.density === "compact");
    await page.locator("#closeSettingsButton").click();

    await page.locator("#quickInput").fill("完成接口联调");
    await page.locator("#quickForm").press("Enter");
    await page.locator(".task-card .item-body").click();
    assert.equal(await page.locator('input[type="date"], input[type="time"]').count(), 0);
    const dueBefore = await page.locator("#taskDueDate").inputValue();
    await page.locator("#taskDueDate").click();
    assert.equal(await page.locator(".date-picker").isVisible(), true);
    await page.locator(".date-picker button[aria-label]").nth(12).click();
    await page.locator("#taskDueDate").fill(dueBefore);
    await page.locator("#taskDueTime").click();
    await page.locator('.date-picker input[aria-label="小时"]').fill("14");
    await page.locator('.date-picker input[aria-label="分钟"]').fill("30");
    await page.locator(".date-picker").getByRole("button", { name: "确定" }).click();
    assert.equal(await page.locator("#taskDueTime").inputValue(), "14:30");
    await page.locator("#taskDueTime").fill("");
    await page.locator("#taskTags").fill("联调");
    await page.locator("#taskWorkToggle").check();
    await page.locator("#taskForm button[type='submit']").click();
    await page.locator("#workTab").click();
    assert.equal(await page.locator(".work-card .source-badge").textContent(), "未完成");
    await page.locator("#todoTab").click();
    await page.locator("[data-action='toggle-task']").click();
    await page.waitForFunction(() => window.__todoController.state.workItems.length === 1);

    const popupPromise = page.waitForEvent("popup");
    await page.locator("#openCalendarButton").click();
    let calendar = await popupPromise;
    calendar.on("pageerror", (error) => errors.push(error.message));
    calendar.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await calendar.waitForLoadState("networkidle");
    await calendar.waitForFunction(() => window.__todoCalendarReady === true);

    await calendar.locator("#addCalendarWorkButton").click();
    await calendar.locator("#calendarWorkTitle").fill("整理测试报告");
    await calendar.locator("#calendarWorkTags").fill("测试");
    await calendar.locator("#calendarWorkForm button[type='submit']").click();
    await page.waitForFunction(() => window.__todoController.state.workItems.length === 2);
    assert.equal(await calendar.locator(".day-cell.today .calendar-entry").count(), 2);

    await calendar.locator("[data-calendar-filter='work']").click();
    assert.equal(await calendar.locator(".day-cell.today .calendar-entry").count(), 2);
    await calendar.locator("[data-calendar-filter='completed']").click();
    assert.equal(await calendar.locator(".day-cell.today .calendar-entry").count(), 1);
    await calendar.locator("[data-calendar-filter='all']").click();
    await calendar.locator("#calendarSearch").fill("整理");
    assert.equal(await calendar.locator(".day-cell.today .calendar-entry").count(), 1);
    await calendar.locator("#calendarSearch").fill("");
    await chooseSafeSelect(calendar, "calendarTagFilter", "测试");
    assert.equal(await calendar.locator(".day-cell.today .calendar-entry").count(), 1);
    await chooseSafeSelect(calendar, "calendarTagFilter", "all");

    await calendar.locator("[data-action='edit-work']").first().click();
    await calendar.locator("#calendarWorkTitle").fill("整理完整测试报告");
    await calendar.locator("#calendarWorkForm button[type='submit']").click();
    await page.waitForFunction(() =>
      window.__todoController.state.workItems.some((item) => item.title === "整理完整测试报告"),
    );
    await calendar.locator("[data-action='delete-work']").first().click();
    await page.waitForFunction(() => window.__todoController.state.workItems.length === 1);
    await calendar.locator("#calendarUndoButton").click();
    await page.waitForFunction(() => window.__todoController.state.workItems.length === 2);

    const csvPromise = calendar.waitForEvent("download");
    await calendar.locator("#exportCsvButton").click();
    const csvDownload = await csvPromise;
    assert.match(csvDownload.suggestedFilename(), /^worklog-\d{4}-\d{2}\.csv$/);
    const initialMonth = await calendar.locator("#monthTitle").textContent();
    await calendar.locator("#nextMonthButton").click();
    assert.notEqual(await calendar.locator("#monthTitle").textContent(), initialMonth);
    await calendar.locator("#previousMonthButton").click();
    assert.equal(await calendar.locator("#monthTitle").textContent(), initialMonth);

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__todoAppReady === true);
    assert.equal(await page.evaluate(() => window.__todoController.state.workItems.length), 2);

    await page.locator("#todoTab").click();
    await page.locator("[data-view='completed']").click();
    await page.locator(".task-card .item-body").click();
    await page.locator("#taskNotes").fill("尚未提交的表单内容");
    await page.evaluate(() => {
      const key = "swidget.todo-worklog-pro.v2";
      const state = JSON.parse(localStorage.getItem(key));
      state.revision += 1;
      state.tasks[0].notes = "另一窗口写入的内容";
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.locator("#taskForm button[type='submit']").click();
    assert.equal(await page.locator("#editorBackdrop").isVisible(), true);
    assert.equal(await page.locator("#taskNotes").inputValue(), "尚未提交的表单内容");
    await page.locator("#taskForm button[type='submit']").click();

    const pageCount = context.pages().length;
    await page.locator("#openCalendarButton").click();
    await page.waitForTimeout(100);
    assert.equal(context.pages().length, pageCount);

    for (const theme of ["light", "dark"]) {
      await setTheme(page, calendar, theme);
      for (const [width, height] of [[280, 280], [360, 360], [480, 347], [720, 520]]) {
        await checkMainLayout(page, width, height);
      }
      await page.setViewportSize({ width: 480, height: 450 });
      await page.screenshot({ path: path.join(root, "tests", `readability-${theme}.png`) });
      await page.locator(".task-card .item-body").click();
      const saveBox = await page.locator("#taskForm button[type='submit']").boundingBox();
      assert.ok(saveBox.y >= 0 && saveBox.y + saveBox.height <= 450, "保存按钮必须保持在视口内");
      await page.screenshot({ path: path.join(root, "tests", `editor-${theme}.png`) });
      await page.locator("#closeEditorButton").click();
      for (const [width, height] of [[720, 520], [960, 720], [1440, 900]]) {
        await checkCalendarLayout(calendar, width, height);
      }
    }

    const closePromise = calendar.waitForEvent("close");
    await calendar.locator("#closeCalendarButton").click();
    await closePromise;
    const reopenPromise = page.waitForEvent("popup");
    await page.locator("#openCalendarButton").click();
    calendar = await reopenPromise;
    await calendar.waitForLoadState("networkidle");
    await calendar.waitForFunction(() => window.__todoCalendarReady === true);
    assert.equal(await calendar.locator(".day-cell").count(), 42);

    const fallbackContext = await browser.newContext();
    await fallbackContext.addInitScript(() => {
      window.open = () => null;
    });
    const fallbackPage = await fallbackContext.newPage();
    await fallbackPage.clock.setFixedTime(new Date(2026, 8, 22, 12));
    await fallbackPage.goto(`${baseUrl}/todo.html`, { waitUntil: "networkidle" });
    await fallbackPage.waitForFunction(() => window.__todoAppReady === true);
    await fallbackPage.locator("#openCalendarButton").click();
    await fallbackPage.waitForURL(/work-calendar\.html\?embedded=1$/);
    await fallbackPage.waitForFunction(() => window.__todoCalendarReady === true);
    assert.equal(await fallbackPage.locator('[data-date="2026-09-20"] .holiday-badge').textContent(), "班");
    assert.equal(await fallbackPage.locator('[data-date="2026-09-25"] .holiday-badge').textContent(), "休");
    assert.equal(await fallbackPage.locator('[data-date="2026-09-19"] .holiday-badge').count(), 0);
    await fallbackPage.locator('[data-date="2026-09-25"]').click();
    assert.match(await fallbackPage.locator("#selectedDateSummary").textContent(), /中秋节放假/);
    for (let month = 0; month < 4; month++) await fallbackPage.locator("#nextMonthButton").click();
    assert.match(await fallbackPage.locator("#holidayScheduleStatus").textContent(), /2027 年节假日数据未收录/);
    await fallbackPage.locator("#closeCalendarButton").click();
    await fallbackPage.waitForURL(/todo\.html$/);
    await fallbackPage.waitForFunction(() => window.__todoAppReady === true);
    await fallbackPage.setViewportSize({ width: 720, height: 520 });
    await fallbackPage.evaluate(async () => {
      const T = window.TodoPro;
      await window.__todoController.update((state) => {
        state.settings.sortMode = "manual";
        state.tasks = ['排序第一项 & <测试> "标题"', "排序第二项"].map((title, index) => T.createTask({title, dueDate: T.localDateKey()}, index));
        state.workItems = Array.from({length: 10}, (_, index) => T.createManualWorkItem({
          title: "工作记录" + index + "：长标题换行后仍可完整阅读并使用日期格剩余空间",
          workDate: T.localDateKey(),
        }));
      });
    });
    await fallbackPage.locator('[data-view="today"]').click();
    await fallbackContext.grantPermissions(["clipboard-read", "clipboard-write"]);
    const revisionBeforeCopy = await fallbackPage.evaluate(() => window.__todoController.state.revision);
    await fallbackPage.locator('[data-action="copy-task-title"]').first().click();
    assert.equal(await fallbackPage.evaluate(() => navigator.clipboard.readText()), '排序第一项 & <测试> "标题"');
    assert.equal(await fallbackPage.evaluate(() => window.__todoController.state.revision), revisionBeforeCopy);
    assert.equal(await fallbackPage.locator("#editorBackdrop").isVisible(), false);
    assert.equal(await fallbackPage.locator(".task-card .item-actions button").first().locator("..").locator("button").count(), 3);
    assert.equal(await fallbackPage.locator(".task-card > .drag-handle").count(), 2);
    for (const width of [360, 720]) {
      await fallbackPage.setViewportSize({width, height: 520});
      const stripSize = await fallbackPage.locator(".task-drag-strip").first().evaluate((strip) => {
        const rail = strip.getBoundingClientRect(), card = strip.closest(".task-card").getBoundingClientRect();
        return {width: rail.width, height: rail.height, cardHeight: card.height, left: rail.left - card.left};
      });
      assert.equal(stripSize.width, 24);
      assert.ok(Math.abs(stripSize.height - stripSize.cardHeight) <= 2);
      assert.ok(stripSize.left <= 1);
    }
    await fallbackPage.screenshot({path: path.join(root, "tests", "task-drag-strip.png")});
    await fallbackPage.locator('[data-action="more-task"]').first().click();
    assert.equal(await fallbackPage.locator('#taskMoreMenu [data-action="delete-task"]').count(), 1);
    await fallbackPage.keyboard.press("Escape");
    assert.equal(await fallbackPage.locator("#taskMoreMenu").isVisible(), false);
    const handles = fallbackPage.locator(".drag-handle");
    assert.equal(await handles.count(), 2);
    const sourceBox = await handles.nth(0).boundingBox();
    const targetBox = await handles.nth(1).boundingBox();
    await fallbackPage.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await fallbackPage.mouse.down();
    await fallbackPage.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {steps: 12});
    await fallbackPage.mouse.up();
    await fallbackPage.waitForFunction(() => document.querySelector(".task-card strong").textContent === "排序第二项");
    await fallbackPage.reload({waitUntil: "networkidle"});
    await fallbackPage.waitForFunction(() => window.__todoAppReady === true);
    assert.equal(await fallbackPage.locator(".task-card strong").first().textContent(), "排序第二项");
    await fallbackPage.locator('[data-action="toggle-task"]').first().click();
    await fallbackPage.locator('[data-view="completed"]').click();
    await fallbackPage.locator('[data-action="copy-task-title"]').first().click();
    assert.equal(await fallbackPage.evaluate(() => navigator.clipboard.readText()), "排序第二项");
    await fallbackPage.locator('[data-action="more-task"]').first().click();
    const menuBox = await fallbackPage.locator("#taskMoreMenu").boundingBox();
    assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= 720 && menuBox.y + menuBox.height <= 520);
    await fallbackPage.getByRole("menuitem", {name: "归档", exact: true}).click();
    await fallbackPage.locator('[data-view="archived"]').click();
    await fallbackPage.locator('[data-action="more-task"]').first().click();
    await fallbackPage.getByRole("menuitem", {name: "恢复到已完成", exact: true}).click();
    await fallbackPage.locator('[data-view="completed"]').click();
    await fallbackPage.locator('[data-action="more-task"]').first().click();
    await fallbackPage.getByRole("menuitem", {name: "删除", exact: true}).click();
    await fallbackPage.waitForFunction(() => window.__todoController.state.tasks.length === 1);
    await fallbackPage.locator("#undoButton").click();
    await fallbackPage.waitForFunction(() => window.__todoController.state.tasks.length === 2);
    assert.match(await fallbackPage.locator(".completed-time").textContent(), /完成于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    const centered = await fallbackPage.locator(".status-toggle.checked").evaluate((button) => {
      const a = button.getBoundingClientRect(), b = button.querySelector("svg").getBoundingClientRect();
      return Math.abs(a.x + a.width / 2 - b.x - b.width / 2) < 1 && Math.abs(a.y + a.height / 2 - b.y - b.height / 2) < 1;
    });
    assert.equal(centered, true);
    await fallbackPage.locator("#openCalendarButton").click();
    await fallbackPage.waitForFunction(() => window.__todoCalendarReady === true);
    await fallbackPage.setViewportSize({width: 960, height: 720});
    assert.equal(await fallbackPage.locator(".day-cell.today .calendar-entry").count(), 11);
    await fallbackPage.locator("#toggleWrapButton").click();
    await fallbackPage.waitForFunction(() => document.body.classList.contains("wrap-entries"));
    assert.equal(await fallbackPage.locator(".day-cell.today .calendar-entry-stack").evaluate((el) => el.scrollHeight > el.clientHeight), true);
    await fallbackPage.screenshot({path: path.join(root, "tests", "calendar-wrap.png")});
    await fallbackPage.reload({waitUntil: "networkidle"});
    await fallbackPage.waitForFunction(() => window.__todoCalendarReady === true);
    assert.equal(await fallbackPage.locator("#toggleWrapButton").getAttribute("aria-pressed"), "true");
    await fallbackPage.locator("#exportReportButton").click();
    const expectedSecond = await fallbackPage.evaluate(() => window.TodoPro.currentBiweek(new Date(), 2));
    await fallbackPage.locator("#reportSecondWeek").click();
    assert.equal(await fallbackPage.locator("#reportStart").inputValue(), expectedSecond.start);
    assert.equal(await fallbackPage.locator("#reportEnd").inputValue(), expectedSecond.end);
    assert.equal(await fallbackPage.locator("#reportSecondWeek").getAttribute("aria-pressed"), "true");
    await fallbackPage.locator("#reportFirstWeek").click();
    assert.equal(await fallbackPage.locator("#reportFirstWeek").getAttribute("aria-pressed"), "true");
    await fallbackPage.locator("#reportStart").fill("2026-02-30");
    assert.equal(await fallbackPage.locator("#saveReportButton").isDisabled(), true);
    assert.equal(await fallbackPage.locator("#copyReportButton").isDisabled(), true);
    const reportDate = await fallbackPage.evaluate(() => window.TodoPro.localDateKey());
    await fallbackPage.locator("#reportStart").fill(reportDate);
    await fallbackPage.locator("#reportEnd").fill(reportDate);
    const reportText = await fallbackPage.locator("#reportPreview").inputValue();
    assert.equal(reportText.split("\n").length, 10);
    assert.equal(await fallbackPage.locator("#saveReportButton").evaluate((button) => getComputedStyle(button).backgroundColor), "rgb(82, 111, 163)");
    await fallbackContext.grantPermissions(["clipboard-read", "clipboard-write"]);
    await fallbackPage.locator("#copyReportButton").click();
    const clipboardText = await fallbackPage.evaluate(() => navigator.clipboard.readText());
    assert.equal(clipboardText.replace(/\r\n/g, "\n"), reportText);
    assert.equal(await fallbackPage.locator("#reportBackdrop").isVisible(), true);
    const reportDownloadPromise = fallbackPage.waitForEvent("download");
    await fallbackPage.locator("#saveReportButton").click();
    const reportDownload = await reportDownloadPromise;
    assert.ok(reportDownload.suggestedFilename().endsWith(".txt"));
    const savedText = fs.readFileSync(await reportDownload.path(), "utf8");
    assert.equal(savedText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"), reportText + "\n");
    await fallbackPage.screenshot({path: path.join(root, "tests", "biweekly-report.png")});
    await fallbackContext.close();

    assert.deepEqual(errors, []);
    console.log("ui smoke tests passed");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
