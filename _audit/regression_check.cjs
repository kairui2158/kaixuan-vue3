const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}});
  }).on('error', reject);
  });
}

async function main() {
  const pages = await fetchJSON('http://127.0.0.1:9227/json');
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
  let msgId = 1;
  function send(method, params) {
    const id = msgId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'timeout' }), 8000);
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) { clearTimeout(timer); ws.removeListener('message', handler); resolve(msg); }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 3000));

  const results = {};

  // 1. Console errors
  const logs = [];
  ws.on('message', (data) => {
    try {
      const m = JSON.parse(data.toString());
      if (m.method === 'Runtime.consoleAPICalled' && m.params && m.params.type === 'error') {
        logs.push(m.params.args.map(a=>a.value||a.description||'').join(' '));
      }
    } catch(e) {}
  });
  await send('Log.enable');
  await new Promise(r => setTimeout(r, 1000));
  results.consoleErrors = logs.slice(0, 20);
  await send('Log.disable');

  // 2. DOM structure
  const dom = await send('Runtime.evaluate', {
    expression: 'document.querySelector("#app") ? document.querySelector("#app").outerHTML.slice(0, 500) : "NO_APP"',
    returnByValue: true
  });
  results.appHtml = dom.result && dom.result.result ? dom.result.result.value : 'FAIL';

  // 3. Sidebar buttons
  const sidebar = await send('Runtime.evaluate', {
    expression: 'Array.from(document.querySelectorAll("button, [role=button], .nav-item, .sidebar-btn")).map(b=>({text:b.textContent.trim().slice(0,30), visible:b.offsetParent!==null, tag:b.tagName, id:b.id})).slice(0,20)',
    returnByValue: true
  });
  results.sidebarButtons = sidebar.result && sidebar.result.result ? sidebar.result.result.value : 'FAIL';

  // 4. OutlineWorkspace
  const outline = await send('Runtime.evaluate', {
    expression: '(function(){ let el = document.querySelector("[class*=outline], [class*=Outline], #outline-workspace, [data-testid*=outline]"); return el ? {tag:el.tagName, classes:el.className, html:el.innerHTML.slice(0,300)} : "NOT_FOUND"; })()',
    returnByValue: true
  });
  results.outlineWorkspace = outline.result && outline.result.result ? outline.result.result.value : 'FAIL';

  // 5. PipelinePanel
  const pipeline = await send('Runtime.evaluate', {
    expression: '(function(){ let el = document.querySelector("[class*=pipeline], [class*=Pipeline], #pipeline-panel"); return el ? {tag:el.tagName, classes:el.className, buttons: Array.from(el.querySelectorAll("button")).map(b=>({text:b.textContent.trim().slice(0,20), visible:b.offsetParent!==null})).slice(0,30)} : "NOT_FOUND"; })()',
    returnByValue: true
  });
  results.pipelinePanel = pipeline.result && pipeline.result.result ? pipeline.result.result.value : 'FAIL';

  // 6. ChapterTree
  const chTree = await send('Runtime.evaluate', {
    expression: '(function(){ let el = document.querySelector("[class*=chapter], [class*=Chapter], [class*=tree], [class*=Tree]"); return el ? {tag:el.tagName, classes:el.className, html:el.innerHTML.slice(0,300)} : "NOT_FOUND"; })()',
    returnByValue: true
  });
  results.chapterTree = chTree.result && chTree.result.result ? chTree.result.result.value : 'FAIL';

  // 7. EditorPanel
  const editor = await send('Runtime.evaluate', {
    expression: '(function(){ let el = document.querySelector("[class*=editor], [class*=Editor], #editor-panel"); return el ? {tag:el.tagName, classes:el.className, html:el.innerHTML.slice(0,300)} : "NOT_FOUND"; })()',
    returnByValue: true
  });
  results.editorPanel = editor.result && editor.result.result ? editor.result.result.value : 'FAIL';

  // 8. ChatPanel
  const chat = await send('Runtime.evaluate', {
    expression: '(function(){ let el = document.querySelector("[class*=chat], [class*=Chat], #chat-panel"); return el ? {tag:el.tagName, classes:el.className, buttons: Array.from(el.querySelectorAll("button")).map(b=>({text:b.textContent.trim().slice(0,20), visible:b.offsetParent!==null})).slice(0,20)} : "NOT_FOUND"; })()',
    returnByValue: true
  });
  results.chatPanel = chat.result && chat.result.result ? chat.result.result.value : 'FAIL';

  // 9. All buttons visibility
  const allBtns = await send('Runtime.evaluate', {
    expression: '(function(){ let btns = document.querySelectorAll("button"); let hidden = []; btns.forEach(b=>{ if(b.offsetParent===null) hidden.push({text:b.textContent.trim().slice(0,30), id:b.id, tag:b.tagName}); }); return {total: btns.length, hidden: hidden.slice(0,30)}; })()',
    returnByValue: true
  });
  results.allButtons = allBtns.result && allBtns.result.result ? allBtns.result.result.value : 'FAIL';

  // 10. Store snapshots
  const stores = ['project','pipeline','chat','agent','skill','settings','theme','provider'];
  for (const s of stores) {
    const r = await send('Runtime.evaluate', {
      expression: '__pinia && __pinia.state.value.' + s + ' ? JSON.stringify(__pinia.state.value.' + s + ').slice(0,200) : "NO_STORE"',
      returnByValue: true
    });
    results['store_' + s] = r.result && r.result.result ? r.result.result.value : 'FAIL';
  }

  // 11. windowClose
  const wc = await send('Runtime.evaluate', {
    expression: 'typeof window.electronAPI.windowClose',
    returnByValue: true
  });
  results.windowCloseType = wc.result && wc.result.result ? wc.result.result.value : 'FAIL';

  // 12. Screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    fs.writeFileSync('_audit/regression_shot.png', Buffer.from(shot.result.data, 'base64'));
    results.screenshot = 'OK_' + Math.round(shot.result.data.length / 1024) + 'KB';
  } else {
    results.screenshot = 'FAILED';
  }

  // 13. Body font-size
  const fsCheck = await send('Runtime.evaluate', {
    expression: 'window.getComputedStyle(document.body).fontSize',
    returnByValue: true
  });
  results.bodyFontSize = fsCheck.result && fsCheck.result.result ? fsCheck.result.result.value : 'FAIL';

  // 14. Modal backdrop
  const modal = await send('Runtime.evaluate', {
    expression: 'document.querySelector(".modal-backdrop, [class*=modal-backdrop], [class*=overlay], .v-overlay") ? "FOUND" : "NONE"',
    returnByValue: true
  });
  results.modalBackdrop = modal.result && modal.result.result ? modal.result.result.value : 'FAIL';

  // 15. Project button
  const projBtn = await send('Runtime.evaluate', {
    expression: '(function(){ let btns = document.querySelectorAll("button"); for(let b of btns) { if(b.textContent.includes("\\u9879\\u76EE") || b.textContent.includes("Project") || b.id.includes("project")) return {text: b.textContent.trim().slice(0,30), visible: b.offsetParent!==null, id: b.id}; } return "NOT_FOUND"; })()',
    returnByValue: true
  });
  results.projectButton = projBtn.result && projBtn.result.result ? projBtn.result.result.value : 'FAIL';

  // 16. Pipeline buttons detail
  const pipelineBtns = await send('Runtime.evaluate', {
    expression: '(function(){ let el = document.querySelector("[class*=pipeline], [class*=Pipeline], #pipeline-panel"); if(!el) return "NO_PIPELINE"; let btns = el.querySelectorAll("button"); let result = {}; btns.forEach(b=>{ let t = b.textContent.trim().slice(0,25); if(t) result[t] = b.offsetParent!==null; }); return result; })()',
    returnByValue: true
  });
  results.pipelineButtons = pipelineBtns.result && pipelineBtns.result.result ? pipelineBtns.result.result.value : 'FAIL';

  fs.writeFileSync('_audit/regression_results.json', JSON.stringify(results, null, 2));
  console.log('=== REGRESSION RESULTS ===');
  for (const [k, v] of Object.entries(results)) {
    if (k === 'store_project' || k === 'store_pipeline') continue;
    console.log(k + ': ' + JSON.stringify(v).slice(0, 200));
  }
  console.log('\\n=== ERROR LOGS ===');
  if (results.consoleErrors && results.consoleErrors.length) {
    results.consoleErrors.forEach(e => console.log('ERR: ' + e.slice(0, 200)));
  } else {
    console.log('No console errors found');
  }

  ws.close();
  console.log('\\nDone. Results saved to _audit/regression_results.json');
}
main().catch(e => console.log('FATAL: ' + e.message));
