// DiagLogger - business layer on top of electron-log
// Provides structured logging with traceId, userAction, scope, and real-time UI subscription

import log from './logger-shim.js';
import { storageKey } from '../utils/storage-key';

// --- EventEmitter for real-time UI subscription ---
var _listeners = [];

function _emit(entry) {
  for (var i = 0; i < _listeners.length; i++) {
    try { _listeners[i](entry); } catch(e) {}
  }
}

function subscribe(fn) {
  _listeners.push(fn);
  return function() {
    var idx = _listeners.indexOf(fn);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}

// --- State ---
var _enabled = true;
var _levels = { error: 0, warn: 1, info: 2, debug: 3 };
var _minLevel = 2;
var _perfMarks = {};
var _prevWordCount = 0;
var _sessionStart = Date.now();
var _errorCount = 0;
var _warnCount = 0;
var _currentTraceId = null;
var _currentUserAction = null;
var _memSampleTimer = null;

// --- Helpers ---
function _ts() {
  var d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0") + " " +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" +
    String(d.getSeconds()).padStart(2, "0") + "." +
    String(d.getMilliseconds()).padStart(3, "0");
}

function _levelNum(lv) { return _levels[lv] !== undefined ? _levels[lv] : 2; }
function _shouldLog(lv) { if (!_enabled) return false; return _levelNum(lv) <= _minLevel; }

function _genTraceId() {
  return _sessionStart.toString(36) + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function _getMemUsage() {
  try { if (performance && performance.memory) return performance.memory.usedJSHeapSize; } catch(e) {}
  return null;
}

// --- Core push: delegates to electron-log ---
function _push(level, cat, msg, detail) {
  if (!_shouldLog(level)) return;

  var entry = {
    ts: _ts(),
    tsMs: Date.now(),
    level: level,
    cat: cat || "general",
    msg: typeof msg === "string" ? msg : String(msg),
    detail: detail ? (typeof detail === "string" ? detail : JSON.stringify(detail)) : "",
    session: _sessionStart,
    traceId: _currentTraceId,
    userAction: _currentUserAction
  };

  // Delegate to electron-log (console already covered by Object.assign in main.ts)
  try {
    var scopedLog = log.scope(cat || "general");
    var logMsg = entry.msg + (entry.detail ? " | " + entry.detail : "");
    if (level === "error") { scopedLog.error(logMsg); _errorCount++; }
    else if (level === "warn") { scopedLog.warn(logMsg); _warnCount++; }
    else if (level === "info") { scopedLog.info(logMsg); }
    else { scopedLog.debug(logMsg); }
  } catch(e) {}

  // Emit to UI subscribers for real-time updates
  _emit(entry);
}

// --- Global error capture (no console monkey-patch, electron-log handles console) ---
function _installGlobalErrorCapture() {
  window.addEventListener("error", function(e) {
    _push("error", "js-exception", e.message || "Unknown error", {
      filename: e.filename, lineno: e.lineno, colno: e.colno,
      stack: e.error && e.error.stack ? e.error.stack : ""
    });
  }, true);
  window.addEventListener("unhandledrejection", function(e) {
    var reason = e.reason;
    var detail = {};
    if (reason instanceof Error) { detail.msg = reason.message; detail.stack = reason.stack || ""; }
    else if (typeof reason === "string") { detail.msg = reason; }
    else { try { detail.msg = JSON.stringify(reason); } catch(x) { detail.msg = String(reason); } }
    _push("error", "promise-rejection", detail.msg || "Unhandled promise rejection", detail);
  }, true);
}

// --- Long task observer ---
function _installLongTaskObserver() {
  try {
    if (typeof PerformanceObserver !== "undefined") {
      var observer = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].duration > 100) {
            _push("warn", "long-task", "long task freeze: " + entries[i].duration.toFixed(0) + "ms", { duration: entries[i].duration });
          }
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    }
  } catch(e) {}
}

// --- Memory sampling ---
function _startMemSampling() {
  if (_memSampleTimer) clearInterval(_memSampleTimer);
  _memSampleTimer = setInterval(function() {
    var mem = _getMemUsage();
    if (mem !== null && mem > 200 * 1024 * 1024) {
      _push("warn", "memory", "JS heap high: " + (mem / 1024 / 1024).toFixed(1) + "MB", { used: mem });
    }
  }, 60000);
}

