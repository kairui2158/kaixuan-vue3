const http = require('http');
(async () => {
  const pages = await new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9227, path: '/json' }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  const ev = (ex) => new Promise((res) => { const mid = ++id; pend.set(mid, res); ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression: ex, returnByValue: true, awaitPromise: true } })); });
  const r = await ev(`({
    hasGetAppVersion: typeof window.electronAPI?.getAppVersion,
    hasStorageRead: typeof window.electronAPI?.storageRead,
    activePanel: window.__getActivePanel ? window.__getActivePanel() : null,
    helpOverlayVisible: !!document.querySelector('.help-overlay'),
    diagVersion: document.querySelector('.diag-version')?.textContent || null,
    bodySnippet: document.body.innerText.slice(0, 120).replace(/\\n/g, ' | ')
  })`);
  console.log(JSON.stringify(r.result.value, null, 2));
  ws.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
