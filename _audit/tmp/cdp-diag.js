const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:9227/devtools/page/526500A6BEE3F0CE829D5CD8F9DC5802');
let id = 1;
const results = [];
ws.on('open', () => {
  ws.send(JSON.stringify({ id: id++, method: 'Runtime.enable' }));
  ws.send(JSON.stringify({ id: id++, method: 'Console.enable' }));
  ws.send(JSON.stringify({ id: id++, method: 'Log.enable' }));
  setTimeout(() => {
    ws.send(JSON.stringify({ id: id++, method: 'Runtime.evaluate', params: { expression: 'document.querySelectorAll("*").length', returnByValue: true } }));
    ws.send(JSON.stringify({ id: id++, method: 'Runtime.evaluate', params: { expression: 'getComputedStyle(document.body).pointerEvents', returnByValue: true } }));
    ws.send(JSON.stringify({ id: id++, method: 'Runtime.evaluate', params: { expression: 'Array.from(document.querySelectorAll("*")).filter(function(e) { var s = getComputedStyle(e); return s.position === "fixed" && s.pointerEvents === "none" && parseInt(s.zIndex) > 100 }).map(function(e) { return e.tagName + "." + e.className + " z:" + getComputedStyle(e).zIndex; }).join("; ")', returnByValue: true } }));
    ws.send(JSON.stringify({ id: id++, method: 'Runtime.evaluate', params: { expression: 'document.body.innerHTML.substring(0, 800)', returnByValue: true } }));
  }, 2000);
});
ws.on('message', function(data) {
  var msg = JSON.parse(data);
  if (msg.method && (msg.method.indexOf('Runtime.') === 0 || msg.method.indexOf('Console.') === 0 || msg.method.indexOf('Log.') === 0)) {
    console.log(JSON.stringify(msg));
  } else if (msg.id) {
    console.log('ID:' + msg.id + ' => ' + JSON.stringify(msg.result || msg.error).substring(0, 600));
  }
});
ws.on('error', function(e) { console.error('WS ERROR:', e.message); });
setTimeout(function() { ws.close(); process.exit(0); }, 12000);
