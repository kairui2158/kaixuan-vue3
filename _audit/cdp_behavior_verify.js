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
  console.log('[OK] Target: ' + pageTarget.url);
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

    // ===== P10: purpose-select switch -> saveProviders -> storage changes =====
    console.log('=== P10: Provider purpose switch -> storage write ===');
    // Open settings
    await evalJS(`var btns=document.querySelectorAll('[data-tooltip]');var s=Array.from(btns).find(b=>b.getAttribute('data-tooltip')==='\u8bbe\u7f6e');if(s){s.click();'clicked'}else{'not found'}`);
    await sleep(500);
    // Go to API tab (first tab)
    await evalJS(`var tabs=document.querySelectorAll('.settings-tab');if(tabs.length>0){tabs[0].click();'clicked'}else{'no tabs'}`);
    await sleep(300);
    // Read storage BEFORE
    let r = await evalJS(`(function(){try{var v=localStorage.getItem('providers');return v?v:'EMPTY'}catch(e){return 'ERR:'+e.message}})()`);
    const storageBefore = r.result?.result?.value || '';
    console.log('  storage before: ' + (storageBefore.substring(0,80) || 'EMPTY'));
    // Check purpose-select exists
    r = await evalJS(`!!document.querySelector('.purpose-select')`);
    const hasPurposeSelect = r.result?.result?.value;
    if (!hasPurposeSelect) {
      record('P10: purpose-select exists', false, 'no .purpose-select found');
    } else {
      record('P10: purpose-select exists', true);
      // Read current value
      r = await evalJS(`document.querySelector('.purpose-select').value`);
      const valBefore = r.result?.result?.value || '';
      console.log('  purpose before: ' + valBefore);
      // Change to a different value
      const newVal = valBefore === 'generate' ? 'verify' : 'generate';
      await evalJS(`document.querySelector('.purpose-select').value='${newVal}';document.querySelector('.purpose-select').dispatchEvent(new Event('change',{bubbles:true}));'changed'`);
      await sleep(500);
      // Read storage AFTER
      r = await evalJS(`(function(){try{var v=localStorage.getItem('providers');return v?v:'EMPTY'}catch(e){return 'ERR:'+e.message}})()`);
      const storageAfter = r.result?.result?.value || '';
      console.log('  storage after: ' + (storageAfter.substring(0,80) || 'EMPTY'));
      // Read purpose AFTER
      r = await evalJS(`document.querySelector('.purpose-select').value`);
      const valAfter = r.result?.result?.value || '';
      console.log('  purpose after: ' + valAfter);
      const storageChanged = storageBefore !== storageAfter;
      const valChanged = valBefore !== valAfter;
      record('P10: purpose value changed in DOM', valChanged, valBefore + ' -> ' + valAfter);
      record('P10: storage updated after switch', storageChanged, storageChanged ? 'providers changed' : 'no change');
    }

    // ===== P11: mode card click -> setMode -> flow preview text changes =====
    console.log('\n=== P11: Mode card click -> flow preview change ===');
    // Go to DeAI tab
    r = await evalJS(`var tabs=document.querySelectorAll('.settings-tab');var d=Array.from(tabs).find(t=>t.textContent.includes('\u53bbAI'));if(d){d.click();'clicked'}else{'not found'}`);
    await sleep(300);
    r = await evalJS(`!!document.querySelector('.deai-settings')`);
    if (!r.result?.result?.value) {
      record('P11: DeAI settings open', false, 'no .deai-settings');
    } else {
      record('P11: DeAI settings open', true);
      // Read flow preview BEFORE
      r = await evalJS(`(function(){var el=document.querySelector('.deai-flow-preview')||document.querySelector('.deai-flow-section');return el?el.textContent:'NO_FLOW_ELEMENT'})()`);
      const flowBefore = r.result?.result?.value || '';
      console.log('  flow before: ' + flowBefore.substring(0,100));
      // Click split-merge card
      r = await evalJS(`var cards=document.querySelectorAll('.deai-mode-card');var sm=Array.from(cards).find(c=>c.textContent.includes('Agent')||c.textContent.includes('split')||c.textContent.includes('Split'));if(sm){sm.click();'clicked'}else{'not found'}`);
      console.log('  split-merge click: ' + (r.result?.result?.value || 'ERR'));
      await sleep(500);
      // Read flow preview AFTER
      r = await evalJS(`(function(){var el=document.querySelector('.deai-flow-preview')||document.querySelector('.deai-flow-section');return el?el.textContent:'NO_FLOW_ELEMENT'})()`);
      const flowAfterSM = r.result?.result?.value || '';
      console.log('  flow after split-merge: ' + flowAfterSM.substring(0,100));
      const changed1 = flowBefore !== flowAfterSM;
      record('P11: flow changes on split-merge click', changed1, changed1 ? 'text changed' : 'no change');
      // Click multi-step card
      r = await evalJS(`var cards=document.querySelectorAll('.deai-mode-card');var ms=Array.from(cards).find(c=>c.textContent.includes('Multi')||c.textContent.includes('multi'));if(ms){ms.click();'clicked'}else{'not found'}`);
      console.log('  multi-step click: ' + (r.result?.result?.value || 'ERR'));
      await sleep(500);
      r = await evalJS(`(function(){var el=document.querySelector('.deai-flow-preview')||document.querySelector('.deai-flow-section');return el?el.textContent:'NO_FLOW_ELEMENT'})()`);
      const flowAfterMS = r.result?.result?.value || '';
      console.log('  flow after multi-step: ' + flowAfterMS.substring(0,100));
      const changed2 = flowAfterSM !== flowAfterMS;
      record('P11: flow changes on multi-step click', changed2, changed2 ? 'text changed' : 'no change');
      // Click chain card
      r = await evalJS(`var cards=document.querySelectorAll('.deai-mode-card');var ch=Array.from(cards).find(c=>c.textContent.includes('\u4e32\u884c')||c.textContent.includes('Chain')||c.textContent.includes('chain'));if(ch){ch.click();'clicked'}else{'not found'}`);
      console.log('  chain click: ' + (r.result?.result?.value || 'ERR'));
      await sleep(500);
      r = await evalJS(`(function(){var el=document.querySelector('.deai-flow-preview')||document.querySelector('.deai-flow-section');return el?el.textContent:'NO_FLOW_ELEMENT'})()`);
      const flowAfterChain = r.result?.result?.value || '';
      console.log('  flow after chain: ' + flowAfterChain.substring(0,100));
      const changed3 = flowAfterMS !== flowAfterChain;
      record('P11: flow changes on chain click', changed3, changed3 ? 'text changed' : 'no change');
    }

    // ===== P13: flow preview contains cross-model and zhuque keywords =====
    console.log('\n=== P13: Flow preview contains cross-model + zhuque ===');
    const modes = [
      { name: 'chain', label: '\u4e32\u884c', en: 'Chain' },
      { name: 'split-merge', label: 'Agent', en: 'Split' },
      { name: 'multi-step', label: 'Multi', en: 'Multi' }
    ];
    for (const mode of modes) {
      // Click the mode card
      await evalJS(`var cards=document.querySelectorAll('.deai-mode-card');var c=Array.from(cards).find(b=>b.textContent.includes('${mode.label}')||b.textContent.includes('${mode.en}'));if(c){c.click();'clicked'}else{'not found'}`);
      await sleep(400);
      r = await evalJS(`(function(){var el=document.querySelector('.deai-flow-preview')||document.querySelector('.deai-flow-section');return el?el.textContent.toLowerCase():'NO_FLOW'})()`);
      const flowText = (r.result?.result?.value || '').toLowerCase();
      const hasCross = flowText.includes('cross') || flowText.includes('cross-model') || flowText.includes('\u4ea4\u53c9');
      const hasZhuque = flowText.includes('zhuque') || flowText.includes('\u6731\u96c0') || flowText.includes('detect') || flowText.includes('\u68c0\u6d4b');
      record('P13: ' + mode.name + ' has cross-model ref', hasCross, flowText.substring(0,60));
      record('P13: ' + mode.name + ' has zhuque/detect ref', hasZhuque, flowText.substring(0,60));
    }

    // ===== P12: Pipeline generate button -> genSettings -> state change =====
    console.log('\n=== P12: Pipeline generate button -> state change ===');
    // Close settings first
    await evalJS(`var ov=document.querySelector('.modal-overlay');if(ov){var closeBtn=ov.querySelector('button');if(closeBtn){closeBtn.click();'closed'}else{ov.click();'overlay clicked'}}else{'no overlay'}`);
    await sleep(300);
    // Try to open pipeline panel - look for pipeline trigger
    r = await evalJS(`(function(){var btns=document.querySelectorAll('button,[data-tooltip]');var p=Array.from(btns).find(b=>b.textContent.includes('\u751f\u6210\u6d41\u6c34\u7ebf')||b.getAttribute('data-tooltip')==='\u751f\u6210\u6d41\u6c34\u7ebf'||b.textContent.includes('\u6d41\u6c34\u7ebf'));if(p){p.click();return 'clicked'}return 'not found'})()`);
    console.log('  pipeline open: ' + (r.result?.result?.value || 'ERR'));
    await sleep(500);
    // Check pipeline panel exists
    r = await evalJS(`!!document.querySelector('.pl-overlay')||!!document.querySelector('.pipeline-panel')||!!document.querySelector('.pl-content')`);
    const pipelineOpen = r.result?.result?.value;
    if (!pipelineOpen) {
      // Try alternate trigger
      r = await evalJS(`(function(){var all=document.querySelectorAll('*');var p=Array.from(all).find(e=>e.textContent.includes('\u751f\u6210\u6d41\u6c34\u7ebf')&&e.children.length<5);if(p&&p.click){p.click();return 'alt clicked'}return 'alt not found'})()`);
      console.log('  alt pipeline open: ' + (r.result?.result?.value || 'ERR'));
      await sleep(500);
      r = await evalJS(`!!document.querySelector('.pl-overlay')||!!document.querySelector('.pipeline-panel')||!!document.querySelector('.pl-content')`);
    }
    record('P12: pipeline panel opens', r.result?.result?.value || false);
    if (r.result?.result?.value) {
      // Navigate to step 1 (settings layer)
      r = await evalJS(`var steps=document.querySelectorAll('.pl-step');if(steps.length>1){steps[1].click();'step1 clicked'}else if(steps.length>0){steps[0].click();'step0 clicked'}else{'no steps'}`);
      console.log('  step nav: ' + (r.result?.result?.value || 'ERR'));
      await sleep(300);
      // Look for generate settings button
      r = await evalJS(`(function(){var btns=document.querySelectorAll('button');var g=Array.from(btns).find(b=>b.textContent.includes('AI\u751f\u6210\u8bbe\u5b9a')||b.textContent.includes('\u751f\u6210\u8bbe\u5b9a')||b.textContent.includes('\u8bbe\u5b9a'));return g?g.textContent:'no gen btn'})()`);
      const btnText = r.result?.result?.value || '';
      console.log('  gen button text: ' + btnText);
      const hasGenBtn = btnText !== 'no gen btn';
      record('P12: generate settings button exists', hasGenBtn, btnText);
      if (hasGenBtn) {
        // Check button state before click
        r = await evalJS(`(function(){var btns=document.querySelectorAll('button');var g=Array.from(btns).find(b=>b.textContent.includes('AI\u751f\u6210\u8bbe\u5b9a')||b.textContent.includes('\u751f\u6210\u8bbe\u5b9a'));return g?g.disabled:'no btn'})()`);
        const disabledBefore = r.result?.result?.value;
        console.log('  disabled before: ' + disabledBefore);
        // Click it and check for state change (loading, disabled, result, toast, error)
        await evalJS(`(function(){var btns=document.querySelectorAll('button');var g=Array.from(btns).find(b=>b.textContent.includes('AI\u751f\u6210\u8bbe\u5b9a')||b.textContent.includes('\u751f\u6210\u8bbe\u5b9a'));if(g){g.click();return 'clicked'}return 'no btn'})()`);
        await sleep(1000);
        // Check for any state change indicators
        r = await evalJS(`(function(){var loading=document.querySelector('.pl-tool-loading');var result=document.querySelector('.pl-tool-result');var toast=document.querySelector('.toast');var error=document.querySelector('.error-message');var btns=document.querySelectorAll('button');var g=Array.from(btns).find(b=>b.textContent.includes('\u751f\u6210\u4e2d')||b.textContent.includes('loading')||b.textContent.includes('Loading'));var details=[];if(loading)details.push('loading');if(result)details.push('result');if(toast)details.push('toast');if(error)details.push('error');if(g)details.push('btn-text-changed:'+g.textContent.substring(0,20));return details.length>0?details.join(','):''})()`);
        const stateChange = r.result?.result?.value || '';
        console.log('  state change indicators: ' + (stateChange || 'none'));
        // Button reacting (disabled or text changed or loading shown) = function wired
        const reacted = stateChange.length > 0;
        record('P12: generate button triggers state change', reacted, stateChange || 'no visible change (may need API key)');
      }
    }

    // ===== SUMMARY =====
    console.log('\n=== BEHAVIOR VERIFICATION SUMMARY ===');
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log('Passed: ' + passed + '/' + results.length);
    console.log('Failed: ' + failed + '/' + results.length);
    if (failed > 0) {
      console.log('\nFailed items:');
      results.filter(r => !r.pass).forEach(r => console.log('  [FAIL] ' + r.name + (r.detail ? ' | ' + r.detail : '')));
    }
    console.log('\n=== ALL RESULTS ===');
    results.forEach(r => console.log('  ' + (r.pass ? '[OK]  ' : '[FAIL]') + ' ' + r.name + (r.detail ? ' | ' + r.detail : '')));
    ws.close();
    process.exit(0);
  });
  setTimeout(() => { console.log('[ERR] Timeout 30s'); process.exit(1); }, 30000);
}
main().catch(e => { console.log('[ERR] ' + e.message); process.exit(1); });
