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

  // write fixture project to storage
  const write = await evalJs(`(async () => {
    const proj = {
      projectName: '深度扫描P1测试项目',
      outlineText: '第一卷 试炼之路\\n主角进入北境学院，结识挚友与宿敌。\\n第二卷 风起云涌\\n学院大比开启，旧阴谋浮出水面。',
      outlineLocked: true,
      outlineLockedText: '第一卷 试炼之路\\n第二卷 风起云涌',
      bookWordCount: 5000000,
      volumesConfirmed: true,
      chaptersConfirmed: false,
      settingsGenerated: true,
      settings: [],
      volumes: [
        { id: 'scanvol1', name: '第一卷 试炼之路', outline: '主角进入北境学院，结识挚友与宿敌。', isBound: true, boundTo: ['chapter-layer'] },
        { id: 'scanvol2', name: '第二卷 风起云涌', outline: '学院大比开启，旧阴谋浮出水面。', isBound: false, boundTo: [] }
      ],
      chapters: {
        scanvol1: [
          { id: 'scanch1', title: '第一章 初入北境', body: '雪落北境，主角踏入学院大门。', plot: '主角抵达学院，遭遇入学试炼。' },
          { id: 'scanch2', title: '第二章 宿敌登场', body: '训练场上，两道目光相撞。', plot: '主角与宿敌初次交锋。' }
        ],
        scanvol2: [
          { id: 'scanch3', title: '第三章 大比前夜', body: '夜色深沉，风声渐紧。', plot: '各方势力暗流涌动。' }
        ]
      },
      settingBindings: {},
      settingsCollection: { categories: [], items: {} },
      memories: [],
      memoryBlacklist: [],
      aiNaming: { results: [], favorites: [] },
      outlineChat: []
    };
    await window.electronAPI.storageWrite('wa_project_scan_p1_test', proj);
    const app = document.querySelector('#app').__vue_app__;
    const store = app.config.globalProperties.$pinia._s.get('project');
    await store.loadProject('scan_p1_test');
    return { loaded: store.currentProjectId, vols: store.volumes.length, chKeys: Object.keys(store.chapters), name: store.projectName };
  })()`);

  await sleep(400);
  const treeState = await evalJs(`(() => {
    const volBtns = Array.from(document.querySelectorAll('[id^="btn-tree-vol-outline-"]'));
    const chItems = Array.from(document.querySelectorAll('.chapter-item'));
    const plotBtns = Array.from(document.querySelectorAll('[id^="btn-tree-ch-plot-"]'));
    return {
      projectName: (document.querySelector('#current-project-name .project-name') || {}).textContent || null,
      volBtnIds: volBtns.map((b) => b.id),
      chItemTexts: chItems.map((c) => c.querySelector('span')?.textContent),
      plotBtnIds: plotBtns.map((b) => b.id)
    };
  })()`);
  console.log(JSON.stringify({ write, treeState }, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
