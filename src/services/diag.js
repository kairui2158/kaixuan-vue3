// DiagLogger - full app diagnostic core module
// zero IPC on normal ops / memory buffer + 30s batch flush / error level immediate flush
var DiagLogger = (function() {
  var _buffer = [];
  var _maxBuffer = 200;
  var _flushTimer = null;
  var _flushInterval = 30000;
  var _enabled = true;
  var _levels = { error: 0, warn: 1, info: 2, debug: 3 };
  var _minLevel = 2;
  var _origConsoleError = null;
  var _origConsoleWarn = null;
  var _perfMarks = {};
  var _prevWordCount = 0;
  var _sessionStart = Date.now();
  var _errorCount = 0;
  var _warnCount = 0;
  var _memSampleTimer = null;

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

  function _push(level, cat, msg, detail) {
    if (!_shouldLog(level)) return;
    var entry = {
      ts: _ts(), tsMs: Date.now(), level: level, cat: cat || "general",
      msg: typeof msg === "string" ? msg : String(msg),
      detail: detail ? (typeof detail === "string" ? detail : JSON.stringify(detail)) : "",
      session: _sessionStart
    };
    _buffer.push(entry);
    if (level === "error") _errorCount++;
    if (level === "warn") _warnCount++;
    if (level === "error") _flushNow();
    if (_buffer.length > _maxBuffer) _buffer.splice(0, _buffer.length - _maxBuffer);
  }

  function _flushNow() {
    if (_buffer.length === 0) return;
    if (!window.electronAPI || typeof window.electronAPI.diagWrite !== "function") return;
    var batch = _buffer.slice();
    _buffer = [];
    try { window.electronAPI.diagWrite(batch); }
    catch(e) { _buffer = batch.concat(_buffer).slice(0, _maxBuffer * 2); }
  }

  function _startFlushTimer() {
    if (_flushTimer) clearInterval(_flushTimer);
    _flushTimer = setInterval(function() { _flushNow(); }, _flushInterval);
  }

  function _getMemUsage() {
    try { if (performance && performance.memory) return performance.memory.usedJSHeapSize; } catch(e) {}
    return null;
  }

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
    if (!_origConsoleError && window.console && console.error) {
      _origConsoleError = console.error.bind(console);
      console.error = function() {
        var args = Array.prototype.slice.call(arguments);
        var msg = args.map(function(a) {
          if (a instanceof Error) return a.message + "\n" + (a.stack || "");
          if (typeof a === "object") { try { return JSON.stringify(a); } catch(x) { return String(a); } }
          return String(a);
        }).join(" ");
        _push("error", "console-error", msg);
        if (_origConsoleError) _origConsoleError.apply(null, args);
      };
    }
    if (!_origConsoleWarn && window.console && console.warn) {
      _origConsoleWarn = console.warn.bind(console);
      console.warn = function() {
        var args = Array.prototype.slice.call(arguments);
        var msg = args.map(function(a) {
          if (typeof a === "object") { try { return JSON.stringify(a); } catch(x) { return String(a); } }
          return String(a);
        }).join(" ");
        _push("warn", "console-warn", msg);
        if (_origConsoleWarn) _origConsoleWarn.apply(null, args);
      };
    }
  }

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

  function _startMemSampling() {
    if (_memSampleTimer) clearInterval(_memSampleTimer);
    _memSampleTimer = setInterval(function() {
      var mem = _getMemUsage();
      if (mem !== null && mem > 200 * 1024 * 1024) {
        _push("warn", "memory", "JS heap high: " + (mem / 1024 / 1024).toFixed(1) + "MB", { used: mem });
      }
    }, 60000);
  }

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
      var read = StorageManager.get(key);
      if (!read) { _push("error", "storage", "storage verify failed: key=" + key + " read null", { key: key }); return false; }
      return true;
    } catch(e) { _push("error", "storage", "storage verify error: " + key + " - " + e.message, { key: key, err: e.message }); return false; }
  }

  function checkSkillConfig(skillIds) {
    if (!skillIds || skillIds.length === 0) return true;
    for (var i = 0; i < skillIds.length; i++) {
      try {
        var sk = SkillManager.get(skillIds[i]);
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

  function exportLogs() { _flushNow(); if (window.electronAPI && typeof window.electronAPI.diagExport === "function") return window.electronAPI.diagExport(); return null; }
  function readLogs(date) { if (window.electronAPI && typeof window.electronAPI.diagRead === "function") return window.electronAPI.diagRead(date || ""); return null; }
  function clearLogs() { _buffer = []; _errorCount = 0; _warnCount = 0; if (window.electronAPI && typeof window.electronAPI.diagClear === "function") return window.electronAPI.diagClear(); return false; }
  function setEnabled(on) {
    _enabled = !!on;
    try { StorageManager.set("diag-enabled", _enabled); } catch(e) {}
    if (_enabled) { _startFlushTimer(); _startMemSampling(); }
    else { if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; } if (_memSampleTimer) { clearInterval(_memSampleTimer); _memSampleTimer = null; } }
  }
  function setLevel(lv) { if (_levels[lv] !== undefined) { _minLevel = _levels[lv]; try { StorageManager.set("diag-level", lv); } catch(e) {} } }
  function getStats() { return { sessionStart: _sessionStart, uptime: Date.now() - _sessionStart, buffered: _buffer.length, errorCount: _errorCount, warnCount: _warnCount, enabled: _enabled, level: _minLevel }; }

  function init() {
    try {
      var savedEnabled = StorageManager.get("diag-enabled");
      if (savedEnabled !== null && savedEnabled !== undefined) _enabled = !!savedEnabled;
      var savedLevel = StorageManager.get("diag-level");
      if (savedLevel && _levels[savedLevel] !== undefined) _minLevel = _levels[savedLevel];
    } catch(e) {}
    _installGlobalErrorCapture();
    _installLongTaskObserver();
    if (_enabled) { _startFlushTimer(); _startMemSampling(); }
    window.addEventListener("beforeunload", function() { _flushNow(); });
    _push("info", "system", "diagnostic engine started", { level: _minLevel, enabled: _enabled });
  }

  return {
    init: init,
    log: function(level, cat, msg, detail) { _push(level, cat, msg, detail); },
    error: function(cat, msg, detail) { _push("error", cat, msg, detail); },
    warn: function(cat, msg, detail) { _push("warn", cat, msg, detail); },
    info: function(cat, msg, detail) { _push("info", cat, msg, detail); },
    debug: function(cat, msg, detail) { _push("debug", cat, msg, detail); },
    flush: _flushNow,
    export: exportLogs,
    read: readLogs,
    clear: clearLogs,
    setEnabled: setEnabled,
    setLevel: setLevel,
    getStats: getStats,
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
})();

function diagLog(level, cat, msg, detail) { DiagLogger.log(level, cat, msg, detail); }
function diagFlush() { DiagLogger.flush(); }
function diagExport() { return DiagLogger.export(); }
function diagRead(date) { return DiagLogger.read(date); }
function diagClear() { return DiagLogger.clear(); }

if (typeof module !== "undefined" && module.exports) module.exports = DiagLogger;

// ESM export for Vite
export { DiagLogger };
