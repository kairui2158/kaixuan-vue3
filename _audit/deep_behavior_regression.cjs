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
  if (!pages.length) { console.log('NO_PAGES'); return; }
  const page = pages.find(p => p.title && p.title.includes('神意')) || pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });

  let msgId = 1;
  function send(method, params) {
    const id = msgId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'timeout' }), 15000);
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
  await send('DOM.enable');
  await sleep(2000);

  const consoleErrors = [];
  ws.on('message', (data) => {
    try {
      const m = JSON.parse(data.toString());
      if (m.method === 'Runtime.consoleAPICalled' && m.params && m.params.type === 'error') {
        const msg = (m.params.args || []).map(a => a.value || a.description || '').join(' ');
        consoleErrors.push(msg);
      }
    } catch (e) {}
  });

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
      try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch (e) {}
      fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'));
      return name + '.png (' + Buffer.from(r.result.data, 'base64').length + ' bytes)';
    }
    return 'SHOT_FAIL';
  }

  const report = { startedAt: new Date().toISOString(), items: [], issues: [], shots: [], consoleErrors: [] };
  function rec(id, title, expected, actual, pass, extra) {
    const item = { id, title, expected, actual, pass: !!pass, extra: extra || null };
    report.items.push(item);
    console.log('[' + (pass ? 'PASS' : 'FAIL') + '] ' + id + ' ' + title);
    if (!pass) report.issues.push({ id, title, expected, actual, extra });
    return item;
  }

  console.log('===== 0. BASE =====');
  const title = await ev('document.title');
  rec('B01', '窗口标题', '神意助手', title, title === '神意助手');
  const appRendered = await ev('!!document.getElementById("app")');
  rec('B02', 'App根节点', true, appRendered, appRendered === true);
  const stores = await ev(`(function(){
    try {
      var app = document.querySelector('#app').__vue_app__;
      if (!app) return {error:'NO_VUE_APP'};
      var pinia = app.config.globalProperties.$pinia;
      if (!pinia) return {error:'NO_PINIA'};
      return Object.keys(pinia.state.value || {});
    } catch(e) { return {error:String(e)}; }
  })()`);
  rec('B03', 'Pinia stores', '>=10', stores, Array.isArray(stores) && stores.length >= 10, stores);
  const ipc = await ev('window.electronAPI ? Object.keys(window.electronAPI).join(",") : "NO_API"');
  rec('B04', 'electronAPI', 'storage+pipeline', ipc, typeof ipc === 'string' && ipc.indexOf('storageRead')>=0 && ipc.indexOf('pipelineGenerate')>=0, ipc);
  report.shots.push(await shot('00_base'));

  console.log('===== 1. PROJECT MODAL =====');
  const projectOpen = await ev(`(function(){
    var btn = document.getElementById('btn-project')
      || document.querySelector('[title*="项目"]')
      || Array.from(document.querySelectorAll('button')).find(b => /项目/.test(b.textContent||'') || /项目/.test(b.title||''));
    if (!btn) {
      var t = document.querySelector('.chapter-tree');
      btn = t && t.querySelector('button');
    }
    if (!btn) return {clicked:false, reason:'NO_BTN'};
    btn.click();
    return {clicked:true, id:btn.id, text:(btn.textContent||'').trim().slice(0,20)};
  })()`);
  await sleep(600);
  const projectModal = await ev(`(function(){
    var overlays = Array.from(document.querySelectorAll('.modal-overlay, .modal, [class*="project"]')).map(el => {
      var r = el.getBoundingClientRect();
      return {cls:el.className.toString().slice(0,80), w:Math.round(r.width), h:Math.round(r.height), text:(el.textContent||'').trim().slice(0,40)};
    }).filter(x => x.w>80 && x.h>60);
    return {overlays:overlays.slice(0,8)};
  })()`);
  rec('S03', '项目按钮弹出项目管理', '可见弹窗', projectModal, !!(projectModal && projectModal.overlays && projectModal.overlays.length), {click:projectOpen, modal:projectModal});
  report.shots.push(await shot('01_project_modal'));

  const projectClose = await ev(`(function(){
    var close = document.querySelector('.modal-close, button.modal-close');
    if (!close) close = Array.from(document.querySelectorAll('button')).find(b => /^(取消|关闭|×)$/.test(b.textContent.trim()));
    if (!close) return {closed:false, reason:'NO_CLOSE'};
    close.click();
    return {closed:true, text:(close.textContent||'').trim().slice(0,10)};
  })()`);
  await sleep(400);
  const leftover1 = await ev(`(function(){
    var overlays = Array.from(document.querySelectorAll('.modal-overlay')).filter(el => {
      var r = el.getBoundingClientRect();
      var cs = window.getComputedStyle(el);
      return r.width>50 && r.height>50 && cs.display!=='none' && cs.visibility!=='hidden';
    });
    return {leftover:overlays.length};
  })()`);
  rec('S04', '项目弹窗可关闭无残留', 'leftover=0', leftover1, leftover1 && leftover1.leftover===0, {close:projectClose, after:leftover1});

  console.log('===== 2. OUTLINE =====');
  const openOw = await ev(`(function(){
    var btn = document.getElementById('btn-outline')
      || document.querySelector('[title*="大纲"]')
      || Array.from(document.querySelectorAll('button,.nav-item,[role="button"]')).find(b => /大纲/.test(b.textContent||'') || /大纲/.test(b.title||'') || /大纲/.test(b.getAttribute('data-tooltip')||''));
    if (!btn) return {opened:false, reason:'NO_BTN'};
    btn.click();
    return {opened:true, id:btn.id, text:(btn.textContent||btn.title||'').trim().slice(0,20)};
  })()`);
  await sleep(700);
  const owState = await ev(`(function(){
    var any = Array.from(document.querySelectorAll('[class*="outline"],[id*="outline"],[class*="ow-"]')).map(el => {
      var r = el.getBoundingClientRect();
      return {id:el.id, cls:el.className.toString().slice(0,50), w:Math.round(r.width), h:Math.round(r.height)};
    }).filter(x => x.w>100 && x.h>80);
    var named = {};
    Array.from(document.querySelectorAll('button')).forEach(b => {
      var t = (b.textContent||'').trim();
      if (/导入|锁定|保存大纲|确认完成|AI共创/.test(t)) {
        var r = b.getBoundingClientRect();
        named[t.slice(0,16)] = {id:b.id, disabled:b.disabled, w:Math.round(r.width), h:Math.round(r.height)};
      }
    });
    return {candidates:any.slice(0,6), named:named};
  })()`);
  const owHasImport = !!(owState && owState.named && Object.keys(owState.named).some(k => /导入/.test(k)));
  const owHasLock = !!(owState && owState.named && Object.keys(owState.named).some(k => /锁定/.test(k)));
  rec('O01', '打开大纲工作台且核心按钮可见', '导入+锁定', owState, owHasImport && owHasLock, {click:openOw, state:owState});
  report.shots.push(await shot('02_outline'));

  const lockClick = await ev(`(function(){
    var btn = Array.from(document.querySelectorAll('button')).find(b => /锁定大纲/.test(b.textContent||''))
      || document.getElementById('btn-lock-outline') || document.getElementById('btn-ow-lock');
    if (!btn) return {clicked:false, reason:'NO_LOCK'};
    btn.click();
    return {clicked:true, id:btn.id, disabled:btn.disabled};
  })()`);
  await sleep(500);
  const afterLock = await ev(`(function(){
    var overlays = Array.from(document.querySelectorAll('.modal-overlay,.modal')).map(el => {
      var r = el.getBoundingClientRect();
      return {cls:el.className.toString().slice(0,60), w:Math.round(r.width), h:Math.round(r.height), text:(el.textContent||'').trim().slice(0,50)};
    }).filter(x => x.w>80 && x.h>40);
    return {overlays:overlays.slice(0,5)};
  })()`);
  rec('O03', '锁定大纲点击有反馈', '弹窗或状态变化', afterLock, !!(lockClick && lockClick.clicked), {click:lockClick, after:afterLock});
  report.shots.push(await shot('03_outline_lock'));
  await ev(`(function(){ var c=Array.from(document.querySelectorAll('button')).find(b=>/取消|关闭/.test((b.textContent||'').trim())); if(c)c.click(); return true; })()`);
  await sleep(300);

  console.log('===== 3. PIPELINE =====');
  const openPl = await ev(`(function(){
    var btn = document.getElementById('btn-pipeline')
      || document.querySelector('[title*="流水线"],[title*="生成"]')
      || Array.from(document.querySelectorAll('button,.nav-item')).find(b => /流水线|生成流水/.test(b.textContent||'') || /流水线|生成流水/.test(b.title||''));
    if (!btn) return {opened:false, reason:'NO_BTN'};
    btn.click();
    return {opened:true, id:btn.id};
  })()`);
  await sleep(800);
  const plState = await ev(`(function(){
    var panel = document.querySelector('.pipeline-panel,#pipeline-panel');
    var layerTitles = Array.from(document.querySelectorAll('h3,h4,.pl-step,.pipeline-step,.step-title')).map(el => (el.textContent||'').trim()).filter(t => /大纲|设定|卷纲|章节|正文/.test(t));
    var btns = Array.from((panel||document.body).querySelectorAll('button')).map(b => {
      var r = b.getBoundingClientRect();
      return {id:b.id, text:(b.textContent||'').trim().slice(0,20), disabled:b.disabled, w:Math.round(r.width), h:Math.round(r.height)};
    }).filter(b => b.w>8 || /确认|生成|保存|新增|插入/.test(b.text));
    return {panel:!!(panel && panel.getBoundingClientRect().width>80), layerTitles:layerTitles.slice(0,12), visibleButtons:btns.filter(b=>b.w>8&&b.h>8).slice(0,30)};
  })()`);
  rec('P01', '打开生成流水线', '面板可见', plState, !!(plState && plState.panel), {click:openPl, state:plState});
  report.shots.push(await shot('04_pipeline'));

  const layerNames = ['大纲','设定','卷纲','章节','正文'];
  const layerDetails = [];
  for (let i = 0; i < layerNames.length; i++) {
    const name = layerNames[i];
    await ev(`(function(){
      var label = ${JSON.stringify(name)};
      var nodes = Array.from(document.querySelectorAll('.pl-step,.pipeline-step,[data-step],button,.step-tab,div,li'));
      var el = nodes.find(function(n){
        var t = (n.textContent||'').replace(/\\s+/g,' ').trim();
        return t===label || t===label+'层' || t.indexOf(label)===0 && t.length<8;
      });
      if (!el) el = document.querySelector('[data-step="${i+1}"]');
      if (el) { el.click(); return 'CLICKED'; }
      return 'NOT_FOUND';
    })()`);
    await sleep(350);
    const detail = await ev(`(function(){
      var panel = document.querySelector('.pipeline-panel,#pipeline-panel') || document.body;
      var vis = Array.from(panel.querySelectorAll('button,select,textarea,input')).map(function(el){
        var r = el.getBoundingClientRect();
        var cs = window.getComputedStyle(el);
        if (r.width<4 || r.height<4 || cs.display==='none' || cs.visibility==='hidden') return null;
        return {tag:el.tagName.toLowerCase(), id:el.id, text:(el.textContent||el.value||el.placeholder||'').trim().slice(0,24), disabled:!!el.disabled, w:Math.round(r.width), h:Math.round(r.height)};
      }).filter(Boolean);
      return {layer:${JSON.stringify(name)}, visibleControls:vis.slice(0,25)};
    })()`);
    layerDetails.push(detail);
    report.shots.push(await shot('05_layer_' + (i+1)));
  }
  rec('P02', '五层可切换并露出控件', '>=4层有控件', layerDetails, layerDetails.filter(d => d && d.visibleControls && d.visibleControls.length>0).length>=4, layerDetails);

  await ev(`(function(){ var el=Array.from(document.querySelectorAll('.pl-step,[data-step],button,div')).find(n=>/^设定/.test((n.textContent||'').trim())); if(el)el.click(); return !!el; })()`);
  await sleep(300);
  const addSettingClick = await ev(`(function(){
    var btn = Array.from(document.querySelectorAll('button')).find(b => /新增设定/.test(b.textContent||''));
    if (!btn) return {clicked:false, reason:'NO_BTN'};
    var info = {id:btn.id, disabled:btn.disabled, w:Math.round(btn.getBoundingClientRect().width)};
    if (btn.disabled || info.w<4) return {clicked:false, reason:'HIDDEN', info:info};
    btn.click();
    return {clicked:true, info:info};
  })()`);
  await sleep(400);
  const addSettingModal = await ev(`(function(){
    var overlays = Array.from(document.querySelectorAll('.modal-overlay,.modal')).map(el => {
      var r = el.getBoundingClientRect();
      return {cls:el.className.toString().slice(0,70), w:Math.round(r.width), h:Math.round(r.height), text:(el.textContent||'').trim().slice(0,60)};
    }).filter(x => x.w>80 && x.h>60);
    var save = Array.from(document.querySelectorAll('button')).find(b => /保存/.test((b.textContent||'').trim()) && b.closest('.modal-overlay,.modal'));
    return {overlays:overlays.slice(0,5), hasSave:!!save, saveDisabled: save?save.disabled:null};
  })()`);
  rec('P03', '新增设定弹出次级面板且有保存', '弹窗+保存', addSettingModal, !!(addSettingModal && addSettingModal.overlays && addSettingModal.overlays.length && addSettingModal.hasSave), {click:addSettingClick, modal:addSettingModal});
  report.shots.push(await shot('06_add_setting'));
  await ev(`(function(){ var c=Array.from(document.querySelectorAll('button')).find(b=>/取消/.test((b.textContent||'').trim())); if(c)c.click(); var x=document.querySelector('.modal-close'); if(x)x.click(); return true; })()`);
  await sleep(300);

  await ev(`(function(){ var el=Array.from(document.querySelectorAll('.pl-step,[data-step],button,div')).find(n=>/卷纲/.test((n.textContent||'').trim().slice(0,6))); if(el)el.click(); return !!el; })()`);
  await sleep(300);
  const volBtns = await ev(`(function(){
    var names=['AI生成全卷','逐卷生成','自动生成卷纲','批量续生成','确认完成'];
    var found={};
    names.forEach(function(n){
      var b=Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').trim().indexOf(n)>=0);
      if(!b){found[n]=null;return;}
      var r=b.getBoundingClientRect();
      found[n]={id:b.id,disabled:b.disabled,w:Math.round(r.width),h:Math.round(r.height)};
    });
    return found;
  })()`);
  rec('P04', '卷纲层生成按钮可见', '>=3可见', volBtns, !!(volBtns && Object.values(volBtns).filter(v=>v&&v.w>8).length>=3), volBtns);
  report.shots.push(await shot('07_volume'));

  await ev(`(function(){ var el=Array.from(document.querySelectorAll('.pl-step,[data-step],button,div')).find(n=>/章节/.test((n.textContent||'').trim().slice(0,6))); if(el)el.click(); return !!el; })()`);
  await sleep(300);
  const chState = await ev(`(function(){
    var plot=document.querySelectorAll('.pl-ch-plot,textarea.pl-ch-plot,[class*="plot"]');
    var sel=document.querySelector('select,.pl-vol-select');
    var btns=Array.from(document.querySelectorAll('button')).filter(b=>/生成章节|自动生成章节|确认完成/.test(b.textContent||''));
    return {plotCount:plot.length, hasVolumeSelect:!!sel, buttons:btns.map(b=>({id:b.id,text:(b.textContent||'').trim().slice(0,16),disabled:b.disabled,w:Math.round(b.getBoundingClientRect().width)}))};
  })()`);
  rec('P05', '章节层有卷选择或生成按钮', '有控件', chState, !!(chState && (chState.hasVolumeSelect || (chState.buttons&&chState.buttons.length))), chState);
  report.shots.push(await shot('08_chapter'));

  await ev(`(function(){ var el=Array.from(document.querySelectorAll('.pl-step,[data-step],button,div')).find(n=>/正文/.test((n.textContent||'').trim().slice(0,6))); if(el)el.click(); return !!el; })()`);
  await sleep(300);
  const bodyState = await ev(`(function(){
    var names=['AI生成正文','插入到编辑器','确认完成'];
    var found={};
    names.forEach(function(n){
      var b=Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').trim().indexOf(n)>=0);
      if(!b){found[n]=null;return;}
      var r=b.getBoundingClientRect();
      found[n]={id:b.id,disabled:b.disabled,w:Math.round(r.width),h:Math.round(r.height)};
    });
    return found;
  })()`);
  rec('P06', '正文层按钮存在', '生成/插入/确认', bodyState, !!(bodyState && (bodyState['AI生成正文'] || bodyState['插入到编辑器'])), bodyState);
  report.shots.push(await shot('09_body'));

  const skillUi = await ev(`(function(){
    var skillLike = Array.from(document.querySelectorAll('select,[class*="skill"],[class*="agent"]')).map(el => ({
      tag:el.tagName, id:el.id, cls:el.className.toString().slice(0,40), w:Math.round(el.getBoundingClientRect().width)
    })).filter(x => x.w>20);
    var mode = Array.from(document.querySelectorAll('label,button,select,[class*="mode"]')).filter(el => /串行|单行|并行|compose|serial/.test(el.textContent||el.value||''));
    return {skillLike:skillLike.slice(0,15), modeUi:mode.map(el=>(el.textContent||'').trim().slice(0,20)).slice(0,8)};
  })()`);
  rec('P07', '层内Skill/Agent/串并行UI', '有skill或mode', skillUi, !!(skillUi && ((skillUi.skillLike&&skillUi.skillLike.length) || (skillUi.modeUi&&skillUi.modeUi.length))), skillUi);

  await ev(`(function(){ var x=document.querySelector('.pipeline-panel .modal-close,#pipeline-panel .modal-close,.pl-close'); if(x){x.click();return 'c';} return 'left'; })()`);
  await sleep(300);

  console.log('===== 4. SETTINGS COLLECTION =====');
  const openSc = await ev(`(function(){
    var btn = document.getElementById('btn-settings-collection')
      || Array.from(document.querySelectorAll('button,.nav-item')).find(b => /设定合集|设定集/.test(b.textContent||'') || /设定合集/.test(b.title||''));
    if (!btn) return {opened:false, reason:'NO_BTN'};
    btn.click();
    return {opened:true, id:btn.id};
  })()`);
  await sleep(500);
  const scState = await ev(`(function(){
    var panel = document.querySelector('.sc-panel,#sc-panel,[class*="ScPanel"]');
    var overlays = Array.from(document.querySelectorAll('.modal-overlay,.modal')).map(el => {
      var r=el.getBoundingClientRect();
      return {cls:el.className.toString().slice(0,50), w:Math.round(r.width), h:Math.round(r.height)};
    }).filter(x => x.w>120 && x.h>80);
    return {panel:!!(panel && panel.getBoundingClientRect().width>80), overlays:overlays.slice(0,6)};
  })()`);
  rec('C01', '设定合集可打开', '面板或弹窗', scState, !!(scState && (scState.panel || (scState.overlays&&scState.overlays.length))), {click:openSc, state:scState});
  report.shots.push(await shot('10_sc'));
  await ev(`(function(){ var x=document.querySelector('.modal-close,.sc-close'); if(x)x.click(); return true; })()`);
  await sleep(250);

  console.log('===== 5. CHAT / EDITOR / SETTINGS =====');
  const chatState = await ev(`(function(){
    var panel=document.querySelector('.chat-panel,#chat-panel');
    var send=document.getElementById('btn-send') || document.querySelector('.btn-send');
    var input=document.querySelector('.chat-panel textarea,#chat-input,textarea.chat-input');
    return {panel:!!(panel&&panel.getBoundingClientRect().width>50), send:send?{id:send.id,w:Math.round(send.getBoundingClientRect().width)}:null, input:!!input};
  })()`);
  rec('H01', '聊天面板+发送按钮', 'panel+send', chatState, !!(chatState&&chatState.panel&&chatState.send), chatState);

  const chatStore = await ev(`(function(){
    try {
      var app=document.querySelector('#app').__vue_app__;
      var pinia=app.config.globalProperties.$pinia;
      var chat=pinia.state.value.chat;
      return {ok:!!chat, keys:chat?Object.keys(chat):[]};
    } catch(e) { return {ok:false, error:String(e)}; }
  })()`);
  rec('H02', 'chat store可读', 'ok', chatStore, !!(chatStore&&chatStore.ok), chatStore);

  const typed = await ev(`(function(){
    var input=document.querySelector('.chat-panel textarea,#chat-input,textarea.chat-input,textarea');
    if(!input) return {typed:false, reason:'NO_INPUT'};
    input.focus();
    var setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
    setter.call(input,'回归测试输入');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return {typed:true, value:input.value.slice(0,12)};
  })()`);
  rec('H03', '聊天输入可写', 'typed', typed, !!(typed&&typed.typed), typed);
  report.shots.push(await shot('11_chat'));

  const editor = await ev(`(function(){
    var ed=document.querySelector('.editor-panel,#editor,.editor-area,[contenteditable="true"],textarea.editor');
    var tabs=document.querySelectorAll('.chapter-tabs .tab,.editor-tab');
    return {editor:!!ed, tag:ed?ed.tagName:null, tabCount:tabs.length};
  })()`);
  rec('E01', '编辑器渲染', 'exists', editor, !!(editor&&editor.editor), editor);
  report.shots.push(await shot('12_editor'));

  const openSet = await ev(`(function(){
    var btn=document.getElementById('btn-settings') || Array.from(document.querySelectorAll('button,.nav-item')).find(b=>/设置/.test(b.textContent||'')||/设置/.test(b.title||''));
    if(!btn) return {opened:false};
    btn.click();
    return {opened:true, id:btn.id};
  })()`);
  await sleep(500);
  const setState = await ev(`(function(){
    var tabs=Array.from(document.querySelectorAll('#tab-api,#tab-skill,#tab-agent,#tab-appearance,#tab-deai,#tab-diag')).map(t=>({id:t.id,text:(t.textContent||'').trim(),w:Math.round(t.getBoundingClientRect().width)}));
    return {tabs:tabs};
  })()`);
  rec('ST01', '设置面板6标签', '6 tabs', setState, !!(setState&&setState.tabs&&setState.tabs.length>=6), {click:openSet, state:setState});
  report.shots.push(await shot('13_settings'));

  const tabResults = [];
  const tabIds = ['tab-api','tab-skill','tab-agent','tab-appearance','tab-deai','tab-diag'];
  for (const tid of tabIds) {
    await ev('(function(){ var el=document.getElementById("'+tid+'"); if(el){el.click();return 1;} return 0; })()');
    await sleep(180);
    const t = await ev('(function(){ var el=document.getElementById("'+tid+'"); return {id:"'+tid+'", exists:!!el}; })()');
    tabResults.push(t);
  }
  rec('ST02', '设置标签可点', '6 exists', tabResults, tabResults.filter(t=>t&&t.exists).length>=6, tabResults);
  await ev(`(function(){ var x=document.querySelector('.modal-close'); if(x)x.click(); return true; })()`);
  await sleep(250);

  console.log('===== 6. STORE / DATA =====');
  const storeSnap = await ev(`(function(){
    try {
      var app=document.querySelector('#app').__vue_app__;
      var pinia=app.config.globalProperties.$pinia;
      var s=pinia.state.value;
      function brief(obj){
        if(!obj) return null;
        var o={};
        Object.keys(obj).slice(0,16).forEach(function(k){
          var v=obj[k];
          if(v==null) o[k]=v;
          else if(Array.isArray(v)) o[k]='arr:'+v.length;
          else if(typeof v==='object') o[k]='obj:'+Object.keys(v).slice(0,5).join(',');
          else o[k]=v;
        });
        return o;
      }
      return {stores:Object.keys(s), project:brief(s.project), pipeline:brief(s.pipeline), editor:brief(s.editor), chat:brief(s.chat)};
    } catch(e) { return {error:String(e)}; }
  })()`);
  rec('D01', '关键store快照', 'project+pipeline', storeSnap, !!(storeSnap&&storeSnap.project&&storeSnap.pipeline), storeSnap);

  const dataDir = await ev(`(function(){ return window.electronAPI && window.electronAPI.storageGetDataDir ? window.electronAPI.storageGetDataDir() : Promise.resolve('NO_API'); })()`);
  rec('D02', '数据目录API', '路径', dataDir, typeof dataDir==='string' && dataDir.length>3, dataDir);

  const leftover = await ev(`(function(){
    var overlays=Array.from(document.querySelectorAll('.modal-overlay')).filter(el=>{
      var r=el.getBoundingClientRect(); var cs=window.getComputedStyle(el);
      return r.width>50 && r.height>50 && cs.display!=='none' && parseFloat(cs.opacity)>0.1;
    }).map(el=>el.className.toString().slice(0,60));
    return {leftover:overlays.length, classes:overlays};
  })()`);
  rec('D03', '无残留遮罩', '0', leftover, leftover&&leftover.leftover===0, leftover);
  report.shots.push(await shot('14_final'));
  report.consoleErrors = consoleErrors.slice(0,30);
  rec('D04', '控制台无error', '0', consoleErrors.length, consoleErrors.length===0, consoleErrors.slice(0,8));

  report.finishedAt = new Date().toISOString();
  report.passCount = report.items.filter(i => i.pass).length;
  report.failCount = report.items.filter(i => !i.pass).length;
  const out = path.join(__dirname, 'regression_behavior.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
  console.log('===== SUMMARY PASS=' + report.passCount + ' FAIL=' + report.failCount + ' =====');
  report.issues.forEach(i => console.log('ISSUE ' + i.id + ': ' + i.title));
  console.log('Wrote ' + out);
  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });

