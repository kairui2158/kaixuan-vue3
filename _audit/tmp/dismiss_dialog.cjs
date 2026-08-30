const http = require('http');
(async () => {
  const pages = await new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9227, path: '/json' }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ id: 1, method: 'Page.enable', params: {} }));
    ws.send(JSON.stringify({ id: 2, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    setTimeout(() => { console.log('dismiss sent'); process.exit(0); }, 1000);
  });
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
