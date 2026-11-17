// The bridge between the game page and the desktop app (sandboxed preload).
// Exposes `window.spacefrontDesktop`, matching DesktopBridge in
// src/client/platform/desktopPlatform.ts. Nothing else of Node or Electron
// reaches the page.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const steamInfo = ipcRenderer.sendSync("sf:steamInfo");

contextBridge.exposeInMainWorld("spacefrontDesktop", {
  version: "1",
  saveFile: (name, data) => ipcRenderer.invoke("sf:saveFile", name, data),
  loadFile: (name) => ipcRenderer.invoke("sf:loadFile", name),
  listFiles: (prefix) => ipcRenderer.invoke("sf:listFiles", prefix),
  deleteFile: (name) => ipcRenderer.invoke("sf:deleteFile", name),
  steam: {
    available: steamInfo.available,
    cloudSaves: steamInfo.cloudSaves,
    unlockAchievement: (id) => ipcRenderer.send("sf:achievement", id),
  },
});
