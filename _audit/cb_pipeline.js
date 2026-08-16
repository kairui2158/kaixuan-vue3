const http = require('http');
const WebSocket = require('ws');
const CDP_URL = 'http://127.0.0.1:9227/json';
http.get(CDP_URL, (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    const targets = JSON.parse(data);
    const target = targets.find((t) => t.title.includes('神意') || t.url.includes('novel-workshop'));
    if (!target) { console.log('NO_TARGET'); return; }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.on('open', () => {
      // close outline first, then open pipeline
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "document.getElementById('btn-close-outline-workspace').click()" } }));
    });
    ws.on('message', (msg) => {
      var d = JSON.parse(msg.toString());
      if (d.id === 1) {
        setTimeout(function() {
          ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: "(function(){ var btn=document.getElementById('btn-tree-gen'); if(btn){btn.click(); return 'CLICKED';} return 'NO_BUTTON';})()" } }));
        }, 300);
      } else if (d.id === 2) {
        setTimeout(function() {
          ws.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: { expression: "JSON.stringify(Array.from(document.querySelectorAll('#pipeline-panel button,[id^=btn-pl-],[id^=btn-ai-],[id^=btn-writing-],[id^=btn-timeline],[id^=btn-batch-],[id^=btn-revise],[id^=btn-translate],[id^=btn-style-],[id^=btn-regenerate],[id^=btn-modify]')).map(function(el){ return {id:el.id||'(no-id)', visible:!!(el.offsetParent || el.getClientRects().length)}; }))" } }));
        }, 500);
      } else if (d.id === 3) {
        console.log(d.result.result.value);
        ws.close();
      }
    });
    ws.on('error', (e) => console.log('WS_ERR:', e.message.substring(0, 100)));
  });
});
