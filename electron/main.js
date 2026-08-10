const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// Enable GPU hardware acceleration
app.disableHardwareAcceleration = false
app.commandLine.appendSwitch('enable-gpu-rasterization')

// IPC handler modules
const { registerCryptoHandlers } = require('./ipc/crypto')
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
  setLegacyDir(path.join(require('os').homedir(), 'Documents', '写作助手数据'))
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
  return await new Promise(function(resolve) {
    var trimmed = baseUrl.replace(/\/+$/, '')
    var tUrl = trimmed.match(/\/v\d+$/) ? trimmed + '/models' : trimmed + '/v1/models'
    var parsed = new URL(tUrl)
    var isHttps = parsed.protocol === 'https:'
    var https = require('https')
    var http = require('http')
    var mod = isHttps ? https : http
    var options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      timeout: 15000
    }
    var req = mod.request(options, function(res) {
      res.on('data', function() {})
      res.on('end', function() {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ connected: true })
        } else {
          resolve({ connected: false, error: 'HTTP ' + res.statusCode })
        }
      })
    })
    req.on('error', function(e) { resolve({ connected: false, error: e.message }) })
    req.on('timeout', function() { req.destroy(); resolve({ connected: false, error: 'Request timeout after 15s' }) })
    req.end()
  })
})

  // Load the app
  var isDev = process.argv.includes('--dev')
  if (isDev) {
    // In dev mode, load from Vite dev server or old renderer
    var viteUrl = 'http://localhost:5173'
    mainWindow.loadURL(viteUrl)
    mainWindow.webContents.openDevTools()
  } else {
    // Production: load built Vue app, fallback to old renderer
    var vueIndex = path.join(__dirname, '..', 'dist-renderer', 'index.html')
    if (fs.existsSync(vueIndex)) {
      mainWindow.loadFile(vueIndex)
    } else {
      // No fallback - Vue3 app is the only renderer
      console.error('dist-renderer/index.html not found! Build with: npx vite build')
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
const { registerStorageHandlers, setDataDir, getDataDir, setLegacyDir } = require('./ipc/storage')
