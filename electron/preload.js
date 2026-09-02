const { contextBridge, ipcRenderer } = require('electron')

// Backward-compatible API (matches original preload.js)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,

  // Crypto
  encrypt: function(text) { return ipcRenderer.invoke('safe:encrypt', text) },
  decrypt: function(val) { return ipcRenderer.invoke('safe:decrypt', val) },

  // Storage
  storageRead: function(key) {
    if (typeof key !== 'string') throw new TypeError('storageRead: key must be string')
    return ipcRenderer.invoke('storage:read', key)
  },
  storageWrite: function(key, data) {
    if (typeof key !== 'string') throw new TypeError('storageWrite: key must be string')
    return ipcRenderer.invoke('storage:write', key, data)
  },
  storageRemove: function(key) {
    if (typeof key !== 'string') throw new TypeError('storageRemove: key must be string')
    return ipcRenderer.invoke('storage:remove', key)
  },
  storageList: function() { return ipcRenderer.invoke('storage:list') },
  storageCorruptionLog: function() { return ipcRenderer.invoke('storage:corruptionLog') },
  storageExport: function(filePath) { return ipcRenderer.invoke('storage:export', filePath) },
  storageImport: function(filePath) { return ipcRenderer.invoke('storage:import', filePath) },
  storageGetDataDir: function() { return ipcRenderer.invoke('storage:getDataDir') },
  storageOpenDataDir: function() { return ipcRenderer.invoke('storage:openDataDir') },

  // Dialog
  dialogSaveFile: function(defaultName) { return ipcRenderer.invoke('dialog:saveFileAsync', defaultName) },
  dialogOpenFile: function() { return ipcRenderer.invoke('dialog:openFileAsync') },
  dialogReadFile: function(filePath) { return ipcRenderer.invoke('dialog:readFileAsync', filePath) },
  dialogSaveFileAsync: function(defaultName) { return ipcRenderer.invoke('dialog:saveFileAsync', defaultName) },
  dialogOpenFileAsync: function() { return ipcRenderer.invoke('dialog:openFileAsync') },
  dialogReadFileAsync: function(filePath) { return ipcRenderer.invoke('dialog:readFileAsync', filePath) },
  dialogWriteFile: function(filePath, content) { return ipcRenderer.invoke('dialog:writeFile', filePath, content) },

  // Native clipboard bridge for Electron context isolation.
  clipboardWrite: function(text) { return ipcRenderer.invoke('clipboard:write', String(text || '')) },
  clipboardRead: function() { return ipcRenderer.invoke('clipboard:read') },

  // Lifecycle
  getAppVersion: function() { return ipcRenderer.invoke('app:getVersion') },
  onFinalSave: function(callback) { ipcRenderer.on('app:finalSave', function() { callback() }) },
  forceQuit: function() { ipcRenderer.send('app:quit') },
  onCloseRequest: function(callback) { ipcRenderer.on('app:requestClose', function() { callback() }) },
  respondCloseChoice: function(choice) { ipcRenderer.send('app:closeChoice', choice) },
  sendSaveComplete: function() { ipcRenderer.send('app:saveComplete') },
  onOpenHelpGuide: function(callback) { ipcRenderer.on('app:openHelpGuide', function() { callback() }) },

  // Diag
  diagWrite: function(entries) { return ipcRenderer.invoke('diag:write', entries) },
  diagRead: function(date) { return ipcRenderer.invoke('diag:read', date || '') },
  diagExport: function(options) { return ipcRenderer.invoke('diag:export', options || {}) },
  diagClear: function() { return ipcRenderer.invoke('diag:clear') },
  diagRefresh: function() { return ipcRenderer.invoke('diag:refresh') },

  // API
  fetchModels: function(baseUrl, apiKey) {
    if (typeof baseUrl !== 'string' || typeof apiKey !== 'string')
      throw new TypeError('fetchModels: baseUrl and apiKey must be strings')
    return ipcRenderer.invoke('api:fetchModels', baseUrl, apiKey)
  },

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
  providerTestConnection: function(baseUrl, apiKey) {
    if (typeof baseUrl !== 'string' || typeof apiKey !== 'string')
      throw new TypeError('providerTestConnection: baseUrl and apiKey must be strings')
    return ipcRenderer.invoke('provider:testConnection', baseUrl, apiKey)
  }
})
