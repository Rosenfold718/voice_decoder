const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("voxApp", {
  platform: process.platform,
  isElectron: true,
});