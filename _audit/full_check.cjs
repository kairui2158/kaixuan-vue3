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

const results = [];
function pass(n) { results.push('PASS:' + n); }
function fail(n, d) { results.push('FAIL:' + n + ' - ' + d); }
function warn(n, d) { results.push('WARN:' + n + ' - ' + d); }

async function main() {
  const pages = await fetchJSON('http://127.0.0.1:9227/json');
  if (!pages || pages.length === 0) { console.log('FATAL:NO_PAGES'); return; }
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
  let msgId = 1;
  let errors = [];
  
  function send(method, params) {
    const id = msgId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'timeout' }), 5000);
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) { clearTimeout(timer); ws.removeListener('message', handler); resolve(msg); }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      errors.push('[' + msg.params.type + '] ' + msg.params.args.map(a => a.value || '').join(' ').substring(0, 150));
    }
  });
  
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('CSS.enable');
  
  await new Promise(r => setTimeout(r, 1500));
  
  // 1. App mount
  const doc = await send('DOM.getDocument');
  if (doc.error) { fail('Document', doc.error); return; }
  const rootId = doc.result.root.nodeId;
  
  const app = await send('DOM.querySelector', { nodeId: rootId, selector: '#app' });
  if (app.result && app.result.nodeId) pass('App mounted');
  else fail('App mount', 'no #app');
  
  // 2. Sidebar
  const sidebar = await send('DOM.querySelector', { nodeId: rootId, selector: '#app-sidebar' });
  if (sidebar.result && sidebar.result.nodeId) {
    pass('Sidebar nav');
    const btns = await send('DOM.querySelectorAll', { nodeId: sidebar.result.nodeId, selector: 'button' });
    const n = btns.result.nodeIds ? btns.result.nodeIds.length : 0;
    if (n >= 6) pass('Sidebar btns: ' + n);
    else warn('Sidebar btns', 'only ' + n);
  } else fail('Sidebar', 'not found');
  
  // 3. Chapter tree
  const tree = await send('DOM.querySelector', { nodeId: rootId, selector: '.chapter-tree' });
  if (tree.result && tree.result.nodeId) { pass('Chapter tree'); } else { warn('Chapter tree', 'may need project'); }
  
  // 4. Editor panel
  const editor = await send('DOM.querySelector', { nodeId: rootId, selector: '.editor-panel' });
  if (editor.result && editor.result.nodeId) {
    pass('Editor panel');
    const editArea = await send('DOM.querySelector', { nodeId: editor.result.nodeId, selector: '[contenteditable], textarea, .ProseMirror' });
    if (editArea.result && editArea.result.nodeId) pass('Editor content');
    else warn('Editor content', 'not found');
  } else fail('Editor panel', 'not found');
  
  // 5. Chat panel
  const chat = await send('DOM.querySelector', { nodeId: rootId, selector: '.chat-panel, #chat-panel' });
  if (chat.result && chat.result.nodeId) { pass('Chat panel'); } else { warn('Chat panel', 'not found'); }
  
  // 6. Modal system
  const backdrop = await send('DOM.querySelectorAll', { nodeId: rootId, selector: '.modal-backdrop' });
  if (backdrop.result.nodeIds && backdrop.result.nodeIds.length > 0) fail('Backdrop', 'found ' + backdrop.result.nodeIds.length);
  else pass('No modal-backdrop');
  
  // 7. Total buttons
  const allBtns = await send('DOM.querySelectorAll', { nodeId: rootId, selector: 'button' });
  const btnCount = allBtns.result.nodeIds ? allBtns.result.nodeIds.length : 0;
  if (btnCount > 0) pass('Total buttons: ' + btnCount);
  else fail('No buttons');
  
  // 8. Body styles
  const body = await send('DOM.querySelector', { nodeId: rootId, selector: 'body' });
  if (body.result && body.result.nodeId) {
    const style = await send('CSS.getComputedStyleForNode', { nodeId: body.result.nodeId });
    if (!style.error) {
      const fs = style.result.computedStyle.find(s => s.name === 'font-size');
      pass('Body font-size: ' + (fs ? fs.value : '?'));
      const bg = style.result.computedStyle.find(s => s.name === 'background-color');
      if (bg && bg.value !== 'rgba(0,0,0,0)' && bg.value !== 'transparent') pass('Body bg set');
      else warn('Body bg', bg ? bg.value : '?');
    }
  }
  
  // 9. Store
  const pinia = await send('Runtime.evaluate', { expression: 'typeof __pinia !== "undefined"', returnByValue: true });
  if (pinia.result && pinia.result.value === true) pass('Pinia store');
  else fail('Pinia', 'not found');
  
  // 10. electronAPI
  const ipc = await send('Runtime.evaluate', { expression: 'typeof window.electronAPI !== "undefined"', returnByValue: true });
  if (ipc.result && ipc.result.value === true) pass('electronAPI');
  else fail('electronAPI', 'not found');
  
  // 11. Storage
  const storage = await send('Runtime.evaluate', { expression: 'typeof window.electronAPI.storageRead === "function"', returnByValue: true });
  if (storage.result && storage.result.value === true) pass('storageRead');
  else fail('storageRead', 'not function');
  
  // 12. Errors
  await new Promise(r => setTimeout(r, 300));
  const errs = errors.filter(e => e.startsWith('[error]'));
  const warns = errors.filter(e => e.startsWith('[warning]'));
  if (errs.length === 0) pass('No console errors');
  else fail('Console errors', errs.join('; ').substring(0, 200));
  if (warns.length > 0) warn('Console warnings', warns.join('; ').substring(0, 200));
  
  // 13. Screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    fs.writeFileSync('_audit/full_regression_check.png', Buffer.from(shot.result.data, 'base64'));
    pass('Screenshot saved');
  } else fail('Screenshot', 'no data');
  
  console.log('=== REGRESSION CHECK ===');
  results.forEach(r => console.log(r));
  console.log('=== END ===');
  ws.close();
}
main().catch(e => console.log('FATAL:' + e.message));
