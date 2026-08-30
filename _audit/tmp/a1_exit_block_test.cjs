// Exit-block real test: check-modal | fail-state | retry
// Usage: node a1_exit_block_test.cjs check-modal|fail-state|retry
const http = require('http');
const mode = process.argv[2] || 'close-window';
function getJson(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9227, path }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}
(async () => {
  const pages = await getJson('/json');
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
  let out;
  if (mode === 'check-modal') {
    out = await ev(`(async()=>{
      const m=document.getElementById('exit-confirm-modal');
      return {modalVisible:!!m, hasSaveBtn:!!document.getElementById('btn-exit-save')};
    })()`);
  } else if (mode === 'fail-state') {
    out = await ev(`(async()=>{
      document.getElementById('btn-exit-save').click();
      await new Promise(r=>setTimeout(r,800));
      const m=document.getElementById('exit-confirm-modal');
      return {
        modalStillVisible:!!m,
        saveFailedShown:!!document.getElementById('btn-exit-retry'),
        errorText:(m&&m.innerText||'').slice(0,120)
      };
    })()`);
  } else if (mode === 'retry') {
    out = await ev(`(async()=>{
      document.getElementById('btn-exit-retry').click();
      await new Promise(r=>setTimeout(r,800));
      return {modalGone:!document.getElementById('exit-confirm-modal')};
    })()`);
  }
  console.log(JSON.stringify(out.result.value, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
