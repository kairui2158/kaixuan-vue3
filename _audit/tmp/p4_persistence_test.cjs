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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1. fixture with full data shape
  const setup = await evalJs(`(async () => {
    const proj = {
      projectName: '深度扫描P4测试', outlineText: '第一卷 试炼\\n第二卷 风云',
      outlineLocked: true, outlineLockedText: '锁定文本', bookWordCount: 3000000,
      volumesConfirmed: true, chaptersConfirmed: false, settingsGenerated: true,
      settings: [{ id: 'set1', name: '测试设定' }],
      volumes: [ { id: 'volA', name: '第一卷 试炼', outline: 'o', isBound: true, boundTo: ['chapter-layer'] } ],
      chapters: { volA: [ { id: 'chA1', title: '第一章', body: '正文内容', plot: '剧情' } ] },
      settingBindings: { volA: ['set1'] },
      settingsCollection: { categories: [{ id: 'cat1', name: '物品' }], items: { it1: { id: 'it1', name: 'XX装甲', category: 'cat1' } } },
      memories: {
        version: 1,
        entities: [ { id: 'ent1', name: '林舟', type: 'character', evidence: [{ chapterId: 'chA1' }] } ],
        relations: [], events: [ { id: 'evt1', title: '初入北境', chapterId: 'chA1' } ],
        world: [], foreshadowing: [], meta: {}, history: [], categories: [], items: []
      },
      memoryBlacklist: [],
      aiNaming: { results: [ { id: 'nr1', name: '云澜城', type: 'city' } ], favorites: [ { id: 'fav1', name: '玄冰剑' } ] },
      outlineChat: [ { role: 'user', content: '测试消息' } ]
    };
    await window.electronAPI.storageWrite('wa_project_scan_p4_test', proj);
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
    await store.loadProject('scan_p4_test');
    return {
      name: store.projectName, volBound: store.volumes[0].isBound, volBoundTo: store.volumes[0].boundTo,
      entities: store.memories.entities.length, events: store.memories.events.length,
      totals: store.memories.meta.totals, naming: store.aiNaming, chatLen: store.outlineChat.length,
      collectionItems: Object.keys(store.settingsCollection.items || {}).length
    };
  })()`);

  // 2. mutate via store API (addWorldEntry triggers saveProject)
  const mutate = await evalJs(`(async () => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
    const id = store.addWorldEntry({ name: '北境学院', content: '雪原上的学院', category: '地点' });
    return { newWorldId: id, worldCount: store.memories.world.length };
  })()`);
  await sleep(400);

  // 3. read back storage JSON and check keys
  const stored = await evalJs('window.electronAPI.storageRead("wa_project_scan_p4_test")');
  const storedKeys = Object.keys(stored || {});

  // 4. reset store, reload, verify restored
  const reload = await evalJs(`(async () => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
    store.currentProjectId = 'default'; store.projectName = ''; store.volumes = []; store.chapters = {};
    store.memories = null;
    await store.loadProject('scan_p4_test');
    return {
      name: store.projectName, worldCount: store.memories.world.length,
      worldName: store.memories.world[0] && store.memories.world[0].name,
      totals: store.memories.meta.totals, naming: store.aiNaming,
      historyLen: store.memories.history.length
    };
  })()`);

  // 5. cleanup
  const cleanup = await evalJs(`(async () => {
    await window.electronAPI.storageRemove('wa_project_scan_p4_test');
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
    store.currentProjectId = 'default'; store.projectName = ''; store.outlineText = ''; store.outlineLockedText = '';
    store.volumes = []; store.chapters = {}; store.memories = null;
    const keys = await window.electronAPI.storageList();
    return { removed: !keys.includes('wa_project_scan_p4_test') };
  })()`);
  console.log(JSON.stringify({ setup, mutate, storedKeys, reload, cleanup }, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
