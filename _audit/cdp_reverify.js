const http = require('http');
function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}
async function main() {
  const targets = await getTargets();
  const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('localhost'));
  if (!pageTarget) { console.log('[ERR] No page target'); process.exit(1); }
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const results = [];
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  function evalJS(expr) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    });
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function record(name, pass, detail) {
    results.push({ name, pass, detail: detail || '' });
    console.log((pass ? '[OK] ' : '[FAIL] ') + name + (detail ? ' | ' + detail : ''));
  }
  ws.addEventListener('open', async () => {
    console.log('[OK] WS connected\n');

    // ===== P10-retry: Check if storageWrite writes JSON or object =====
    console.log('=== P10-retry: Provider storage mechanism ===');
    // Open settings -> API tab
    await evalJS(`var btns=document.querySelectorAll('[data-tooltip]');var s=Array.from(btns).find(b=>b.getAttribute('data-tooltip')==='\u8bbe\u7f6e');if(s){s.click();'clicked'}else{'not found'}`);
    await sleep(500);
    await evalJS(`var tabs=document.querySelectorAll('.settings-tab');if(tabs.length>0){tabs[0].click();'clicked'}else{'no tabs'}`);
    await sleep(300);
    // Check electronAPI shim
    let r = await evalJS(`typeof window.electronAPI + ' | ' + typeof window.electronAPI.storageWrite + ' | ' + typeof window.electronAPI.storageRead`);
    console.log('  electronAPI types: ' + r.result?.result?.value);
    // Check how many providers exist
    r = await evalJS(`document.querySelectorAll('.purpose-select').length`);
    console.log('  purpose-select count: ' + r.result?.result?.value);
    // Manually call saveProviders and check storage
    // First, find the Pinia store via __pinia or app instance
    r = await evalJS(`(function(){try{var app=document.querySelector('#app').__vue_app__;if(!app)return'no vue app';var pinia=app.config.globalProperties.$pinia;if(!pinia)return'no pinia';var stores=Object.keys(pinia.state.value);return'stores: '+stores.join(',')}catch(e){return'ERR:'+e.message}})()`);
    console.log('  pinia: ' + r.result?.result?.value);
    // Read providers store state directly
    r = await evalJS(`(function(){try{var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;var ps=pinia.state.value.providers;if(!ps)return'no providers state';return JSON.stringify({providers:ps.providers.length,generateProvider:ps.generateProvider,verifyProvider:ps.verifyProvider})}catch(e){return'ERR:'+e.message}})()`);
    console.log('  store state: ' + r.result?.result?.value);
    const storeStateBefore = r.result?.result?.value || '';
    // Read localStorage for providers key
    r = await evalJS(`(function(){try{var v=localStorage.getItem('providers');return v?('len='+v.length+' first20='+v.substring(0,20)):'NULL'}catch(e){return'ERR:'+e.message}})()`);
    console.log('  localStorage providers: ' + r.result?.result?.value);
    // Now trigger saveProviders via store
    r = await evalJS(`(function(){try{var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;var ps=pinia.state.value.providers;if(!ps)return'no store';// Manually trigger storageWrite to test shim
window.electronAPI.storageWrite('providers',JSON.stringify({providers:ps.providers,generateProvider:ps.generateProvider,verifyProvider:ps.verifyProvider}));return'wrote'}catch(e){return'ERR:'+e.message}})()`);
    console.log('  manual write: ' + r.result?.result?.value);
    await sleep(200);
    r = await evalJS(`(function(){try{var v=localStorage.getItem('providers');return v?('len='+v.length+' first40='+v.substring(0,40)):'NULL'}catch(e){return'ERR:'+e.message}})()`);
    console.log('  localStorage after manual write: ' + r.result?.result?.value);
    const lsAfterManual = r.result?.result?.value || '';
    // Now test actual purpose-select change via native event
    r = await evalJS(`(function(){var sel=document.querySelector('.purpose-select');if(!sel)return'no select';var before=sel.value;// Use native setter
var setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;setter.call(sel,before==='generate'?'verify':'generate');sel.dispatchEvent(new Event('change',{bubbles:true}));return'before='+before+' after='+sel.value})()`);
    console.log('  native change: ' + r.result?.result?.value);
    await sleep(500);
    // Check store state after change
    r = await evalJS(`(function(){try{var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;var ps=pinia.state.value.providers;return JSON.stringify({providers:ps.providers.length,generateProvider:ps.generateProvider,verifyProvider:ps.verifyProvider})}catch(e){return'ERR:'+e.message}})()`);
    console.log('  store state after change: ' + r.result?.result?.value);
    const storeStateAfter = r.result?.result?.value || '';
    const storeChanged = storeStateBefore !== storeStateAfter;
    record('P10: store state changes on purpose switch', storeChanged, storeStateBefore.substring(0,40) + ' -> ' + storeStateAfter.substring(0,40));
    // Check localStorage after real change
    r = await evalJS(`(function(){try{var v=localStorage.getItem('providers');return v?('len='+v.length+' first40='+v.substring(0,40)):'NULL'}catch(e){return'ERR:'+e.message}})()`);
    console.log('  localStorage after real change: ' + r.result?.result?.value);

    // ===== P11-retry: Set chain first, then click split-merge =====
    console.log('\n=== P11-retry: Chain -> split-merge flow change ===');
    // Go to DeAI tab
    await evalJS(`var tabs=document.querySelectorAll('.settings-tab');var d=Array.from(tabs).find(t=>t.textContent.includes('\u53bbAI'));if(d){d.click();'clicked'}else{'not found'}`);
    await sleep(300);
    // Click chain first to establish baseline
    await evalJS(`var cards=document.querySelectorAll('.deai-mode-card');var ch=Array.from(cards).find(c=>c.textContent.includes('\u4e32\u884c'));if(ch){ch.click();'clicked'}else{'not found'}`);
    await sleep(500);
    r = await evalJS(`(function(){var el=document.querySelector('.deai-flow-preview')||document.querySelector('.deai-flow-section');return el?el.textContent.substring(0,60):'NO_FLOW'})()`);
    const flowChain = r.result?.result?.value || '';
    console.log('  flow on chain: ' + flowChain);
    // Now click split-merge
    await evalJS(`var cards=document.querySelectorAll('.deai-mode-card');var sm=Array.from(cards).find(c=>c.textContent.includes('Agent')||c.textContent.includes('Split'));if(sm){sm.click();'clicked'}else{'not found'}`);
    await sleep(500);
    r = await evalJS(`(function(){var el=document.querySelector('.deai-flow-preview')||document.querySelector('.deai-flow-section');return el?el.textContent.substring(0,60):'NO_FLOW'})()`);
    const flowSM = r.result?.result?.value || '';
    console.log('  flow on split-merge: ' + flowSM);
    const changed = flowChain !== flowSM;
    record('P11: chain->split-merge flow changes', changed, changed ? 'text changed' : 'no change');
    // Also check store mode value
    r = await evalJS(`(function(){try{var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;return 'mode='+pinia.state.value.deai.mode}catch(e){return'ERR:'+e.message}})()`);
    console.log('  store mode: ' + r.result?.result?.value);

    // ===== P12-retry: Find genSettings button precisely =====
    console.log('\n=== P12-retry: Pipeline genSettings button ===');
    // Close settings
    await evalJS(`var ov=document.querySelector('.modal-overlay');if(ov){var btns=ov.querySelectorAll('button');for(var i=0;i<btns.length;i++){if(btns[i].textContent.includes('\u5173\u95ed')||btns[i].textContent.includes('\u53d6\u6d88')||btns[i].className.includes('close')){btns[i].click();break}}'closed'}else{'no overlay'}`);
    await sleep(300);
    // Open pipeline
    await evalJS(`(function(){var btns=document.querySelectorAll('button,[data-tooltip]');var p=Array.from(btns).find(b=>b.textContent.includes('\u751f\u6210\u6d41\u6c34\u7ebf')||b.getAttribute('data-tooltip')==='\u751f\u6210\u6d41\u6c34\u7ebf');if(p){p.click();return 'clicked'}return 'not found'})()`);
    await sleep(500);
    // Navigate to step 1 (settings)
    await evalJS(`var steps=document.querySelectorAll('.pl-step');if(steps.length>1){steps[1].click();'step1'}else if(steps.length>0){steps[0].click();'step0'}else{'no steps'}`);
    await sleep(300);
    // List all buttons in the pipeline panel
    r = await evalJS(`(function(){var panel=document.querySelector('.pl-content')||document.querySelector('.pl-overlay')||document.body;var btns=panel.querySelectorAll('button');var texts=[];btns.forEach(function(b){texts.push(b.textContent.trim().substring(0,20)+'|'+b.className.substring(0,30))});return texts.join('\n')})()`);
    console.log('  buttons in pipeline:\n' + r.result?.result?.value);
    // Find the exact genSettings button by class btn-primary
    r = await evalJS(`(function(){var panel=document.querySelector('.pl-content')||document.querySelector('.pl-overlay')||document.body;var btn=panel.querySelector('button.btn-primary');return btn?('text='+btn.textContent.trim()+'|disabled='+btn.disabled):'no btn-primary'})()`);
    console.log('  btn-primary: ' + r.result?.result?.value);
    const btnInfo = r.result?.result?.value || '';
    const hasGenBtn = btnInfo.includes('AI') || btnInfo.includes('\u751f\u6210');
    record('P12: genSettings btn-primary exists', hasGenBtn, btnInfo);
    if (hasGenBtn) {
      // Check isGenerating state before
      r = await evalJS(`(function(){try{var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;return 'isGenerating='+pinia.state.value.pipeline.isGenerating}catch(e){return'ERR:'+e.message}})()`);
      console.log('  isGenerating before: ' + r.result?.result?.value);
      // Click the btn-primary
      await evalJS(`(function(){var panel=document.querySelector('.pl-content')||document.querySelector('.pl-overlay');var btn=panel.querySelector('button.btn-primary');if(btn){btn.click();return'clicked'}return'no btn'})()`);
      await sleep(1500);
      // Check isGenerating after
      r = await evalJS(`(function(){try{var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;return 'isGenerating='+pinia.state.value.pipeline.isGenerating}catch(e){return'ERR:'+e.message}})()`);
      console.log('  isGenerating after: ' + r.result?.result?.value);
      // Check button text changed
      r = await evalJS(`(function(){var panel=document.querySelector('.pl-content')||document.querySelector('.pl-overlay');var btn=panel.querySelector('button.btn-primary');return btn?btn.textContent.trim():'no btn'})()`);
      console.log('  btn text after click: ' + r.result?.result?.value);
      // Check for toast/loading/error
      r = await evalJS(`(function(){var toasts=document.querySelectorAll('.toast,.toast-message');var loading=document.querySelectorAll('.pl-tool-loading,.loading');var errors=document.querySelectorAll('.error,.error-message');var details=[];toasts.forEach(function(t){details.push('toast:'+t.textContent.substring(0,30))});loading.forEach(function(l){details.push('loading:'+l.textContent.substring(0,20))});errors.forEach(function(e){details.push('error:'+e.textContent.substring(0,30))});return details.length>0?details.join(','):''})()`);
      console.log('  UI feedback: ' + (r.result?.result?.value || 'none'));
      // The button reacted if: text changed, isGenerating toggled, or toast/loading appeared
      r = await evalJS(`(function(){try{var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;return pinia.state.value.pipeline.isGenerating}catch(e){return false}})()`);
      const genStarted = r.result?.result?.value;
      r = await evalJS(`(function(){var panel=document.querySelector('.pl-content')||document.querySelector('.pl-overlay');var btn=panel.querySelector('button.btn-primary');return btn?btn.textContent.trim():'no btn'})()`);
      const textChanged = r.result?.result?.value && r.result?.result?.value.includes('\u751f\u6210\u4e2d');
      const reacted = genStarted || textChanged;
      record('P12: genSettings triggers state change', reacted, 'isGenerating=' + genStarted + ' textChanged=' + textChanged);
    }

    // ===== SUMMARY =====
    console.log('\n=== RE-VERIFICATION SUMMARY ===');
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log('Passed: ' + passed + '/' + results.length);
    console.log('Failed: ' + failed + '/' + results.length);
    results.forEach(r => console.log('  ' + (r.pass ? '[OK]  ' : '[FAIL]') + ' ' + r.name + (r.detail ? ' | ' + r.detail : '')));
    ws.close();
    process.exit(0);
  });
  setTimeout(() => { console.log('[ERR] Timeout 30s'); process.exit(1); }, 30000);
}
main().catch(e => { console.log('[ERR] ' + e.message); process.exit(1); });
