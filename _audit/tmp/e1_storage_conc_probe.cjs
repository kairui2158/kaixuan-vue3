const CDP_PORT = 9227;
async function getPageWs() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
  return page.webSocketDebuggerUrl;
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map();
    ws.onopen = () => resolve({ send(method, params = {}) { return new Promise((res2, rej2) => { const mid = ++id; pending.set(mid, { res2, rej2 }); ws.send(JSON.stringify({ id: mid, method, params })); }); }, close: () => ws.close() });
    ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const { res2, rej2 } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej2(new Error(JSON.stringify(msg.error))) : res2(msg.result); } };
    ws.onerror = reject;
  });
}
async function evaluate(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval fail: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}
(async () => {
  const cdp = await connect(await getPageWs());
  const results = {};

  results.cleanup = await evaluate(cdp, `(async () => {
    const api = window.electronAPI;
    await api.storageRemove('wa_project_p1788101837759');
    await api.storageRemove('wa_project_p1788101864209');
    const app = document.querySelector('#app').__vue_app__;
    const ps = app.config.globalProperties.$pinia._s.get('project');
    const ids = (ps.projectList || []).map((p) => p.id);
    if (ps.currentProjectId === 'p1788101837759' || ps.currentProjectId === 'p1788101864209') {
      const smoke = ids.find((i) => i === 'p1788090303036');
      if (smoke) ps.selectProject(smoke);
      else ps.clearCurrent();
    }
    await ps.loadProjectList();
    return { list: (ps.projectList || []).map((p) => p.name), current: ps.currentProjectId };
  })()`);

  results.conc = await evaluate(cdp, `(async () => {
    const api = window.electronAPI;
    const key = 'wa_e1_conc_test';
    let rounds = 20;
    for (let i = 0; i < rounds; i++) {
      const a = { pad: 'a'.repeat(100 + Math.floor(Math.random() * 9000)), n: 1, i };
      const b = { pad: 'b'.repeat(10 + Math.floor(Math.random() * 900)), n: 2, i };
      const c = { pad: 'c'.repeat(500 + Math.floor(Math.random() * 3000)), n: 3, i };
      await Promise.all([api.storageWrite(key, a), api.storageWrite(key, b), api.storageWrite(key, c)]);
      const back = await api.storageRead(key);
      if (!back || back.i !== i || back.n !== 3 || back.pad.length !== c.pad.length) {
        return { pass: false, round: i, back: back ? { n: back.n, i: back.i, padLen: (back.pad || '').length } : null };
      }
    }
    await api.storageRemove(key);
    return { pass: true, rounds };
  })()`);

  console.log(JSON.stringify(results, null, 2));
  cdp.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
