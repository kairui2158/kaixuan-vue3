const http = require('http');
(async () => {
  const pages = await new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9227, path: '/json' }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  console.log('targets:', pages.map((p) => ({ type: p.type, url: p.url.slice(0, 60) })));
  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener('message', (e) => console.log('MSG:', e.data.slice(0, 300)));
  ws.addEventListener('error', (e) => console.log('WS-ERR', e.message || String(e)));
  ws.addEventListener('close', () => console.log('WS-CLOSED'));
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '1+1', returnByValue: true } }));
    setTimeout(() => { console.log('diag done'); process.exit(0); }, 3000);
  });
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
