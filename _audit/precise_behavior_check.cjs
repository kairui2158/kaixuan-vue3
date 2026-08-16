const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}});
  }).on('error', reject);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const pages = await fetchJSON('http://127.0.0.1:9227/json');
  if (!pages.length) { console.log('NO_PAGES'); process.exit(1); }
  const page = pages.find(p => p.title && p.title.includes('神意')) || pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
  let msgId = 1;
  function send(method, params) {
    const id = msgId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'timeout' }), 12000);
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
  await sleep(800);

  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.error) return { _evalError: r.error };
    if (r.result && r.result.exceptionDetails) {
      return { _exception: (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text };
    }
    return r.result && r.result.result ? r.result.result.value : null;
  }
  async function shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result && r.result.data) {
      const p = path.join(__dirname, 'shots_b11', name + '.png');
      fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'));
      return name + ' ' + Buffer.from(r.result.data, 'base64').length;
    }
    return 'FAIL';
  }

  const items = [];
  function rec(id, title, actual, pass) {
    items.push({ id, title, actual, pass: !!pass });
    console.log((pass ? 'PASS' : 'FAIL') + ' ' + id + ' ' + title);
  }

  rec('T01', 'document.title', await ev('document.title'), (await ev('document.title')) === '神意助手');
  const headerTitle = await ev('(function(){ var el=document.querySelector(".app-title"); return el?el.textContent.trim():null; })()');
  rec('T02', '页眉品牌名应为神意助手', headerTitle, headerTitle === '神意助手');

  // close any open overlay first
  await ev(`(function(){
    if (window.__getActivePanel) {
      // cannot set from outside easily
    }
    var closes = document.querySelectorAll('.modal-close, #btn-close-pl, #btn-close-sc');
    closes.forEach(function(b){ try{b.click()}catch(e){} });
    return true;
  })()`);
  await sleep(300);

  // SETTINGS COLLECTION via exact sidebar id
  const scClick = await ev(`(function(){
    var btn = document.getElementById('btn-settings-collection');
    if (!btn) return {ok:false, reason:'NO_BTN'};
    btn.click();
    return {ok:true};
  })()`);
  await sleep(500);
  const scState = await ev(`(function(){
    var el = document.getElementById('settings-collection-panel');
    if (!el) return {found:false, active: window.__getActivePanel ? window.__getActivePanel() : null};
    var r = el.getBoundingClientRect();
    var cs = window.getComputedStyle(el);
    var addCat = document.getElementById('btn-add-category');
    var addItem = document.getElementById('btn-add-item');
    var aiGen = document.getElementById('btn-ai-gen-item');
    return {
      found:true,
      display:cs.display,
      w:Math.round(r.width),
      h:Math.round(r.height),
      addCat:!!addCat,
      addItem:!!addItem,
      aiGen:!!aiGen,
      active: window.__getActivePanel ? window.__getActivePanel() : null
    };
  })()`);
  rec('C01', '设定合集面板打开', scState, !!(scState && scState.found && scState.w>100 && scState.h>80));
  await shot('p_sc_open');

  if (scState && scState.addCat) {
    await ev('document.getElementById("btn-add-category").click()');
    await sleep(250);
    const catBox = await ev(`(function(){
      var box = document.querySelector('.sc-inline-input-box');
      if (!box) return {found:false};
      var r = box.getBoundingClientRect();
      var confirm = Array.from(box.querySelectorAll('button')).find(b => /确认/.test(b.textContent||''));
      return {found:true, w:Math.round(r.width), h:Math.round(r.height), hasConfirm:!!confirm};
    })()`);
    rec('C02', '设定合集新建分类弹出输入框', catBox, !!(catBox && catBox.found && catBox.hasConfirm));
    await ev(`(function(){ var c=Array.from(document.querySelectorAll('.sc-inline-input-box button')).find(b=>/取消/.test(b.textContent||'')); if(c)c.click(); return true; })()`);
    await sleep(200);
  } else {
    rec('C02', '设定合集新建分类弹出输入框', scState, false);
  }

  await ev(`(function(){ var b=document.getElementById('btn-close-sc'); if(b)b.click(); return true; })()`);
  await sleep(300);

  // PIPELINE via exact id
  const plClick = await ev(`(function(){
    var btn=document.getElementById('btn-pipeline');
    if(!btn) return {ok:false};
    btn.click();
    return {ok:true};
  })()`);
  await sleep(600);
  const plOpen = await ev(`(function(){
    var el=document.getElementById('pipeline-panel');
    if(!el) return {found:false};
    var r=el.getBoundingClientRect();
    return {found:true, w:Math.round(r.width), h:Math.round(r.height), step: (function(){
      try {
        var app=document.querySelector('#app').__vue_app__;
        return app.config.globalProperties.$pinia.state.value.pipeline.currentStep;
      } catch(e) { return 'NA'; }
    })()};
  })()`);
  rec('P01', '生成流水线打开', plOpen, !!(plOpen && plOpen.found && plOpen.w>200));
  await shot('p_pl_open');

  // Switch steps via store, not fuzzy text
  const layerResults = [];
  for (let i = 0; i < 5; i++) {
    const switched = await ev(`(function(){
      try {
        var app=document.querySelector('#app').__vue_app__;
        var pinia=app.config.globalProperties.$pinia;
        var stores = pinia._s || pinia._s;
        var pipe = null;
        if (pinia._s && pinia._s.get) pipe = pinia._s.get('pipeline');
        if (!pipe && window.__pinia) {}
        // fallback: click exact step child
        var steps = document.querySelectorAll('#pl-steps .pl-step');
        if (steps[${i}]) steps[${i}].click();
        return {clicked:!!steps[${i}], count:steps.length};
      } catch(e) { return {error:String(e)}; }
    })()`);
    await sleep(250);
    const detail = await ev(`(function(){
      var ids = [
        ['pl-outline','btn-pl-confirm-outline'],
        ['btn-pl-gen-settings','btn-pl-save-settings','btn-pl-confirm-settings'],
        ['btn-pl-gen-volumes','btn-pl-gen-single-volume','btn-pl-create-volumes','btn-pl-continue-volumes','btn-pl-confirm-volumes'],
        ['btn-pl-gen-chapters','btn-pl-autogen-chapters','btn-pl-confirm-chapters'],
        ['btn-pl-gen-body','btn-pl-insert-body','btn-pl-confirm-body']
      ][${i}];
      var panel = document.getElementById('pl-step-'+(${i}+1)+'-content');
      var cs = panel ? window.getComputedStyle(panel) : null;
      var buttons = {};
      ids.forEach(function(id){
        var el=document.getElementById(id);
        if(!el){ buttons[id]=null; return; }
        var r=el.getBoundingClientRect();
        buttons[id]={disabled:el.disabled, w:Math.round(r.width), h:Math.round(r.height), display:window.getComputedStyle(el).display};
      });
      var addSetting = null;
      if (${i}===1) {
        var b = Array.from(document.querySelectorAll('#pl-step-2-content button')).find(x => /新增设定/.test(x.textContent||''));
        if (b) {
          var r=b.getBoundingClientRect();
          addSetting={w:Math.round(r.width),h:Math.round(r.height),disabled:b.disabled};
        }
      }
      var step = null;
      try { step = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.pipeline.currentStep; } catch(e) {}
      return {step:step, panelDisplay: cs?cs.display:null, panelVis: cs?cs.visibility:null, buttons:buttons, addSetting:addSetting, switch: ${JSON.stringify(switched).replace(/"/g, '\\"')} };
    })()`);
    layerResults.push(detail);
    const visibleBtn = detail && detail.buttons && Object.values(detail.buttons).some(v => v && v.w > 8);
    rec('P1' + i, '流水线第' + (i+1) + '层控件可见', detail, !!(detail && detail.panelDisplay !== 'none' && visibleBtn));
    await shot('p_layer_' + (i+1));
  }

  // add setting on layer 2
  await ev(`(function(){ var steps=document.querySelectorAll('#pl-steps .pl-step'); if(steps[1]) steps[1].click(); return true; })()`);
  await sleep(250);
  const addClick = await ev(`(function(){
    var b=Array.from(document.querySelectorAll('#pl-step-2-content button')).find(x=>/新增设定/.test(x.textContent||''));
    if(!b) return {ok:false, reason:'NO_BTN'};
    b.click();
    return {ok:true, w:Math.round(b.getBoundingClientRect().width)};
  })()`);
  await sleep(300);
  const addModal = await ev(`(function(){
    var el=document.querySelector('.pl-add-setting-overlay, .pl-add-setting-modal');
    if(!el) return {found:false};
    var r=el.getBoundingClientRect();
    var save=Array.from(document.querySelectorAll('.pl-add-setting-footer button, .pl-add-setting-modal button')).find(b=>/保存/.test(b.textContent||''));
    return {found:true, w:Math.round(r.width), h:Math.round(r.height), hasSave:!!save, saveDisabled:save?save.disabled:null};
  })()`);
  rec('P20', '新增设定弹窗+保存按钮', {addClick, addModal}, !!(addClick && addClick.ok && addModal && addModal.found && addModal.hasSave));
  await shot('p_add_setting');
  await ev(`(function(){ var c=Array.from(document.querySelectorAll('.pl-add-setting-modal button')).find(b=>/取消/.test(b.textContent||'')); if(c)c.click(); return true; })()`);
  await sleep(200);

  // volume / body button ids after forcing step
  await ev(`(function(){ var steps=document.querySelectorAll('#pl-steps .pl-step'); if(steps[2]) steps[2].click(); return true; })()`);
  await sleep(200);
  const volIds = await ev(`(function(){
    return ['btn-pl-gen-volumes','btn-pl-gen-single-volume','btn-pl-create-volumes','btn-pl-continue-volumes','btn-pl-confirm-volumes'].map(function(id){
      var el=document.getElementById(id); if(!el) return {id:id,found:false};
      var r=el.getBoundingClientRect();
      return {id:id, found:true, disabled:el.disabled, w:Math.round(r.width), h:Math.round(r.height)};
    });
  })()`);
  rec('P21', '卷纲层5按钮按ID可见', volIds, Array.isArray(volIds) && volIds.filter(v=>v.found && v.w>8).length>=4);

  await ev(`(function(){ var steps=document.querySelectorAll('#pl-steps .pl-step'); if(steps[4]) steps[4].click(); return true; })()`);
  await sleep(200);
  const bodyIds = await ev(`(function(){
    return ['btn-pl-gen-body','btn-pl-insert-body','btn-pl-confirm-body'].map(function(id){
      var el=document.getElementById(id); if(!el) return {id:id,found:false};
      var r=el.getBoundingClientRect();
      return {id:id, found:true, disabled:el.disabled, w:Math.round(r.width), h:Math.round(r.height), text:(el.textContent||'').trim()};
    });
  })()`);
  rec('P22', '正文层3按钮按ID可见', bodyIds, Array.isArray(bodyIds) && bodyIds.filter(v=>v.found && v.w>8).length>=3);

  await ev(`(function(){ var b=document.getElementById('btn-close-pl'); if(b)b.click(); return true; })()`);
  await sleep(300);

  // CHAPTER TREE / PROJECT
  const tree = await ev(`(function(){
    var tree=document.querySelector('.chapter-tree, #chapter-tree');
    var projectBtn=document.getElementById('btn-project') || document.querySelector('[data-tooltip*="项目"]');
    var btns = tree ? Array.from(tree.querySelectorAll('button')).map(b=>({id:b.id,title:b.title||b.getAttribute('data-tooltip')||'',text:(b.textContent||'').trim().slice(0,12)})) : [];
    return {tree:!!tree, projectBtn:!!projectBtn, buttons:btns.slice(0,12)};
  })()`);
  rec('S01', '章节树存在', tree, !!(tree && tree.tree));

  const proj = await ev(`(function(){
    var btn=document.getElementById('btn-project');
    if(!btn && tree) {}
    if(!btn){
      btn=Array.from(document.querySelectorAll('.chapter-tree button, .tree-header button')).find(b=>/项目/.test(b.title||b.getAttribute('data-tooltip')||b.textContent||''));
    }
    if(!btn) return {opened:false, reason:'NO_BTN'};
    btn.click();
    return {opened:true, id:btn.id};
  })()`);
  await sleep(400);
  const projModal = await ev(`(function(){
    var el=document.querySelector('.project-modal, #project-modal, [class*="ProjectModal"]');
    var overlays=Array.from(document.querySelectorAll('.modal-overlay')).filter(o=>{
      var r=o.getBoundingClientRect(); return r.width>80 && r.height>80;
    }).map(o=>({cls:o.className.toString().slice(0,50), text:(o.textContent||'').trim().slice(0,30), w:Math.round(o.getBoundingClientRect().width)}));
    return {el:!!el, overlays:overlays.slice(0,5)};
  })()`);
  rec('S02', '项目弹窗', {proj, projModal}, !!(projModal && (projModal.el || (projModal.overlays&&projModal.overlays.length))));
  await ev(`(function(){ var x=document.querySelector('.modal-close'); if(x)x.click(); return true; })()`);
  await sleep(250);

  // CHAT insert/replace existence in source-rendered empty state is expected hidden.
  // Inject one assistant message through pinia if possible.
  const chatInject = await ev(`(function(){
    try {
      var app=document.querySelector('#app').__vue_app__;
      var pinia=app.config.globalProperties.$pinia;
      var store = pinia._s.get('chat');
      if (!store) return {ok:false, reason:'NO_CHAT_STORE', keys: Array.from(pinia._s.keys())};
      var before = (store.messages && store.messages.length) || (store.history && store.history.length) || 0;
      if (store.messages && Array.isArray(store.messages)) {
        store.messages.push({ id:'reg-1', role:'assistant', content:'回归测试回复内容', ts:Date.now() });
      } else if (typeof store.addMessage === 'function') {
        store.addMessage({ role:'assistant', content:'回归测试回复内容' });
      } else {
        return {ok:false, reason:'NO_ADD', keys:Object.keys(store)};
      }
      return {ok:true, before:before, keys:Object.keys(store)};
    } catch(e) { return {ok:false, error:String(e)}; }
  })()`);
  await sleep(300);
  const chatBtns = await ev(`(function(){
    var btns=Array.from(document.querySelectorAll('.chat-panel button, #chat-panel button, button')).filter(b=>/复制|重生成|插入|替换/.test((b.textContent||'').trim()));
    return btns.map(b=>({id:b.id, text:(b.textContent||'').trim(), w:Math.round(b.getBoundingClientRect().width)}));
  })()`);
  rec('H10', '注入助手消息后出现复制/插入/替换', {chatInject, chatBtns}, Array.isArray(chatBtns) && chatBtns.some(b=>/插入/.test(b.text)) && chatBtns.some(b=>/替换/.test(b.text)));

  const leftover = await ev(`(function(){
    var overlays=Array.from(document.querySelectorAll('.modal-overlay,.pl-overlay,.sc-overlay')).filter(el=>{
      var r=el.getBoundingClientRect(); var cs=window.getComputedStyle(el);
      return r.width>80 && r.height>80 && cs.display!=='none' && parseFloat(cs.opacity||'1')>0.05;
    }).map(el=>({id:el.id, cls:el.className.toString().slice(0,40)}));
    return overlays;
  })()`);
  rec('Z01', '无残留大遮罩', leftover, Array.isArray(leftover) && leftover.length===0);

  const skillBind = await ev(`(function(){
    var el=document.querySelector('.skill-bind-modal, #skill-bind-modal, [class*="SkillBind"]');
    if(!el) return {visible:false};
    var r=el.getBoundingClientRect();
    var cs=window.getComputedStyle(el);
    return {visible: r.width>50 && r.height>50 && cs.display!=='none', w:Math.round(r.width), h:Math.round(r.height)};
  })()`);
  rec('Z02', 'Skill绑定弹窗未自动弹出', skillBind, !(skillBind && skillBind.visible));

  const report = {
    startedAt: new Date().toISOString(),
    pass: items.filter(i=>i.pass).length,
    fail: items.filter(i=>i.pass===false).length,
    items
  };
  fs.writeFileSync(path.join(__dirname, 'regression_precise.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('SUMMARY PASS=' + report.pass + ' FAIL=' + report.fail);
  items.filter(i=>!i.pass).forEach(i => console.log('ISSUE ' + i.id + ' ' + i.title + ' ' + JSON.stringify(i.actual).slice(0,240)));
  ws.close();
}
main().catch(e => { console.error(e); process.exit(1); });

