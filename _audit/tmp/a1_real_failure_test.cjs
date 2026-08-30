// A1 real-failure probe: baseline | fail | recover
// Usage: node a1_real_failure_test.cjs baseline
const http = require('http');
const mode = process.argv[2] || 'baseline';
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
  const out = await ev(`(async()=>{
    const store=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
    const ret=await store.saveProject();
    const banner=document.getElementById('save-error-banner');
    const bannerStyle=banner?getComputedStyle(banner):null;
    return {
      mode:${JSON.stringify(mode)},
      saveResult:ret,
      lastSaveError:store.lastSaveError,
      bannerExists:!!banner,
      bannerVisible:bannerStyle?bannerStyle.display!=='none'&&bannerStyle.visibility!=='hidden':false,
      bannerText:banner?banner.innerText.slice(0,80):null
    };
  })()`);
  console.log(JSON.stringify(out.result.value, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
