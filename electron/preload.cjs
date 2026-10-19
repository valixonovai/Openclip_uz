const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("uzclip", {
  openVideo: () => ipcRenderer.invoke("dialog:open-video"),
  saveVideo: (suggestedName) => ipcRenderer.invoke("dialog:save-video", suggestedName),
  mediaUrl: (projectId) => ipcRenderer.invoke("media:url", projectId),
  request: (method, params) => ipcRenderer.invoke("worker:request", { method, params }),
  onEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("worker:event", handler);
    return () => ipcRenderer.removeListener("worker:event", handler);
  },
});
