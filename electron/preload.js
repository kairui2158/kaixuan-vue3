const { contextBridge, ipcRenderer } = require('electron')

function cloneableSnapshot(value) {
  try {
    if (typeof structuredClone === 'function') return structuredClone(value)
  } catch (error) {
    // Renderer callers may pass Vue/Pinia reactive proxies. The JSON snapshot
    // matches the persisted storage format and keeps IPC cloneable.
  }
  return JSON.parse(JSON.stringify(value))
}

// Backward-compatible API (matches original preload.js)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron,

  // Crypto
  encrypt: function(text) { return ipcRenderer.invoke('safe:encrypt', cloneableSnapshot(text)) },
  decrypt: function(val) { return ipcRenderer.invoke('safe:decrypt', cloneableSnapshot(val)) },

  // Storage
  storageRead: function(key) {
    if (typeof key !== 'string') throw new TypeError('storageRead: key must be string')
    return ipcRenderer.invoke('storage:read', key)
  },
  storageWrite: function(key, data) {
    if (typeof key !== 'string') throw new TypeError('storageWrite: key must be string')
    return ipcRenderer.invoke('storage:write', key, cloneableSnapshot(data))
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
  outlineJournalApply: function(projectId, commands, options) {
    return ipcRenderer.invoke(
      'outlineJournal:apply',
      projectId,
      cloneableSnapshot(commands),
      cloneableSnapshot(options || {})
    )
  },
  outlineJournalSnapshot: function(projectId) {
    return ipcRenderer.invoke('outlineJournal:snapshot', projectId)
  },
  outlineJournalMigrate: function(projectId, messages) {
    return ipcRenderer.invoke('outlineJournal:migrate', projectId, cloneableSnapshot(messages))
  },
  outlineJournalFlush: function(projectId) {
    return ipcRenderer.invoke('outlineJournal:flush', projectId)
  },
  outlineJournalFlushAll: function() {
    return ipcRenderer.invoke('outlineJournal:flushAll')
  },
  outlineJournalRestore: function(projectId, snapshot) {
    return ipcRenderer.invoke('outlineJournal:restore', projectId, cloneableSnapshot(snapshot))
  },
  outlineJournalLegacyCandidates: function(projectId) {
    return ipcRenderer.invoke('outlineJournal:legacyCandidates', projectId)
  },
  outlineJournalRestoreLegacy: function(projectId) {
    return ipcRenderer.invoke('outlineJournal:restoreLegacy', projectId)
  },
  outlineJournalTestFailureControl: function(command) {
    return ipcRenderer.invoke('outlineJournal:testFailureControl', command)
  },

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
  responsivenessLedger: function() { return ipcRenderer.invoke('responsiveness:ledger') },
  responsivenessReport: function(payload) { return ipcRenderer.invoke('responsiveness:report', payload || {}) },
  responsivenessTestControl: function(payload) { return ipcRenderer.invoke('responsiveness:testControl', payload || {}) },
  onResponsivenessEvent: function(callback) {
    var listener = function(_event, detail) { callback(detail || {}) }
    ipcRenderer.on('app:responsivenessEvent', listener)
    return function() { ipcRenderer.removeListener('app:responsivenessEvent', listener) }
  },
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
  runTraceList: function(source) { return ipcRenderer.invoke('runTrace:list', source || 'pipeline') },
  runTraceRead: function(payload) { return ipcRenderer.invoke('runTrace:read', payload || {}) },
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
  skillPackageResolveVersion: function(skillId, version) {
    return ipcRenderer.invoke('skillPackage:resolveVersion', skillId, version)
  },
  skillPackageExport: function(skillId, targetPath, version) {
    return ipcRenderer.invoke('skillPackage:export', skillId, targetPath, version)
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
  providerNetRegistry: function() { return ipcRenderer.invoke('providerNet:registry') },
  providerNetHeartbeat: function(streamId) { return ipcRenderer.invoke('providerNet:heartbeat', streamId) },
  providerNetSchedulerSnapshot: function() { return ipcRenderer.invoke('providerNet:schedulerSnapshot') },
  onProviderNetStreamFrame: function(callback) {
    var listener = function(event, payload) { callback(payload) }
    ipcRenderer.on('providerNet:streamFrame', listener)
    return function() { ipcRenderer.removeListener('providerNet:streamFrame', listener) }
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
