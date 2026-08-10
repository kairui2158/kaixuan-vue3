const http = require('http');
function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9224/json', (res) => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}
async function run() {
  const targets = await getTargets();
  const page = targets.find(t => t.url.indexOf('5173') >= 0 || t.title === 'Novel Workshop');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  function send(method, params) { return new Promise((resolve) => { const i = id++; pending.set(i, resolve); ws.send(JSON.stringify({ id:i, method, params:params||{} })); }); }
  function evalJS(expr) { return send('Runtime.evaluate', { expression: expr, returnByValue: true }); }
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 4000));
  
  // Simple main page check
  let r = await evalJS('JSON.stringify({
    resizers: document.querySelectorAll(''+''.resizer-v'').length,
    headerH: document.querySelector(''.app-header'')?.offsetHeight,
    bodySW: document.body.scrollWidth,
    bodyCW: document.body.clientWidth,
    chapterTree: !!document.querySelector(''.chapter-tree''),
    editorPanel: !!document.querySelector(''.editor-panel''),
    chatPanel: !!document.querySelector(''.chat-panel''),
    sidebarBtns: document.querySelectorAll(''.sidebar-nav button'').length,
    api: typeof window.electronAPI
  })');
  console.log('Main:', r.result?.value);
  
  // Click settings nav
  await evalJS('document.querySelectorAll(''.sidebar-nav button'').forEach(b => { if (b.title === "设置" || b.dataset.panel === "settings") b.click(); })');
  await new Promise(r => setTimeout(r, 2000));
  r = await evalJS('JSON.stringify({
    settingsVisible: !!document.querySelector(''.settings-modal''),
    providerList: !!document.querySelector(''.provider-list''),
    providerCards: document.querySelectorAll(''.provider-card'').length,
    addBtn: !!document.querySelector(''.provider-card-add''),
    tabs: Array.from(document.querySelectorAll(''.settings-modal .tab, .tab-btn'')).map(t => t.textContent.trim())
  })');
  console.log('Settings:', r.result?.value);
  
  // Click add provider
  await evalJS('document.querySelector(''.provider-card-add'')?.click()');
  await new Promise(r => setTimeout(r, 1000));
  r = await evalJS('JSON.stringify({
    editView: !!document.querySelector(''.provider-edit-view''),
    backBtn: !!document.querySelector(''.btn-back''),
    fetchBtn: !!document.querySelector(''.model-fetch-row .btn-sm''),
    testBtn: !!document.querySelector(''.btn-test''),
    saveBtn: !!document.querySelector(''.form-actions .btn-primary'')
  })');
  console.log('ProviderEdit:', r.result?.value);
  
  // Close settings (click backdrop)
  await evalJS('document.querySelector(''.settings-modal .modal-close, .settings-modal .btn-close'')?.click()');
  await new Promise(r => setTimeout(r, 1000));
  
  // Open outline
  await evalJS('document.querySelectorAll(''.sidebar-nav button'').forEach(b => { if (b.dataset.panel === "outline") b.click(); })');
  await new Promise(r => setTimeout(r, 2000));
  r = await evalJS('JSON.stringify({
    outlineVisible: !!document.querySelector(''.ow-overlay''),
    saveBtn: !!document.querySelector(''.ow-footer .btn-primary''),
    textarea: !!document.querySelector(''.ow-textarea''),
    saveDisabled: document.querySelector(''.ow-footer .btn-primary'')?.disabled
  })');
  console.log('Outline:', r.result?.value);
  
  // Close outline
  await evalJS('document.querySelector(''.ow-overlay .modal-close'')?.click()');
  await new Promise(r => setTimeout(r, 1000));
  
  // Open settings-collection
  await evalJS('document.querySelectorAll(''.sidebar-nav button'').forEach(b => { if (b.dataset.panel === "settings-collection") b.click(); })');
  await new Promise(r => setTimeout(r, 2000));
  r = await evalJS('JSON.stringify({
    scVisible: !!document.querySelector(''.sc-overlay''),
    scSidebar: !!document.querySelector(''.sc-sidebar''),
    scToolbar: !!document.querySelector(''.sc-toolbar''),
    scEntries: !!document.querySelector(''.sc-entries''),
    scEditor: !!document.querySelector(''.sc-editor''),
    itemCards: document.querySelectorAll(''.sc-item-card'').length
  })');
  console.log('SettingsCollection:', r.result?.value);
  
  // Close
  await evalJS('document.querySelector(''.sc-overlay .modal-close'')?.click()');
  await new Promise(r => setTimeout(r, 1000));
  
  // Open pipeline
  await evalJS('document.querySelectorAll(''.sidebar-nav button'').forEach(b => { if (b.dataset.panel === "pipeline") b.click(); })');
  await new Promise(r => setTimeout(r, 2000));
  r = await evalJS('JSON.stringify({
    pipelineVisible: !!document.querySelector(''.pipeline-panel, [class*="pipeline"]''),
    pipelineSteps: document.querySelectorAll(''.pipeline-step, .step-item'').length
  })');
  console.log('Pipeline:', r.result?.value);
  
  ws.close();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
