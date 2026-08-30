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
  const key = 'wa_project_scan_p4_naming_test';
  const setup = await evalJs(`(async () => {
    const data = {
      projectName: 'AI命名持久化测试', outlineText: '第一卷',
      aiNaming: {
        version: 1,
        legacyTopLevelResults: undefined,
        favorites: [{ id: 'fav1', name: '玄冰剑', meaning: '冰霜名剑', usage: '主角武器', type: 'item', createdAt: '2026-01-01T00:00:00.000Z' }],
        history: [{ id: 'hist1', request: { type: 'city', context: '北境城市', style: '古风', count: 1 }, results: [{ id: 'r1', name: '云澜城', meaning: '云水之城', usage: '商业城市', type: 'city', createdAt: '2026-01-01T00:00:00.000Z' }], createdAt: '2026-01-01T00:00:00.000Z' }]
      },
      extraTopLevelResults: [{ id: 'legacy', name: '旧位置名' }]
    };
    await window.electronAPI.storageWrite('${key}', data);
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
    await store.loadProject('scan_p4_naming_test');
    return {
      favorites: store.aiNaming.favorites.length,
      history: store.aiNaming.history.length,
      historyResults: store.aiNaming.history[0]?.results?.length,
      restoredName: store.aiNaming.history[0]?.results?.[0]?.name,
      topLevelLegacyPreserved: store.aiNaming.extraTopLevelResults,
    };
  })()`);
  const saved = await evalJs(`(async () => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
    await store.saveProject();
    const disk = await window.electronAPI.storageRead('${key}');
    return { diskHistory: disk.aiNaming.history.length, diskHistoryResults: disk.aiNaming.history[0].results.length, diskTopLevel: disk.aiNaming.extraTopLevelResults };
  })()`);
  const cleanup = await evalJs(`(async () => {
    await window.electronAPI.storageRemove('${key}');
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
    store.currentProjectId = 'default'; store.projectName = ''; store.outlineText = ''; store.volumes = []; store.chapters = {}; store.aiNaming = { version: 1, favorites: [], history: [] };
    const keys = await window.electronAPI.storageList();
    return { removed: !keys.includes('${key}') };
  })()`);
  console.log(JSON.stringify({ setup, saved, cleanup }, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
