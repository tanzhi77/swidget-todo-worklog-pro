"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const qml = fs.readFileSync(path.join(__dirname, "..", "Embed_todo_worklog_pro.qml"), "utf8");
const context = vm.createContext({
  console, storageReady: false,
  Qt: { btoa: (s) => Buffer.from(s, "binary").toString("base64"), atob: (s) => Buffer.from(s, "base64").toString("binary") },
});
for (const match of qml.matchAll(/^    function [\s\S]*?^    }/gm)) vm.runInContext(match[0], context);
context.currentStateJson = context.defaultStateJson();
const saved = JSON.parse(context.currentStateJson);
saved.revision = 7;
saved.tasks = [{ id: "persisted", title: "重启后恢复" }];
context.stateJson = "file:" + context.encodeState(JSON.stringify(saved));
const handler = qml.match(/onStateJsonChanged: \{([\s\S]*?)^    }/m)[1];
vm.runInContext(handler, context);
assert.equal(JSON.parse(context.currentStateJson).tasks[0].title, "重启后恢复");
assert.equal(context.commitState(JSON.stringify(saved), 7), false);
context.storageReady = true;
assert.equal(context.commitState(JSON.stringify(saved), 6), false);
assert.equal(context.commitState(JSON.stringify(saved), 7), true);
assert.equal(JSON.parse(context.currentStateJson).revision, 8);
const next = context.encodeState(context.currentStateJson);
context.currentStateJson = context.defaultStateJson();
context.stateJson = "file:" + next;
vm.runInContext(handler, context);
assert.equal(JSON.parse(context.currentStateJson).revision, 8);
assert.equal(JSON.parse(context.currentStateJson).tasks.length, 1);
console.log("QML state restore and revision tests passed (JavaScript harness, not Qt runtime)");
