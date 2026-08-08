const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

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
  // Agent management channels
  ipcMain.handle('agent:execute', async function(event, config) {
    // Placeholder: will be connected to agent-scheduler in stage 7
    return { status: 'not_implemented', message: 'Agent scheduler not yet available' }
  })

  ipcMain.handle('agent:spawn', async function(event, config) {
    return { status: 'not_implemented', message: 'Agent spawn not yet available' }
  })

  ipcMain.handle('agent:status', function(event, agentId) {
    return { status: 'not_implemented' }
  })

  ipcMain.handle('agent:cancel', function(event, agentId) {
    return { status: 'not_implemented' }
  })

  // Pipeline channels
  ipcMain.handle('pipeline:generate', async function(event, config) {
    return { status: 'not_implemented' }
  })

  ipcMain.handle('pipeline:resume', async function(event, breakpoint) {
    return { status: 'not_implemented' }
  })

  // DeAI channels
  ipcMain.handle('deai:process', async function(event, config) {
    return { status: 'not_implemented' }
  })

  ipcMain.handle('deai:cancel', function(event) {
    return { status: 'ok' }
  })

  // Skill channels
  ipcMain.handle('skill:execute', async function(event, config) {
    return { status: 'not_implemented' }
  })

  ipcMain.handle('skill:validate', function(event, output, rules) {
    return { valid: true, errors: [] }
  })

  // Provider channels
  ipcMain.handle('provider:testConnection', async function(event, baseUrl, apiKey) {
    return { connected: false, error: 'Not implemented' }
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