// --- Trace management (new) ---
function startTrace(action) {
  _currentTraceId = _genTraceId();
  _currentUserAction = action || null;
  _push("info", "trace", "trace started: " + (action || "unnamed"), { traceId: _currentTraceId });
  return _currentTraceId;
}

function endTrace(traceId) {
  _push("info", "trace", "trace ended", { traceId: traceId || _currentTraceId });
  _currentTraceId = null;
  _currentUserAction = null;
}

function setTraceContext(traceId, userAction) {
  _currentTraceId = traceId || null;
  _currentUserAction = userAction || null;
}

// --- Performance ---
function perfStart(key) { _perfMarks[key] = { start: Date.now(), startMem: _getMemUsage() }; }
function perfEnd(key, cat, extraMsg) {
  var mark = _perfMarks[key];
  if (!mark) return 0;
  var elapsed = Date.now() - mark.start;
  delete _perfMarks[key];
  var lv = elapsed > 15000 ? "warn" : "info";
  _push(lv, cat || "perf", (extraMsg || key) + " - " + elapsed + "ms", { elapsed: elapsed, key: key });
  if (mark.startMem !== null) {
    var curMem = _getMemUsage();
    if (curMem !== null && mark.startMem !== null) {
      var delta = curMem - mark.startMem;
      if (delta > 50 * 1024 * 1024) _push("warn", "memory", "memory spike: " + (delta / 1024 / 1024).toFixed(1) + "MB", { key: key, delta: delta });
    }
  }
  return elapsed;
}

// --- Business trackers (preserved) ---
function trackWordCount(currentCount) {
  if (_prevWordCount > 0 && currentCount > 0) {
    var ratio = currentCount / _prevWordCount;
    if (ratio < 0.3 && _prevWordCount > 100) {
      _push("warn", "word-count", "word count drop: " + _prevWordCount + " -> " + currentCount, { prev: _prevWordCount, cur: currentCount, ratio: ratio });
    }
  }
  _prevWordCount = currentCount;
}

function checkStorageWrite(key) {
  try {
    var read = window.electronAPI ? window.electronAPI.storageRead(storageKey(key)) : null;
    if (!read) { _push("error", "storage", "storage verify failed: key=" + key + " read null", { key: key }); return false; }
    return true;
  } catch(e) { _push("error", "storage", "storage verify error: " + key + " - " + e.message, { key: key, err: e.message }); return false; }
}

function checkSkillConfig(skillIds) {
  if (!skillIds || skillIds.length === 0) return true;
  for (var i = 0; i < skillIds.length; i++) {
    try {
      var allSkills = [];
      try { var sData = window.electronAPI ? window.electronAPI.storageRead(storageKey('skills')) : null; if (sData && sData.skills) allSkills = sData.skills; } catch(e2) {}
      var sk = null;
      for (var j = 0; j < allSkills.length; j++) { if (allSkills[j].id === skillIds[i]) { sk = allSkills[j]; break; } }
      if (!sk) { _push("error", "skill-config", "missing skill ref: " + skillIds[i], { id: skillIds[i], index: i }); return false; }
      if (!sk.template || sk.template.trim().length < 5) _push("warn", "skill-config", "skill template too short: " + skillIds[i], { id: skillIds[i], len: sk.template ? sk.template.length : 0 });
    } catch(e) { _push("error", "skill-config", "skill check error: " + skillIds[i] + " - " + e.message, { id: skillIds[i], err: e.message }); return false; }
  }
  return true;
}

function trackUI(action, target, expectedResult) { _push("info", "ui", action + " -> " + target, { expected: expectedResult || "" }); }
function trackPipeline(step, volIdx, chIdx, status, detail) {
  var msg = "pipeline[" + step + "]";
  if (volIdx >= 0) msg += " vol" + volIdx;
  if (chIdx >= 0) msg += " ch" + chIdx;
  msg += " -> " + status;
  _push(status === "error" ? "error" : "info", "pipeline", msg, detail || {});
}
function trackDeAi(mode, skillCount, hardRuleEnabled, elapsed, result) {
  _push("info", "deai", "deAI run: mode=" + mode + " skills=" + skillCount + " hardrule=" + (hardRuleEnabled ? "on" : "off") + " " + elapsed + "ms", { mode: mode, skillCount: skillCount, hardRule: hardRuleEnabled, elapsed: elapsed, result: result || "ok" });
}
function trackApiCall(model, tokenEstimate, elapsed, status, errorMsg) {
  var lv = status === "error" ? "error" : (elapsed > 30000 ? "warn" : "info");
  _push(lv, "api", "API call: model=" + (model || "?") + " status=" + status + " " + elapsed + "ms", { model: model, tokens: tokenEstimate, elapsed: elapsed, status: status, err: errorMsg || "" });
}
function trackFileOp(op, filename, success, detail) { _push(success ? "info" : "warn", "file", "file " + op + ": " + filename + " -> " + (success ? "ok" : "fail"), detail || {}); }

