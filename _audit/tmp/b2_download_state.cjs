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
  let id = 0;
  const pend = new Map();
  const events = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
    if (m.method === 'Browser.downloadProgress' || m.method === 'Browser.downloadWillBegin') {
      events.push({ method: m.method, state: m.params.state, suggestedName: m.params.suggestedFilename || m.params.suggestedName });
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params) => new Promise((res) => {
    const mid = ++id;
    pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Page.enable', {});
  await send('Browser.enable', {});
  const ev = (ex) => send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
  await ev(`(async()=>{
    document.getElementById('btn-export-data')?.click();
    await new Promise(r=>setTimeout(r,1500));
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 2500));
  console.log(JSON.stringify(events, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
