// Safe logger shim - works in both Electron and browser environments
// In Electron: forwards logs to main process via IPC for file persistence
// In browser: falls back to console only
var _hasElectron = (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.diagWrite === 'function');
var _buffer = [];
var _flushTimer = null;
// Save original console methods BEFORE Object.assign overwrites them
var _origConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console)
};

function _flushBuffer() {
  if (_buffer.length === 0) return;
  if (!_hasElectron) { _buffer = []; return; }
  try {
    var batch = _buffer.slice();
    _buffer = [];
    window.electronAPI.diagWrite(batch);
  } catch(e) {}
}

function _queueLog(level, args) {
  var msg = Array.prototype.slice.call(args).map(function(a) {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a) } catch(e) { return String(a) }
  }).join(' ');
  _buffer.push({ ts: new Date().toISOString(), level: level, msg: msg, cat: 'renderer' });
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(_flushBuffer, 2000);
  if (level === 'error') { clearTimeout(_flushTimer); _flushBuffer(); }
}

var consoleLog = function() { _origConsole.log.apply(console, arguments); _queueLog('info', arguments) };
var consoleError = function() { _origConsole.error.apply(console, arguments); _queueLog('error', arguments) };
var consoleWarn = function() { _origConsole.warn.apply(console, arguments); _queueLog('warn', arguments) };
var consoleInfo = function() { _origConsole.info.apply(console, arguments); _queueLog('info', arguments) };
var consoleDebug = function() { _origConsole.debug.apply(console, arguments); _queueLog('debug', arguments) };

var shimLog = {
  functions: { log: consoleLog, error: consoleError, warn: consoleWarn, info: consoleInfo, debug: consoleDebug, verbose: consoleDebug, silly: consoleDebug },
  scope: function(name) {
    var prefix = '[' + name + ']';
    return {
      log: function() { var a = [prefix].concat(Array.prototype.slice.call(arguments)); _origConsole.log.apply(console, a); _queueLog('info', a) },
      error: function() { var a = [prefix].concat(Array.prototype.slice.call(arguments)); _origConsole.error.apply(console, a); _queueLog('error', a) },
      warn: function() { var a = [prefix].concat(Array.prototype.slice.call(arguments)); _origConsole.warn.apply(console, a); _queueLog('warn', a) },
      info: function() { var a = [prefix].concat(Array.prototype.slice.call(arguments)); _origConsole.info.apply(console, a); _queueLog('info', a) },
      debug: function() { var a = [prefix].concat(Array.prototype.slice.call(arguments)); _origConsole.debug.apply(console, a); _queueLog('debug', a) },
      verbose: function() { _origConsole.debug.apply(console, arguments) },
      silly: function() { _origConsole.debug.apply(console, arguments) }
    };
  },
  transports: { file: { level: _hasElectron ? 'debug' : false }, console: { level: 'debug' } },
  log: consoleLog, error: consoleError, warn: consoleWarn, info: consoleInfo, debug: consoleDebug, verbose: consoleDebug, silly: consoleDebug
};

if (typeof window !== 'undefined') { window.addEventListener('beforeunload', function() { _flushBuffer() }) }

export default shimLog;
export var functions = shimLog.functions;