// --- Export/Read/Clear via electron-log / IPC ---
async function exportLogs(options) {
  if (window.electronAPI && typeof window.electronAPI.diagExport === "function") return await window.electronAPI.diagExport(options || {});
  return null;
}
async function readLogs(date) {
  if (window.electronAPI && typeof window.electronAPI.diagRead === "function") return await window.electronAPI.diagRead(date || "");
  return null;
}
async function clearLogs() {
  _errorCount = 0;
  _warnCount = 0;
  if (window.electronAPI && typeof window.electronAPI.diagClear === "function") return await window.electronAPI.diagClear();
  return false;
}

// --- Settings ---
function setEnabled(on) {
  _enabled = !!on;
  try { if (window.electronAPI) window.electronAPI.storageWrite(storageKey("diag-enabled"), _enabled); } catch(e) {}
  if (_enabled) { _startMemSampling(); }
  else { if (_memSampleTimer) { clearInterval(_memSampleTimer); _memSampleTimer = null; } }
}
function setLevel(lv) { if (_levels[lv] !== undefined) { _minLevel = _levels[lv]; try { if (window.electronAPI) window.electronAPI.storageWrite(storageKey("diag-level"), lv); } catch(e) {} } }
function getStats() {
  return {
    sessionStart: _sessionStart,
    uptime: Date.now() - _sessionStart,
    errorCount: _errorCount,
    warnCount: _warnCount,
    enabled: _enabled,
    level: _minLevel
  };
}

// --- Init ---
function init() {
  try {
    var savedEnabled = window.electronAPI ? window.electronAPI.storageRead(storageKey("diag-enabled")) : null;
    if (savedEnabled !== null && savedEnabled !== undefined) _enabled = !!savedEnabled;
    var savedLevel = window.electronAPI ? window.electronAPI.storageRead(storageKey("diag-level")) : null;
    if (savedLevel && _levels[savedLevel] !== undefined) _minLevel = _levels[savedLevel];
  } catch(e) {}
  _installGlobalErrorCapture();
  _installLongTaskObserver();
  if (_enabled) { _startMemSampling(); }
  window.addEventListener("beforeunload", function() {});
  _push("info", "system", "diagnostic engine started (electron-log)", { level: _minLevel, enabled: _enabled });
}

var DiagLogger = {
  init: init,
  log: function(level, cat, msg, detail) { _push(level, cat, msg, detail); },
  error: function(cat, msg, detail) { _push("error", cat, msg, detail); },
  warn: function(cat, msg, detail) { _push("warn", cat, msg, detail); },
  info: function(cat, msg, detail) { _push("info", cat, msg, detail); },
  debug: function(cat, msg, detail) { _push("debug", cat, msg, detail); },
  flush: function() {},  // no-op: electron-log handles flushing
  export: exportLogs,
  read: readLogs,
  clear: clearLogs,
  setEnabled: setEnabled,
  setLevel: setLevel,
  getStats: getStats,
  subscribe: subscribe,
  startTrace: startTrace,
  endTrace: endTrace,
  setTraceContext: setTraceContext,
  perfStart: perfStart,
  perfEnd: perfEnd,
  trackWordCount: trackWordCount,
  checkStorageWrite: checkStorageWrite,
  checkSkillConfig: checkSkillConfig,
  trackUI: trackUI,
  trackPipeline: trackPipeline,
  trackDeAi: trackDeAi,
  trackApiCall: trackApiCall,
  trackFileOp: trackFileOp
};

// Backward-compatible global
if (typeof window !== "undefined") window.DiagLogger = DiagLogger;

function diagLog(level, cat, msg, detail) { DiagLogger.log(level, cat, msg, detail); }
function diagFlush() {}
function diagExport() { return DiagLogger.export(); }
function diagRead(date) { return DiagLogger.read(date); }
function diagClear() { return DiagLogger.clear(); }

export { DiagLogger, subscribe, startTrace, endTrace };
