const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  exit: () => ipcRenderer.send("exit"),
  openFile: () => ipcRenderer.send("dialog:openFile"),
  fullscreen: () => ipcRenderer.send("fullscreen"),
  unfullscreen: () => ipcRenderer.send("unfullscreen"),
  isFullscreen: () => !!ipcRenderer.sendSync("isFullscreen"),

  isSteam: () => false,
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke("write-file", filePath, content),
  getUserDataPath: () => ipcRenderer.sendSync("get-user-data-path"),
  lunaCopyText: (text) => ipcRenderer.send("copy-text", text),
});
