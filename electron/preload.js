const { contextBridge, ipcRenderer } = require('electron')

// Backward-compatible API (matches original preload.js)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,

  // Crypto
  encrypt: function(text) { return ipcRenderer.sendSync('safe:encrypt', text) },
  decrypt: function(val) { return ipcRenderer.sendSync('safe:decrypt', val) },

  // Storage
  storageRead: function(key) { return ipcRenderer.sendSync('storage:read', key) },
  storageWrite: function(key, data) { return ipcRenderer.sendSync('storage:write', key, data) },
  storageRemove: function(key) { return ipcRenderer.sendSync('storage:remove', key) },
  storageList: function() { return ipcRenderer.sendSync('storage:list') },
  storageExport: function(filePath) { return ipcRenderer.sendSync('storage:export', filePath) },
  storageImport: function(filePath) { return ipcRenderer.sendSync('storage:import', filePath) },
  storageGetDataDir: function() { return ipcRenderer.sendSync('storage:getDataDir') },

  // Dialog
  dialogSaveFile: function(defaultName) { return ipcRenderer.sendSync('dialog:saveFile', defaultName) },
  dialogOpenFile: function() { return ipcRenderer.sendSync('dialog:openFile') },

  // Lifecycle
  onFinalSave: function(callback) { ipcRenderer.on('app:finalSave', function() { callback() }) },
  forceQuit: function() { ipcRenderer.send('app:quit') },
  onCloseRequest: function(callback) { ipcRenderer.on('app:requestClose', function() { callback() }) },
  respondCloseChoice: function(choice) { ipcRenderer.send('app:closeChoice', choice) },

  // Diag
  diagWrite: function(batch) { return ipcRenderer.sendSync('diag:write', batch) },
  diagRead: function(date) { return ipcRenderer.sendSync('diag:read', date || '') },
  diagExport: function() { return ipcRenderer.sendSync('diag:export') },
  diagClear: function() { return ipcRenderer.sendSync('diag:clear') },

  // API
  fetchModels: function(baseUrl, apiKey) { return ipcRenderer.invoke('api:fetchModels', baseUrl, apiKey) },

  // New channels (Vue 3 migration)
  // Agent
  agentExecute: function(config) { return ipcRenderer.invoke('agent:execute', config) },
  agentSpawn: function(config) { return ipcRenderer.invoke('agent:spawn', config) },
  agentStatus: function(agentId) { return ipcRenderer.invoke('agent:status', agentId) },
  agentCancel: function(agentId) { return ipcRenderer.invoke('agent:cancel', agentId) },

  // Pipeline
  pipelineGenerate: function(config) { return ipcRenderer.invoke('pipeline:generate', config) },
  pipelineResume: function(breakpoint) { return ipcRenderer.invoke('pipeline:resume', breakpoint) },

  // DeAI
  deaiProcess: function(config) { return ipcRenderer.invoke('deai:process', config) },
  deaiCancel: function() { return ipcRenderer.invoke('deai:cancel') },

  // Skill
  skillExecute: function(config) { return ipcRenderer.invoke('skill:execute', config) },
  skillValidate: function(output, rules) { return ipcRenderer.invoke('skill:validate', output, rules) },

  // Provider
  providerTestConnection: function(baseUrl, apiKey) { return ipcRenderer.invoke('provider:testConnection', baseUrl, apiKey) }
})
