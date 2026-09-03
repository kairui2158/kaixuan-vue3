const http = require('http');

function getPage(port) {
  return new Promise(function(resolve, reject) {
    var req = http.request({hostname:'127.0.0.1', port:port, path:'/json', method:'GET'}, function(res){
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
  ws.on('message', function(data) {
    var msg = JSON.parse(data);
    if (msg.id && pending[msg.id]) {
      pending[msg.id].resolve(msg);
      delete pending[msg.id];
    }
  });
  function send(method, params) {
    return new Promise(function(resolve, reject) {
      var id = msgId++;
      pending[id] = { resolve: resolve, reject: reject };
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      setTimeout(function() { if (pending[id]) { reject(new Error('timeout: ' + method + ' id:' + id)); delete pending[id]; } }, 8000);
    });
  }
  return new Promise(function(resolve, reject) {
    ws.on('open', function() { resolve({ send: send, ws: ws }); });
    ws.on('error', reject);
  });
}

getPage(9228).then(function(page) {
  console.log('Connecting to:', page.webSocketDebuggerUrl);
  return wsConnect(page.webSocketDebuggerUrl);
}).then(function(cdp) {
  // Skip Runtime.enable, directly evaluate
  return cdp.send('Runtime.evaluate', {
    expression: 'JSON.stringify({ elemCount: document.querySelectorAll("*").length, bodyPointerEvents: getComputedStyle(document.body).pointerEvents, bodyDisplay: getComputedStyle(document.body).display, htmlLen: document.body.innerHTML.length, activePanel: (window.__vue_app__?"vue_app_exists":"no_vue"), readyState: document.readyState })',
    returnByValue: true
  }).then(function(r) {
    console.log('BASIC:', JSON.stringify(r.result));
    return cdp.send('Runtime.evaluate', {
      expression: 'Array.from(document.querySelectorAll("*")).filter(function(e){ var s=getComputedStyle(e); return s.position==="fixed" && s.pointerEvents==="none" && parseInt(s.zIndex)>50 }).map(function(e){ return e.tagName+"."+e.className+" z:"+getComputedStyle(e).zIndex+" w:"+e.offsetWidth+" h:"+e.offsetHeight; }).join(" | ")',
      returnByValue: true
    });
  }).then(function(r) {
    console.log('OVERLAYS:', JSON.stringify(r.result));
    return cdp.send('Runtime.evaluate', {
      expression: 'Array.from(document.querySelectorAll("*")).filter(function(e){ var s=getComputedStyle(e); return s.position==="fixed" }).map(function(e){ return e.tagName+"."+e.className+" z:"+getComputedStyle(e).zIndex+" pe:"+s.pointerEvents+" w:"+e.offsetWidth+" h:"+e.offsetHeight; }).join(" | ")',
      returnByValue: true
    });
  }).then(function(r) {
    console.log('ALL_FIXED:', JSON.stringify(r.result));
    return cdp.send('Runtime.evaluate', {
      expression: 'document.body.innerHTML.substring(0, 1200)',
      returnByValue: true
    });
  }).then(function(r) {
    console.log('HTML:', JSON.stringify(r.result));
    cdp.ws.close();
    process.exit(0);
  }).catch(function(e) {
    console.error('CDP failed:', e.message);
    cdp.ws.close();
    process.exit(1);
  });
}).catch(function(e) {
  console.error('Failed:', e.message);
  process.exit(1);
});
