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
    // close settings, then open each panel
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: "document.getElementById('btn-close-settings').click()" } }));
    });
    var panels = ['memory','dashboard','plugin-market','pipeline'];
    var pi = 0;
    ws.on('message', (msg) => {
      var d = JSON.parse(msg.toString());
      if (d.id === 1) {
        setTimeout(function() { openPanel(); }, 300);
      } else if (d.id === 2) {
        setTimeout(function() {
          ws.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: { expression: "JSON.stringify(Array.from(document.querySelectorAll('button')).map(function(el){return {id:el.id||'(no-id)','text':(el.textContent||'').trim().substring(0,20),visible:!!(el.offsetParent||el.getClientRects().length)};}).filter(function(b){return b.visible;}))" } }));
        }, 500);
      } else if (d.id === 3) {
        var visible = JSON.parse(d.result.result.value);
        console.log('PANEL ' + panels[pi-1] + ': visible buttons=' + visible.length);
        console.log(JSON.stringify(visible));
        pi++;
        if (pi < panels.length) {
          setTimeout(function() {
            ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: "var btn=document.getElementById('btn-close-pl'); if(btn){btn.click();'CLOSE'}else{'NO_PL'}" } }));
          }, 200);
        } else {
          ws.close();
        }
      }
    });
    function openPanel() {
      ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: 'document.getElementById("btn-'+panels[pi]+'").click()' } }));
    }
    function closePanel(idx) {
      ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: "var pane=document.getElementById('"+panels[idx]+"'); if(pane){pane.style.display='none';'HIDDEN'}else{'NO_PANEL'}" } }));
    }
    ws.on('error', (e) => console.log('WS_ERR:', e.message.substring(0, 100)));
  });
});
