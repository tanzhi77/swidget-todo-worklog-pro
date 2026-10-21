"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("portableHost", {
  load: () => ipcRenderer.invoke("state:load"),
  copyText: (text) => ipcRenderer.invoke("clipboard:write", text),
  commit: (json, revision) => ipcRenderer.invoke("state:commit", json, revision),
  openCalendar: () => ipcRenderer.invoke("calendar:open"),
  closeCalendar: () => ipcRenderer.invoke("calendar:close"),
  exportText: (name, text, mime) => ipcRenderer.invoke("file:export", name, text, mime),
  onState: (callback) => {
    const listener = (_event, json) => callback(json);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
});
