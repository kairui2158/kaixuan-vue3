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
  dialogOpenDirectoryAsync: function() { return ipcRenderer.invoke('dialog:openDirectoryAsync') },
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
  onRendererRecoveryNotice: function(callback) {
    var listener = function(_event, detail) { callback(detail) }
    ipcRenderer.on('app:rendererRecoveryNotice', listener)
    return function() { ipcRenderer.removeListener('app:rendererRecoveryNotice', listener) }
  },
  onGetCurrentProjectId: function(callback) { ipcRenderer.on('app:getCurrentProjectId', function() { callback() }) },
  windowOpenProject: function(pid) { return ipcRenderer.invoke('window:openProject', pid) },
  windowSetCurrentProject: function(pid) { return ipcRenderer.invoke('window:setCurrentProject', pid) },
  windowGetInitialProjectId: function() { return ipcRenderer.invoke('window:getInitialProjectId') },

  // Agent
  agentStateSave: function(payload) { return ipcRenderer.invoke('agent:state:save', payload || {}) },
  agentStatus: function(target) { return ipcRenderer.invoke('agent:status', target) },
  agentCancel: function(agentId, reason) { return ipcRenderer.invoke('agent:cancel', agentId, reason) },
  agentCancelToken: function(payload) { return ipcRenderer.invoke('agent:cancel-token', payload || {}) },
  agentCheckpointSave: function(payload) { return ipcRenderer.invoke('agent:checkpoint:save', payload || {}) },
  agentCheckpointLoad: function(checkpointId) { return ipcRenderer.invoke('agent:checkpoint:load', checkpointId) },
  agentCheckpointList: function() { return ipcRenderer.invoke('agent:checkpoint:list') },
  agentRecover: function() { return ipcRenderer.invoke('agent:recover') },

  // Diag
  diagWrite: function(entries) { return ipcRenderer.invoke('diag:write', entries) },
  diagRead: function(date) { return ipcRenderer.invoke('diag:read', date || '') },
  diagExport: function(options) { return ipcRenderer.invoke('diag:export', options || {}) },
  diagClear: function() { return ipcRenderer.invoke('diag:clear') },
  diagRefresh: function() { return ipcRenderer.invoke('diag:refresh') },
  runTraceExport: function(payload) { return ipcRenderer.invoke('runTrace:export', payload || {}) },
  runTraceReportStateIntegrity: function(report) { ipcRenderer.send('runTrace:stateIntegrity', report || {}) },
  runTraceSave: function(payload) { return ipcRenderer.invoke('runTrace:save', payload || {}) },
  runTraceRemove: function(payload) { return ipcRenderer.invoke('runTrace:remove', payload || {}) },
  runTraceOpenFolder: function(source) { return ipcRenderer.invoke('runTrace:openFolder', source || 'pipeline') },
  intentCorpusAppend: function(payload) { return ipcRenderer.invoke('intentCorpus:append', payload || {}) },
  intentCorpusStatus: function() { return ipcRenderer.invoke('intentCorpus:status') },
  intentCorpusExportPackage: function(payload) { return ipcRenderer.invoke('intentCorpus:exportPackage', payload || {}) },

  // Skills
  skillListFolders: function(rootPath) { return ipcRenderer.invoke('skill:listFolders', rootPath) },
  skillPackageOpenDialog: function() { return ipcRenderer.invoke('skillPackage:openDialog') },
  skillPackagePreview: function(zipPath) { return ipcRenderer.invoke('skillPackage:preview', zipPath) },
  skillPackageInstall: function(zipPath, skillId, version) {
    return ipcRenderer.invoke('skillPackage:install', zipPath, skillId, version)
  },
  skillPackageListVersions: function(skillId) {
    return ipcRenderer.invoke('skillPackage:listVersions', skillId)
  },
  skillPackageExport: function(skillId, targetPath) {
    return ipcRenderer.invoke('skillPackage:export', skillId, targetPath)
  },
  skillOpenFolder: function(folderPath) { return ipcRenderer.invoke('skill:openFolder', folderPath) },
  skillLoadFolder: function(folderPath) { return ipcRenderer.invoke('skill:loadFolder', folderPath) },
  skillExecuteScript: function(script, payload) { return ipcRenderer.invoke('skill:executeScript', script, payload) },

  // API providers
  providerTestConnection: function(baseUrl, apiKey) { return ipcRenderer.invoke('provider:testConnection', baseUrl, apiKey) },
  fetchModels: function(baseUrl, apiKey) {
    if (typeof baseUrl !== 'string' || typeof apiKey !== 'string')
      throw new TypeError('fetchModels: baseUrl and apiKey must be strings')
    return ipcRenderer.invoke('api:fetchModels', baseUrl, apiKey)
  },
  providerNetStream: function(payload) { return ipcRenderer.invoke('providerNet:stream', payload || {}) },
  providerNetRequest: function(request) { return ipcRenderer.invoke('providerNet:request', request) },
  providerNetAbort: function(signalId) { return ipcRenderer.invoke('providerNet:abort', signalId) },
  onProviderNetStreamChunk: function(callback) {
    var listener = function(event, payload) { callback(payload) }
    ipcRenderer.on('providerNet:streamChunk', listener)
    return function() { ipcRenderer.removeListener('providerNet:streamChunk', listener) }
  },

  // Intent routing is synchronous, so the native Chinese tokenizer lives in
  // the main process and is bridged synchronously here.
  jiebaCut: function(text, hmm) {
    return ipcRenderer.sendSync('jieba:cut', text, Boolean(hmm))
  },

  // Local embedding is a main-process-only capability and stays offline.
  intentEmbed: function(texts) { return ipcRenderer.invoke('intent:embed', texts || []) },
  intentEmbeddingStatus: function() { return ipcRenderer.invoke('intent:embeddingStatus') },
  intentEmbeddingWarmup: function() { return ipcRenderer.invoke('intent:embeddingWarmup') }
})
