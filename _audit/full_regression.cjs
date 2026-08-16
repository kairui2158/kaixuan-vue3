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
  if (!pages.length) { console.log('NO_PAGES'); return; }
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
  await new Promise(r => setTimeout(r, 3000));

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

  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : 'FAIL';
  }

  async function click(s) {
    return await ev('(function(){ let el=document.querySelector("'+s.replace(/"/g,'\\"')+'"); if(!el)return"NOT_FOUND"; el.click(); return"CLICKED"; })()');
  }

  // Helper: check if element is truly visible (computed style, not offsetParent)
  function visibleCheck(sel) {
    return ev('(function(){ let el=document.querySelector("'+sel.replace(/"/g,'\\"')+'"); if(!el)return"NOT_FOUND"; let cs=window.getComputedStyle(el); let r=el.getBoundingClientRect(); return{display:cs.display,vis:cs.visibility,opacity:cs.opacity,w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)}; })()');
  }

  function panelButtons(sel) {
    return ev('(function(){ let el=document.querySelector("'+sel.replace(/"/g,'\\"')+'"); if(!el)return"NOT_FOUND"; return Array.from(el.querySelectorAll("button")).map(b=>{let cs=window.getComputedStyle(b); let r=b.getBoundingClientRect(); return{id:b.id,text:b.textContent.trim().slice(0,25),d:cs.display,v:cs.vis,w:Math.round(r.width),h:Math.round(r.height)}}); })()');
  }

  const report = { sections: [], errors: [], issues: [] };
  function addSection(name, data) { report.sections.push({ name, data }); }
  function addIssue(desc, severity) { report.issues.push({ desc, severity: severity || 'WARN' }); }

  // === 1. INITIAL STATE ===
  console.log('=== 1. INITIAL STATE ===');
  let app = await ev('document.getElementById("app") ? "RENDERED" : "NOT_FOUND"');
  addSection('App渲染', app);
  console.log('App: ' + app);

  let sidebar = await ev('document.getElementById("app-sidebar") ? "RENDERED" : "NOT_FOUND"');
  addSection('侧边栏', sidebar);
  console.log('Sidebar: ' + sidebar);

  let chapterTree = await ev('document.querySelector(".chapter-tree") ? "RENDERED" : "NOT_FOUND"');
  addSection('章节树', chapterTree);
  console.log('ChapterTree: ' + chapterTree);

  let editor = await ev('document.querySelector(".editor-panel") ? "RENDERED" : "NOT_FOUND"');
  addSection('编辑器', editor);
  console.log('Editor: ' + editor);

  let chat = await ev('document.querySelector(".chat-panel") ? "RENDERED" : "NOT_FOUND"');
  addSection('聊天面板', chat);
  console.log('Chat: ' + chat);

  // Check for hidden overlays
  let hasOverlay = await ev('(function(){ let els=document.querySelectorAll(".modal-overlay, .pl-overlay, .ow-overlay, .sc-overlay"); let out=[]; els.forEach(el=>{let cs=window.getComputedStyle(el); if(cs.display!="none" && cs.visibility!="hidden") { let r=el.getBoundingClientRect(); out.push({cls:el.className.slice(0,60),display:cs.display,w:Math.round(r.width),h:Math.round(r.height)});}}); return out; })()');
  if (Array.isArray(hasOverlay) && hasOverlay.length > 0) {
    addIssue('初始状态有残留覆盖层: ' + JSON.stringify(hasOverlay), 'HIGH');
    console.log('WARN: Stale overlays at init: ' + JSON.stringify(hasOverlay));
  } else {
    addSection('初始覆盖层', '无残留（modal-hidden 修复生效）');
    console.log('No stale overlays - modal-hidden fix works');
  }

  // Check console errors
  await new Promise(r => setTimeout(r, 500));
  addSection('控制台错误', logs.length === 0 ? '0' : logs.slice(0,10));
  console.log('Console errors: ' + logs.length);

  // === 2. OPEN 大纲工作台 ===
  console.log('\\n=== 2. OPEN 大纲工作台 ===');
  await click('#btn-outline-workspace');
  await new Promise(r => setTimeout(r, 1000));
  let ow = await visibleCheck('#outline-workspace');
  addSection('大纲工作台可见性', ow);
  console.log('OutlineWorkspace: ' + JSON.stringify(ow));
  if (typeof ow === 'object' && ow.display !== 'none') {
    let btns = await panelButtons('#outline-workspace');
    addSection('大纲工作台按钮', btns);
    console.log('Buttons: ' + (Array.isArray(btns) ? btns.length : btns));
    // Check for hidden buttons (display:none or 0 size)
    if (Array.isArray(btns)) {
      let hidden = btns.filter(b => b.d === 'none' || b.w === 0 || b.h === 0);
      if (hidden.length) addIssue('大纲工作台有隐藏按钮: ' + JSON.stringify(hidden), 'MED');
    }
  }
  // Close outline
  await click('#btn-close-outline-workspace');
  await new Promise(r => setTimeout(r, 500));

  // === 3. OPEN 设定合集 ===
  console.log('\\n=== 3. OPEN 设定合集 ===');
  await click('#btn-settings-collection');
  await new Promise(r => setTimeout(r, 1000));
  let sc = await visibleCheck('#settings-collection-panel');
  addSection('设定合集可见性', sc);
  console.log('ScPanel: ' + JSON.stringify(sc));
  if (typeof sc === 'object' && sc.display !== 'none') {
    let btns = await panelButtons('#settings-collection-panel');
    addSection('设定合集按钮', btns);
    console.log('Buttons: ' + (Array.isArray(btns) ? btns.length : btns));
    if (Array.isArray(btns)) {
      let hidden = btns.filter(b => b.d === 'none' || b.w === 0 || b.h === 0);
      if (hidden.length) addIssue('设定合集有隐藏按钮: ' + JSON.stringify(hidden), 'MED');
    }
  }
  await click('#btn-close-sc');
  await new Promise(r => setTimeout(r, 500));

  // === 4. OPEN 生成流水线 ===
  console.log('\\n=== 4. OPEN 生成流水线 ===');
  await click('#btn-pipeline');
  await new Promise(r => setTimeout(r, 1000));
  let pl = await visibleCheck('.pl-overlay');
  addSection('生成流水线可见性', pl);
  console.log('PipelinePanel: ' + JSON.stringify(pl));
  if (typeof pl === 'object' && pl.display !== 'none') {
    let btns = await panelButtons('.pl-overlay');
    addSection('生成流水线按钮', btns);
    console.log('Buttons: ' + (Array.isArray(btns) ? btns.length : btns));
    if (Array.isArray(btns)) {
      let hidden = btns.filter(b => b.d === 'none' || b.w === 0 || b.h === 0);
      if (hidden.length) addIssue('生成流水线有隐藏按钮('+hidden.length+'): ' + JSON.stringify(hidden.slice(0,5)), 'MED');
      // Count by layer (step)
      let layerBtns = {};
      btns.forEach(b => {
        let layer = 'unknown';
        if (b.id.includes('s1') || b.id.includes('step1') || b.id.includes('outline')) layer = 's1';
        else if (b.id.includes('s2') || b.id.includes('step2') || b.id.includes('setting')) layer = 's2';
        else if (b.id.includes('s3') || b.id.includes('step3') || b.id.includes('volume')) layer = 's3';
        else if (b.id.includes('s4') || b.id.includes('step4') || b.id.includes('chapter')) layer = 's4';
        else if (b.id.includes('s5') || b.id.includes('step5') || b.id.includes('body')) layer = 's5';
        if (!layerBtns[layer]) layerBtns[layer] = [];
        layerBtns[layer].push(b.text);
      });
      addSection('生成流水线各层按钮', layerBtns);
      console.log('Layer buttons: ' + Object.keys(layerBtns).map(k => k + ':' + layerBtns[k].length).join(', '));
    }
  }
  await click('#btn-close-pl');
  await new Promise(r => setTimeout(r, 500));

  // === 5. OPEN 项目弹窗 ===
  console.log('\\n=== 5. OPEN 项目弹窗 ===');
  await click('#btn-open-project');
  await new Promise(r => setTimeout(r, 1000));
  // ProjectModal is rendered inside ChapterTree, check its content
  let pm = await ev('(function(){ let el=document.querySelector(".project-modal-content"); if(!el)return"NOT_FOUND"; let cs=window.getComputedStyle(el); let r=el.getBoundingClientRect(); return{display:cs.display,w:Math.round(r.width),h:Math.round(r.height)}; })()');
  addSection('项目弹窗可见性', pm);
  console.log('ProjectModal: ' + JSON.stringify(pm));
  if (typeof pm === 'object' && pm.display !== 'none') {
    let btns = await ev('(function(){ let el=document.querySelector(".project-modal-content"); if(!el)return[]; return Array.from(el.querySelectorAll("button")).map(b=>{let cs=window.getComputedStyle(b); return{id:b.id,text:b.textContent.trim().slice(0,25),d:cs.display}}); })()');
    addSection('项目弹窗按钮', btns);
    console.log('ProjectModal buttons: ' + (Array.isArray(btns) ? btns.length : btns));
  }
  // Close project modal (click overlay)
  await ev('(function(){ let el=document.querySelector(".modal-overlay:not(.modal-hidden)"); if(el)el.click(); })()');
  await new Promise(r => setTimeout(r, 500));

  // === 6. OPEN 设置 ===
  console.log('\\n=== 6. OPEN 设置 ===');
  await click('#btn-settings');
  await new Promise(r => setTimeout(r, 1000));
  let sm = await ev('(function(){ let el=document.querySelector(".modal-content.modal-lg"); if(!el)return"NOT_FOUND"; let cs=window.getComputedStyle(el); let r=el.getBoundingClientRect(); return{display:cs.display,w:Math.round(r.width),h:Math.round(r.height)}; })()');
  addSection('设置面板可见性', sm);
  console.log('SettingsModal: ' + JSON.stringify(sm));
  if (typeof sm === 'object' && sm.display !== 'none') {
    let tabs = await ev('(function(){ let el=document.querySelector(".settings-tabs"); if(!el)return[]; return Array.from(el.querySelectorAll("button")).map(b=>{let cs=window.getComputedStyle(b); return{id:b.id,text:b.textContent.trim().slice(0,25),d:cs.display}}); })()');
    addSection('设置面板标签', tabs);
    console.log('Settings tabs: ' + (Array.isArray(tabs) ? tabs.length : tabs));
  }
  await click('#btn-close-settings');
  await new Promise(r => setTimeout(r, 500));

  // === 7. KEY FUNCTIONAL TESTS ===
  // 7a. Re-open outline and test lock/save buttons
  console.log('\\n=== 7a. TEST 大纲工作台锁定/保存/确认 ===');
  await click('#btn-outline-workspace');
  await new Promise(r => setTimeout(r, 800));
  // Check lock button
  let lockBtn = await ev('(function(){ let el=document.getElementById("btn-ow-lock"); if(!el)return{id:"btn-ow-lock",found:false}; let cs=window.getComputedStyle(el); return{id:"btn-ow-lock",found:true,text:el.textContent.trim().slice(0,20),d:cs.display,w:Math.round(el.getBoundingClientRect().width)}; })()');
  addSection('大纲锁定按钮', lockBtn);
  console.log('Lock btn: ' + JSON.stringify(lockBtn));
  let saveBtn = await ev('(function(){ let el=document.getElementById("btn-save-ow"); if(!el)return{id:"btn-save-ow",found:false}; let cs=window.getComputedStyle(el); return{id:"btn-save-ow",found:true,text:el.textContent.trim().slice(0,20),d:cs.display,w:Math.round(el.getBoundingClientRect().width)}; })()');
  addSection('大纲保存按钮', saveBtn);
  console.log('Save btn: ' + JSON.stringify(saveBtn));
  let confirmBtn = await ev('(function(){ let el=document.getElementById("btn-ow-confirm"); if(!el)return{id:"btn-ow-confirm",found:false}; let cs=window.getComputedStyle(el); return{id:"btn-ow-confirm",found:true,text:el.textContent.trim().slice(0,20),d:cs.display,w:Math.round(el.getBoundingClientRect().width)}; })()');
  addSection('大纲确认按钮', confirmBtn);
  console.log('Confirm btn: ' + JSON.stringify(confirmBtn));
  let importBtn = await ev('(function(){ let el=document.getElementById("btn-import-outline"); if(!el)return{id:"btn-import-outline",found:false}; let cs=window.getComputedStyle(el); return{id:"btn-import-outline",found:true,text:el.textContent.trim().slice(0,20),d:cs.display,w:Math.round(el.getBoundingClientRect().width)}; })()');
  addSection('大纲导入按钮', importBtn);
  console.log('Import btn: ' + JSON.stringify(importBtn));
  // Close outline
  await click('#btn-close-outline-workspace');
  await new Promise(r => setTimeout(r, 500));

  // 7b. Re-open pipeline and test layer buttons
  console.log('\\n=== 7b. TEST 生成流水线各层按钮 ===');
  await click('#btn-pipeline');
  await new Promise(r => setTimeout(r, 800));
  // Check step buttons
  let stepBtns = await ev('(function(){ let el=document.querySelector(".pl-overlay"); if(!el)return"NO_PIPELINE"; let btns=el.querySelectorAll("button"); let result={}; btns.forEach(b=>{let t=b.textContent.trim().slice(0,25); if(t) result[t] = window.getComputedStyle(b).display; }); return result; })()');
  addSection('流水线按钮状态', stepBtns);
  console.log('Pipeline step buttons: ' + JSON.stringify(stepBtns));
  // Try clicking step 1 button
  let step1 = await ev('(function(){ let el=document.querySelector(".pl-overlay"); if(!el)return"NO_PIPELINE"; let btns=el.querySelectorAll("button"); for(let b of btns) { if(b.textContent.includes("大纲层")) { b.click(); return "CLICKED_STEP1"; } } return "STEP1_NOT_FOUND"; })()');
  addSection('流水线点击大纲层', step1);
  console.log('Step1 click: ' + step1);
  await new Promise(r => setTimeout(r, 500));
  await click('#btn-close-pl');
  await new Promise(r => setTimeout(r, 500));

  // 7c. Open project modal and test new project
  console.log('\\n=== 7c. TEST 项目弹窗新建项目 ===');
  await click('#btn-open-project');
  await new Promise(r => setTimeout(r, 800));
  let newBtn = await ev('(function(){ let el=document.querySelector(".project-modal-content"); if(!el)return"NO_MODAL"; return Array.from(el.querySelectorAll("button")).filter(b=>b.textContent.includes("新建")).map(b=>({text:b.textContent.trim().slice(0,20),d:window.getComputedStyle(b).display})); })()');
  addSection('项目弹窗新建按钮', newBtn);
  console.log('New project btn: ' + JSON.stringify(newBtn));
  // Close project modal
  await ev('(function(){ let el=document.querySelector(".modal-overlay:not(.modal-hidden)"); if(el)el.click(); })()');
  await new Promise(r => setTimeout(r, 500));

  // 7d. Test chat buttons
  console.log('\\n=== 7d. TEST 聊天面板按钮 ===');
  let chatBtns = await ev('(function(){ let el=document.querySelector(".chat-panel"); if(!el)return"NO_CHAT"; return Array.from(el.querySelectorAll("button")).map(b=>{let cs=window.getComputedStyle(b); return{id:b.id,text:b.textContent.trim().slice(0,20),d:cs.display,w:Math.round(b.getBoundingClientRect().width)}}); })()');
  addSection('聊天面板按钮', chatBtns);
  console.log('Chat buttons: ' + (Array.isArray(chatBtns) ? chatBtns.length : chatBtns));

  // 7e. Test chapter tree structure
  console.log('\\n=== 7e. TEST 章节树 ===');
  let ct = await ev('(function(){ let el=document.querySelector(".chapter-tree"); if(!el)return"NO_CT"; return{header:el.querySelector(".tree-header")?"RENDERED":"NO_HEADER",projectBtn:el.querySelector("#btn-open-project")?"RENDERED":"NO_BTN",genBtn:el.querySelector("#btn-tree-gen")?"RENDERED":"NO_BTN",treeContent:el.querySelector(".tree-content")?"RENDERED":"NO_TREE_CONTENT"}; })()');
  addSection('章节树结构', ct);
  console.log('ChapterTree: ' + JSON.stringify(ct));

  // 7f. Test IPC/electronAPI
  console.log('\\n=== 7f. TEST IPC 接口 ===');
  let apiMethods = await ev('window.electronAPI ? Object.keys(window.electronAPI).join(", ") : "NO_API"');
  addSection('electronAPI 方法', apiMethods);
  console.log('API methods: ' + apiMethods);
  let piniaState = await ev('__pinia ? Object.keys(__pinia.state.value).join(", ") : "NO_PINIA"');
  addSection('Pinia stores', piniaState);
  console.log('Pinia stores: ' + piniaState);

  // === 8. FINAL SCREENSHOT ===
  await new Promise(r => setTimeout(r, 500));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    fs.writeFileSync('_audit/regression_final.png', Buffer.from(shot.result.data, 'base64'));
    addSection('最终截图', Math.round(shot.result.data.length / 1024) + 'KB');
  }

  // === 9. FINAL CONSOLE ERRORS ===
  await new Promise(r => setTimeout(r, 500));
  addSection('总计控制台错误', logs.length === 0 ? '0' : logs.slice(0,10));

  // === 10. SUMMARY ===
  let summary = 'Issues: ' + report.issues.length;
  if (report.issues.length) {
    report.issues.forEach(i => summary += '\\n  [' + i.severity + '] ' + i.desc);
  }
  addSection('问题汇总', report.issues.length === 0 ? '无' : report.issues);
  console.log('\\n=== SUMMARY ===');
  console.log(summary);

  // Write report
  fs.writeFileSync('_audit/regression_full_report.json', JSON.stringify(report, null, 2));
  console.log('\\nReport saved to _audit/regression_full_report.json');
  ws.close();
}
main().catch(e => console.log('FATAL: ' + e.message));
