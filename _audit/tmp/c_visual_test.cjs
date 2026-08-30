// Stage C real UI verification: C1 ch-plot badge text, C2 diag btn-close overflow.
// Usage: node c_visual_test.cjs
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
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const ev = (ex) => new Promise((res) => {
    const mid = ++id; pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression: ex, returnByValue: true, awaitPromise: true } }));
  });
  await new Promise((res) => { const mid = ++id; pend.set(mid, res); ws.send(JSON.stringify({ id: mid, method: 'Page.enable', params: {} })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Page.javascriptDialogOpening') {
      ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    }
  });

  // C1: open the first chapter plot tab and read the mode badge.
  const c1 = await ev(`(async()=>{
    const btn = document.querySelector('button[id^="btn-tree-ch-plot-"]');
    if (!btn) return { skipped: 'no chapter plot button in tree' };
    btn.click();
    await new Promise(r=>setTimeout(r,600));
    const badge = document.getElementById('editor-mode-badge');
    return { badgeText: badge ? badge.textContent.trim() : null, badgeVisible: badge ? badge.offsetParent !== null : false };
  })()`);

  // C2: settings modal -> diag tab -> measure the panel close button.
  const c2 = await ev(`(async()=>{
    if (!document.getElementById('settings-modal')) { document.getElementById('btn-settings')?.click(); await new Promise(r=>setTimeout(r,500)); }
    document.getElementById('tab-diag')?.click();
    await new Promise(r=>setTimeout(r,400));
    const panel = document.getElementById('diag-panel');
    const btn = panel ? panel.querySelector('.btn-close') : null;
    if (!btn) return { skipped: 'diag panel or close button not found' };
    const cs = getComputedStyle(btn);
    return {
      clientHeight: btn.clientHeight,
      scrollHeight: btn.scrollHeight,
      overflow: btn.scrollHeight - btn.clientHeight,
      heightCss: cs.height,
      lineHeightCss: cs.lineHeight,
    };
  })()`);

  console.log(JSON.stringify({
    c1_badge: c1.result.value,
    c2_close: c2.result.value,
    c1_pass: c1.result.value.badgeText === '剧情/概要',
    c2_pass: c2.result.value.overflow !== undefined ? c2.result.value.overflow <= 0 : null,
  }, null, 2));
  ws.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
