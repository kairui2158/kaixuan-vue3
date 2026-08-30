const http = require('http');
(async () => {
  const pages = await new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9227, path: '/json' }, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); }).on('error', rej);
  });
  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  const ev = (ex) => new Promise((res) => { const mid = ++id; pend.set(mid, res); ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression: ex, returnByValue: true } })); });
  const r = await ev(`(() => {
    const appEl = document.getElementById('app');
    const app = appEl && appEl.__vue_app__;
    return {
      hasApp: !!app,
      hasInstance: !!(app && app._instance),
      hasSubtree: !!(app && app._instance && app._instance.subTree),
      containerSame: app && app._container === appEl,
      containerHasVnode: !!(appEl && appEl._vnode)
    };
  })()`);
  console.log(JSON.stringify(r.result.value));
  ws.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
