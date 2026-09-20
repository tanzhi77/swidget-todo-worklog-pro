"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { downloadArtifact } = require("@electron/get");
const { createPackage } = require("@electron/asar");
const { extract } = require("@electron-internal/extract-zip");
const root = path.resolve(__dirname, "..");
const staging = path.join(root, "build", "staging");
fs.mkdirSync(staging, {recursive: true});
const pkg = require("../package.json");
fs.writeFileSync(path.join(staging, "package.json"), JSON.stringify({name: pkg.name, version: pkg.version, main: pkg.main}));
fs.cpSync(path.join(root, "desktop"), path.join(staging, "desktop"), {recursive: true, filter: (source) => !source.includes(path.sep + "tests")});
const assets = path.join(staging, "Embed_todo_worklog_pro");
fs.mkdirSync(assets, {recursive: true});
for (const file of fs.readdirSync(path.join(root, "Embed_todo_worklog_pro"))) {
  if (/\.(html|css|js|png)$/.test(file)) fs.copyFileSync(path.join(root, "Embed_todo_worklog_pro", file), path.join(assets, file));
}
(async () => {
  const output = path.join(root, "build", "portable", "TodoWorklogPro-win32-x64");
  fs.mkdirSync(output, {recursive: true});
  const archive = await downloadArtifact({version: pkg.devDependencies.electron, artifactName: "electron", platform: "win32", arch: "x64"});
  await extract(archive, {dir: output});
  fs.copyFileSync(path.join(output, "electron.exe"), path.join(output, "TodoWorklogPro.exe"));
  fs.unlinkSync(path.join(output, "electron.exe"));
  fs.rmSync(path.join(output, "resources", "default_app.asar"), {force: true});
  await createPackage(staging, path.join(output, "resources", "app.asar"));
  fs.copyFileSync(path.join(root, "README.md"), path.join(output, "README.md"));
  console.log(output);
})().catch((error) => { console.error(error); process.exitCode = 1; });
