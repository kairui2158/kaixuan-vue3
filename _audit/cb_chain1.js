const http = require('http');
const WebSocket = require('ws');
http.get('http://127.0.0.1:9227/json', (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    const targets = JSON.parse(data);
    const target = targets.find((t) => t.title.includes('神意') || t.url.includes('novel-workshop'));
    if (!target) { console.log('NO_CDP_TARGET'); return; }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    var step = 0;
    ws.on('open', () => {
      console.log('CDP_OPEN');
      // Step 0: check current UI state, click outline workspace button
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "JSON.stringify({activePanel: window.__getActivePanel ? window.__getActivePanel() : 'n/a', outlineBtn: !!document.getElementById('btn-outline-workspace')})" } }));
    });
    ws.on('message', (msg) => {
      var d = JSON.parse(msg.toString());
      if (d.id === 1) {
        console.log('STATE:', d.result.result.value);
        // Click outline workspace to open
        ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: "document.getElementById('btn-outline-workspace').click()" } }));
      } else if (d.id === 2) {
        setTimeout(function() {
          ws.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: { expression: "JSON.stringify({outlineOpen: !!document.getElementById('outline-workspace'), importBtn: !!document.getElementById('btn-import-outline'), lockBtn: !!document.getElementById('btn-lock-outline'), saveBtn: !!document.getElementById('btn-save-outline')})" } }));
        }, 500);
      } else if (d.id === 3) {
        console.log('OUTLINE_STATE:', d.result.result.value);
        ws.close();
      }
    });
    ws.on('error', (e) => console.log('WS_ERR:', e.message.substring(0, 100)));
  });
});
