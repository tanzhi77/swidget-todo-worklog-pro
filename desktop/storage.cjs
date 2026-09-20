"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const context = { window: {}, console, Intl, URL, Blob, crypto: crypto.webcrypto, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../Embed_todo_worklog_pro/todo-core.js"), "utf8"), context);
const core = context.window.TodoPro;

class Storage {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true });
    this.filename = path.join(directory, "state.json");
    this.backup = path.join(directory, "state.backup.json");
    const probe = path.join(directory, ".write-probe-" + process.pid);
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
    this.state = fs.existsSync(this.filename)
      ? this.parse(fs.readFileSync(this.filename, "utf8")) : core.createDefaultState();
  }
  parse(json) {
    if (typeof json !== "string" || Buffer.byteLength(json) > 20 * 1024 * 1024) throw new Error("数据超出限制");
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.workItems)) throw new Error("数据文件格式无效");
    return core.normalizeState(parsed);
  }
  load() { return JSON.stringify(this.state); }
  commit(json, revision) {
    if (revision !== this.state.revision) return false;
    const next = this.parse(json);
    next.revision = this.state.revision + 1;
    const temp = this.filename + ".tmp";
    const fd = fs.openSync(temp, "w");
    try { fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    if (fs.existsSync(this.filename)) fs.copyFileSync(this.filename, this.backup);
    fs.renameSync(temp, this.filename);
    this.state = next;
    return true;
  }
}
module.exports = { Storage };
