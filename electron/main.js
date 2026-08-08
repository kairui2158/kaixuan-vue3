const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// Enable GPU hardware acceleration
app.disableHardwareAcceleration = false
app.commandLine.appendSwitch('enable-gpu-rasterization')

// IPC handler modules
const { registerCryptoHandlers } = require('./ipc/crypto')
const { registerStorageHandlers, setDataDir, getDataDir } = require('./ipc/storage')
const { registerDiagHandlers, setLogDir } = require('./ipc/diag')
const { registerApiHandlers } = require('./ipc/api')
const { registerDialogHandlers } = require('./ipc/dialog')
const { registerLifecycleHandlers } = require('./ipc/lifecycle')

var mainWindow = null

function createWindow() {
  var userDataDir = app.getPath('userData')
  var dataDir = path.join(userDataDir, 'data')
  var logDir = path.join(userDataDir, 'logs')

  setDataDir(dataDir)
  setLogDir(logDir)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0a0a0c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  // Register all IPC handlers
  registerCryptoHandlers()
  registerStorageHandlers()
  registerDiagHandlers()
  registerApiHandlers()
  registerDialogHandlers()
  registerLifecycleHandlers(mainWindow)

 // New IPC channels for Vue 3 migration
  // These features are handled in renderer process via composables
 ipcMain.handle('agent:execute', async function(event, config) {
    return { status: 'renderer_handled' }
 })

 ipcMain.handle('agent:spawn', async function(event, config) {
    return { status: 'renderer_handled' }
 })

 ipcMain.handle('agent:status', function(event, agentId) {
    return { status: 'renderer_handled' }
 })

 ipcMain.handle('agent:cancel', function(event, agentId) {
    return { status: 'ok' }
 })

 ipcMain.handle('pipeline:generate', async function(event, config) {
    return { status: 'renderer_handled' }
 })

 ipcMain.handle('pipeline:resume', async function(event, breakpoint) {
    return { status: 'renderer_handled' }
 })

 ipcMain.handle('deai:process', async function(event, config) {
    return { status: 'renderer_handled' }
 })

 ipcMain.handle('deai:cancel', function(event) {
   return { status: 'ok' }
 })

 ipcMain.handle('skill:execute', async function(event, config) {
    return { status: 'renderer_handled' }
 })

 ipcMain.handle('skill:validate', function(event, output, rules) {
   return { valid: true, errors: [] }
 })

 ipcMain.handle('provider:testConnection', async function(event, baseUrl, apiKey) {
  ipcMain.handle('provider:testConnection', async function(event, baseUrl, apiKey) {
    try {
      var tUrl = baseUrl.replace(/\/$/, '') + '/v1/models'
      var tResp = await fetch(tUrl, { headers: { 'Authorization': 'Bearer ' + apiKey } })
      if (tResp.ok) return { connected: true }
      return { connected: false, error: 'HTTP ' + tResp.status }
    } catch(te) {
      return { connected: false, error: te.message }
    }
 })

  // Load the app
  var isDev = process.argv.includes('--dev')
  if (isDev) {
    // In dev mode, load from Vite dev server or old renderer
    var viteUrl = 'http://localhost:5173'
    mainWindow.loadURL(viteUrl).catch(function() {
      // Fallback to old renderer during migration
      mainWindow.loadFile(path.join(__dirname, '..', 'renderer.html'))
    })
    mainWindow.webContents.openDevTools()
  } else {
    // Production: load built Vue app, fallback to old renderer
    var vueIndex = path.join(__dirname, '..', 'dist-renderer', 'index.html')
    if (fs.existsSync(vueIndex)) {
      mainWindow.loadFile(vueIndex)
    } else {
      mainWindow.loadFile(path.join(__dirname, '..', 'renderer.html'))
    }
  }

  // CDP debug port for testing
  if (isDev) {
    mainWindow.webContents.on('did-finish-load', function() {
      // Enable remote debugging
    })
  }
}

app.whenReady().then(function() {
  createWindow()

  app.on('activate', function() {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') app.quit()
})

// Single instance lock
var gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', function() {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// Error handlers
process.on('uncaughtException', function(e) {
  console.error('Uncaught:', e)
})
process.on('unhandledRejection', function(reason) {
  console.error('Unhandled rejection:', reason)
})
