const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const pages = await fetchJSON('http://127.0.0.1:9227/json');
  if (!pages || pages.length === 0) { console.log('FATAL:NO_PAGES'); return; }
  const wsUrl = pages[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));
  let msgId = 1;
  let consoleErrors = [];
  function send(method, params) {
    const id = msgId++;
    return new Promise((resolve) => {
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) { ws.removeListener('message', handler); resolve(msg); }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('CSS.enable');
  
  // Capture console errors
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Runtime.consoleAPICalled') {
      const type = msg.params.type;
      if (type === 'error' || type === 'warning') {
        const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
        consoleErrors.push('[' + type + '] ' + text.substring(0, 200));
      }
    }
  });

  const results = [];
  const pass = (name) => results.push('PASS:' + name);
  const fail = (name, detail) => results.push('FAIL:' + name + ' - ' + detail);
  const warn = (name, detail) => results.push('WARN:' + name + ' - ' + detail);
  
  await new Promise(r => setTimeout(r, 2000));
  
  // ===== 1. APP BOOT =====
  const doc = await send('DOM.getDocument');
  const rootId = doc.result.root.nodeId;
  
  const app = await send('DOM.querySelector', { nodeId: rootId, selector: '#app' });
  if (app.result && app.result.nodeId) {
    const appChild = await send('DOM.querySelector', { nodeId: app.result.nodeId, selector: '*' });
    if (appChild.result && appChild.result.nodeId) pass('App mount');
    else fail('App mount', 'app has no children (Vue not rendered)');
  } else fail('App mount', 'no #app element');
  
  // ===== 2. SIDEBAR NAV =====
  const sidebar = await send('DOM.querySelector', { nodeId: rootId, selector: '#app-sidebar' });
  if (sidebar.result && sidebar.result.nodeId) {
    pass('Sidebar nav rendered');
    const sidebarBtns = await send('DOM.querySelectorAll', { nodeId: sidebar.result.nodeId, selector: 'button' });
    const count = sidebarBtns.result.nodeIds ? sidebarBtns.result.nodeIds.length : 0;
    if (count >= 6) pass('Sidebar buttons: ' + count);
    else warn('Sidebar buttons', 'only ' + count + ' found, expected 6+');
  } else fail('Sidebar nav', 'not found');
  
  // ===== 3. CHAPTER TREE =====
  const tree = await send('DOM.querySelector', { nodeId: rootId, selector: '.chapter-tree' });
  if (tree.result && tree.result.nodeId) {
    pass('Chapter tree rendered');
    const treeHeader = await send('DOM.querySelector', { nodeId: tree.result.nodeId, selector: '.tree-header' });
    if (treeHeader.result && treeHeader.result.nodeId) pass('Chapter tree header');
    else warn('Chapter tree header', 'not found');
  } else warn('Chapter tree', 'not rendered (may need project loaded)');
  
  // ===== 4. EDITOR PANEL =====
  const editor = await send('DOM.querySelector', { nodeId: rootId, selector: '.editor-panel' });
  if (editor.result && editor.result.nodeId) {
    pass('Editor panel rendered');
    const editorArea = await send('DOM.querySelector', { nodeId: editor.result.nodeId, selector: '.ProseMirror, .editor-content, textarea, [contenteditable]' });
    if (editorArea.result && editorArea.result.nodeId) pass('Editor content area');
    else warn('Editor content area', 'not found');
  } else fail('Editor panel', 'not found');
  
  // ===== 5. CHAT PANEL =====
  const chat = await send('DOM.querySelector', { nodeId: rootId, selector: '.chat-panel, #chat-panel' });
  if (chat.result && chat.result.nodeId) {
    pass('Chat panel rendered');
    const chatInput = await send('DOM.querySelector', { nodeId: chat.result.nodeId, selector: 'input, textarea' });
    if (chatInput.result && chatInput.result.nodeId) pass('Chat input');
    else warn('Chat input', 'not found');
  } else warn('Chat panel', 'not found');
  
  // ===== 6. MODAL SYSTEM =====
  const backdrop = await send('DOM.querySelectorAll', { nodeId: rootId, selector: '.modal-backdrop' });
  if (backdrop.result.nodeIds && backdrop.result.nodeIds.length > 0) fail('Modal backdrop', 'found ' + backdrop.result.nodeIds.length + ' (should be 0)');
  else pass('No modal-backdrop');  
  const overlay = await send('DOM.querySelectorAll', { nodeId: rootId, selector: '.modal-overlay' });
  if (overlay.result.nodeIds && overlay.result.nodeIds.length > 0) pass('Modal-overlay: ' + overlay.result.nodeIds.length);
  // Some modals are always rendered
  
  // ===== 7. BUTTON STYLES =====
  const allBtns = await send('DOM.querySelectorAll', { nodeId: rootId, selector: 'button' });
  const btnCount = allBtns.result.nodeIds ? allBtns.result.nodeIds.length : 0;
  if (btnCount > 0) pass('Total buttons: ' + btnCount);
  else fail('Total buttons', '0');
  
  // Check a specific button's computed style
  const firstBtn = await send('DOM.querySelector', { nodeId: rootId, selector: 'button' });
  if (firstBtn.result && firstBtn.result.nodeId) {
    const style = await send('CSS.getComputedStyleForNode', { nodeId: firstBtn.result.nodeId });
    const cursor = style.result.computedStyle.find(s => s.name === 'cursor');
    const display = style.result.computedStyle.find(s => s.name === 'display');
    if (cursor && cursor.value === 'pointer') pass('Button cursor: pointer');
    else warn('Button cursor', cursor ? cursor.value : '?');
  }
  
  // ===== 8. CSS TOKENS =====
  const body = await send('DOM.querySelector', { nodeId: rootId, selector: 'body' });
  if (body.result && body.result.nodeId) {
    const style = await send('CSS.getComputedStyleForNode', { nodeId: body.result.nodeId });
    const fontSize = style.result.computedStyle.find(s => s.name === 'font-size');
    const fontFamily = style.result.computedStyle.find(s => s.name === 'font-family');
    const bgColor = style.result.computedStyle.find(s => s.name === 'background-color');
    pass('Body font-size: ' + (fontSize ? fontSize.value : '?'));
    if (bgColor && bgColor.value !== 'rgba(0, 0, 0, 0)') pass('Body background set');
    else warn('Body background', 'transparent');
  }
  
  // ===== 9. STORE INITIALIZATION =====
  const storeCheck = await send('Runtime.evaluate', { expression: 'typeof __pinia !== "undefined"', returnByValue: true });
  if (storeCheck.result && storeCheck.result.value === true) pass('Pinia store initialized');
  else fail('Pinia store', '__pinia not found');
  
  const storeState = await send('Runtime.evaluate', { expression: 'JSON.stringify((__pinia.state.value || {}).project || {})', returnByValue: true, timeout: 3000 });
  if (storeState.result && storeState.result.value) {
    const state = storeState.result.value;
    if (state.length > 10) pass('Project store state: ' + state.substring(0, 80) + '...');
    else warn('Project store', 'empty state');
  } else warn('Project store', 'not accessible');
  
  // ===== 10. ELECTRON IPC =====
  const ipcCheck = await send('Runtime.evaluate', { expression: 'typeof window.electronAPI !== "undefined"', returnByValue: true });
  if (ipcCheck.result && ipcCheck.result.value === true) pass('electronAPI available');
  else fail('electronAPI', 'not found');
  
  const storageCheck = await send('Runtime.evaluate', { expression: 'typeof window.electronAPI.storageRead === "function"', returnByValue: true });
  if (storageCheck.result && storageCheck.result.value === true) pass('storageRead function');
  else fail('storageRead', 'not a function');
  
  // ===== 11. NO JS ERRORS =====
  await new Promise(r => setTimeout(r, 500));
  const errors = consoleErrors.filter(e => e.startsWith('[error]'));
  const warnings = consoleErrors.filter(e => e.startsWith('[warning]'));
  if (errors.length === 0) pass('No console errors');
  else fail('Console errors', errors.join('; ').substring(0, 300));
  if (warnings.length > 0) warn('Console warnings', warnings.join('; ').substring(0, 300));
  
  // ===== 12. SCREENSHOT =====
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  if (screenshot.result && screenshot.result.data) {
    const buf = Buffer.from(screenshot.result.data, 'base64');
    fs.writeFileSync('_audit/full_regression_check.png', buf);
    pass('Screenshot: ' + buf.length + ' bytes');
  } else fail('Screenshot', 'no data');
  
  // ===== 13. PIPELINE COMPONENT =====
  const pipeline = await send('DOM.querySelector', { nodeId: rootId, selector: '.pipeline-panel, #pipeline-panel' });
  if (pipeline.result && pipeline.result.nodeId) {
    pass('Pipeline panel rendered');
    const steps = await send('DOM.querySelectorAll', { nodeId: pipeline.result.nodeId, selector: '.pl-step, .pipeline-step' });
    if (steps.result.nodeIds && steps.result.nodeIds.length > 0) pass('Pipeline steps: ' + steps.result.nodeIds.length);
    else warn('Pipeline steps', 'none found');
  } else warn('Pipeline panel', 'not rendered (needs click)');
  
  // ===== 14. SETTINGS COMPONENT =====
  const settings = await send('DOM.querySelector', { nodeId: rootId, selector: '.settings-modal, #settings-modal' });
  if (settings.result && settings.result.nodeId) pass('Settings modal rendered');
  else pass('Settings modal', 'not open (expected)');
  
  // Print results
  console.log('=== FULL REGRESSION CHECK ===');
  results.forEach(r => console.log(r));
  console.log('=== END ===');
  
  ws.close();
}

main().catch(e => { console.log('FATAL:' + e.message); });
