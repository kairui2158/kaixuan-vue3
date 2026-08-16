const http = require('http');
const WebSocket = require('ws');
http.get('http://127.0.0.1:9227/json', (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    const targets = JSON.parse(data);
    const target = targets.find((t) => t.title.includes('神意') || t.url.includes('novel-workshop'));
    if (!target) { console.log('NO_TARGET'); return; }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "JSON.stringify(['btn-new-project','btn-open-file','btn-tree-generate','btn-add-volume','btn-tree-gen','btn-open-project'].map(function(id){ var el=document.getElementById(id); return {id:id, exists:!!el}; }))" } }));
    });
    ws.on('message', (msg) => {
      var d = JSON.parse(msg.toString());
      if (d.id === 1) { console.log(d.result.result.value); ws.close(); }
    });
    ws.on('error', (e) => console.log('WS_ERR:', e.message.substring(0, 100)));
  });
});
