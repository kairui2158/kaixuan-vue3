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
    var tabIdx = 0;
    var tabs = ['tab-skill','tab-agent','tab-appearance','tab-deai','tab-diag'];
    ws.on('open', () => {
      clickTab();
    });
    function clickTab() {
      ws.send(JSON.stringify({ id: tabIdx*2+1, method: 'Runtime.evaluate', params: { expression: 'document.getElementById("'+tabs[tabIdx]+'").click()' } }));
    }
    ws.on('message', (msg) => {
      var d = JSON.parse(msg.toString());
      if (d.id % 2 === 1) {
        setTimeout(function() {
          ws.send(JSON.stringify({ id: d.id+1, method: 'Runtime.evaluate', params: { expression: "JSON.stringify(['" + tabs[tabIdx] + "',Array.from(document.querySelectorAll('#settings-modal button')).map(function(el){return {id:el.id||'(no-id)','text':(el.textContent||'').trim().substring(0,20),visible:!!(el.offsetParent||el.getClientRects().length)};})])" } }));
        }, 300);
      } else {
        var result = d.result.result.value;
        console.log('TAB ' + tabs[tabIdx] + ':', result);
        tabIdx++;
        if (tabIdx < tabs.length) {
          setTimeout(clickTab, 200);
        } else {
          ws.close();
        }
      }
    });
    ws.on('error', (e) => console.log('WS_ERR:', e.message.substring(0, 100)));
  });
});
