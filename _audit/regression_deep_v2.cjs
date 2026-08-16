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
      const timer = setTimeout(() => resolve({ error: 'timeout' }), 10000);
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
  await new Promise(r => setTimeout(r, 2000));

  const results = {};
  const logs = [];
  ws.on('message', (data) => {
    try {
      const m = JSON.parse(data.toString());
      if (m.method === 'Runtime.consoleAPICalled' && m.params) {
        const level = m.params.type || 'log';
        const msg = m.params.args.map(a=>a.value||a.description||'').join(' ');
        if (level === 'error') logs.push('[ERR] ' + msg);
        else if (level === 'warn') logs.push('[WARN] ' + msg);
      }
    } catch(e) {}
  });

  async function evalJS(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : 'FAIL';
  }

  async function clickEl(selector) {
    return await evalJS('(function(){ let el = document.querySelector("' + selector.replace(/"/g,'\\"') + '"); if(!el) return "NOT_FOUND"; el.click(); return "CLICKED"; })()');
  }

  // === 1. Initial state ===
  console.log('=== 1. INITIAL STATE ===');
  results.initialPanel = await evalJS('typeof __pinia !== "undefined" ? __pinia.state.value.settings?.activeTab || "N/A" : "NO_PINIA"');
  console.log('activeTab: ' + results.initialPanel);

  // === 2. Open 大纲工作台 ===
  console.log('\\n=== 2. OPEN 大纲工作台 ===');
  await clickEl('#btn-outline-workspace');
  await new Promise(r => setTimeout(r, 1000));
  let ow = await evalJS('(function(){ let el = document.getElementById("outline-workspace"); if(!el) return "NOT_FOUND"; return {tag:el.tagName, classes:el.className, visible:el.offsetParent!==null, btnCount:el.querySelectorAll("button").length, allBtns:Array.from(el.querySelectorAll("button")).map(b=>({text:b.textContent.trim().slice(0,30), visible:b.offsetParent!==null, id:b.id, display:window.getComputedStyle(b).display}))}; })()');
  results.outlineWorkspace = ow;
  console.log('OutlineWorkspace: ' + (typeof ow === 'object' ? ow.btnCount + ' buttons, visible=' + ow.visible : ow));
  // Check why send button is hidden
  if (typeof ow === 'object') {
    const sendBtn = ow.allBtns.find(b => b.id === 'btn-ow-send');
    console.log('Send button: ' + JSON.stringify(sendBtn));
  }

  // Close outline
  await clickEl('#btn-close-outline-workspace');
  await new Promise(r => setTimeout(r, 500));

  // === 3. Open 生成流水线 ===
  console.log('\\n=== 3. OPEN 生成流水线 ===');
  await clickEl('#btn-pipeline');
  await new Promise(r => setTimeout(r, 1000));
  let pl = await evalJS('(function(){ let el = document.querySelector(".pl-overlay"); if(!el) return "NOT_FOUND"; return {tag:el.tagName, classes:el.className, visible:el.offsetParent!==null, btnCount:el.querySelectorAll("button").length, allBtns:Array.from(el.querySelectorAll("button")).map(b=>({text:b.textContent.trim().slice(0,25), visible:b.offsetParent!==null, id:b.id, display:window.getComputedStyle(b).display}))}; })()');
  results.pipelinePanel = pl;
  console.log('PipelinePanel: ' + (typeof pl === 'object' ? pl.btnCount + ' buttons, visible=' + pl.visible : pl));
  // Check for any hidden buttons in pipeline
  if (typeof pl === 'object') {
    const hidden = pl.allBtns.filter(b => !b.visible);
    if (hidden.length) console.log('Hidden pipeline buttons: ' + JSON.stringify(hidden));
  }

  // Close pipeline
  await clickEl('#btn-close-pl');
  await new Promise(r => setTimeout(r, 500));

  // === 4. Open 设定合集 ===
  console.log('\\n=== 4. OPEN 设定合集 ===');
  await clickEl('#btn-settings-collection');
  await new Promise(r => setTimeout(r, 1000));
  let sc = await evalJS('(function(){ let el = document.getElementById("settings-collection-panel"); if(!el) return "NOT_FOUND"; return {tag:el.tagName, classes:el.className, visible:el.offsetParent!==null, btnCount:el.querySelectorAll("button").length, allBtns:Array.from(el.querySelectorAll("button")).map(b=>({text:b.textContent.trim().slice(0,25), visible:b.offsetParent!==null, id:b.id}))}; })()');
  results.scPanel = sc;
  console.log('ScPanel: ' + (typeof sc === 'object' ? sc.btnCount + ' buttons, visible=' + sc.visible : sc));

  // Close
  await clickEl('#btn-close-sc');
  await new Promise(r => setTimeout(r, 500));

  // === 5. Open 项目弹窗 ===
  console.log('\\n=== 5. OPEN 项目弹窗 ===');
  await clickEl('#btn-open-project');
  await new Promise(r => setTimeout(r, 1000));
  let pm = await evalJS('(function(){ let el = document.querySelector(".project-modal-content"); if(!el) return "NOT_FOUND"; return {tag:el.tagName, classes:el.className, visible:el.offsetParent!==null, btnCount:el.querySelectorAll("button").length, allBtns:Array.from(el.querySelectorAll("button")).map(b=>({text:b.textContent.trim().slice(0,25), visible:b.offsetParent!==null, id:b.id}))}; })()');
  results.projectModal = pm;
  console.log('ProjectModal: ' + (typeof pm === 'object' ? pm.btnCount + ' buttons, visible=' + pm.visible : pm));

  // === 6. Open 设置面板 ===
  console.log('\\n=== 6. OPEN 设置面板 ===');
  await clickEl('#btn-settings');
  await new Promise(r => setTimeout(r, 1000));
  let sm = await evalJS('(function(){ let el = document.querySelector(".settings-tabs"); if(!el) return "NOT_FOUND"; return {tag:el.tagName, classes:el.className, visible:el.offsetParent!==null, btnCount:el.querySelectorAll("button").length, allBtns:Array.from(el.querySelectorAll("button")).map(b=>({text:b.textContent.trim().slice(0,25), visible:b.offsetParent!==null, id:b.id}))}; })()');
  results.settingsModal = sm;
  console.log('SettingsModal: ' + (typeof sm === 'object' ? sm.btnCount + ' buttons, visible=' + sm.visible : sm));

  // === 7. Check for ALL hidden buttons across the entire app ===
  console.log('\\n=== 7. GLOBAL HIDDEN BUTTONS ===');
  let hidden = await evalJS('(function(){ let btns = document.querySelectorAll("button"); let hidden = []; btns.forEach(b=>{ let style = window.getComputedStyle(b); if(style.display==="none" || b.offsetParent===null) hidden.push({text:b.textContent.trim().slice(0,30), id:b.id, display:style.display, tag:b.tagName, parentClasses: (b.parentElement ? b.parentElement.className.slice(0,40) : "")}); }); return {total:btns.length, hiddenCount:hidden.length, hidden}; })()');
  results.hiddenButtons = hidden;
  console.log('Hidden buttons: ' + (typeof hidden === 'object' ? hidden.hiddenCount + '/' + hidden.total : hidden));
  if (typeof hidden === 'object' && hidden.hidden.length > 0) {
    hidden.hidden.forEach(b => console.log('  HIDDEN: ' + b.id + ' (' + b.text + ') display=' + b.display + ' parent=' + b.parentClasses));
  }

  // === 8. Check for console errors ===
  await new Promise(r => setTimeout(r, 500));
  results.consoleErrors = logs.slice(0, 30);
  console.log('\\nConsole errors: ' + results.consoleErrors.length);
  results.consoleErrors.forEach(e => console.log('  ' + e.slice(0, 200)));

  // === 9. Store state sanity ===
  console.log('\\n=== 9. STORE STATES ===');
  const storeKeys = ['project','pipeline','chat','agent','skill','settings','theme','provider'];
  for (const sk of storeKeys) {
    const sr = await evalJS('__pinia && __pinia.state.value.' + sk + ' ? Object.keys(__pinia.state.value.' + sk + ').join(", ") : "NO_STORE"');
    console.log('  ' + sk + ': ' + sr);
  }

  // === 10. Screenshot ===
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    fs.writeFileSync('_audit/regression_shot_v2.png', Buffer.from(shot.result.data, 'base64'));
    results.screenshot = 'OK_' + Math.round(shot.result.data.length / 1024) + 'KB';
  }

  // === 11. Check for windowClose ===
  results.windowClose = await evalJS('typeof window.electronAPI.windowClose');
  // Also check what's available
  results.electronAPIMethods = await evalJS('window.electronAPI ? Object.keys(window.electronAPI).join(", ") : "NO_API"');
  console.log('\\nelectronAPI methods: ' + results.electronAPIMethods);

  // === 12. Check ChapterTree for project button click handler ===
  results.ctProjectBtn = await evalJS('(function(){ let btn = document.getElementById("btn-open-project"); if(!btn) return "NOT_FOUND"; let onclick = btn.onclick ? "HAS_ONCLICK" : "NO_ONCLICK"; let listeners = typeof getEventListeners !== "undefined" ? getEventListeners(btn).click.length : "UNKNOWN"; return {onclick, listeners, visible: btn.offsetParent !== null, text: btn.textContent.trim()}; })()');
  console.log('Project button: ' + JSON.stringify(results.ctProjectBtn));

  fs.writeFileSync('_audit/regression_deep_v2.json', JSON.stringify(results, null, 2));
  console.log('\\nDone. Results saved to _audit/regression_deep_v2.json');
  ws.close();
}
main().catch(e => console.log('FATAL: ' + e.message));
