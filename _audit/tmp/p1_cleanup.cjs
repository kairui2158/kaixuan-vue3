const http = require('http');

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9227, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

(async () => {
  const pages = await getJson('/json');
  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = new Map();
  function send(method, params) {
    return new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result && r.result.value;
  };
  const result = await evalJs(`(async () => {
    await window.electronAPI.storageRemove('wa_project_scan_p1_test');
    const app = document.querySelector('#app').__vue_app__;
    const store = app.config.globalProperties.$pinia._s.get('project');
    store.currentProjectId = 'default';
    store.projectName = '';
    store.outlineText = '';
    store.outlineLockedText = '';
    store.volumes = [];
    store.chapters = {};
    const ed = app.config.globalProperties.$pinia._s.get('editor');
    ed.tabs = [];
    ed.activeTabId = null;
    const keys = await window.electronAPI.storageList();
    return {
      removed: !keys.includes('wa_project_scan_p1_test'),
      storeReset: store.currentProjectId === 'default' && store.volumes.length === 0,
      editorReset: ed.tabs.length === 0
    };
  })()`);
  console.log(JSON.stringify(result, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
