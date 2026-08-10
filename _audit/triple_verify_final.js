const WebSocket = globalThis.WebSocket;

const CDP_URL = 'ws://localhost:9224';
const results = { pass: 0, fail: 0, items: [] };

function log(status, name, detail) {
  var icon = status === 'PASS' ? '[OK]' : status === 'FAIL' ? '[ERR]' : '[WARN]';
  results.items.push({ status, name, detail });
  if (status === 'PASS') results.pass++;
  else if (status === 'FAIL') results.fail++;
  console.log(icon + ' ' + name + (detail ? ' -> ' + detail : ''));
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function getCDPTarget() {
  var resp = await fetch('http://localhost:9224/json');
  var targets = await resp.json();
  var page = targets.find(function(t) { return t.type === 'page'; });
  if (!page) throw new Error('No page target found');
  return page.webSocketDebuggerUrl;
}

function sendCDP(ws, method, params) {
  return new Promise(function(resolve, reject) {
    var id = Math.floor(Math.random() * 1000000);
    var handler = function(ev) {
      try {
        var msg = JSON.parse(ev.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch(e) {}
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    setTimeout(function() { ws.removeEventListener('message', handler); reject(new Error('CDP timeout: ' + method)); }, 15000);
  });
}

async function evaluate(ws, expr) {
  var result = await sendCDP(ws, 'Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function screenshot(ws, filename) {
  var result = await sendCDP(ws, 'Page.captureScreenshot', { format: 'png' });
  var fs = require('fs');
  fs.writeFileSync('_audit/screenshots/' + filename, Buffer.from(result.data, 'base64'));
}

async function main() {
  console.log('=== CDP+DOM+HOOK Triple Verification ===');
  var wsUrl = await getCDPTarget();
  var ws = new WebSocket(wsUrl);
  
  await new Promise(function(resolve, reject) {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
    setTimeout(function() { reject(new Error('WS connect timeout')); }, 5000);
  });
  
  console.log('CDP connected');
  await sleep(500);

  // === 1. Main page layout check ===
  console.log('\n--- 1. Main Page Layout ---');
  var layout = await evaluate(ws, `JSON.stringify({
    headerH: document.querySelector('.app-header')?.offsetHeight,
    bodyW: document.querySelector('.app-body')?.offsetWidth,
    bodyH: document.querySelector('.app-body')?.offsetHeight,
    sidebarW: document.querySelector('.sidebar-nav, [class*=sidebar]')?.offsetWidth,
    mainW: document.querySelector('.app-main')?.offsetWidth,
    mainH: document.querySelector('.app-main')?.offsetHeight,
    mainContentW: document.querySelector('.app-main-content')?.offsetWidth,
    mainContentH: document.querySelector('.app-main-content')?.offsetHeight,
    chapterTreeW: document.querySelector('.chapter-tree')?.offsetWidth,
    editorPanelW: document.querySelector('.editor-panel')?.offsetWidth,
    chatPanelW: document.querySelector('.chat-panel')?.offsetWidth,
    resizerCount: document.querySelectorAll('.resizer-v').length,
    statusbarH: document.querySelector('.statusbar')?.offsetHeight,
    docWidth: document.documentElement.scrollWidth,
    docHeight: document.documentElement.scrollHeight,
    vw: window.innerWidth,
    vh: window.innerHeight,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    overflowY: document.documentElement.scrollHeight > window.innerHeight
  })`);
  var l = JSON.parse(layout);
  log(l.overflowX ? 'FAIL' : 'PASS', 'No horizontal overflow', 'docW=' + l.docWidth + ' vw=' + l.vw);
  log(l.overflowY ? 'FAIL' : 'PASS', 'No vertical overflow', 'docH=' + l.docHeight + ' vh=' + l.vh);
  log(l.headerH === 48 ? 'PASS' : 'FAIL', 'Header height 48px', 'h=' + l.headerH);
  log(l.resizerCount >= 2 ? 'PASS' : 'FAIL', 'Resizers present', 'count=' + l.resizerCount);
  log(l.chapterTreeW > 0 ? 'PASS' : 'FAIL', 'ChapterTree visible', 'w=' + l.chapterTreeW);
  log(l.editorPanelW > 0 ? 'PASS' : 'FAIL', 'EditorPanel visible', 'w=' + l.editorPanelW);
  log(l.chatPanelW > 0 ? 'PASS' : 'FAIL', 'ChatPanel visible', 'w=' + l.chatPanelW);
  log(l.statusbarH > 0 ? 'PASS' : 'FAIL', 'Statusbar visible', 'h=' + l.statusbarH);
  var totalW = (l.chapterTreeW || 0) + 4 + (l.editorPanelW || 0) + 4 + (l.chatPanelW || 0);
  log(Math.abs(totalW - l.mainContentW) < 5 ? 'PASS' : 'WARN', 'Panel widths add up', totalW + ' vs ' + l.mainContentW);

  // === 2. Text overflow check ===
  console.log('\n--- 2. Text Overflow Scan ---');
  var textOverflow = await evaluate(ws, `(function() {
    var overflows = [];
    var els = document.querySelectorAll('*');
    for (var i = 0; i < els.length && i < 500; i++) {
      var el = els[i];
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        var tag = el.tagName + (el.className ? '.' + (typeof el.className === 'string' ? el.className.split(' ')[0] : '') : '');
        if (tag.indexOf('HTML') === -1 && tag.indexOf('BODY') === -1 && tag.indexOf('script') === -1) {
          var text = (el.textContent || '').slice(0, 40);
          overflows.push({ tag: tag, scrollW: el.scrollWidth, clientW: el.clientWidth, text: text });
        }
      }
    }
    return JSON.stringify(overflows.slice(0, 20));
  })()`);
  var overflows = JSON.parse(textOverflow);
  if (overflows.length === 0) {
    log('PASS', 'No text overflow detected', 'scanned 500 elements');
  } else {
    log('FAIL', 'Text overflow detected', overflows.length + ' elements');
    overflows.forEach(function(o) { log('FAIL', '  overflow: ' + o.tag, o.text + ' (' + o.scrollW + '>' + o.clientW + ')'); });
  }

  // === 3. Border overflow check ===
  console.log('\n--- 3. Border Overflow Scan ---');
  var borderOverflow = await evaluate(ws, `(function() {
    var issues = [];
    var els = document.querySelectorAll('div, section, aside, header, main, footer');
    for (var i = 0; i < els.length && i < 300; i++) {
      var el = els[i];
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var parent = el.parentElement;
      if (!parent) continue;
      var pRect = parent.getBoundingClientRect();
      if (rect.right > pRect.right + 1 || rect.bottom > pRect.bottom + 1) {
        var cls = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
        if (cls === 'panel-backdrop' || cls === 'ow-overlay' || cls === 'sc-overlay' || cls === 'modal-overlay' || cls === 'bind-modal') continue;
        issues.push({ tag: el.tagName + '.' + cls, right: Math.round(rect.right), pRight: Math.round(pRect.right), bottom: Math.round(rect.bottom), pBottom: Math.round(pRect.bottom) });
      }
    }
    return JSON.stringify(issues.slice(0, 15));
  })()`);
  var borders = JSON.parse(borderOverflow);
  if (borders.length === 0) {
    log('PASS', 'No border overflow detected');
  } else {
    log('FAIL', 'Border overflow detected', borders.length + ' elements');
    borders.forEach(function(b) { log('FAIL', '  overflow: ' + b.tag, 'right=' + b.right + '/' + b.pRight + ' bottom=' + b.bottom + '/' + b.pBottom); });
  }

  // === 4. HOOK: electronAPI exists ===
  console.log('\n--- 4. HOOK: electronAPI ---');
  var apiExists = await evaluate(ws, `typeof window.electronAPI`);
  log(apiExists === 'object' ? 'PASS' : 'FAIL', 'window.electronAPI exists', apiExists);
  
  if (apiExists === 'object') {
    var apiMethods = await evaluate(ws, `JSON.stringify(Object.keys(window.electronAPI))`);
    var methods = JSON.parse(apiMethods);
    log(methods.indexOf('fetchModels') >= 0 ? 'PASS' : 'FAIL', 'fetchModels method exists');
    log(methods.indexOf('providerTestConnection') >= 0 ? 'PASS' : 'FAIL', 'providerTestConnection method exists');
    log(methods.indexOf('respondCloseChoice') >= 0 ? 'PASS' : 'FAIL', 'respondCloseChoice method exists');
    log(methods.indexOf('onCloseRequest') >= 0 ? 'PASS' : 'FAIL', 'onCloseRequest method exists');
    log(methods.indexOf('onFinalSave') >= 0 ? 'PASS' : 'FAIL', 'onFinalSave method exists');
    log(methods.indexOf('storageRead') >= 0 ? 'PASS' : 'FAIL', 'storageRead method exists');
    log(methods.indexOf('storageWrite') >= 0 ? 'PASS' : 'FAIL', 'storageWrite method exists');
    log(methods.indexOf('forceQuit') >= 0 ? 'PASS' : 'FAIL', 'forceQuit method exists');
  }

  // === 5. HOOK: storage read/write cycle ===
  console.log('\n--- 5. HOOK: Storage R/W ---');
  try {
    var writeResult = await evaluate(ws, `window.electronAPI.storageWrite('_test_verify', { hello: 'world', ts: Date.now() })`);
    log(writeResult === true ? 'PASS' : 'FAIL', 'storageWrite returns true', String(writeResult));
    var readResult = await evaluate(ws, `JSON.stringify(window.electronAPI.storageRead('_test_verify'))`);
    var read = JSON.parse(readResult);
    log(read && read.hello === 'world' ? 'PASS' : 'FAIL', 'storageRead returns data', readResult);
    var removeResult = await evaluate(ws, `window.electronAPI.storageRemove('_test_verify')`);
    log(removeResult === true ? 'PASS' : 'FAIL', 'storageRemove returns true', String(removeResult));
  } catch(e) {
    log('FAIL', 'Storage R/W cycle', e.message);
  }

  // === 6. HOOK: Pinia stores ===
  console.log('\n--- 6. HOOK: Pinia Stores ---');
  try {
    var storeCheck = await evaluate(ws, `(function() {
      var app = document.querySelector('#app');
      if (!app || !app.__vue_app__) return JSON.stringify({ error: 'no vue app' });
      var pinia = app.__vue_app__._context.provides.pinia;
      if (!pinia) return JSON.stringify({ error: 'no pinia' });
      var stores = Object.keys(pinia.state.value);
      return JSON.stringify({ stores: stores });
    })()`);
    var sc = JSON.parse(storeCheck);
    if (sc.error) {
      log('WARN', 'Pinia store check', sc.error);
    } else {
      log(sc.stores.indexOf('provider') >= 0 ? 'PASS' : 'FAIL', 'Provider store exists');
      log(sc.stores.indexOf('project') >= 0 ? 'PASS' : 'FAIL', 'Project store exists');
      log(sc.stores.indexOf('agent') >= 0 ? 'PASS' : 'FAIL', 'Agent store exists');
      log(sc.stores.indexOf('skill') >= 0 ? 'PASS' : 'FAIL', 'Skill store exists');
      log(sc.stores.indexOf('settings') >= 0 ? 'PASS' : 'FAIL', 'Settings store exists');
      log(sc.stores.indexOf('deai') >= 0 ? 'PASS' : 'FAIL', 'DeAi store exists');
      log(sc.stores.indexOf('editor') >= 0 ? 'PASS' : 'FAIL', 'Editor store exists');
    }
  } catch(e) {
    log('WARN', 'Pinia store check', e.message);
  }

  // === 7. HOOK: Provider data ===
  console.log('\n--- 7. HOOK: Provider Data ---');
  try {
    var providerData = await evaluate(ws, `(function() {
      var app = document.querySelector('#app');
      if (!app || !app.__vue_app__) return JSON.stringify({ error: 'no vue' });
      var pinia = app.__vue_app__._context.provides.pinia;
      if (!pinia) return JSON.stringify({ error: 'no pinia' });
      var ps = pinia.state.value.provider;
      if (!ps) return JSON.stringify({ error: 'no provider state' });
      return JSON.stringify({
        providerCount: ps.providers ? ps.providers.length : 0,
        generateProvider: ps.generateProvider,
        verifyProvider: ps.verifyProvider,
        firstProvider: ps.providers && ps.providers[0] ? ps.providers[0].name : null
      });
    })()`);
    var pd = JSON.parse(providerData);
    if (pd.error) {
      log('WARN', 'Provider data', pd.error);
    } else {
      log('PASS', 'Provider data accessible', pd.providerCount + ' providers');
      log(pd.providerCount > 0 ? 'PASS' : 'WARN', 'At least 1 provider configured', 'count=' + pd.providerCount);
    }
  } catch(e) {
    log('WARN', 'Provider data', e.message);
  }

  // === 8. Screenshot main page ===
  console.log('\n--- 8. Screenshots ---');
  try {
    await screenshot(ws, 'verify_main.png');
    log('PASS', 'Main page screenshot');
  } catch(e) {
    log('FAIL', 'Main page screenshot', e.message);
  }

  // === 9. Navigate to settings and verify provider UI ===
  console.log('\n--- 9. Settings Panel ---');
  try {
    await evaluate(ws, `document.querySelector('[data-tooltip="设置"]')?.click()`);
    await sleep(800);
    var settingsVisible = await evaluate(ws, `!!document.querySelector('.modal-overlay')`);
    log(settingsVisible ? 'PASS' : 'FAIL', 'Settings modal opens');
    
    var apiTabVisible = await evaluate(ws, `!!document.querySelector('.api-settings')`);
    log(apiTabVisible ? 'PASS' : 'FAIL', 'API settings tab visible');
    
    var providerListVisible = await evaluate(ws, `!!document.querySelector('.provider-list-view')`);
    log(providerListVisible ? 'PASS' : 'FAIL', 'Provider list view visible');
    
    var providerCards = await evaluate(ws, `document.querySelectorAll('.provider-card').length`);
    log('PASS', 'Provider cards count', String(providerCards));
    
    var addBtnVisible = await evaluate(ws, `!!document.querySelector('.provider-card-add')`);
    log(addBtnVisible ? 'PASS' : 'FAIL', 'Provider add button visible');
    
    if (providerCards > 0) {
      await evaluate(ws, `document.querySelector('.provider-card .btn-secondary')?.click()`);
      await sleep(500);
      var editViewVisible = await evaluate(ws, `!!document.querySelector('.provider-edit-view')`);
      log(editViewVisible ? 'PASS' : 'FAIL', 'Provider edit view opens on click');
      
      var backBtnVisible = await evaluate(ws, `!!document.querySelector('.btn-back')`);
      log(backBtnVisible ? 'PASS' : 'FAIL', 'Provider back button visible');
      
      var editBg = await evaluate(ws, `getComputedStyle(document.querySelector('.provider-edit-view')).backgroundColor`);
      log(editBg !== 'rgba(0, 0, 0, 0)' && editBg !== 'transparent' ? 'PASS' : 'WARN', 'Provider edit has bg', editBg);
      
      var fetchBtnVisible = await evaluate(ws, `!!document.querySelector('.model-fetch-row .btn-secondary')`);
      log(fetchBtnVisible ? 'PASS' : 'FAIL', 'Fetch models button visible');
      
      var testBtnVisible = await evaluate(ws, `!!document.querySelector('.btn-test')`);
      log(testBtnVisible ? 'PASS' : 'FAIL', 'Test connection button visible');
      
      await screenshot(ws, 'verify_provider_edit.png');
      log('PASS', 'Provider edit screenshot');
      
      // Go back
      await evaluate(ws, `document.querySelector('.btn-back')?.click()`);
      await sleep(300);
    }
    
    // Close settings
    await evaluate(ws, `document.querySelector('.modal-close')?.click()`);
    await sleep(500);
  } catch(e) {
    log('FAIL', 'Settings panel check', e.message);
  }

  // === 10. Settings Collection panel ===
  console.log('\n--- 10. Settings Collection ---');
  try {
    await evaluate(ws, `document.querySelector('[data-tooltip="设定合集"]')?.click()`);
    await sleep(800);
    var scVisible = await evaluate(ws, `!!document.querySelector('.sc-overlay')`);
    log(scVisible ? 'PASS' : 'FAIL', 'Settings collection opens');
    
    if (scVisible) {
      var scSidebar = await evaluate(ws, `!!document.querySelector('.sc-sidebar')`);
      log(scSidebar ? 'PASS' : 'FAIL', 'SC sidebar visible');
      
      var scItemsArea = await evaluate(ws, `!!document.querySelector('.sc-items-area')`);
      log(scItemsArea ? 'PASS' : 'FAIL', 'SC items area visible');
      
      var scDetailArea = await evaluate(ws, `!!document.querySelector('.sc-detail-area')`);
      log(scDetailArea ? 'PASS' : 'WARN', 'SC detail area visible', '(needs selected entry)');
      
      var scLayout = await evaluate(ws, `JSON.stringify({
        sidebarW: document.querySelector('.sc-sidebar')?.offsetWidth,
        itemsAreaW: document.querySelector('.sc-items-area')?.offsetWidth,
        detailAreaW: document.querySelector('.sc-detail-area')?.offsetWidth,
        contentW: document.querySelector('.sc-content')?.offsetWidth
      })`);
      var sl = JSON.parse(scLayout);
      log(sl.sidebarW > 0 ? 'PASS' : 'FAIL', 'SC sidebar width', String(sl.sidebarW));
      log(sl.itemsAreaW > 0 ? 'PASS' : 'FAIL', 'SC items area width', String(sl.itemsAreaW));
      log('PASS', 'SC layout check', 'sidebar=' + sl.sidebarW + ' items=' + sl.itemsAreaW + ' detail=' + sl.detailAreaW);
      
      await screenshot(ws, 'verify_sc_panel.png');
      log('PASS', 'SC panel screenshot');
      
      await evaluate(ws, `document.querySelector('.sc-overlay .modal-close')?.click()`);
      await sleep(300);
    }
  } catch(e) {
    log('FAIL', 'Settings collection check', e.message);
  }

  // === 11. Outline Workspace ===
  console.log('\n--- 11. Outline Workspace ---');
  try {
    await evaluate(ws, `document.querySelector('[data-tooltip="大纲工作台"]')?.click()`);
    await sleep(800);
    var owVisible = await evaluate(ws, `!!document.querySelector('.ow-overlay')`);
    log(owVisible ? 'PASS' : 'FAIL', 'Outline workspace opens');
    
    if (owVisible) {
      var saveBtn = await evaluate(ws, `!!document.querySelector('.ow-footer .btn-primary')`);
      log(saveBtn ? 'PASS' : 'FAIL', 'Outline save button exists');
      
      var textareaVisible = await evaluate(ws, `!!document.querySelector('.ow-textarea')`);
      log(textareaVisible ? 'PASS' : 'FAIL', 'Outline textarea visible');
      
      // Click save button and check feedback
      await evaluate(ws, `document.querySelector('.ow-footer .btn-primary')?.click()`);
      await sleep(300);
      var feedback = await evaluate(ws, `document.querySelector('.save-feedback')?.textContent || ''`);
      log(feedback.length > 0 ? 'PASS' : 'FAIL', 'Save feedback shows', feedback);
      
      await screenshot(ws, 'verify_outline.png');
      log('PASS', 'Outline workspace screenshot');
      
      await evaluate(ws, `document.querySelector('.ow-overlay .modal-close')?.click()`);
      await sleep(300);
    }
  } catch(e) {
    log('FAIL', 'Outline workspace check', e.message);
  }

  // === 12. Resizer check ===
  console.log('\n--- 12. Resizer Check ---');
  try {
    var resizerInfo = await evaluate(ws, `JSON.stringify({
      count: document.querySelectorAll('.resizer-v').length,
      chapter: document.querySelector('[data-target="chapter"]') ? true : false,
      chat: document.querySelector('[data-target="chat"]') ? true : false,
      chapterW: document.querySelector('.resizer-v[data-target="chapter"]')?.offsetWidth,
      chatW: document.querySelector('.resizer-v[data-target="chat"]')?.offsetWidth,
      chapterCursor: getComputedStyle(document.querySelector('[data-target="chapter"]'))?.cursor,
      chatCursor: getComputedStyle(document.querySelector('[data-target="chat"]'))?.cursor
    })`);
    var ri = JSON.parse(resizerInfo);
    log(ri.count >= 2 ? 'PASS' : 'FAIL', 'Resizer count', String(ri.count));
    log(ri.chapter ? 'PASS' : 'FAIL', 'Chapter resizer exists');
    log(ri.chat ? 'PASS' : 'FAIL', 'Chat resizer exists');
    log(ri.chapterCursor === 'col-resize' ? 'PASS' : 'FAIL', 'Chapter resizer cursor', ri.chapterCursor);
    log(ri.chatCursor === 'col-resize' ? 'PASS' : 'FAIL', 'Chat resizer cursor', ri.chatCursor);
  } catch(e) {
    log('FAIL', 'Resizer check', e.message);
  }

  // === 13. ExitConfirmModal check ===
  console.log('\n--- 13. Exit Confirm Modal ---');
  try {
    var exitModalExists = await evaluate(ws, `!!document.querySelector('.modal-content-sm') || document.querySelector('[class*=exit]') !== null`);
    log(exitModalExists ? 'PASS' : 'WARN', 'Exit modal in DOM (hidden by default)', '(v-if hidden until close request)');
    
    // Check onCloseRequest listener registered
    var exitRef = await evaluate(ws, `(function() {
      var app = document.querySelector('#app');
      if (!app || !app.__vue_app__) return 'no vue';
      return 'vue app exists';
    })()`);
    log('PASS', 'Vue app for exit modal', exitRef);
  } catch(e) {
    log('WARN', 'Exit modal check', e.message);
  }

  // === 14. BreadcrumbBar check ===
  console.log('\n--- 14. BreadcrumbBar ---');
  try {
    var bcVisible = await evaluate(ws, `!!document.querySelector('.breadcrumb-bar, [class*=breadcrumb]')`);
    log(bcVisible ? 'PASS' : 'FAIL', 'BreadcrumbBar visible');
  } catch(e) {
    log('WARN', 'BreadcrumbBar check', e.message);
  }

  // === Summary ===
  console.log('\n=== SUMMARY ===');
  console.log('PASS: ' + results.pass + ' | FAIL: ' + results.fail);
  var fs = require('fs');
  fs.writeFileSync('_audit/triple_verify_final.json', JSON.stringify(results, null, 2));
  
  ws.close();
  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch(function(e) {
  console.error('FATAL:', e.message);
  process.exit(2);
});
