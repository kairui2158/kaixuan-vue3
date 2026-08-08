const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  version: process.versions.electron,
  encrypt: function(text) { return ipcRenderer.sendSync("safe:encrypt", text); },
  decrypt: function(val) { return ipcRenderer.sendSync("safe:decrypt", val); },
  storageRead: function(key) { return ipcRenderer.sendSync("storage:read", key); },
  storageWrite: function(key, data) { return ipcRenderer.sendSync("storage:write", key, data); },
  storageRemove: function(key) { return ipcRenderer.sendSync("storage:remove", key); },
  storageList: function() { return ipcRenderer.sendSync("storage:list"); },
  storageExport: function(filePath) { return ipcRenderer.sendSync("storage:export", filePath); },
  storageImport: function(filePath) { return ipcRenderer.sendSync("storage:import", filePath); },
  storageGetDataDir: function() { return ipcRenderer.sendSync("storage:getDataDir"); },
  dialogSaveFile: function(defaultName) { return ipcRenderer.sendSync("dialog:saveFile", defaultName); },
  dialogOpenFile: function() { return ipcRenderer.sendSync("dialog:openFile"); },
  onFinalSave: function(callback) {
    ipcRenderer.on("app:finalSave", function() { callback(); });
  },
 forceQuit: function() { ipcRenderer.send("app:quit"); },
  onCloseRequest: function(callback) {
    ipcRenderer.on("app:requestClose", function() { callback(); });
  },
  respondCloseChoice: function(choice) { ipcRenderer.send("app:closeChoice", choice); },
  diagWrite: function(batch) { return ipcRenderer.sendSync("diag:write", batch); },
  diagRead: function(date) { return ipcRenderer.sendSync("diag:read", date || ""); },
  diagExport: function() { return ipcRenderer.sendSync("diag:export"); },
 diagClear: function() { return ipcRenderer.sendSync("diag:clear"); },
   fetchModels: function(baseUrl, apiKey) { return ipcRenderer.invoke("api:fetchModels", baseUrl, apiKey); },
});
