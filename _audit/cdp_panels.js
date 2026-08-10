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

async function run() {
  const targets = await getTargets();
  const page = targets.find(t => t.url.indexOf('5173') >= 0 || t.title === 'Novel Workshop');
  if (!page) { console.log('No page target found'); process.exit(1); }
  
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();
  
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  
  function send(method, params) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  
  function evalJS(expr) {
    return send('Runtime.evaluate', { expression: expr, returnByValue: true });
  }
  
  await new Promise((resolve) => ws.onopen = resolve);
  await send('Runtime.enable');
  await send('Page.enable');
  
  // Reload fresh
  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 4000));
  
  const allResults = {};
  
  // === CHECK 1: Main page ===
  let r = await evalJS(`(() => {
    const results = {};
    // Scan ALL elements for overflow (not just nowrap ones)
    const overflowEls = [];
    const allEls = document.querySelectorAll('*');
    for (let i = 0; i < allEls.length; i++) {
      const el = allEls[i];
      const styles = window.getComputedStyle(el);
      // Check horizontal overflow
      if (el.scrollWidth > el.clientWidth + 2 && styles.overflowX !== 'hidden' && styles.overflowX !== 'scroll') {
        if (el.children.length <= 3) {
          overflowEls.push({
            tag: el.tagName,
            cls: (el.className || '').substring(0, 60),
            txt: (el.textContent || '').substring(0, 30),
            sw: el.scrollWidth,
            cw: el.clientWidth,
            ws: styles.whiteSpace,
            ox: styles.overflowX
          });
        }
      }
      // Check vertical overflow without scroll
      if (el.scrollHeight > el.clientHeight + 2 && styles.overflowY === 'visible' && el.children.length <= 3) {
        // only report if it's likely a problem (small container with lots of text)
        if (el.clientHeight < 40 && el.scrollHeight > 60) {
          overflowEls.push({
            tag: el.tagName,
            cls: (el.className || '').substring(0, 60),
            txt: (el.textContent || '').substring(0, 30),
            sw: el.scrollWidth,
            cw: el.clientWidth,
            sh: el.scrollHeight,
            ch: el.clientHeight,
            type: 'vertical'
          });
        }
      }
    }
    results.overflow = overflowEls.slice(0, 30);
    results.bodyScroll = { sw: document.body.scrollWidth, cw: document.body.clientWidth, hScroll: document.body.scrollWidth > document.body.clientWidth };
    
    // Check resizers have mousedown listeners (check if draggable)
    const resizers = document.querySelectorAll('.resizer-v');
    results.resizers = Array.from(resizers).map(r => ({
      target: r.getAttribute('data-target'),
      w: r.offsetWidth,
      cursor: window.getComputedStyle(r).cursor
    }));
    
    // Check sidebar buttons
    const navBtns = document.querySelectorAll('.sidebar-nav button, .sidebar-nav .nav-btn, .sidebar-nav [class*="nav"]');
    results.sidebarBtns = Array.from(navBtns).map(b => ({
      cls: (b.className || '').substring(0, 40),
      txt: (b.textContent || '').trim().substring(0, 20),
      title: b.getAttribute('title') || b.getAttribute('data-panel') || ''
    }));
    
    return JSON.stringify(results);
  })()`);
  allResults.mainPage = JSON.parse(r.result?.value || '{}');
  
  // === CHECK 2: Open settings panel ===
  await evalJS(`(() => {
    const btns = document.querySelectorAll('.sidebar-nav button, .sidebar-nav .nav-btn');
    for (const b of btns) {
      if (b.getAttribute('title') === '设置' || b.textContent.includes('设置') || b.getAttribute('data-panel') === 'settings') {
        b.click();
        return 'clicked settings';
      }
    }
    return 'settings btn not found';
  })()`);
  await new Promise(r => setTimeout(r, 2000));
  
  r = await evalJS(`(() => {
    const results = {};
    results.settingsVisible = !!document.querySelector('.settings-modal, [class*="settings"]');
    results.providerList = !!document.querySelector('.provider-list, .provider-card');
    results.providerEditView = !!document.querySelector('.provider-edit-view');
    results.addProviderBtn = !!document.querySelector('.provider-card-add');
    
    // Check for overflow in settings
    const overflowEls = [];
    const allEls = document.querySelectorAll('*');
    for (let i = 0; i < allEls.length; i++) {
      const el = allEls[i];
      const styles = window.getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && styles.overflowX !== 'hidden' && el.children.length <= 3) {
        overflowEls.push({
          tag: el.tagName, cls: (el.className||'').substring(0,50),
          txt: (el.textContent||'').substring(0,25), sw: el.scrollWidth, cw: el.clientWidth
        });
      }
    }
    results.overflow = overflowEls.slice(0, 20);
    
    // Check tab buttons
    const tabs = document.querySelectorAll('.settings-modal .tab, [class*="tab"]');
    results.tabs = Array.from(tabs).map(t => ({ txt: (t.textContent||'').trim().substring(0,15), cls: (t.className||'').substring(0,40) }));
    
    return JSON.stringify(results);
  })()`);
  allResults.settingsPanel = JSON.parse(r.result?.value || '{}');
  
  // === CHECK 3: Click add provider to see edit view ===
  await evalJS(`(() => {
    const addBtn = document.querySelector('.provider-card-add');
    if (addBtn) { addBtn.click(); return 'clicked add'; }
    return 'no add btn';
  })()`);
  await new Promise(r => setTimeout(r, 1000));
  
  r = await evalJS(`(() => {
    const results = {};
    results.editViewVisible = !!document.querySelector('.provider-edit-view');
    results.backBtn = !!document.querySelector('.btn-back');
    results.fetchModelsBtn = !!document.querySelector('.model-fetch-row .btn-sm');
    results.testConnBtn = !!document.querySelector('.btn-test');
    results.saveBtn = !!document.querySelector('.form-actions .btn-primary');
    results.fields = {
      name: !!document.querySelector('.provider-edit-view input[placeholder*="CloudAI"], .provider-edit-view input'),
      baseUrl: !!document.querySelector('.provider-edit-view input[placeholder*="openai"]')
    };
    // Check overflow
    const overflowEls = [];
    document.querySelectorAll('.provider-edit-view *').forEach(el => {
      const styles = window.getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && styles.overflowX !== 'hidden' && el.children.length <= 3) {
        overflowEls.push({ tag: el.tagName, cls: (el.className||'').substring(0,50), sw: el.scrollWidth, cw: el.clientWidth });
      }
    });
    results.overflow = overflowEls.slice(0, 15);
    return JSON.stringify(results);
  })()`);
  allResults.providerEdit = JSON.parse(r.result?.value || '{}');
  
  // Close settings, open outline
  await evalJS(`(() => {
    // Click breadcrumb home or close button
    const closeBtn = document.querySelector('.settings-modal .modal-close, [class*="settings"] .btn-close');
    if (closeBtn) { closeBtn.click(); return 'closed'; }
    // Try clicking the settings nav button again to toggle
    const btns = document.querySelectorAll('.sidebar-nav button, .sidebar-nav .nav-btn');
    for (const b of btns) {
      if (b.getAttribute('title') === '设置' || b.getAttribute('data-panel') === 'settings') { b.click(); return 'toggled'; }
    }
    return 'no close';
  })()`);
  await new Promise(r => setTimeout(r, 1000));
  
  // === CHECK 4: Open outline workspace ===
  await evalJS(`(() => {
    const btns = document.querySelectorAll('.sidebar-nav button, .sidebar-nav .nav-btn');
    for (const b of btns) {
      if (b.getAttribute('title') === '大纲' || b.getAttribute('data-panel') === 'outline') { b.click(); return 'clicked outline'; }
    }
    return 'outline btn not found';
  })()`);
  await new Promise(r => setTimeout(r, 2000));
  
  r = await evalJS(`(() => {
    const results = {};
    results.outlineVisible = !!document.querySelector('.ow-overlay, .ow-content');
    results.saveBtn = !!document.querySelector('.ow-footer .btn-primary');
    results.textarea = !!document.querySelector('.ow-textarea');
    results.lockBtn = !!document.querySelector('.ow-footer .btn-secondary:last-child');
    results.importBtn = !!document.querySelector('.ow-footer .btn-import');
    
    // Check if save button is disabled
    const saveBtn = document.querySelector('.ow-footer .btn-primary');
    results.saveBtnDisabled = saveBtn ? saveBtn.disabled : null;
    
    // Test save button click
    const beforeText = document.querySelector('.ow-textarea')?.value || '';
    results.outlineText = beforeText.substring(0, 50);
    
    // Check overflow
    const overflowEls = [];
    document.querySelectorAll('.ow-overlay *').forEach(el => {
      const styles = window.getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && styles.overflowX !== 'hidden' && el.children.length <= 3) {
        overflowEls.push({ tag: el.tagName, cls: (el.className||'').substring(0,50), sw: el.scrollWidth, cw: el.clientWidth });
      }
    });
    results.overflow = overflowEls.slice(0, 15);
    return JSON.stringify(results);
  })()`);
  allResults.outlineWorkspace = JSON.parse(r.result?.value || '{}');
  
  // Close outline, open settings-collection
  await evalJS(`(() => {
    const closeBtn = document.querySelector('.ow-overlay .modal-close, .ow-header button');
    if (closeBtn) { closeBtn.click(); return 'closed'; }
    return 'no close';
  })()`);
  await new Promise(r => setTimeout(r, 1000));
  
  // === CHECK 5: Open settings-collection ===
  await evalJS(`(() => {
    const btns = document.querySelectorAll('.sidebar-nav button, .sidebar-nav .nav-btn');
    for (const b of btns) {
      if (b.getAttribute('data-panel') === 'settings-collection' || b.getAttribute('title') === '设定合集') { b.click(); return 'clicked sc'; }
    }
    return 'sc btn not found';
  })()`);
  await new Promise(r => setTimeout(r, 2000));
  
  r = await evalJS(`(() => {
    const results = {};
    results.scVisible = !!document.querySelector('.sc-panel, .sc-overlay, [class*="settings-collection"]');
    results.scSidebar = !!document.querySelector('.sc-sidebar, [class*="sc"] .sidebar');
    results.scToolbar = !!document.querySelector('.sc-toolbar, [class*="sc"] .toolbar');
    results.scEditor = !!document.querySelector('.sc-editor, [class*="sc"] textarea');
    results.scEntries = !!document.querySelector('.sc-entries, [class*="sc"] .entries');
    
    // Dump structure
    const scRoot = document.querySelector('.sc-panel, [class*="settings-collection"]');
    if (scRoot) {
      results.scHTML = scRoot.innerHTML.substring(0, 500);
      results.scClasses = Array.from(scRoot.querySelectorAll('*')).slice(0, 20).map(e => ({ tag: e.tagName, cls: (e.className||'').substring(0,40) }));
    }
    
    // Check overflow
    const overflowEls = [];
    document.querySelectorAll('[class*="sc"] *').forEach(el => {
      const styles = window.getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && styles.overflowX !== 'hidden' && el.children.length <= 3) {
        overflowEls.push({ tag: el.tagName, cls: (el.className||'').substring(0,50), sw: el.scrollWidth, cw: el.clientWidth });
      }
    });
    results.overflow = overflowEls.slice(0, 15);
    return JSON.stringify(results);
  })()`);
  allResults.settingsCollection = JSON.parse(r.result?.value || '{}');
  
  // Close, open pipeline
  await evalJS(`(() => {
    const btns = document.querySelectorAll('.sidebar-nav button, .sidebar-nav .nav-btn');
    for (const b of btns) {
      if (b.getAttribute('data-panel') === 'settings-collection' || b.getAttribute('title') === '设定合集') { b.click(); return 'closed'; }
    }
    return 'no close';
  })()`);
  await new Promise(r => setTimeout(r, 1000));
  
  // === CHECK 6: Open pipeline ===
  await evalJS(`(() => {
    const btns = document.querySelectorAll('.sidebar-nav button, .sidebar-nav .nav-btn');
    for (const b of btns) {
      if (b.getAttribute('data-panel') === 'pipeline' || b.getAttribute('title') === '流水线' || b.getAttribute('title') === '生成') { b.click(); return 'clicked pipeline'; }
    }
    return 'pipeline btn not found';
  })()`);
  await new Promise(r => setTimeout(r, 2000));
  
  r = await evalJS(`(() => {
    const results = {};
    results.pipelineVisible = !!document.querySelector('.pipeline-panel, [class*="pipeline"]');
    const pp = document.querySelector('.pipeline-panel, [class*="pipeline"]');
    if (pp) results.pipelineHTML = pp.innerHTML.substring(0, 300);
    
    const overflowEls = [];
    document.querySelectorAll('[class*="pipeline"] *').forEach(el => {
      const styles = window.getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && styles.overflowX !== 'hidden' && el.children.length <= 3) {
        overflowEls.push({ tag: el.tagName, cls: (el.className||'').substring(0,50), sw: el.scrollWidth, cw: el.clientWidth });
      }
    });
    results.overflow = overflowEls.slice(0, 15);
    return JSON.stringify(results);
  })()`);
  allResults.pipeline = JSON.parse(r.result?.value || '{}');
  
  console.log(JSON.stringify(allResults, null, 2));
  ws.close();
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
