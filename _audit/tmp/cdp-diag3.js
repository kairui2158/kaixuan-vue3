const http = require('http');

function getPage() {
  return new Promise(function(resolve, reject) {
    var req = http.request({hostname:'127.0.0.1', port:9227, path:'/json', method:'GET'}, function(res){
      var d='';
      res.on('data', function(c){ d+=c; });
      res.on('end', function(){ try { resolve(JSON.parse(d)[0]); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(5000, function(){ req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function wsConnect(url) {
  var WebSocket = require('ws');
  var ws = new WebSocket(url);
  var msgId = 1;
  var pending = {};
  var consoleMessages = [];
  
  ws.on('message', function(data) {
    var msg = JSON.parse(data);
    if (msg.id && pending[msg.id]) {
      pending[msg.id].resolve(msg.result || msg.error);
      delete pending[msg.id];
    } else if (msg.method) {
      if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Log.entryAdded') {
        consoleMessages.push(JSON.stringify(msg));
      }
    }
  });
  
  function send(method, params) {
    return new Promise(function(resolve, reject) {
      var id = msgId++;
      pending[id] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      setTimeout(function() { if (pending[id]) { reject(new Error('timeout: ' + method)); delete pending[id]; } }, 8000);
    });
  }
  
  return new Promise(function(resolve, reject) {
    ws.on('open', function() {
      resolve({ send: send, ws: ws, getConsole: function() { return consoleMessages; } });
    });
    ws.on('error', reject);
  });
}

getPage().then(function(page) {
  console.log('Connecting to:', page.webSocketDebuggerUrl);
  return wsConnect(page.webSocketDebuggerUrl);
}).then(function(cdp) {
  return cdp.send('Runtime.enable').then(function() {
    return cdp.send('Console.enable');
  }).then(function() {
    return cdp.send('Log.enable');
  }).then(function() {
    console.log('CDP ready, waiting 2s for console messages...');
    return new Promise(function(r) { setTimeout(r, 2000); });
  }).then(function() {
    return cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify({ elemCount: document.querySelectorAll("*").length, bodyPointerEvents: getComputedStyle(document.body).pointerEvents, htmlLen: document.body.innerHTML.length })',
      returnByValue: true
    });
  }).then(function(r) {
    console.log('BASIC:', JSON.stringify(r));
    return cdp.send('Runtime.evaluate', {
      expression: 'Array.from(document.querySelectorAll("*")).filter(function(e){ var s=getComputedStyle(e); return s.position==="fixed" && s.pointerEvents==="none" && parseInt(s.zIndex)>100 }).map(function(e){ return e.tagName+"."+e.className+" z:"+getComputedStyle(e).zIndex+" w:"+e.offsetWidth+" h:"+e.offsetHeight; }).join(" | ")',
      returnByValue: true
    });
  }).then(function(r) {
    console.log('OVERLAYS:', JSON.stringify(r));
    return cdp.send('Runtime.evaluate', {
      expression: 'Array.from(document.querySelectorAll("*")).filter(function(e){ var s=getComputedStyle(e); return s.position==="fixed" && s.pointerEvents==="none" }).map(function(e){ return e.tagName+"."+e.className+" z:"+getComputedStyle(e).zIndex; }).join(" | ")',
      returnByValue: true
    });
  }).then(function(r) {
    console.log('ALL_FIXED_NONE:', JSON.stringify(r));
    var msgs = cdp.getConsole();
    console.log('CONSOLE_ERRORS:', msgs.length > 0 ? msgs.join('\n') : '(none)');
    cdp.ws.close();
    process.exit(0);
  }).catch(function(e) {
    console.error('CDP eval failed:', e.message);
    var msgs = cdp.getConsole();
    console.log('CONSOLE_ERRORS:', msgs.length > 0 ? msgs.join('\n') : '(none)');
    cdp.ws.close();
    process.exit(1);
  });
}).catch(function(e) {
  console.error('Failed:', e.message);
  process.exit(1);
});
