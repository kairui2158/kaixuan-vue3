const { app, BrowserWindow, ipcMain, safeStorage, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// Window state persistence: save/restore window bounds across sessions
function getWindowStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}
function loadWindowState() {
  try {
    var p = getWindowStatePath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch(e) { /* ignore corrupt state */ }
  return null;
}
function saveWindowState() {
  if (!mainWindow) return;
  try {
    var bounds = mainWindow.getBounds();
    var state = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: mainWindow.isMaximized() };
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state), "utf8");
  } catch(e) { /* ignore write errors */ }
}
// Error logging to user data directory
var ErrorLog = {
  write: function(msg) {
    try {
      var logDir = path.join(app.getPath("userData"), "logs");
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      var logFile = path.join(logDir, "error-" + new Date().toISOString().slice(0,10) + ".log");
      fs.appendFileSync(logFile, "[" + new Date().toISOString() + "] " + msg + "\n", "utf8");
    } catch(e) { /* can't log if logging fails */ }
  }
};
app.commandLine.appendSwitch("remote-debugging-port", "9223");

// GPU: keep hardware acceleration enabled for smooth rendering.
// Previous "disable-gpu-compositing" caused severe lag by forcing software compositing.
// If black screen recurs on specific GPU drivers, use --use-angle=d3d11 instead.

let mainWindow = null;

// Single instance lock: prevent multiple app instances (fixes duplicate process issue)
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.whenReady().then(() => {
    dialog.showMessageBoxSync({
      type: "info",
      title: "写作助手",
      message: "写作助手已在运行中",
      detail: "应用已在后台运行，请检查任务栏恢复窗口。如果任务栏没有图标，可能是上次异常退出残留了进程，请打开任务管理器结束所有“写作助手”或 electron 进程后重试。"
    });
    app.quit();
  });
} else {
  app.on("second-instance", function() {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  var saved = loadWindowState();
  mainWindow = new BrowserWindow({
    width: saved ? saved.width : 1200,
    height: saved ? saved.height : 800,
    minWidth: 800,
    minHeight: 600,
    x: saved && !saved.maximized ? saved.x : undefined,
    y: saved && !saved.maximized ? saved.y : undefined,
    title: "\u5c0f\u8bf4\u5de5\u574a",
    backgroundColor: "#0d0d0f",
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.focus();
    if (saved && saved.maximized) mainWindow.maximize();
  });

 // Save window state on close/resize/move
 mainWindow.on("close", function(e) {
   saveWindowState();
   if (mainWindow._forceClose) return;
  e.preventDefault();
   // Send request to renderer to show custom exit-confirm modal
   try { mainWindow.webContents.send("app:requestClose"); } catch(err) {}
   // Listen for renderer's response (choice: 0=save+exit, 1=direct exit, 2=cancel)
    // Remove any previous listener to prevent duplicates if user triggers close multiple times
    ipcMain.removeAllListeners("app:closeChoice");
    ipcMain.once("app:closeChoice", function(event, choice) {
     if (choice === 0) {
        try { mainWindow.webContents.send("app:finalSave"); } catch(err) {}
        mainWindow._forceClose = true;
        setTimeout(function() { mainWindow.close(); }, 500);
      } else if (choice === 1) {
        mainWindow._forceClose = true;
        mainWindow.close();
      }
      // choice === 2: cancel, do nothing (window stays open)
    });
 });
  mainWindow.on("resize", function() { if (!mainWindow.isMaximized()) saveWindowState(); });
  mainWindow.on("move", function() { if (!mainWindow.isMaximized()) saveWindowState(); });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadFile("renderer.html");
}

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Ensure window state is saved before quitting
app.on("before-quit", function() {
  saveWindowState();
});

// Global error handlers
process.on("uncaughtException", function(e) {
  ErrorLog.write("UNCAUGHT: " + (e && e.stack ? e.stack : String(e)));
});
process.on("unhandledRejection", function(reason) {
  ErrorLog.write("UNHANDLED_REJECTION: " + String(reason));
});

// IPC: reserved interface
ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.on("app:quit", () => app.quit());

// P1-1: API Key encryption via OS keychain (safeStorage)
ipcMain.on("safe:encrypt", function(event, text) {
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      event.returnValue = "enc:" + safeStorage.encryptString(text).toString("base64");
    } else {
      event.returnValue = text;
    }
  } catch(e) {
    ErrorLog.write("encrypt failed: " + e.message);
    event.returnValue = text;
  }
});

ipcMain.on("safe:decrypt", function(event, val) {
  try {
    if (val && typeof val === "string" && val.startsWith("enc:") && safeStorage && safeStorage.isEncryptionAvailable()) {
      event.returnValue = safeStorage.decryptString(Buffer.from(val.substring(4), "base64"));
    } else {
      event.returnValue = val;
    }
  } catch(e) {
    ErrorLog.write("decrypt failed: " + e.message);
    event.returnValue = val;
  }
});

