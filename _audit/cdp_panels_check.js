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

  // Reload page
  await cdpSend(ws, 'Page.reload', { ignoreCache: true });
  await sleep(4000);

  const results = {};

  // 1. Check main page overflow
  results.mainPage = await evaluate(ws, `JSON.stringify((function() {
    var body = document.body;
    var issues = [];
    if (body.scrollWidth > body.clientWidth) {
      issues.push('body horizontal scroll: scrollWidth=' + body.scrollWidth + ' clientWidth=' + body.clientWidth);
    }
    // Check all visible elements for overflow
    var els = document.querySelectorAll('*');
    for (var i = 0; i < els.length && i < 500; i++) {
      var el = els[i];
      if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
      if (el.scrollWidth > el.clientWidth + 2) {
      	var rect = el.getBoundingClientRect();
      	if (rect.right > window.innerWidth) {
        	issues.push(el.tagName + (el.className ? '.' + el.className.toString().split(' ')[0] : '') + ' overflow right=' + Math.round(rect.right) + ' vw=' + window.innerWidth);
      	}
      }
    }
    return { scrollWidth: body.scrollWidth, clientWidth: body.clientWidth, issues: issues.slice(0, 20) };
  })())`);
  results.mainPage = JSON.parse(results.mainPage);

  // 2. Check resizers
  results.resizers = await evaluate(ws, `JSON.stringify((function() {
    var rs = document.querySelectorAll('[data-target]');
    var arr = [];
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i].getBoundingClientRect();
      arr.push({ target: rs[i].dataset.target, visible: rs[i].offsetWidth > 0, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    }
    return arr;
  })())`);
  results.resizers = JSON.parse(results.resizers);

  // 3. Check sidebar nav buttons
  results.sidebarNav = await evaluate(ws, `JSON.stringify((function() {
    var btns = document.querySelectorAll('.sidebar-btn');
    var arr = [];
    for (var i = 0; i < btns.length; i++) {
      arr.push({ text: btns[i].textContent.trim().substring(0,30), tooltip: btns[i].dataset.tooltip || '', tag: btns[i].tagName, visible: btns[i].offsetWidth > 0 });
    }
    return arr;
  })())`);
  results.sidebarNav = JSON.parse(results.sidebarNav);

  // 4. Navigate to settings panel
  await evaluate(ws, `(function() {
    var btns = document.querySelectorAll('.sidebar-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.tooltip === '\u8bbe\u7f6e') { btns[i].click(); return true; }
    }
    return false;
  })()`);
  await sleep(2000);

  results.settingsPanel = await evaluate(ws, `JSON.stringify((function() {
    var issues = [];
    var panel = document.querySelector('.api-settings, [class*=settings]');
    if (!panel) return { found: false, issues: ['settings panel not found'] };
    var rect = panel.getBoundingClientRect();
    if (rect.right > window.innerWidth) issues.push('panel overflows right: ' + Math.round(rect.right));
    if (rect.bottom > window.innerHeight) issues.push('panel overflows bottom: ' + Math.round(rect.bottom));
    // Check provider cards
    var cards = panel.querySelectorAll('.provider-card');
    var cardInfo = [];
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      cardInfo.push({ name: cards[i].querySelector('.provider-card-name, h4, strong') ? cards[i].querySelector('.provider-card-name, h4, strong').textContent.trim().substring(0,30) : 'N/A', right: Math.round(r.right), width: Math.round(r.width) });
      if (r.right > window.innerWidth) issues.push('card ' + i + ' overflows right: ' + Math.round(r.right));
    }
    // Check for provider-edit-view visibility
    var editView = panel.querySelector('.provider-edit-view');
    var editVisible = editView && editView.offsetWidth > 0;
    if (editVisible) issues.push('provider-edit-view is visible without navigation');
    // Check buttons
    var addBtn = panel.querySelector('button[class*=add], .btn-add');
    return { found: true, cards: cardInfo, cardCount: cards.length, editViewVisible: editVisible, hasAddBtn: !!addBtn, issues: issues };
  })())`);
  results.settingsPanel = JSON.parse(results.settingsPanel);

  // 5. Click add provider to open edit view
  await evaluate(ws, `(function() {
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var t = btns[i].textContent.trim();
      if (t.indexOf('\u65b0\u589e') >= 0 || t.indexOf('\u6dfb\u52a0') >= 0 || t.indexOf('+') >= 0 || t.toLowerCase().indexOf('add') >= 0) {
      	if (btns[i].offsetWidth > 0) { btns[i].click(); return true; }
      }
    }
    return false;
  })()`);
  await sleep(1500);

  results.providerEdit = await evaluate(ws, `JSON.stringify((function() {
    var edit = document.querySelector('.provider-edit-view, .provider-edit');
    if (!edit) return { found: false };
    var visible = edit.offsetWidth > 0;
    var rect = edit.getBoundingClientRect();
    var inputs = edit.querySelectorAll('input, textarea, select');
    var inputInfo = [];
    for (var i = 0; i < inputs.length; i++) {
      inputInfo.push({ type: inputs[i].type || inputs[i].tagName, name: inputs[i].name || inputs[i].placeholder || '', visible: inputs[i].offsetWidth > 0 });
    }
    var btns = edit.querySelectorAll('button');
    var btnTexts = [];
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].offsetWidth > 0) btnTexts.push(btns[i].textContent.trim().substring(0,20));
    }
    var issues = [];
    if (rect.right > window.innerWidth) issues.push('edit view overflows right: ' + Math.round(rect.right));
    if (rect.bottom > window.innerHeight) issues.push('edit view overflows bottom: ' + Math.round(rect.bottom));
    // Check for fetchModels button
    var hasFetchBtn = btnTexts.some(function(t) { return t.indexOf('\u83b7\u53d6') >= 0 || t.indexOf('\u62c9\u53d6') >= 0 || t.toLowerCase().indexOf('fetch') >= 0; });
    var hasTestBtn = btnTexts.some(function(t) { return t.indexOf('\u6d4b\u8bd5') >= 0 || t.toLowerCase().indexOf('test') >= 0; });
    return { found: true, visible: visible, inputs: inputInfo, buttons: btnTexts, hasFetchBtn: hasFetchBtn, hasTestBtn: hasTestBtn, issues: issues };
  })())`);
  results.providerEdit = JSON.parse(results.providerEdit);

  // 6. Go back to main, then check outline
  await evaluate(ws, `(function() {
    var btns = document.querySelectorAll('.sidebar-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.tooltip === '\u9996\u9875' || btns[i].dataset.tooltip === 'main') { btns[i].click(); return; }
    }
    // Click the backdrop to close
    var bd = document.querySelector('.panel-backdrop');
    if (bd) bd.click();
  })()`);
  await sleep(1000);

  // Open outline
  await evaluate(ws, `(function() {
    var btns = document.querySelectorAll('.sidebar-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.tooltip === '\u5927\u7eb2\u5de5\u4f5c\u53f0') { btns[i].click(); return true; }
    }
    return false;
  })()`);
  await sleep(2000);

  results.outlinePanel = await evaluate(ws, `JSON.stringify((function() {
    var ow = document.querySelector('.ow-overlay, .outline-workspace');
    if (!ow) return { found: false };
    var visible = ow.offsetWidth > 0;
    var saveBtn = null;
    var btns = ow.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var t = btns[i].textContent.trim();
      if (t.indexOf('\u4fdd\u5b58') >= 0 && btns[i].offsetWidth > 0) { saveBtn = { text: t, tag: btns[i].tagName, disabled: btns[i].disabled }; break; }
    }
    var textarea = ow.querySelector('textarea');
    var issues = [];
    var rect = ow.getBoundingClientRect();
    if (rect.right > window.innerWidth) issues.push('overlay overflows right: ' + Math.round(rect.right));
    if (rect.bottom > window.innerHeight) issues.push('overlay overflows bottom: ' + Math.round(rect.bottom));
    return { found: true, visible: visible, hasSaveBtn: !!saveBtn, saveBtn: saveBtn, hasTextarea: !!textarea, issues: issues };
  })())`);
  results.outlinePanel = JSON.parse(results.outlinePanel);

  // 7. Check electronAPI functions
  results.electronAPI = await evaluate(ws, `JSON.stringify((function() {
    if (!window.electronAPI) return { exists: false };
    var fns = Object.keys(window.electronAPI);
    return { exists: true, functions: fns };
  })())`);
  results.electronAPI = JSON.parse(results.electronAPI);

  // 8. Check exit modal
  results.exitModal = await evaluate(ws, `JSON.stringify((function() {
    var modal = document.querySelector('.exit-confirm-modal, [class*=exit-modal], [class*=ExitConfirm]');
    if (!modal) return { found: false };
    return { found: true, visible: modal.offsetWidth > 0 };
  })())`);
  results.exitModal = JSON.parse(results.exitModal);

  // 9. Check layout alignment
  results.layout = await evaluate(ws, `JSON.stringify((function() {
    var header = document.querySelector('.app-header, header');
    var sidebar = document.querySelector('.sidebar-nav, nav');
    var chapterTree = document.querySelector('.chapter-tree');
    var editorPanel = document.querySelector('.editor-panel');
    var chatPanel = document.querySelector('.chat-panel');
    var breadcrumb = document.querySelector('.breadcrumb-bar');
    var statusbar = document.querySelector('.status-bar, .statusbar');
    var r = {};
    if (header) r.header = { height: Math.round(header.getBoundingClientRect().height), width: Math.round(header.getBoundingClientRect().width) };
    if (sidebar) r.sidebar = { width: Math.round(sidebar.getBoundingClientRect().width), x: Math.round(sidebar.getBoundingClientRect().x) };
    if (chapterTree) r.chapterTree = { width: Math.round(chapterTree.getBoundingClientRect().width), x: Math.round(chapterTree.getBoundingClientRect().x) };
    if (editorPanel) r.editorPanel = { width: Math.round(editorPanel.getBoundingClientRect().width), x: Math.round(editorPanel.getBoundingClientRect().x) };
    if (chatPanel) r.chatPanel = { width: Math.round(chatPanel.getBoundingClientRect().width), x: Math.round(chatPanel.getBoundingClientRect().x), right: Math.round(chatPanel.getBoundingClientRect().right) };
    if (breadcrumb) r.breadcrumb = { width: Math.round(breadcrumb.getBoundingClientRect().width), top: Math.round(breadcrumb.getBoundingClientRect().top) };
    if (statusbar) r.statusbar = { width: Math.round(statusbar.getBoundingClientRect().width), bottom: Math.round(statusbar.getBoundingClientRect().bottom) };
    // Check if panels sum to viewport width
    if (sidebar && chapterTree && editorPanel && chatPanel) {
      var total = sidebar.getBoundingClientRect().width + chapterTree.getBoundingClientRect().width + editorPanel.getBoundingClientRect().width + chatPanel.getBoundingClientRect().width;
      r.totalWidth = Math.round(total);
      r.viewportWidth = window.innerWidth;
      r.diff = Math.round(window.innerWidth - total);
    }
    return r;
  })())`);
  results.layout = JSON.parse(results.layout);

  // 10. Open settings-collection panel
  await evaluate(ws, `(function() {
    var btns = document.querySelectorAll('.sidebar-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].dataset.tooltip === '\u8bbe\u5b9a\u5408\u96c6') { btns[i].click(); return true; }
    }
    return false;
  })()`);
  await sleep(2000);

  results.scPanel = await evaluate(ws, `JSON.stringify((function() {
    var sc = document.querySelector('.sc-overlay, .sc-content, [class*=settings-collection]');
    if (!sc) return { found: false };
    var visible = sc.offsetWidth > 0;
    var rect = sc.getBoundingClientRect();
    var sidebar = sc.querySelector('.sc-sidebar');
    var main = sc.querySelector('.sc-main');
    var entries = sc.querySelector('.sc-entries');
    var editor = sc.querySelector('.sc-editor');
    var cards = sc.querySelectorAll('.sc-item-card, .sc-entry-card');
    var issues = [];
    if (rect.right > window.innerWidth) issues.push('SC panel overflows right: ' + Math.round(rect.right));
    if (rect.bottom > window.innerHeight) issues.push('SC panel overflows bottom: ' + Math.round(rect.bottom));
    return {
      found: true, visible: visible,
      sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
      mainWidth: main ? Math.round(main.getBoundingClientRect().width) : 0,
      hasEntries: !!entries, entryCount: cards.length,
      hasEditor: !!editor,
      issues: issues
    };
  })())`);
  results.scPanel = JSON.parse(results.scPanel);

  // Go back to main
  await evaluate(ws, `(function() {
    var bd = document.querySelector('.panel-backdrop');
    if (bd) bd.click();
    var closeBtn = document.querySelector('.sc-overlay button, [class*=close] button');
    if (closeBtn) closeBtn.click();
  })()`);
  await sleep(1000);

  console.log(JSON.stringify(results, null, 2));
  ws.close();
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
