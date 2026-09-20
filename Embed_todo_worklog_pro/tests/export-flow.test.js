"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const path = require("node:path");
const qml = fs.readFileSync(path.join(__dirname, "..", "Embed_todo_worklog_pro.qml"), "utf8");
const hostLayer = {
  exportPayload: ["backup.json", '{"title":"中文"}', "application/json"],
  exportApproved: false, pendingDownload: null,
  localPath: (url) => decodeURIComponent(url.replace("file:///", "")),
};
let starts = 0;
const context = vm.createContext({
  hostLayer, selectedFile: "file:///C:/Users/test/My%20Files/backup.json",
  mainWebView: { runJavaScript: (script) => {
    starts++;
    vm.runInNewContext(script, { window: { TodoPro: { downloadPreparedText: (name, content) => {
      assert.equal(name, "backup.json"); assert.equal(JSON.parse(content).title, "中文");
    } } } });
  } },
});
const dialog = qml.slice(qml.indexOf("id: exportDialog"));
const accepted = dialog.match(/onAccepted: \{([\s\S]*?)^            }/m)[1];
assert.equal(starts, 0);
assert.equal(hostLayer.exportApproved, false);
vm.runInContext('(function(){' + accepted + '})()', context);
assert.equal(starts, 1);
assert.equal(hostLayer.savedPath, "C:/Users/test/My Files/backup.json");
let acceptedDownload = false;
context.download = { accept: () => { acceptedDownload = true; }, cancel: () => assert.fail("unexpected cancel") };
const requested = qml.match(/onDownloadRequested: function\(download\) \{([\s\S]*?)^            }/m)[1];
vm.runInContext('(function(){' + requested + '})()', context);
assert.equal(acceptedDownload, true, "download must be accepted before callback returns");
assert.equal(context.download.downloadDirectory, "C:/Users/test/My Files");
assert.equal(context.download.downloadFileName, "backup.json");
assert.equal(hostLayer.exportApproved, false);
const notices = [];
hostLayer.notifyFile = (message) => notices.push(message);
context.WebEngineDownloadRequest = { DownloadCompleted: 2 };
hostLayer.pendingDownload.isFinished = true;
hostLayer.pendingDownload.state = 2;
const finished = qml.match(/function onIsFinishedChanged\(\) \{([\s\S]*?)^            }/m)[1];
vm.runInContext('(function(){' + finished + '})()', context);
assert.equal(hostLayer.pendingDownload, null);
assert.equal(hostLayer.exportPayload, null);
assert.ok(notices[0].includes('C:/Users/test/My Files/backup.json'));
hostLayer.exportPayload = ['next.csv', 'title\r\n中文', 'text/csv'];
const rejected = dialog.match(/onRejected: \{([\s\S]*?)^            }/m)[1];
vm.runInContext('(function(){' + rejected + '})()', context);
assert.equal(hostLayer.exportPayload, null);
assert.equal(hostLayer.exportApproved, false);
assert.equal(starts, 1, 'cancel must not start another download');
assert.equal(notices[1], '已取消导出');
console.log("export sequencing, completion, cancellation and selected-path tests passed (QML JavaScript harness)");
