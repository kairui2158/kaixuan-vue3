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
      setTimeout(function() { if (pending[id]) { reject(new Error('timeout: ' + method + ' id:' + id)); delete pending[id]; } }, 10000);
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
  // Try Page domain + DOM domain instead of Runtime
  return cdp.send('Page.enable').then(function() {
    return cdp.send('DOM.enable');
  }).then(function() {
    // Get root DOM node
    return cdp.send('DOM.getDocument');
  }).then(function(r) {
    var root = r.result.root;
    console.log('Root node:', root.nodeName, 'childCount:', root.childNodeCount);
    // Get outer HTML
    return cdp.send('DOM.getOuterHTML', { nodeId: root.nodeId });
  }).then(function(r) {
    console.log('OuterHTML (first 1200):', r.result.outerHTML.substring(0, 1200));
    // Search for fixed/overlay elements
    return cdp.send('DOM.performSearch', { query: 'div.panel-backdrop' });
  }).then(function(r) {
    console.log('Backdrop search:', JSON.stringify(r.result));
    return cdp.send('DOM.performSearch', { query: 'div[class*=modal]' });
  }).then(function(r) {
    console.log('Modal search:', JSON.stringify(r.result));
    // Try Page captureScreenshot
    return cdp.send('Page.captureScreenshot', { format: 'png' });
  }).then(function(r) {
    console.log('Screenshot taken, length:', r.result.data ? r.result.data.length : 0);
    if (r.result.data) {
      require('fs').writeFileSync('_audit/tmp/cdp-screenshot.png', Buffer.from(r.result.data, 'base64'));
      console.log('Screenshot saved to _audit/tmp/cdp-screenshot.png');
    }
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
