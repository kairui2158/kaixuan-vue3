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
  const dialogs = [];
  let dialogHandler = null;
  function send(method, params) {
    return new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return; }
    if (msg.method === 'Page.javascriptDialogOpening') {
      dialogs.push(msg.params);
      if (dialogHandler) dialogHandler(msg.params);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable');
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result && r.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // load fixture
  const load = await evalJs(`(async () => {
    const proj = {
      projectName: '深度扫描P1测试项目', outlineText: '第一卷 试炼之路\\n第二卷 风起云涌',
      outlineLocked: true, outlineLockedText: '第一卷\\n第二卷', bookWordCount: 100,
      volumesConfirmed: true, chaptersConfirmed: false, settingsGenerated: true, settings: [],
      volumes: [ { id: 'scanvol1', name: '第一卷 试炼之路', outline: 'o', isBound: false, boundTo: [] } ],
      chapters: { scanvol1: [ { id: 'scanch1', title: '第一章', body: 'b', plot: 'p' } ] },
      settingBindings: {}, settingsCollection: { categories: [], items: {} },
      memories: [], memoryBlacklist: [], aiNaming: { results: [], favorites: [] }, outlineChat: []
    };
    await window.electronAPI.storageWrite('wa_project_scan_p1_test', proj);
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project');
    await store.loadProject('scan_p1_test');
    return store.volumes.length;
  })()`);

  // trigger ctx menu via right-click then click 删除卷; auto-dismiss dialog when it opens
  dialogHandler = async () => {
    await send('Page.handleJavaScriptDialog', { accept: false });
  };
  await evalJs(`(() => {
    const vol = document.querySelector('.volume-item');
    vol.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 150 }));
    return 'ctx dispatched';
  })()`);
  await sleep(300);
  const menuVisible = await evalJs('!!document.querySelector(".ctx-menu")');
  await evalJs(`(() => { const b = Array.from(document.querySelectorAll('.ctx-item')).find(x => x.textContent.trim() === '删除卷'); if (b) { b.click(); return 'clicked del-vol'; } return 'NO del-vol button'; })()`);
  // native confirm blocks the renderer synchronously; wait for dialog event
  await sleep(1200);
  const volCount = await evalJs(`(document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project')).volumes.length`);

  // now test accept path: delete and confirm
  dialogHandler = async () => {
    await send('Page.handleJavaScriptDialog', { accept: true });
  };
  await evalJs(`(() => {
    const vol = document.querySelector('.volume-item');
    vol.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 150 }));
    return 'ctx dispatched';
  })()`);
  await sleep(300);
  await evalJs(`(() => { const b = Array.from(document.querySelectorAll('.ctx-item')).find(x => x.textContent.trim() === '删除卷'); if (b) { b.click(); return 'clicked del-vol'; } return 'NO del-vol button'; })()`);
  await sleep(1200);
  const volCountAfterAccept = await evalJs(`(document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project')).volumes.length`);

  // cleanup
  await evalJs(`(async () => {
    await window.electronAPI.storageRemove('wa_project_scan_p1_test');
    const app = document.querySelector('#app').__vue_app__;
    const s = app.config.globalProperties.$pinia._s.get('project');
    s.currentProjectId = 'default'; s.projectName = ''; s.outlineText = ''; s.outlineLockedText = '';
    s.volumes = []; s.chapters = {};
    const ed = app.config.globalProperties.$pinia._s.get('editor');
    ed.tabs = []; ed.activeTabId = null;
    return true;
  })()`);
  console.log(JSON.stringify({ fixtureVolumes: load, menuVisible, dialogs, volCountAfterCancel: volCount, volCountAfterAccept }, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