// IPC: File-based storage (data in user Documents, survives uninstall)
// Data stored in user Documents for persistence across uninstall/reinstall
function getStorageDir() {
  var dir = path.join(app.getPath("documents"), "写作助手数据");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
// One-time migration: copy data from old %APPDATA% location to Documents
function migrateOldDataIfNeeded() {
  try {
    var newDir = getStorageDir();
    var markerFile = path.join(newDir, ".migrated");
    if (fs.existsSync(markerFile)) return;
    var oldDir = path.join(app.getPath("userData"), "data");
    if (!fs.existsSync(oldDir)) { fs.writeFileSync(markerFile, "no-old-data", "utf8"); return; }
    var files = fs.readdirSync(oldDir);
    var migrated = 0;
    for (var i = 0; i < files.length; i++) {
      var srcFile = path.join(oldDir, files[i]);
      var dstFile = path.join(newDir, files[i]);
      if (!fs.existsSync(dstFile)) { fs.copyFileSync(srcFile, dstFile); migrated++; }
    }
    fs.writeFileSync(markerFile, "migrated-" + migrated + "-" + new Date().toISOString(), "utf8");
    if (migrated > 0) ErrorLog.write("[OK] Migrated " + migrated + " files to Documents");
  } catch(e) { ErrorLog.write("[ERR] Migration failed: " + e.message); }
}
function safeKey(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}
ipcMain.on("storage:read", function(event, key) {
  try {
    migrateOldDataIfNeeded();
    var file = path.join(getStorageDir(), safeKey(key) + ".json");
    if (fs.existsSync(file)) {
      event.returnValue = fs.readFileSync(file, "utf8");
    } else {
      event.returnValue = null;
    }
  } catch(e) {
    ErrorLog.write("storage:read failed: " + key + " " + e.message);
    event.returnValue = null;
  }
});
ipcMain.on("storage:write", function(event, key, data) {
  try {
    migrateOldDataIfNeeded();
    var file = path.join(getStorageDir(), safeKey(key) + ".json");
    fs.writeFileSync(file, data, "utf8");
    event.returnValue = true;
  } catch(e) {
    ErrorLog.write("storage:write failed: " + key + " " + e.message);
    event.returnValue = false;
  }
});
ipcMain.on("storage:remove", function(event, key) {
  try {
    var file = path.join(getStorageDir(), safeKey(key) + ".json");
    if (fs.existsSync(file)) fs.unlinkSync(file);
    event.returnValue = true;
  } catch(e) {
    ErrorLog.write("storage:remove failed: " + key + " " + e.message);
    event.returnValue = false;
  }
});
ipcMain.on("storage:list", function(event) {
  try {
    migrateOldDataIfNeeded();
    var dir = getStorageDir();
    var files = fs.readdirSync(dir);
    var keys = files.filter(function(f) { return f.endsWith(".json"); }).map(function(f) { return f.slice(0, -5); });
    event.returnValue = keys;
  } catch(e) {
    ErrorLog.write("storage:list failed: " + e.message);
    event.returnValue = [];
  }
});
// Export all data to a single backup file
ipcMain.on("storage:export", function(event, exportPath) {
  try {
    var dir = getStorageDir();
    var files = fs.readdirSync(dir);
    var data = {};
    for (var i = 0; i < files.length; i++) {
      if (files[i].endsWith(".json")) {
        data[files[i].slice(0, -5)] = fs.readFileSync(path.join(dir, files[i]), "utf8");
      }
    }
    fs.writeFileSync(exportPath, JSON.stringify(data, null, 2), "utf8");
    event.returnValue = { success: true, count: Object.keys(data).length };
  } catch(e) {
    ErrorLog.write("storage:export failed: " + e.message);
    event.returnValue = { success: false, error: e.message };
  }
});
// Import data from a backup file
ipcMain.on("storage:import", function(event, importPath) {
  try {
    var raw = fs.readFileSync(importPath, "utf8");
    var data = JSON.parse(raw);
    var dir = getStorageDir();
    var imported = 0;
    Object.keys(data).forEach(function(key) {
      fs.writeFileSync(path.join(dir, safeKey(key) + ".json"), data[key], "utf8");
      imported++;
    });
    event.returnValue = { success: true, count: imported };
  } catch(e) {
    ErrorLog.write("storage:import failed: " + e.message);
    event.returnValue = { success: false, error: e.message };
  }
});
ipcMain.on("storage:getDataDir", function(event) {
  try { event.returnValue = getStorageDir(); } catch(e) { event.returnValue = null; }
});

// === Diagnostic IPC ===
function getDiagLogDir() {
  var dir = path.join(app.getPath("userData"), "diag-logs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
ipcMain.on("diag:write", function(event, batch) {
  try {
    if (!batch || !Array.isArray(batch) || batch.length === 0) { event.returnValue = false; return; }
    var logDir = getDiagLogDir();
    var today = new Date().toISOString().slice(0, 10);
    var logFile = path.join(logDir, "diag-" + today + ".jsonl");
    var lines = batch.map(function(e) { return JSON.stringify(e); }).join("\n") + "\n";
    fs.appendFileSync(logFile, lines, "utf8");
    event.returnValue = true;
  } catch(e) {
    ErrorLog.write("diag:write failed: " + e.message);
    event.returnValue = false;
  }
});
ipcMain.on("diag:read", function(event, dateStr) {
  try {
    var logDir = getDiagLogDir();
    var date = dateStr || new Date().toISOString().slice(0, 10);
    var logFile = path.join(logDir, "diag-" + date + ".jsonl");
    if (!fs.existsSync(logFile)) { event.returnValue = []; return; }
    var content = fs.readFileSync(logFile, "utf8");
    var lines = content.split("\n").filter(function(l) { return l.trim().length > 0; });
    var entries = [];
    for (var i = 0; i < lines.length; i++) {
      try { entries.push(JSON.parse(lines[i])); } catch(x) {}
    }
    event.returnValue = entries;
  } catch(e) {
    ErrorLog.write("diag:read failed: " + e.message);
    event.returnValue = [];
  }
});
ipcMain.on("diag:export", function(event) {
  try {
    var logDir = getDiagLogDir();
    var files = fs.readdirSync(logDir).filter(function(f) { return f.endsWith(".jsonl"); }).sort();
    var allEntries = [];
    var recent = files.slice(-7);
    for (var i = 0; i < recent.length; i++) {
      var content = fs.readFileSync(path.join(logDir, recent[i]), "utf8");
      var lines = content.split("\n").filter(function(l) { return l.trim().length > 0; });
      for (var j = 0; j < lines.length; j++) { try { allEntries.push(JSON.parse(lines[j])); } catch(x) {} }
    }
    var savePath = dialog.showSaveDialogSync(mainWindow, {
      title: "导出诊断日志", defaultPath: "diag-export-" + Date.now() + ".json",
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (savePath) {
      fs.writeFileSync(savePath, JSON.stringify(allEntries, null, 2), "utf8");
      event.returnValue = savePath;
    } else { event.returnValue = null; }
  } catch(e) {
    ErrorLog.write("diag:export failed: " + e.message);
    event.returnValue = null;
  }
});
ipcMain.on("diag:clear", function(event) {
  try {
    var logDir = getDiagLogDir();
    if (fs.existsSync(logDir)) {
      var files = fs.readdirSync(logDir);
      for (var i = 0; i < files.length; i++) fs.unlinkSync(path.join(logDir, files[i]));
    }
    event.returnValue = true;
  } catch(e) {
    ErrorLog.write("diag:clear failed: " + e.message);
    event.returnValue = false;
  }
});
// IPC: Proxy fetch for model list (bypass CORS in renderer process)
ipcMain.handle("api:fetchModels", async function(event, baseUrl, apiKey) {
  try {
    var url = baseUrl.replace(/\/+$/, "") + "/models";
    var https = require("https");
    var http = require("http");
    var mod = url.startsWith("https") ? https : http;
    return await new Promise(function(resolve, reject) {
    var req = mod.get(url, {
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      timeout: 30000
    }, function(res) {
      var body = "";
      res.on("data", function(chunk) { body += chunk; });
      res.on("end", function() {
        try {
          var data = JSON.parse(body);
          resolve({ ok: true, data: data, status: res.statusCode });
        } catch(e) {
          resolve({ ok: false, status: res.statusCode, error: "JSON parse failed: " + e.message });
        }
      });
    });
    req.on("error", function(e) {
      resolve({ ok: false, error: e.message });
    });
    req.on("timeout", function() {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    });
  } catch(e) {
    if (typeof ErrorLog !== "undefined") ErrorLog.write("api:fetchModels failed: " + e.message);
    return { ok: false, error: e.message };
  }
});
// Dialog: choose file for export/import
ipcMain.on("dialog:saveFile", function(event, defaultName) {
  try {
    var result = dialog.showSaveDialogSync(mainWindow, {
      title: "导出配置",
      defaultPath: defaultName || "writing-assistant-backup.json",
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    event.returnValue = result || null;
  } catch(e) {
    ErrorLog.write("dialog:saveFile failed: " + e.message);
    event.returnValue = null;
  }
});
ipcMain.on("dialog:openFile", function(event) {
  try {
    var result = dialog.showOpenDialogSync(mainWindow, {
      title: "导入配置",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"]
    });
    event.returnValue = (result && result.length > 0) ? result[0] : null;
  } catch(e) {
    ErrorLog.write("dialog:openFile failed: " + e.message);
    event.returnValue = null;
  }
});
ipcMain.on("storage:list", function(event) {
  try {
    var dir = getStorageDir();
    var files = fs.readdirSync(dir);
    var keys = files.filter(function(f) { return f.endsWith(".json"); }).map(function(f) { return f.slice(0, -5); });
    event.returnValue = keys;
  } catch(e) {
    ErrorLog.write("storage:list failed: " + e.message);
    event.returnValue = [];
  }
});
