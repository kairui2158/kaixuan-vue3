// DiagLogger — minimal event emitter for real-time UI subscription
// Only subscribe/_emit/_listeners kept; all other DiagLogger code removed as dead.

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

export { subscribe };
