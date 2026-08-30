// B2 real export verification
// Usage: node b2_export_test.cjs
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
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const ev = (ex) => new Promise((res) => {
    const mid = ++id;
    pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression: ex, returnByValue: true, awaitPromise: true } }));
  });
  await new Promise((res) => {
    const mid = ++id;
    pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method: 'Page.enable', params: {} }));
  });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Page.javascriptDialogOpening') {
      const did = ++id;
      ws.send(JSON.stringify({ id: did, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    }
  });
  const out = await ev(`(async()=>{
    if (!document.getElementById('settings-modal')) { document.getElementById('btn-settings')?.click(); await new Promise(r=>setTimeout(r,500)); }
    document.getElementById('tab-appearance')?.click();
    await new Promise(r=>setTimeout(r,300));
    const btn=document.getElementById('btn-export-data');
    if(!btn) return {btnFound:false};
    btn.click();
    await new Promise(r=>setTimeout(r,1200));
    return {btnFound:true, clicked:true};
  })()`);
  console.log(JSON.stringify(out.result.value, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
