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
      ws.send(JSON.stringify({
        id: 1, method: 'Runtime.evaluate',
        params: { expression: "(function(){ return ['btn-ai-co-create','btn-generate-content','btn-de-ai','btn-ai-names','btn-writing-rules','btn-timeline','btn-batch-review','btn-revise','btn-find','btn-undo','btn-redo','btn-save-editor','btn-export'].map(function(id){ var el=document.getElementById(id); return {id:id, exists:!!el, visible:!!(el && (el.offsetParent || el.getClientRects().length))}; }); })()" }
      }));
    });
    ws.on('message', (msg) => {
      var d = JSON.parse(msg.toString());
      if (d.id === 1) {
        var r = d.result;
        if (r) {
          console.log('RESULT:', JSON.stringify({ result: r.result, exceptionDetails: r.exceptionDetails }, null, 2));
        } else {
          console.log('RAW:', JSON.stringify(d, null, 2).substring(0, 500));
        }
        ws.close();
      }
    });
    ws.on('error', (e) => console.log('WS_ERR:', e.message.substring(0, 100)));
  });
});
