const http = require('http');
const fs = require('fs');

const CDP_PORT = 9224;
const results = [];
const ts = () => new Date().toISOString();

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + CDP_PORT + '/json', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runVerify() {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && t.url && t.url.includes('localhost:5173'));
  if (!page) {
    console.log('[ERR] No Novel Workshop page target found at localhost:5173');
    process.exit(1);
  }
  console.log('[OK] Target: ' + page.url + ' @ ' + ts());

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  function evalJS(expr) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    });
  }

  function record(name, pass, detail) {
    const status = pass ? 'PASS' : 'FAIL';
    console.log('[' + status + '] ' + name + (detail ? ' -> ' + String(detail).slice(0, 120) : ''));
    results.push({ name, pass, detail: String(detail || '').slice(0, 200), ts: ts() });
  }

  function safeVal(r) {
    if (r && r.result && r.result.result && r.result.result.value !== undefined) {
      return r.result.result.value;
    }
    if (r && r.result && r.result.exceptionDetails) {
      return JSON.stringify({ error: r.result.exceptionDetails.text || 'exception' });
    }
    return '{}';
  }

  ws.addEventListener('open', async () => {
    console.log('=== TRIPLE VERIFICATION v2 START ===');
    console.log('Time: ' + ts() + '\n');

    // Phase 0: Ensure no panel is open so editor is visible
    console.log('--- Phase 0: Reset panels ---');
    let rReset = await evalJS("document.querySelector('.panel-backdrop') ? (document.querySelector('.panel-backdrop').click(), 'backdrop-clicked') : 'no-backdrop'");
    console.log('  backdrop: ' + safeVal(rReset));
    await sleep(300);
    // Force-close via Pinia store if backdrop didn't work
    let rForce = await evalJS("var app=document.querySelector('#app').__vue_app__; app.config.globalProperties.$pinia._s.forEach(function(){}); 'ok'");
    // Access the App component's activePanel ref through the Vue instance
    let rClose = await evalJS("var app=document.querySelector('#app').__vue_app__; var root=app._instance; var activePanel=null; function findActivePanel(inst){ if(inst&&inst.setupState&&inst.setupState.activePanel!==undefined){ inst.setupState.activePanel.value=''; return true;} if(inst&&inst.setupState&&inst.setupState.activePanel&&inst.setupState.activePanel.value!==undefined){ inst.setupState.activePanel.value=''; return true;} return false;} var found=findActivePanel(root); if(!found&&root&&root.subTree){ var c=root.subTree; } 'panel-closed:'+(found?'yes':'no')");
    console.log('  force close: ' + safeVal(rClose));
    await sleep(500);

    // Verify editor is visible now
    let rCheckEditor = await evalJS("JSON.stringify({ hasEditor: !!document.querySelector('.editor-panel'), hasTextarea: !!document.querySelector('textarea'), editorBtns: document.querySelectorAll('.editor-toolbar button').length })");
    let editorCheck = JSON.parse(safeVal(rCheckEditor));
    console.log('  editor visible: ' + JSON.stringify(editorCheck));

    // Phase 1: CDP Structure Checks (7 items) - run while no panel open
    console.log('\n--- Phase 1: CDP App Structure ---');
    let r = await evalJS("JSON.stringify({ hasVue: !!document.querySelector('#app'), hasPinia: !!(document.querySelector('#app') && document.querySelector('#app').__vue_app__), title: document.title, btnCount: document.querySelectorAll('button').length, selectCount: document.querySelectorAll('select').length, hasEditor: !!document.querySelector('.editor-panel'), hasChapterTree: !!document.querySelector('[class*=chapter]') || !!document.querySelector('[class*=tree]') || !!document.querySelector('[class*=sidebar]'), hasPipeline: !!(document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('pipeline')) || !!document.querySelector('[class*=pipeline]') || !!document.querySelector('[class*=pl-step]') })");
    let cdpData = JSON.parse(safeVal(r));
    record('CDP: Vue app mounted', cdpData.hasVue, 'title=' + cdpData.title);
    record('CDP: Pinia available', cdpData.hasPinia, 'via __vue_app__');
    record('CDP: Editor area present', cdpData.hasEditor);
    record('CDP: Chapter tree present', cdpData.hasChapterTree);
    record('CDP: Pipeline present', cdpData.hasPipeline, cdpData.hasPipeline ? 'store or DOM' : 'missing');
    record('CDP: Buttons rendered', cdpData.btnCount > 5, 'count=' + cdpData.btnCount);
    record('CDP: Selects rendered', cdpData.selectCount >= 2, 'count=' + cdpData.selectCount);

    // Phase 2: DOM Editor Checks (while no panel open, editor visible)
    console.log('\n--- Phase 2: DOM Editor Verification ---');
    let domR = await evalJS("try { JSON.stringify({ hasTextarea: !!document.querySelector('textarea'), hasSidebar: !!document.querySelector('.sidebar-nav, [class*=sidebar]'), hasEditorPanel: !!document.querySelector('.editor-panel'), editorBtnCount: document.querySelectorAll('.editor-toolbar button').length, hasDeAiBtn: !!document.getElementById('btn-de-ai') || !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('\u53bbAI') || b.id === 'btn-de-ai') }) } catch(e) { JSON.stringify({error: e.message}) }");
    let domData = JSON.parse(safeVal(domR));
    record('DOM: Textarea exists', domData.hasTextarea);
    record('DOM: Sidebar nav exists', domData.hasSidebar);
    record('DOM: Editor panel exists', domData.hasEditorPanel);
    record('DOM: Editor toolbar buttons', domData.editorBtnCount > 3, 'count=' + domData.editorBtnCount);
    record('DOM: De-AI button exists', domData.hasDeAiBtn);

    // Phase 3: Click sidebar button to trigger breadcrumb
    console.log('\n--- Phase 3: Breadcrumb via sidebar click ---');
    // Click the 'outline' nav item (first sidebar-btn with data-tooltip='大纲工作台')
    let rNavClick = await evalJS("var btns=document.querySelectorAll('.sidebar-btn'); var outlineBtn=Array.from(btns).find(b=>b.getAttribute('data-tooltip')==='\u5927\u7eb2\u5de5\u4f5c\u53f0'); if(outlineBtn){outlineBtn.click(); 'clicked-outline'} else if(btns.length>0){btns[0].click();'clicked-first'} else 'no-btns'");
    console.log('  nav click: ' + safeVal(rNavClick));
    await sleep(500);
    let rBreadcrumb = await evalJS("JSON.stringify({ hasBreadcrumb: !!document.querySelector('[class*=breadcrumb]'), breadcrumbText: document.querySelector('[class*=breadcrumb]') ? document.querySelector('[class*=breadcrumb]').innerText.slice(0,50) : '' })");
    let bcData = JSON.parse(safeVal(rBreadcrumb));
    record('DOM: Breadcrumb exists', bcData.hasBreadcrumb, bcData.breadcrumbText || 'empty');

    // Phase 4: Pipeline DOM checks
    console.log('\n--- Phase 4: Pipeline DOM ---');
    // Close current panel first, then open pipeline
    let rClosePanel = await evalJS("var bd=document.querySelector('.panel-backdrop'); if(bd){bd.click();'closed'} else 'no-backdrop'");
    console.log('  close panel: ' + safeVal(rClosePanel));
    await sleep(400);
    // Click pipeline nav button
    let rPipeNav = await evalJS("var btns=document.querySelectorAll('.sidebar-btn'); var plBtn=Array.from(btns).find(b=>b.getAttribute('data-tooltip')==='\u751f\u6210\u6d41\u6c34\u7ebf'); if(plBtn){plBtn.click();'clicked-pipeline'} else 'no-pipeline-btn'");
    console.log('  pipeline nav: ' + safeVal(rPipeNav));
    await sleep(800);
    // Click second step if available
    await evalJS("var steps=document.querySelectorAll('.pl-step'); if(steps.length>1){steps[1].click();'step2'} else 'no-steps'");
    await sleep(400);
    let skillR = await evalJS("try { JSON.stringify({ plStepCount: document.querySelectorAll('.pl-step').length, skillSelectCount: document.querySelectorAll('.pl-cfg-select-sm').length, cfgSelectCount: document.querySelectorAll('.pl-cfg-select').length }) } catch(e) { JSON.stringify({error: e.message}) }");
    let skillData = JSON.parse(safeVal(skillR));
    record('DOM: Pipeline steps exist', skillData.plStepCount > 0, 'count=' + skillData.plStepCount);
    record('DOM: Skill slots exist', skillData.skillSelectCount > 0, 'count=' + skillData.skillSelectCount);
    record('DOM: Agent selects exist', skillData.cfgSelectCount > 0, 'count=' + skillData.cfgSelectCount);
    // Close pipeline panel
    await evalJS("var bd=document.querySelector('.panel-backdrop'); if(bd){bd.click();'closed'} else 'no-backdrop'");
    await sleep(500);

    // Phase 5: HOOK Behavioral Verification
    console.log('\n--- Phase 5: HOOK Behavioral Verification ---');

    // 5a: Provider purpose switch - force a real change
    console.log('\n  5a: Provider purpose switch');
    let provBeforeR = await evalJS("JSON.stringify(window.electronAPI.storageRead('providers') || null)");
    let provBeforeStr = safeVal(provBeforeR);
    console.log('  providers before: ' + provBeforeStr.slice(0, 150));
    // Toggle generateProvider to a different value to force detectable change
    let providerSwitchR = await evalJS("var app=document.querySelector('#app').__vue_app__; var pinia=app.config.globalProperties.$pinia; var ps=pinia._s.get('provider'); if(!ps) 'no-provider-store'; else if(!ps.providers||ps.providers.length===0) 'no-providers'; else { var firstId=ps.providers[0].id; var secondId=ps.providers.length>1?ps.providers[1].id:firstId; var prevGen=ps.generateProvider; if(prevGen===firstId){ ps.setVerifyProvider(firstId); ps.setGenerateProvider(secondId); } else { ps.setGenerateProvider(firstId); } JSON.stringify({firstId:firstId, prevGen:prevGen, newGen:ps.generateProvider, providerCount:ps.providers.length}) }");
    console.log('  provider switch: ' + safeVal(providerSwitchR));
    await sleep(500);
    let provAfterR = await evalJS("JSON.stringify(window.electronAPI.storageRead('providers') || null)");
    let provAfterStr = safeVal(provAfterR);
    console.log('  providers after: ' + provAfterStr.slice(0, 150));
    let provChanged = provBeforeStr !== provAfterStr;
    record('HOOK: Provider purpose switch saves to storage', provChanged, provChanged ? 'storage updated' : 'no change detected');

    // 5b: DeAI mode switch
    console.log('\n  5b: DeAI mode switch');
    let deaiBeforeR = await evalJS("JSON.stringify(window.electronAPI.storageRead('deAiConfig') || null)");
    let deaiBeforeStr = safeVal(deaiBeforeR);
    console.log('  deAiConfig before: ' + deaiBeforeStr.slice(0, 150));
    let deaiSwitchR = await evalJS("var app=document.querySelector('#app').__vue_app__; var pinia=app.config.globalProperties.$pinia; var ds=pinia._s.get('deai'); if(!ds) 'no-deai-store'; else { var curMode=ds.mode; var newMode=curMode==='chain'?'split-merge':'chain'; ds.setMode(newMode); JSON.stringify({prevMode:curMode, newMode:ds.mode}) }");
    console.log('  deai mode switch: ' + safeVal(deaiSwitchR));
    await sleep(500);
    let deaiAfterR = await evalJS("JSON.stringify(window.electronAPI.storageRead('deAiConfig') || null)");
    let deaiAfterStr = safeVal(deaiAfterR);
    console.log('  deAiConfig after: ' + deaiAfterStr.slice(0, 150));
    let deaiChanged = deaiBeforeStr !== deaiAfterStr;
    record('HOOK: DeAI mode switch saves to storage', deaiChanged, deaiChanged ? 'storage updated' : 'no change detected');

    // 5b2: DeAI flow preview check
    let flowInfoR = await evalJS("var app=document.querySelector('#app').__vue_app__; var pinia=app.config.globalProperties.$pinia; var ds=pinia._s.get('deai'); if(!ds||!ds.flowPreview) JSON.stringify({hasCross:false,hasZhuque:false}); else { var fp=ds.flowPreview; JSON.stringify({hasCross:fp.some(function(s){return s.indexOf('cross')>=0}), hasZhuque:fp.some(function(s){return s.indexOf('zhuque')>=0}), flow:fp.join(' > ')}) }");
    let flowObj = JSON.parse(safeVal(flowInfoR));
    console.log('  flow preview: ' + JSON.stringify(flowObj).slice(0, 150));
    record('HOOK: DeAI flow has cross-model', flowObj.hasCross);
    record('HOOK: DeAI flow has zhuque', flowObj.hasZhuque);

    // 5c: Hardrule toggle
    console.log('\n  5c: Hardrule toggle');
    let hrBeforeR = await evalJS("JSON.stringify(window.electronAPI.storageRead('deAiConfig') || null)");
    let hrBeforeStr = safeVal(hrBeforeR);
    console.log('  deAiConfig before toggle: ' + hrBeforeStr.slice(0, 150));
    let hrToggleR = await evalJS("var app=document.querySelector('#app').__vue_app__; var pinia=app.config.globalProperties.$pinia; var ds=pinia._s.get('deai'); if(!ds) 'no-deai-store'; else { var prev=ds.hardruleEnabled; ds.hardruleEnabled=!prev; ds.saveConfig(); JSON.stringify({prev:prev, now:ds.hardruleEnabled}) }");
    console.log('  hardrule toggle: ' + safeVal(hrToggleR));
    await sleep(500);
    let hrAfterR = await evalJS("JSON.stringify(window.electronAPI.storageRead('deAiConfig') || null)");
    let hrAfterStr = safeVal(hrAfterR);
    console.log('  deAiConfig after toggle: ' + hrAfterStr.slice(0, 150));
    let hrChanged = hrBeforeStr !== hrAfterStr;
    record('HOOK: Hardrule toggle saves config', hrChanged, hrChanged ? 'storage updated' : 'no change');

    // Summary
    console.log('\n=== TRIPLE VERIFICATION v2 SUMMARY ===');
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log('Passed: ' + passed + '/' + results.length);
    console.log('Failed: ' + failed + '/' + results.length);
    if (failed > 0) {
      console.log('Failed items:');
      results.filter(r => !r.pass).forEach(r => console.log('  - ' + r.name + (r.detail ? ' (' + r.detail + ')' : '')));
    }
    console.log('\nTime: ' + ts());
    const report = { ts: ts(), passed, failed, total: results.length, results };
    fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/triple_verify_report_v2.json', JSON.stringify(report, null, 2));
    console.log('\nReport saved to _audit/triple_verify_report_v2.json');
    ws.close();
    process.exit(failed > 0 ? 1 : 0);
  });

  setTimeout(() => { console.log('[ERR] Timeout after 60s'); process.exit(1); }, 60000);
}

runVerify().catch(e => { console.log('[ERR] ' + e.message); process.exit(1); });
