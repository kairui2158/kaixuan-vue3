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
      // Step 1: click outline button to open OutlineWorkspace panel
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "(function(){ var btn=document.getElementById('btn-outline-workspace'); if(btn){btn.click(); return 'CLICKED';} return 'NO_BUTTON';})()" } }));
    });
    var step = 1;
    ws.on('message', (msg) => {
      var d = JSON.parse(msg.toString());
      if (d.id === 1) {
        console.log('STEP1:', d.result.result.value);
        // Step 2: wait a moment then check outline workspace buttons
        setTimeout(function() {
          ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: "JSON.stringify(['btn-ai-co-create','btn-close-outline-workspace','btn-export-outline-md','btn-export-outline-txt','btn-ow-send','btn-generate-outline-skills','btn-import-outline','btn-save-outline','btn-lock-outline'].map(function(id){ var el=document.getElementById(id); return {id:id, exists:!!el, visible:!!(el && (el.offsetParent || el.getClientRects().length))}; }))" } }));
        }, 500);
      } else if (d.id === 2) {
        console.log('STEP2:', d.result.result.value);
        // Step 3: check if chat area is open
        ws.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: { expression: "JSON.stringify({chatAreaOpen: document.querySelector('.ow-chat') ? !!(document.querySelector('.ow-chat').offsetParent) : false, panelVisible: !!document.getElementById('btn-ai-co-create')})" } }));
      } else if (d.id === 3) {
        console.log('STEP3:', d.result.result.value);
        ws.close();
      }
    });
    ws.on('error', (e) => console.log('WS_ERR:', e.message.substring(0, 100)));
  });
});
