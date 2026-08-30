// DiagLogger — 渲染进程诊断日志（写盘 + 实时订阅）
// 最小核心：_push -> logger-shim 落盘 -> _emit 推送订阅方，并挂载 window.DiagLogger。

import log from './logger-shim.js';
import { storageKey } from '../utils/storage-key';

// --- 实时订阅 ---
var _listeners = [];

function _emit(entry) {
  for (var i = 0; i < _listeners.length; i++) {
    try { _listeners[i](entry); } catch (e) {}
  }
}

function subscribe(fn) {
  _listeners.push(fn);
  return function () {
    var idx = _listeners.indexOf(fn);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}

// --- 状态 ---
var _enabled = true;
var _levels = { error: 0, warn: 1, info: 2, debug: 3 };
var _minLevel = 2;
var _sessionStart = Date.now();

function _ts() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0') + '.' +
    String(d.getMilliseconds()).padStart(3, '0');
}

function _levelNum(lv) { return _levels[lv] !== undefined ? _levels[lv] : 2; }
function _shouldLog(lv) { return _enabled && _levelNum(lv) <= _minLevel; }

// detail 顶层白名单：DiagLogPanel 列直接读取这些字段
var _topLevelKeys = ['providerId', 'purpose', 'model', 'durationMs', 'skillId', 'agentId'];

function _push(level, cat, msg, detail) {
  if (!_shouldLog(level)) return;

  var entry = {
    ts: _ts(),
    tsMs: Date.now(),
    level: level,
    cat: cat || 'general',
    msg: typeof msg === 'string' ? msg : String(msg),
    detail: detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '',
    session: _sessionStart
  };
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    for (var k = 0; k < _topLevelKeys.length; k++) {
      var key = _topLevelKeys[k];
      if (detail[key] !== undefined && detail[key] !== null) entry[key] = detail[key];
    }
  }

  // 结构化条目直接走 diag:write 落盘（保留 purpose/skillId/agentId 顶层字段），
  // console 输出走原始方法，避免 logger-shim 再写一条裸文本重复行。
  try {
    if (window.electronAPI && typeof window.electronAPI.diagWrite === 'function') {
      window.electronAPI.diagWrite([entry]);
    }
  } catch (e) {}
  try {
    var rawConsole = log.raw || console;
    var logMsg = entry.msg + (entry.detail ? ' | ' + entry.detail : '');
    if (level === 'error') rawConsole.error(logMsg);
    else if (level === 'warn') rawConsole.warn(logMsg);
    else if (level === 'info') rawConsole.info(logMsg);
    else rawConsole.debug(logMsg);
  } catch (e) {}

  _emit(entry);
}

// --- 全局错误捕获 ---
function _installGlobalErrorCapture() {
  window.addEventListener('error', function (e) {
    _push('error', 'js-exception', e.message || '未知错误', {
      filename: e.filename, lineno: e.lineno, colno: e.colno,
      stack: e.error && e.error.stack ? e.error.stack : ''
    });
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    var detail = {};
    if (reason instanceof Error) { detail.msg = reason.message; detail.stack = reason.stack || ''; }
    else if (typeof reason === 'string') { detail.msg = reason; }
    else { try { detail.msg = JSON.stringify(reason); } catch (x) { detail.msg = String(reason); } }
    _push('error', 'promise-rejection', detail.msg || '未处理的 Promise 拒绝', detail);
  }, true);
}

// --- 对外 API ---
function trackApiCall(model, tokenEstimate, elapsed, status, errorMsg) {
  var lv = status === 'error' ? 'error' : (elapsed > 30000 ? 'warn' : 'info');
  _push(lv, 'api', 'API 调用: model=' + (model || '?') + ' status=' + status + ' ' + elapsed + 'ms', {
    model: model, tokens: tokenEstimate, elapsed: elapsed, status: status, err: errorMsg || ''
  });
}

async function exportLogs(options) {
  if (window.electronAPI && typeof window.electronAPI.diagExport === 'function') {
    return await window.electronAPI.diagExport(options || {});
  }
  return null;
}

async function readLogs(date) {
  if (window.electronAPI && typeof window.electronAPI.diagRead === 'function') {
    return await window.electronAPI.diagRead(date || '');
  }
  return null;
}

async function clearLogs() {
  if (window.electronAPI && typeof window.electronAPI.diagClear === 'function') {
    return await window.electronAPI.diagClear();
  }
  return false;
}

function setEnabled(on) {
  _enabled = !!on;
  try { if (window.electronAPI) window.electronAPI.storageWrite(storageKey('diag-enabled'), _enabled); } catch (e) {}
}

function setLevel(lv) {
  if (_levels[lv] !== undefined) {
    _minLevel = _levels[lv];
    try { if (window.electronAPI) window.electronAPI.storageWrite(storageKey('diag-level'), lv); } catch (e) {}
  }
}

function getStats() {
  return { sessionStart: _sessionStart, uptime: Date.now() - _sessionStart, enabled: _enabled, level: _minLevel };
}

function init() {
  try {
    var savedEnabled = window.electronAPI ? window.electronAPI.storageRead(storageKey('diag-enabled')) : null;
    if (savedEnabled !== null && savedEnabled !== undefined) _enabled = !!savedEnabled;
    var savedLevel = window.electronAPI ? window.electronAPI.storageRead(storageKey('diag-level')) : null;
    if (savedLevel && _levels[savedLevel] !== undefined) _minLevel = _levels[savedLevel];
  } catch (e) {}
  _installGlobalErrorCapture();
  _push('info', 'system', '诊断日志已启动', { level: _minLevel, enabled: _enabled });
}

var DiagLogger = {
  init: init,
  log: function (level, cat, msg, detail) { _push(level, cat, msg, detail); },
  error: function (cat, msg, detail) { _push('error', cat, msg, detail); },
  warn: function (cat, msg, detail) { _push('warn', cat, msg, detail); },
  info: function (cat, msg, detail) { _push('info', cat, msg, detail); },
  debug: function (cat, msg, detail) { _push('debug', cat, msg, detail); },
  flush: function () {},
  export: exportLogs,
  read: readLogs,
  clear: clearLogs,
  setEnabled: setEnabled,
  setLevel: setLevel,
  getStats: getStats,
  subscribe: subscribe,
  trackApiCall: trackApiCall
};

// 全局挂载：pipeline-manager 等守卫式消费方依赖 window.DiagLogger
if (typeof window !== 'undefined') window.DiagLogger = DiagLogger;

export { DiagLogger, subscribe };
