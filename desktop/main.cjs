"use strict";
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, screen, clipboard } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { Storage } = require("./storage.cjs");
const root = path.resolve(__dirname, "..");
const base = app.isPackaged ? path.dirname(app.getPath("exe")) : root;
const dataDirectory = process.env.TODO_WORKLOG_DATA_DIR
  ? path.resolve(process.env.TODO_WORKLOG_DATA_DIR) : path.join(base, app.isPackaged ? "data" : ".portable-data");
let storage, mainWindow, calendarWindow;
const windows = new Set();
let exporting = false;
try {
  storage = new Storage(dataDirectory);
  app.setPath("userData", path.join(dataDirectory, "runtime"));
  app.setPath("sessionData", path.join(dataDirectory, "runtime"));
  app.setPath("crashDumps", path.join(dataDirectory, "crashes"));
} catch (error) {
  dialog.showErrorBox("无法打开数据", "请将工具放在可写目录。已有数据文件若损坏，请先备份再通过 state.backup.json 恢复。\n" + error.message);
  app.exit(1);
}
const locked = storage && app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
  function createWindow(page, options) {
    const win = new BrowserWindow({
      ...options, show: false, backgroundColor: "#ffffff",
      webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    windows.add(win);
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event) => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.once("ready-to-show", () => win.show());
    win.on("closed", () => windows.delete(win));
    win.loadFile(path.join(root, "Embed_todo_worklog_pro", page));
    return win;
  }
  function openCalendar() {
    if (calendarWindow && !calendarWindow.isDestroyed()) {
      if (calendarWindow.isMinimized()) calendarWindow.restore();
      calendarWindow.show(); calendarWindow.focus(); return true;
    }
    const area = screen.getDisplayMatching(mainWindow.getBounds()).workAreaSize;
    calendarWindow = createWindow("work-calendar.html", {
      title: "工作月历", width: Math.round(area.width * 0.8), height: Math.round(area.height * 0.85),
      minWidth: Math.min(720, area.width), minHeight: Math.min(520, area.height),
    });
    calendarWindow.on("closed", () => { calendarWindow = null; });
    return true;
  }
  function handle(channel, callback) {
    ipcMain.handle(channel, (event, ...args) => {
      const owner = [...windows].find((win) => win.webContents === event.sender);
      if (!owner || event.senderFrame !== event.sender.mainFrame) throw new Error("请求来源无效");
      return callback(owner, ...args);
    });
  }
  app.whenReady().then(() => {
    handle("state:load", () => storage.load());
    handle("clipboard:write", (_owner, text) => {
      if (typeof text !== "string" || Buffer.byteLength(text) > 20 * 1024 * 1024) throw new Error("复制内容无效");
      clipboard.writeText(text);
      return true;
    });
    handle("state:commit", (_owner, json, revision) => {
      const accepted = storage.commit(json, revision);
      if (accepted) for (const win of windows) win.webContents.send("state:changed", storage.load());
      return accepted;
    });
    handle("calendar:open", openCalendar);
    handle("calendar:close", () => { calendarWindow?.close(); return true; });
    handle("file:export", async (owner, filename, text) => {
      if (exporting) return "请先完成当前导出";
      if (typeof text !== "string" || Buffer.byteLength(text) > 50 * 1024 * 1024) throw new Error("导出内容无效");
      const name = path.basename(String(filename));
      const extension = path.extname(name).slice(1).toLowerCase();
      if (!["json", "csv", "txt"].includes(extension)) throw new Error("不支持的导出类型");
      exporting = true;
      try {
        const result = await dialog.showSaveDialog(owner, {
          title: "选择导出位置", defaultPath: path.join(base, name),
          filters: [{ name: extension.toUpperCase() + " 文件", extensions: [extension] }],
        });
        if (result.canceled || !result.filePath) return "已取消导出";
        await fs.promises.writeFile(result.filePath, text, "utf8");
        return "已保存至：" + result.filePath;
      } finally { exporting = false; }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "文件", submenu: [
        { label: "工作月历", click: openCalendar },
        { label: "打开数据目录", click: () => shell.openPath(dataDirectory) },
        { type: "separator" }, { label: "退出", role: "quit" },
      ] },
      { label: "编辑", submenu: [{role:"undo"},{role:"redo"},{type:"separator"},{role:"cut"},{role:"copy"},{role:"paste"},{role:"selectAll"}] },
      { label: "视图", submenu: [{ label: "放大", role: "zoomIn" },{ label: "缩小", role: "zoomOut" },{ label: "实际大小", role: "resetZoom" }] },
    ]));
    mainWindow = createWindow("todo.html", { title: "待办与工作记录 Pro", width: 820, height: 780, minWidth: 420, minHeight: 420 });
    mainWindow.on("closed", () => { mainWindow = null; app.quit(); });
  }).catch((error) => { dialog.showErrorBox("启动失败", error.message); app.quit(); });
}
app.on("window-all-closed", () => app.quit());
