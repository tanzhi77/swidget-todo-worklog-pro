"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Storage } = require("../storage.cjs");
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "todo-portable-"));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}
test("state survives restart and rejects stale revisions", (t) => {
  const dir = directory(t);
  const store = new Storage(dir);
  const state = JSON.parse(store.load());
  state.tasks.push({id:"test",title:"重启恢复测试",status:"active",tags:[],subtasks:[]});
  assert.equal(store.commit(JSON.stringify(state), 0), true);
  assert.equal(store.commit(JSON.stringify(state), 0), false);
  const restored = new Storage(dir);
  assert.equal(JSON.parse(restored.load()).tasks[0].title, "重启恢复测试");
  assert.equal(JSON.parse(restored.load()).revision, 1);
  assert.equal(restored.commit(restored.load(), 1), true);
  assert.equal(JSON.parse(fs.readFileSync(store.backup)).revision, 1);
});
test("invalid data is never silently replaced", (t) => {
  const dir = directory(t);
  const file = path.join(dir, "state.json");
  fs.writeFileSync(file, "{bad data");
  assert.throws(() => new Storage(dir));
  assert.equal(fs.readFileSync(file, "utf8"), "{bad data");
});
test("separate directories stay isolated and invalid commit preserves disk", (t) => {
  const a = new Storage(directory(t)), b = new Storage(directory(t));
  a.commit(a.load(), 0);
  const before = fs.readFileSync(a.filename, "utf8");
  assert.throws(() => a.commit('{"tasks":[]}', 1));
  assert.equal(fs.readFileSync(a.filename, "utf8"), before);
  assert.equal(JSON.parse(b.load()).revision, 0);
});
