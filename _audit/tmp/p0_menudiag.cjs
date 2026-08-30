const http = require('http');
function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9227, path }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}
(async () => {
  const pages = await getJson('/json');
  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pending = new Map();
  function send(method, params) {
    return new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
  }
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  const expr = `(() => {
    const all = Array.from(document.querySelectorAll('button, a, [role=menuitem], [class*=menu]'));
    const menus = all.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).slice(0, 40)
      .map(e => ({ tag: e.tagName, cls: String(e.className).slice(0,60), text: e.textContent.trim().slice(0,20) }));
    return { count: menus.length, menus };
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(JSON.stringify(r.result.value, null, 1));
  ws.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
