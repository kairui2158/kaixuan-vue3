const { app, BrowserWindow, Menu, ipcMain, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')

// electron-log: main process logging infrastructure
const log = require('electron-log/main')
log.initialize()
log.transports.file.maxSize = 10 * 1024 * 1024  // 10MB per file
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
log.errorHandler.startCatching()
log.eventLogger.startLogging()

// Development-only compatibility switches. Packaged builds keep Electron defaults.
if (!app.isPackaged) {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('remote-allow-origins', '*')
}

// Multi-window support: no single instance lock
// Each window loads its own project; project lock prevents same project in two windows
var windowMap = new Map()       // windowId -> { projectId, browserWindow }
var lockedProjects = new Set()  // projectIds currently held by a window
var windowCounter = 0
var ipcHandlersRegistered = false
var windowStateSaveTimers = new Map() // win.id -> debounce timer
var rendererResourceSamplers = new Map() // win.id -> interval timer

function startRendererResourceSampler(win) {
  if (!win || rendererResourceSamplers.has(win.id)) return
  var sampleCount = 0
  var timer = setInterval(function() {
    if (!win || win.isDestroyed()) {
      stopRendererResourceSampler(win)
      return
    }
    sampleCount++
    try {
      var metrics = app.getAppMetrics().filter(function(metric) {
        return metric && metric.id === win.webContents.id
      })[0]
      if (!metrics || !metrics.memory || !metrics.cpu) return
      var cpuPercent = Number(metrics.cpu.percentCPUUsage) || 0
      var memoryMb = Number(metrics.memory.workingSetSize) / 1024
      if (cpuPercent >= 90) {
        log.warn('renderer-pressure-high: windowId=' + win.id +
          ' cpu=' + cpuPercent.toFixed(1) +
          ' memoryMb=' + memoryMb.toFixed(1) +
          ' samples=' + sampleCount)
      } else {
        log.info('renderer-resource-sample: windowId=' + win.id +
          ' cpu=' + cpuPercent.toFixed(1) +
          ' memoryMb=' + memoryMb.toFixed(1) +
          ' samples=' + sampleCount)
      }
    } catch (e) {
      log.warn('renderer-resource-sample-failed: windowId=' + win.id + ' error=' + e.message)
    }
  }, 5000)
  rendererResourceSamplers.set(win.id, timer)
}

function stopRendererResourceSampler(win) {
  if (!win) return
  var timer = rendererResourceSamplers.get(win.id)
  if (timer) clearInterval(timer)
  rendererResourceSamplers.delete(win.id)
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
const { registerLifecycleHandlers, registerWindowCloseHandler } = require('./ipc/lifecycle')
const { registerStorageHandlers, setDataDir, getDataDir, setLegacyDir } = require('./ipc/storage')
const { registerSkillLoaderHandlers } = require('./ipc/skill-loader')
const { registerSkillPackageHandlers } = require('./ipc/skill-package')
const { registerRunTraceHandlers, setDataDir: setRunTraceDataDir } = require('./ipc/runTrace')
const { registerIntentCorpusHandlers, setDataDir: setIntentCorpusDataDir } = require('./ipc/intentCorpus')
const { registerJiebaHandlers } = require('./ipc/jieba')
const { registerIntentEmbeddingHandlers } = require('./ipc/intentEmbedding')
const { registerAgentStateHandlers, setDataDir: setAgentStateDataDir } = require('./ipc/agentState')

function registerApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: '窗口',
      submenu: [
        {
          label: '新建窗口',
          click: function() { createWindow() }
        },
        {
          label: '在新窗口打开当前项目',
          click: function(item, focusedWindow) {
            if (focusedWindow) {
              focusedWindow.webContents.send('app:getCurrentProjectId')
            }
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '应用教学指南',
          click: function(item, focusedWindow) {
            if (focusedWindow) focusedWindow.webContents.send('app:openHelpGuide')
          }
        }
      ]
    }
  ]))
}

function getWindowStatePath(winId) {
  return path.join(app.getPath('userData'), 'window-state-' + winId + '.json')
}
function loadWindowState(winId) {
  try {
    var p = getWindowStatePath(winId)
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch(e) {}
  return null
}
function saveWindowStateFor(win) {
  if (!win) return
  try {
    var entry = windowMap.get(win.id)
    var winId = entry ? entry.windowId : 0
    var bounds = win.getBounds()
    var state = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: win.isMaximized() }
    fs.writeFileSync(getWindowStatePath(winId), JSON.stringify(state), 'utf8')
  } catch(e) {}
}

