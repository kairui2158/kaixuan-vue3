const { app, BrowserWindow, ipcMain, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')

// electron-log: main process logging infrastructure
const log = require('electron-log/main')
log.initialize()
log.transports.file.maxSize = 10 * 1024 * 1024  // 10MB per file
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
log.errorHandler.startCatching()
log.eventLogger.startLogging()

// Enable GPU hardware acceleration
 app.disableHardwareAcceleration = true
   app.commandLine.appendSwitch('disable-gpu')
   app.commandLine.appendSwitch('no-sandbox')
   app.commandLine.appendSwitch('remote-allow-origins', '*')

// Single instance lock - must be before app.whenReady()
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

// IPC handler modules
const { registerCryptoHandlers } = require('./ipc/crypto')
const { registerDiagHandlers, setLogDir } = require('./ipc/diag')
const { registerApiHandlers } = require('./ipc/api')
const { registerDialogHandlers } = require('./ipc/dialog')
const { registerLifecycleHandlers } = require('./ipc/lifecycle')
const { registerStorageHandlers, setDataDir, getDataDir, setLegacyDir } = require('./ipc/storage')

var mainWindow = null

function getWindowStatePath() {
  return path.join(app.getPath("userData"), "window-state.json")
}
function loadWindowState() {
  try {
    var p = getWindowStatePath()
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch(e) {}
  return null
}
function saveWindowState() {
  if (!mainWindow) return
  try {
    var bounds = mainWindow.getBounds()
    var state = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: mainWindow.isMaximized() }
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state), "utf8")
  } catch(e) {}
}

function createWindow() {
  var docsDir = path.join(app.getPath('documents'), '神意助手数据')
  var dataDir = docsDir
  var logDir = path.join(app.getPath('userData'), 'logs')

  setDataDir(dataDir)
  setLegacyDir(path.join(app.getPath('documents'), '写作助手数据'))
  setLogDir(logDir)

  var saved = loadWindowState()
  mainWindow = new BrowserWindow({
    width: saved ? saved.width : 1400,
    height: saved ? saved.height : 900,
    minWidth: 1000,
    minHeight: 700,
    x: saved && !saved.maximized ? saved.x : undefined,
    y: saved && !saved.maximized ? saved.y : undefined,
    show: true,
    backgroundColor: '#0a0a0c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  mainWindow.once('ready-to-show', function() {
    mainWindow.show()
    mainWindow.focus()
    if (saved && saved.maximized) mainWindow.maximize()
  })

  mainWindow.on('close', function() { saveWindowState() })
  mainWindow.on('resize', function() { if (!mainWindow.isMaximized()) saveWindowState() })
  mainWindow.on('move', function() { if (!mainWindow.isMaximized()) saveWindowState() })

  // Register all IPC handlers
  registerCryptoHandlers()
  registerStorageHandlers()
  registerDiagHandlers()
  registerApiHandlers()
  registerDialogHandlers()
  registerLifecycleHandlers(mainWindow)

  ipcMain.handle('clipboard:write', function(event, text) {
    clipboard.writeText(String(text || ''))
    return true
  })
  ipcMain.handle('clipboard:read', function(event) {
    return clipboard.readText()
  })

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

app.on('before-quit', function() {
  saveWindowState()
})


