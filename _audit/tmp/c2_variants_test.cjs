// C2 style variant experiment on the live diag close button + project state snapshot.
// Usage: node c2_variants_test.cjs
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

  const variants = await ev(`(async()=>{
    if (!document.getElementById('settings-modal')) { document.getElementById('btn-settings')?.click(); await new Promise(r=>setTimeout(r,500)); }
    document.getElementById('tab-diag')?.click();
    await new Promise(r=>setTimeout(r,400));
    const panel = document.getElementById('diag-panel');
    const btn = panel ? panel.querySelector('.btn-close') : null;
    if (!btn) return { error: 'no btn' };
    const measure = () => ({ ch: btn.clientHeight, sh: btn.scrollHeight, ov: btn.scrollHeight - btn.clientHeight });
    const base = measure();
    const results = { base };
    btn.style.display = 'inline-flex'; btn.style.alignItems = 'center'; btn.style.justifyContent = 'center';
    results.flexExplicit = measure();
    btn.style.display = 'grid'; btn.style.placeItems = 'center'; btn.style.lineHeight = 'normal';
    results.grid = measure();
    btn.style.fontSize = 'var(--font-size-xl, 18px)';
    results.grid18px = measure();
    btn.style.fontSize = 'var(--font-size-lg, 16px)';
    results.grid16px = measure();
    btn.removeAttribute('style');
    return results;
  })()`);

  const state = await ev(`(async()=>{
    document.getElementById('btn-open-project')?.click();
    await new Promise(r=>setTimeout(r,500));
    const rows = [...document.querySelectorAll('.project-item, .project-row, [class*="project-item"]')].map(el => el.textContent.trim().slice(0, 60));
    const modalOpen = !!document.querySelector('.project-modal-content');
    document.getElementById('btn-close-outline-workspace') || document.querySelector('.project-modal-content .btn-close')?.click();
    await new Promise(r=>setTimeout(r,300));
    return { modalOpen, rows };
  })()`);

  console.log(JSON.stringify({ variants: variants.result.value, projectState: state.result.value }, null, 2));
  ws.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
