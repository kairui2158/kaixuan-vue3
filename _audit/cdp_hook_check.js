const http = require('http');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9224/json', (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function cdpSend(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function evaluate(ws, expression) {
  const result = await cdpSend(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  return result.result.value;
}

async function run() {
  const targets = await getTargets();
  const target = targets.find(t => t.url && t.url.indexOf('5173') >= 0);
  if (!target) { console.log('ERROR: No target found'); process.exit(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Page.enable');
  await cdpSend(ws, 'Page.reload', { ignoreCache: true });
  await sleep(4000);

  const results = {};

  // 1. Test fetchModels IPC
  results.fetchModels = await evaluate(ws, `JSON.stringify(await (async function() {
    try {
      if (!window.electronAPI || !window.electronAPI.fetchModels) return { ok: false, error: 'fetchModels not found' };
      var result = await window.electronAPI.fetchModels('https://api.openai.com/v1', 'test-key');
      return { ok: true, result: result, type: typeof result, isArray: Array.isArray(result) };
    } catch(e) {
      return { ok: false, error: e.message, stack: e.stack ? e.stack.substring(0,200) : '' };
    }
  })())`);
  results.fetchModels = JSON.parse(results.fetchModels);

  // 2. Test providerTestConnection IPC
  results.testConnection = await evaluate(ws, `JSON.stringify(await (async function() {
    try {
      if (!window.electronAPI || !window.electronAPI.providerTestConnection) return { ok: false, error: 'providerTestConnection not found' };
      var result = await window.electronAPI.providerTestConnection('https://api.openai.com/v1', 'test-key');
      return { ok: true, result: result };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  })())`);
  results.testConnection = JSON.parse(results.testConnection);

  // 3. Test storageRead/Write
  results.storage = await evaluate(ws, `JSON.stringify(await (async function() {
    try {
      await window.electronAPI.storageWrite('__test_hook', { test: true, ts: Date.now() });
      var read = await window.electronAPI.storageRead('__test_hook');
      await window.electronAPI.storageRemove('__test_hook');
      return { ok: true, writeOk: true, readOk: read && read.test === true, removeOk: true };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  })())`);
  results.storage = JSON.parse(results.storage);

  // 4. Test respondCloseChoice (without actually quitting)
  results.closeChoice = await evaluate(ws, `JSON.stringify(await (async function() {
    try {
      if (!window.electronAPI || !window.electronAPI.respondCloseChoice) return { ok: false, error: 'respondCloseChoice not found' };
      // Send 'cancel' to avoid actually quitting
      window.electronAPI.respondCloseChoice('cancel');
      return { ok: true, sent: 'cancel' };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  })())`);
  results.closeChoice = JSON.parse(results.closeChoice);

  // 5. Test Pinia stores
  results.stores = await evaluate(ws, `JSON.stringify((function() {
    var app = document.querySelector('#app');
    if (!app || !app.__vue_app__) return { ok: false, error: 'Vue app not found' };
    var pinia = app.__vue_app__.config.globalProperties.$pinia;
    if (!pinia) return { ok: false, error: 'Pinia not found' };
    var storeIds = Object.keys(pinia.state.value);
    var storeData = {};
    for (var id of storeIds) {
      var s = pinia.state.value[id];
      storeData[id] = {};
      if (s.providers !== undefined) storeData[id].providerCount = Array.isArray(s.providers) ? s.providers.length : Object.keys(s.providers || {}).length;
      if (s.currentProjectId !== undefined) storeData[id].currentProjectId = s.currentProjectId;
      if (s.outlineText !== undefined) storeData[id].hasOutline = !!s.outlineText;
      if (s.activeTab !== undefined) storeData[id].activeTab = s.activeTab;
      if (s.theme !== undefined) storeData[id].theme = s.theme;
    }
    return { ok: true, storeIds: storeIds, data: storeData };
  })())`);
  results.stores = JSON.parse(results.stores);

  // 6. Navigate to settings, click add provider, verify edit view
  await evaluate(ws, `(function() {
    var btns = document.querySelectorAll('.sidebar-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.tooltip === '\u8bbe\u7f6e') { btns[i].click(); return; }
    }
  })()`);
  await sleep(2000);

  // Check if settings modal opened and which tab is active
  results.settingsModal = await evaluate(ws, `JSON.stringify((function() {
    var modal = document.querySelector('.modal-overlay');
    if (!modal) return { found: false };
    var activeTab = modal.querySelector('.settings-tab.active');
    var apiPanel = modal.querySelector('.api-settings');
    var providerList = modal.querySelector('.provider-list-view');
    var providerCards = modal.querySelectorAll('.provider-card');
    var addBtn = modal.querySelector('.provider-card-add');
    var editView = modal.querySelector('.provider-edit-view');
    return {
      found: true,
      activeTab: activeTab ? activeTab.textContent.trim() : 'none',
      apiPanelVisible: apiPanel && apiPanel.offsetWidth > 0,
      providerListVisible: providerList && providerList.offsetWidth > 0,
      providerCardCount: providerCards.length,
      addBtnVisible: addBtn && addBtn.offsetWidth > 0,
      editViewVisible: editView && editView.offsetWidth > 0
    };
  })())`);
  results.settingsModal = JSON.parse(results.settingsModal);

  // 7. Click add provider button
  await evaluate(ws, `(function() {
    var addBtn = document.querySelector('.provider-card-add');
    if (addBtn) addBtn.click();
  })()`);
  await sleep(1500);

  results.providerEditView = await evaluate(ws, `JSON.stringify((function() {
    var edit = document.querySelector('.provider-edit-view');
    if (!edit) return { found: false };
    var inputs = edit.querySelectorAll('input');
    var textareas = edit.querySelectorAll('textarea');
    var selects = edit.querySelectorAll('select');
    var btns = edit.querySelectorAll('button');
    var btnTexts = [];
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].offsetWidth > 0) btnTexts.push(btns[i].textContent.trim().substring(0,20));
    }
    // Check for back button
    var backBtn = edit.querySelector('.provider-edit-back, [class*=back]');
    return {
      found: true,
      visible: edit.offsetWidth > 0,
      inputCount: inputs.length,
      textareaCount: textareas.length,
      selectCount: selects.length,
      buttons: btnTexts,
      hasBackBtn: !!backBtn,
      issues: []
    };
  })())`);
  results.providerEditView = JSON.parse(results.providerEditView);

  // 8. Test outline save button click
  // Close settings first
  await evaluate(ws, `(function() {
    var closeBtn = document.querySelector('.modal-close');
    if (closeBtn) closeBtn.click();
  })()`);
  await sleep(500);
  await evaluate(ws, `(function() {
    var bd = document.querySelector('.panel-backdrop');
    if (bd) bd.click();
  })()`);
  await sleep(500);

  // Open outline
  await evaluate(ws, `(function() {
    var btns = document.querySelectorAll('.sidebar-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.tooltip === '\u5927\u7eb2\u5de5\u4f5c\u53f0') { btns[i].click(); return; }
    }
  })()`);
  await sleep(2000);

  // Click save and check if it works
  results.outlineSave = await evaluate(ws, `JSON.stringify(await (async function() {
    var btns = document.querySelectorAll('.ow-overlay button, .ow-footer button, [class*=outline] button');
    var saveBtn = null;
    for (var i = 0; i < btns.length; i++) {
      var t = btns[i].textContent.trim();
      if (t.indexOf('\u4fdd\u5b58') >= 0) { saveBtn = btns[i]; break; }
    }
    if (!saveBtn) return { ok: false, error: 'save button not found' };
    if (saveBtn.disabled) return { ok: false, error: 'save button disabled' };
    // Check if there is an event listener (Vue bound)
    var hasClick = saveBtn.onclick !== null || saveBtn.__vueParentComponent !== undefined;
    // Try clicking
    try {
      saveBtn.click();
      await new Promise(r => setTimeout(r, 500));
      return { ok: true, buttonText: saveBtn.textContent.trim(), hasClick: hasClick };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  })())`);
  results.outlineSave = JSON.parse(results.outlineSave);

  console.log(JSON.stringify(results, null, 2));
  ws.close();
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
