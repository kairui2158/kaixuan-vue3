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
      // Close memory panel first, then check which panels are rendered
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "(function(){ var m=document.getElementById('btn-close-mem'); if(m){m.click();return 'CLOSE_MEM';} return 'NO_MEM';})()" } }));
    });
    ws.on('message', (msg) => {
      var d = JSON.parse(msg.toString());
      if (d.id === 1) {
        setTimeout(function() {
          // Check which panel containers exist in the DOM
          ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: "JSON.stringify(['memory-panel','dashboard-modal','pipeline-panel','outline-workspace','settings-modal','plugin-market','sc-panel','settings-collection-panel'].map(function(id){var el=document.getElementById(id);return {id:id,exists:!!el,visible:!!(el && (el.offsetParent||el.getClientRects().length))};}))" } }));
        }, 300);
      } else if (d.id === 2) {
        console.log('PANELS:', d.result.result.value);
        // Now open settings-collection panel
        ws.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: { expression: "var btn=document.getElementById('btn-settings-collection'); if(btn){btn.click();'CLICKED'}else{'NO_BTN'}" } }));
      } else if (d.id === 3) {
        setTimeout(function() {
          ws.send(JSON.stringify({ id: 4, method: 'Runtime.evaluate', params: { expression: "JSON.stringify(Array.from(document.querySelectorAll('#sc-panel button,[id^=btn-]')).filter(function(el){return el.offsetParent||el.getClientRects().length;}).map(function(el){return {id:el.id||'(no-id)','text':(el.textContent||'').trim().substring(0,20)};}))" } }));
        }, 500);
      } else if (d.id === 4) {
        console.log('SC_BUTTONS:', d.result.result.value);
        // Close sc, open dashboard
        ws.send(JSON.stringify({ id: 5, method: 'Runtime.evaluate', params: { expression: "document.getElementById('btn-close-sc').click()" } }));
      } else if (d.id === 5) {
        setTimeout(function() {
          ws.send(JSON.stringify({ id: 6, method: 'Runtime.evaluate', params: { expression: "var btn=document.getElementById('btn-dashboard'); if(btn){btn.click();'CLICKED'}else{'NO_BTN'}" } }));
        }, 300);
      } else if (d.id === 6) {
        setTimeout(function() {
          ws.send(JSON.stringify({ id: 7, method: 'Runtime.evaluate', params: { expression: "JSON.stringify(Array.from(document.querySelectorAll('#dashboard-modal button')).map(function(el){return {id:el.id||'(no-id)','text':(el.textContent||'').trim().substring(0,20),visible:!!(el.offsetParent||el.getClientRects().length)};}))" } }));
        }, 500);
      } else if (d.id === 7) {
        console.log('DASH_BUTTONS:', d.result.result.value);
        ws.close();
      }
    });
    ws.on('error', (e) => console.log('WS_ERR:', e.message.substring(0, 100)));
  });
});
