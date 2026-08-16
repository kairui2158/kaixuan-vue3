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
  await new Promise(r => setTimeout(r, 2000));

  const logs = [];
  ws.on('message', (data) => {
    try {
      const m = JSON.parse(data.toString());
      if (m.method === 'Runtime.consoleAPICalled' && m.params) {
        const l = m.params.type || 'log';
        const msg = m.params.args.map(a=>a.value||a.description||'').join(' ');
        if (l === 'error') logs.push('[ERR] '+msg);
        else if (l === 'warn') logs.push('[WARN] '+msg);
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

  function isVis(el) {
    return ev('(function(){ let e=document.querySelector("'+el.replace(/"/g,'\\"')+'"); if(!e)return"NOT_FOUND"; let cs=window.getComputedStyle(e); let r=e.getBoundingClientRect(); return{ok:cs.display!="none"&&cs.visibility!="hidden"&&r.width>0&&r.height>0,w:Math.round(r.width),h:Math.round(r.height)}; })()');
  }

  function btns(el) {
    return ev('(function(){ let e=document.querySelector("'+el.replace(/"/g,'\\"')+'"); if(!e)return"NOT_FOUND"; return Array.from(e.querySelectorAll("button")).map(b=>{let cs=window.getComputedStyle(b); let r=b.getBoundingClientRect(); return{id:b.id||"",t:b.textContent.trim().slice(0,30),d:cs.display,w:Math.round(r.width),h:Math.round(r.height)}}); })()');
  }

  // ====== SEQUENTIAL VERIFICATION ======
  const results = {};
  function log(k, v) { results[k] = v; console.log('[' + k + '] ' + (typeof v === 'object' ? JSON.stringify(v).slice(0,200) : v)); }

  // 0. Initial
  log('init_app', await ev('document.getElementById("app") ? "OK" : "FAIL"'));
  log('init_sidebar', await ev('document.getElementById("app-sidebar") ? "OK" : "FAIL"'));
  log('init_chapter_tree', await ev('document.querySelector(".chapter-tree") ? "OK" : "FAIL"'));
  log('init_editor', await ev('document.querySelector(".editor-panel") ? "OK" : "FAIL"'));
  log('init_chat', await ev('document.querySelector(".chat-panel") ? "OK" : "FAIL"'));
  log('init_console_errors', logs.length === 0 ? '0' : logs.slice(0,5));

  // 1. 大纲工作台
  log('--', '=== 1. 大纲工作台 ===');
  let r1 = await click('#btn-outline-workspace');
  await new Promise(r => setTimeout(r, 800));
  let ow = await isVis('#outline-workspace');
  log('ow_visible', ow);
  if (typeof ow === 'object' && ow.ok) {
    let owBtns = await btns('#outline-workspace');
    log('ow_buttons', owBtns);
    let hidden = Array.isArray(owBtns) ? owBtns.filter(b => b.w === 0 || b.h === 0) : [];
    if (hidden.length) log('ow_hidden_buttons', hidden.map(b => b.id + ':' + b.t));
  }
  await click('#btn-close-outline-workspace');
  await new Promise(r => setTimeout(r, 500));

  // 2. 设定合集
  log('--', '=== 2. 设定合集 ===');
  let r2 = await click('#btn-settings-collection');
  await new Promise(r => setTimeout(r, 800));
  let sc = await isVis('#settings-collection-panel');
  log('sc_visible', sc);
  if (typeof sc === 'object' && sc.ok) {
    let scBtns = await btns('#settings-collection-panel');
    log('sc_buttons', scBtns);
  }
  await click('#btn-close-sc');
  await new Promise(r => setTimeout(r, 500));

  // 3. 生成流水线
  log('--', '=== 3. 生成流水线 ===');
  let r3 = await click('#btn-pipeline');
  await new Promise(r => setTimeout(r, 800));
  let pl = await isVis('.pl-overlay');
  log('pl_visible', pl);
  if (typeof pl === 'object' && pl.ok) {
    let plBtns = await btns('.pl-overlay');
    log('pl_buttons_total', Array.isArray(plBtns) ? plBtns.length : plBtns);
    // Group by visibility
    if (Array.isArray(plBtns)) {
      let visible = plBtns.filter(b => b.w > 0 && b.h > 0);
      let hidden = plBtns.filter(b => b.w === 0 || b.h === 0);
      log('pl_visible_buttons', visible.length);
      log('pl_hidden_buttons', hidden.length + ' (' + hidden.map(b => b.id || b.t).slice(0,8).join(', ') + '...)');

      // Try clicking step tabs
      let stepTabs = plBtns.filter(b => b.t.includes('层') || b.t.includes('Step') || b.t.includes('步骤'));
      log('pl_step_tabs', stepTabs.length > 0 ? stepTabs : 'no step tabs found');

      // Try clicking a step 2 button
      let s2Btn = await ev('(function(){ let el=document.querySelector(\".pl-overlay\"); if(!el)return\"NO_PANEL\"; let btns=el.querySelectorAll(\"button\"); for(let b of btns) { if(b.textContent.includes(\"设定层\")) { b.click(); return \"CLICKED_S2\"; } } return \"NO_S2_BTN\"; })()');
      log('pl_click_step2', s2Btn);
      await new Promise(r => setTimeout(r, 500));
      // Check if step 2 buttons became visible
      let s2check = await btns('.pl-overlay');
      if (Array.isArray(s2check)) {
        let s2visible = s2check.filter(b => b.w > 0 && b.h > 0 && (b.t.includes('新增') || b.t.includes('生成') || b.t.includes('保存')));
        log('pl_s2_visible_after_click', s2visible.length > 0 ? s2visible.map(b => b.t) : 'still hidden');
      }
    }
  }
  await click('#btn-close-pl');
  await new Promise(r => setTimeout(r, 500));

  // 4. 项目弹窗
  log('--', '=== 4. 项目弹窗 ===');
  let r4 = await click('#btn-open-project');
  await new Promise(r => setTimeout(r, 800));
  let pm = await isVis('.project-modal-content');
  log('pm_visible', pm);
  if (typeof pm === 'object' && pm.ok) {
    let pmBtns = await btns('.project-modal-content');
    log('pm_buttons', pmBtns);
    // Click new project button
    let newBtn = await ev('(function(){ let el=document.querySelector(\".project-modal-content\"); if(!el)return\"NO_MODAL\"; let btns=el.querySelectorAll(\"button\"); for(let b of btns) { if(b.textContent.includes(\"新建\")) { b.click(); return \"CLICKED_NEW\"; } } return \"NO_NEW_BTN\"; })()');
    log('pm_click_new', newBtn);
    await new Promise(r => setTimeout(r, 500));
    // Check if form appeared
    let form = await ev('document.querySelector(\".new-project-form\") ? {ok:true,w:Math.round(document.querySelector(\".new-project-form\").getBoundingClientRect().width)} : \"NOT_FOUND\"');
    log('pm_new_form', form);
  }
  // Close project modal
  await ev('(function(){ let el=document.querySelector(\".modal-overlay:not(.modal-hidden)\"); if(el)el.click(); })()');
  await new Promise(r => setTimeout(r, 500));

  // 5. 设置面板
  log('--', '=== 5. 设置面板 ===');
  let r5 = await click('#btn-settings');
  await new Promise(r => setTimeout(r, 800));
  let sm = await isVis('.modal-content.modal-lg');
  log('sm_visible', sm);
  if (typeof sm === 'object' && sm.ok) {
    let smTabs = await ev('(function(){ let el=document.querySelector(\".settings-tabs\"); if(!el)return\"NO_TABS\"; return Array.from(el.querySelectorAll(\"button\")).map(b=>({id:b.id,t:b.textContent.trim().slice(0,20),d:window.getComputedStyle(b).display})); })()');
    log('sm_tabs', smTabs);
    // Click each tab and verify the panel changes
    for (let tab of ['skill', 'agent', 'appearance', 'deai', 'diag']) {
      let c = await click('#tab-' + tab);
      await new Promise(r => setTimeout(r, 300));
      if (c === 'CLICKED') log('sm_tab_clicked_' + tab, 'OK');
    }
  }
  await click('#btn-close-settings');
  await new Promise(r => setTimeout(r, 500));

  // 6. 聊天面板按钮
  log('--', '=== 6. 聊天面板 ===');
  let chatBtns = await btns('.chat-panel');
  log('chat_buttons', chatBtns);

  // 7. 章节树
  log('--', '=== 7. 章节树 ===');
  log('ct_header', await ev('document.querySelector(\".tree-header\") ? \"OK\" : \"NOT_FOUND\"'));
  log('ct_project_btn', await ev('document.getElementById(\"btn-open-project\") ? \"OK\" : \"NOT_FOUND\"'));
  log('ct_gen_btn', await ev('document.getElementById(\"btn-tree-gen\") ? \"OK\" : \"NOT_FOUND\"'));

  // 8. IPC
  log('--', '=== 8. IPC 接口 ===');
  log('electronAPI', await ev('window.electronAPI ? Object.keys(window.electronAPI).length + \" methods\" : \"NO_API\"'));
  log('pinia_stores', await ev('__pinia ? Object.keys(__pinia.state.value).join(\", \") : \"NO_PINIA\"'));

  // 9. Console errors accumulated
  log('total_console_errors', logs.length === 0 ? '0' : logs.slice(0,10));

  // 10. Final screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    fs.writeFileSync('_audit/regression_sequential.png', Buffer.from(shot.result.data, 'base64'));
    log('screenshot', Math.round(shot.result.data.length / 1024) + 'KB');
  }

  fs.writeFileSync('_audit/regression_sequential.json', JSON.stringify(results, null, 2));
  console.log('\\nDone. Report saved.');
  ws.close();
}
main().catch(e => console.log('FATAL: ' + e.message));
