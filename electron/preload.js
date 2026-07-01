const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  transcribe: (audioBase64, fileName) => ipcRenderer.invoke("transcribe", audioBase64, fileName),
  exportDocx: (text, fileName) => ipcRenderer.invoke("export-docx", text, fileName),
});