function scheduleWindowStateSave(win) {
  if (!win) return
  var existing = windowStateSaveTimers.get(win.id)
  if (existing) clearTimeout(existing)
  var timer = setTimeout(function() {
    windowStateSaveTimers.delete(win.id)
    if (!win.isDestroyed()) saveWindowStateFor(win)
  }, 500)
  windowStateSaveTimers.set(win.id, timer)
}

function flushWindowStateFor(win) {
  if (!win) return
  var existing = windowStateSaveTimers.get(win.id)
  if (existing) {
    clearTimeout(existing)
    windowStateSaveTimers.delete(win.id)
  }
  saveWindowStateFor(win)
}

function saveWindowState() {
  for (var entry of windowMap.values()) {
    if (entry.browserWindow) saveWindowStateFor(entry.browserWindow)
  }
}

function createWindow(projectId) {
  // Project lock: prevent same project in two windows
  if (projectId && lockedProjects.has(projectId)) {
    for (var entry of windowMap.values()) {
      if (entry.projectId === projectId) {
        var existingWin = entry.browserWindow
        if (existingWin.isMinimized()) existingWin.restore()
        existingWin.focus()
        return existingWin
      }
    }
  }

  var isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  var explicitIsolation = process.env.SHENYI_DATA_DIR && process.env.SHENYI_ALLOW_TEST_ISOLATION === '1'
  var testDataDir = isDev && process.env.SHENYI_TEST_USER_DATA_DIR
    ? path.resolve(process.env.SHENYI_TEST_USER_DATA_DIR)
    : ''
  var isolationDataDir = explicitIsolation
    ? path.resolve(process.env.SHENYI_DATA_DIR)
    : ''
  var docsDir = isolationDataDir || testDataDir || (isDev
    ? path.join(process.cwd(), '_data')
    : path.join(app.getPath('documents'), '神意助手数据'))
  var dataDir = docsDir
  var logDir = path.join(app.getPath('userData'), 'logs')
  if (isDev && process.env.SHENYI_TEST_LOG_DIR) {
    logDir = path.resolve(process.env.SHENYI_TEST_LOG_DIR)
  }

  setDataDir(dataDir)
  setRunTraceDataDir(dataDir)
  setIntentCorpusDataDir(dataDir)
  setAgentStateDataDir(dataDir)
  setLegacyDir(path.join(app.getPath('documents'), '写作助手数据'))
  setLogDir(logDir)

  if (!ipcHandlersRegistered) {
    registerCryptoHandlers()
    registerStorageHandlers()
    registerDiagHandlers()
    registerApiHandlers()
    registerDialogHandlers()
    registerLifecycleHandlers()
    registerSkillLoaderHandlers()
    registerSkillPackageHandlers(require('electron'))
    registerRunTraceHandlers()
    registerIntentCorpusHandlers()
    registerJiebaHandlers()
    registerIntentEmbeddingHandlers()
    registerAgentStateHandlers()

    ipcMain.handle('window:getInitialProjectId', function(event) {
      var wc = event.sender
      for (var entry of windowMap.values()) {
        if (entry.browserWindow && entry.browserWindow.webContents === wc) {
          return entry.projectId || null
        }
      }
      return null
    })

    ipcMain.handle('window:openProject', function(event, pid) {
      if (pid && lockedProjects.has(pid)) {
        for (var entry of windowMap.values()) {
          if (entry.projectId === pid) {
            var w = entry.browserWindow
            if (w.isMinimized()) w.restore()
            w.focus()
            return { ok: false, reason: 'already_open' }
          }
        }
      }
      createWindow(pid)
      return { ok: true }
    })

    ipcMain.handle('window:setCurrentProject', function(event, pid) {
      var wc = event.sender
      for (var entry of windowMap.values()) {
        if (entry.browserWindow && entry.browserWindow.webContents === wc) {
          var oldPid = entry.projectId
          if (oldPid && lockedProjects.has(oldPid)) lockedProjects.delete(oldPid)
          entry.projectId = pid
          if (pid) lockedProjects.add(pid)
          return true
        }
      }
      return false
    })

    ipcMain.handle('clipboard:write', function(event, text) {
      clipboard.writeText(String(text || ''))
      return true
    })
    ipcMain.handle('clipboard:read', function(event) {
      return clipboard.readText()
    })

    ipcMain.handle('provider:testConnection', async function(event, baseUrl, apiKey) {
      try {
        var protocols = require('./dist-renderer/providerProtocols.cjs')
        var url = protocols.buildProviderModelsUrl({ baseUrl: baseUrl, providerType: 'openai-compatible' })
        var response = await fetch(url, {
          method: 'GET',
          headers: protocols.buildProviderHeaders('openai-compatible', apiKey),
          signal: AbortSignal.timeout(15000),
        })
        if (response.ok) return { connected: true }
        var body = await response.arrayBuffer()
        var text = Buffer.from(body).toString('utf8')
        var providerMessage = ''
        try {
          var parsed = JSON.parse(text)
          providerMessage = (parsed && parsed.error && parsed.error.message) || (parsed && parsed.message) || ''
        } catch (e) {}
        return { connected: false, error: protocols.httpErrorMessage(response.status, providerMessage) }
      } catch (e) {
        if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
          return { connected: false, error: '供应商响应超时' }
        }
        return { connected: false, error: (e && e.message) || '连接失败' }
      }
    })

    ipcHandlersRegistered = true
  }

  registerApplicationMenu()

  var winId = ++windowCounter
  var saved = loadWindowState(winId)
  var win = new BrowserWindow({
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

  startRendererResourceSampler(win)
  windowMap.set(win.id, { windowId: winId, projectId: projectId || null, browserWindow: win })
  if (projectId) lockedProjects.add(projectId)

  win.once('ready-to-show', function() {
    win.show()
    win.focus()
    if (saved && saved.maximized) win.maximize()
  })

  win.on('close', function() { flushWindowStateFor(win) })
  win.on('closed', function() {
    stopRendererResourceSampler(win)
    var pendingSave = windowStateSaveTimers.get(win.id)
    if (pendingSave) {
      clearTimeout(pendingSave)
      windowStateSaveTimers.delete(win.id)
    }
    var entry = windowMap.get(win.id)
    if (entry && entry.projectId && lockedProjects.has(entry.projectId)) lockedProjects.delete(entry.projectId)
    windowMap.delete(win.id)
  })
  win.on('resize', function() { if (!win.isMaximized()) scheduleWindowStateSave(win) })
  win.on('move', function() { if (!win.isMaximized()) scheduleWindowStateSave(win) })

  // Per-window close handler (lifecycle IPC: save & quit / force quit / cancel)
  registerWindowCloseHandler(win)

  win.webContents.on('render-process-gone', function(_event, details) {
    log.error('render-process-gone: reason=' + details.reason + ' exitCode=' + details.exitCode)
    log.error('render-process-gone: windowId=' + win.id)
    var message = '窗口页面进程异常退出（' + details.reason + '）。该窗口可能已停止响应，可保留现场排查，或关闭后重新打开。'
    for (var entry of windowMap.values()) {
      if (entry.browserWindow && !entry.browserWindow.isDestroyed() && entry.browserWindow.webContents !== _event.sender) {
        entry.browserWindow.webContents.send('app:rendererRecoveryNotice', {
          reason: details.reason,
          exitCode: details.exitCode,
          message: message
        })
      }
    }
  })
  win.webContents.on('child-process-gone', function(_event, details) {
    log.error('child-process-gone: type=' + details.type + ' reason=' + details.reason + ' exitCode=' + details.exitCode)
  })
  win.webContents.on('did-fail-load', function(_event, code, desc, url, isMainFrame) {
    if (isMainFrame) log.error('did-fail-load: code=' + code + ' desc=' + desc + ' url=' + url)
  })

  win.webContents.session.on('will-download', function(_event, item) {
    var downloadsDir = app.getPath('downloads')
    var filePath = path.join(downloadsDir, item.getFilename())
    if (fs.existsSync(filePath)) {
      var ext = path.extname(filePath)
      var base = path.basename(filePath, ext)
      var n = 1
      while (fs.existsSync(path.join(downloadsDir, base + ' (' + n + ')' + ext))) n++
      filePath = path.join(downloadsDir, base + ' (' + n + ')' + ext)
    }
    item.setSavePath(filePath)
  })

  // Load the app
  var isDev = process.argv.includes('--dev')
  if (isDev) {
    // In dev mode, load from Vite dev server or old renderer
    var viteUrl = 'http://localhost:5173'
    win.loadURL(viteUrl)
    win.webContents.openDevTools()
  } else {
    // Production: load built Vue app, fallback to old renderer
    var vueIndex = path.join(__dirname, '..', 'dist-renderer', 'index.html')
    if (fs.existsSync(vueIndex)) {
      win.loadFile(vueIndex)
    } else {
      // No fallback - Vue3 app is the only renderer
      console.error('dist-renderer/index.html not found! Build with: npx vite build')
    }
  }

  // CDP debug port for testing
  if (isDev) {
    win.webContents.on('did-finish-load', function() {
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
  for (var pending of windowStateSaveTimers.values()) clearTimeout(pending)
  windowStateSaveTimers.clear()
  saveWindowState()
})


