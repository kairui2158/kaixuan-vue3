const http = require('http');
const fs = require('fs');

const CDP_PORT = 9223;
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
  const page = targets.find(t => t.type === 'page');
  if (!page) { console.log('[ERR] No page target'); process.exit(1); }
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
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    });
  }

  function record(name, pass, detail) {
    const status = pass ? 'PASS' : 'FAIL';
    console.log('[' + status + '] ' + name + (detail ? ' -> ' + String(detail).slice(0,120) : ''));
    results.push({ name, pass, detail: String(detail || '').slice(0,200), ts: ts() });
  }

  ws.addEventListener('open', async () => {
    console.log('=== TRIPLE VERIFICATION START ===');
    console.log('Time: ' + ts() + '\n');

    // ===== 1. CDP: App structure & component rendering =====
    console.log('--- 1. CDP: App Structure ---');
    let r = await evalJS(`JSON.stringify({
      hasVue: !!document.querySelector('#app'),
      hasPinia: !!(document.querySelector('#app') && document.querySelector('#app').__vue_app__),
      title: document.title,
      btnCount: document.querySelectorAll('button').length,
      selectCount: document.querySelectorAll('select').length,
      hasEditor: !!document.querySelector('textarea') || !!document.querySelector('[class*=editor]'),
      hasChapterTree: !!document.querySelector('[class*=chapter]') || !!document.querySelector('[class*=tree]') || !!document.querySelector('[class*=sidebar]'),
      hasPipeline: !!document.querySelector('[class*=pipeline]') || !!document.querySelector('[class*=pl-step]'),
      bodyTextLen: document.body.innerText.length
    })`);
    let cdpData = JSON.parse(r.result.result.value);
    record('CDP: Vue app mounted', cdpData.hasVue, 'title=' + cdpData.title);
    record('CDP: Pinia available', cdpData.hasPinia, 'via __vue_app__');
    record('CDP: Editor area present', cdpData.hasEditor);
    record('CDP: Chapter tree present', cdpData.hasChapterTree);
    record('CDP: Pipeline present', cdpData.hasPipeline);
    record('CDP: Buttons rendered', cdpData.btnCount > 5, 'count=' + cdpData.btnCount);
    record('CDP: Selects rendered', cdpData.selectCount >= 2, 'count=' + cdpData.selectCount);

    // ===== 2. DOM: Element existence & content =====
    console.log('\n--- 2. DOM: Element Verification ---');
    let domR = await evalJS(`JSON.stringify({
      pipelineSteps: document.querySelectorAll('.pl-step').length,
      agentSelect: document.querySelectorAll('select').length,
      skillSlots: document.querySelectorAll('[class*=skill]').length,
      sidebarNav: !!document.querySelector('[class*=sidebar]') || !!document.querySelector('nav'),
      breadcrumb: !!document.querySelector('[class*=breadcrumb]'),
      toolButtons: Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('AI') || b.textContent.includes('生成')).length,
      bodySnippet: document.body.innerText.slice(0,200)
    })`);
    let domData = JSON.parse(domR.result.result.value);
    record('DOM: Pipeline steps visible', domData.pipelineSteps >= 3, 'count=' + domData.pipelineSteps);
    record('DOM: Sidebar/navigation present', domData.sidebarNav);
    record('DOM: Skill slots present', domData.skillSlots > 0, 'count=' + domData.skillSlots);
    record('DOM: AI/generate buttons', domData.toolButtons >= 2, 'count=' + domData.toolButtons);
    record('DOM: Breadcrumb present', domData.breadcrumb);

    // ===== 3. HOOK: Behavior verification via storageRead before/after =====
    console.log('\n--- 3. HOOK: Behavior Verification ---');

    // 3a: Provider purpose switch - read storage before, change select, read after
    let provBefore = await evalJS(`JSON.stringify(window.electronAPI.storageRead('providers') || null)`);
    let provBeforeStr = provBefore.result.result.value;
    console.log('  providers before: ' + provBeforeStr.slice(0,150));

    // Open settings modal
    await evalJS(`var btns = document.querySelectorAll('[data-tooltip]'); var sb = Array.from(btns).find(b => b.getAttribute('data-tooltip') === '\u8bbe\u7f6e'); if(sb) sb.click(); 'ok'`);
    await sleep(500);

    // Click API settings tab
    await evalJS(`var tabs = document.querySelectorAll('.settings-tab'); var at = Array.from(tabs).find(t => t.textContent.includes('API') || t.textContent.includes('\u4f9b\u5e94\u5546')); if(at) at.click(); 'ok'`);
    await sleep(500);

    // Find purpose-select and change it
    let purposeR = await evalJS(`
      var sel = document.querySelector('.purpose-select');
      if (!sel) 'no-purpose-select';
      else {
        var opts = sel.querySelectorAll('option');
        var curVal = sel.value;
        var newVal = opts.length > 1 ? (curVal === opts[0].value ? opts[1].value : opts[0].value) : opts[0].value;
        sel.value = newVal;
        sel.dispatchEvent(new Event('change', {bubbles:true}));
        'changed:' + curVal + '->' + newVal;
      }
    `);
    console.log('  purpose change: ' + purposeR.result.result.value);
    await sleep(1000);

    let provAfter = await evalJS(`JSON.stringify(window.electronAPI.storageRead('providers') || null)`);
    let provAfterStr = provAfter.result.result.value;
    console.log('  providers after: ' + provAfterStr.slice(0,150));
    let provChanged = provBeforeStr !== provAfterStr;
    record('HOOK: Provider purpose switch saves to storage', provChanged, provChanged ? 'storage updated' : 'no change detected');

    // 3b: DeAI mode card click
    await evalJS(`var tabs = document.querySelectorAll('.settings-tab'); var dt = Array.from(tabs).find(t => t.textContent.includes('\u53bbAI')); if(dt) dt.click(); 'ok'`);
    await sleep(500);

    let deaiBefore = await evalJS(`JSON.stringify(window.electronAPI.storageRead('deAiConfig') || null)`);
    let deaiBeforeStr = deaiBefore.result.result.value;
    console.log('  deAiConfig before: ' + deaiBeforeStr.slice(0,150));

    // Click a different mode card
    let modeR = await evalJS(`
      var cards = document.querySelectorAll('.deai-mode-card');
      if (cards.length < 2) 'not-enough-cards:' + cards.length;
      else {
        var activeCard = Array.from(cards).find(c => c.classList.contains('active'));
        var targetCard = activeCard === cards[0] ? cards[1] : cards[0];
        targetCard.click();
        'clicked:' + (targetCard.querySelector('.deai-mode-card-title') ? targetCard.querySelector('.deai-mode-card-title').textContent : 'card');
      }
    `);
    console.log('  mode card click: ' + modeR.result.result.value);
    await sleep(1000);

    let deaiAfter = await evalJS(`JSON.stringify(window.electronAPI.storageRead('deAiConfig') || null)`);
    let deaiAfterStr = deaiAfter.result.result.value;
    console.log('  deAiConfig after: ' + deaiAfterStr.slice(0,150));
    let deaiChanged = deaiBeforeStr !== deaiAfterStr;
    record('HOOK: DeAI mode card click saves to storage', deaiChanged, deaiChanged ? 'storage updated' : 'no change detected');

    // 3c: DeAI flow preview content
    let flowR = await evalJS(`
      var fp = document.querySelector('.deai-flow-section');
      if (!fp) 'no-flow-section';
      else {
        var text = fp.textContent;
        var hasCross = text.includes('cross') || text.includes('cross-model');
        var hasZhuque = text.includes('zhuque');
        JSON.stringify({hasCross: hasCross, hasZhuque: hasZhuque, snippet: text.slice(0,200)})
      }
    `);
    let flowVal = flowR.result.result.value;
    console.log('  flow preview: ' + flowVal.slice(0,200));
    let flowObj = flowVal.startsWith('{') ? JSON.parse(flowVal) : {hasCross: false, hasZhuque: false};
    record('HOOK: DeAI flow has cross-model', flowObj.hasCross);
    record('HOOK: DeAI flow has zhuque', flowObj.hasZhuque);

    // 3d: Hardrule toggle behavior
    let hardruleR = await evalJS(`
      var toggleBtn = document.querySelector('.toggle-btn');
      if (!toggleBtn) 'no-toggle-btn';
      else {
        var wasOn = toggleBtn.classList.contains('on');
        toggleBtn.click();
        'wasOn:' + wasOn;
      }
    `);
    console.log('  hardrule toggle: ' + hardruleR.result.result.value);
    await sleep(500);

    let deaiAfterToggle = await evalJS(`JSON.stringify(window.electronAPI.storageRead('deAiConfig') || null)`);
    let deaiAfterToggleStr = deaiAfterToggle.result.result.value;
    let hardruleChanged = deaiAfterStr !== deaiAfterToggleStr;
    record('HOOK: Hardrule toggle saves config', hardruleChanged, hardruleChanged ? 'storage updated' : 'no change');

    // Close settings modal
    await evalJS(`var ov = document.querySelector('.modal-overlay'); if(ov) ov.click(); 'ok'`);
    await sleep(300);

    // 3e: Pipeline panel interaction
    let pipeR = await evalJS(`
      var btns = document.querySelectorAll('[data-tooltip]');
      var plBtn = Array.from(btns).find(b => b.getAttribute('data-tooltip') === '\u751f\u6210\u6d41\u6c34\u7ebf');
      if (plBtn) { plBtn.click(); 'opened' } else {
        var allBtns = document.querySelectorAll('button');
        var found = Array.from(allBtns).find(b => b.textContent.includes('\u6d41\u6c34\u7ebf'));
        if (found) { found.click(); 'opened-via-text' } else 'not-found';
      }
    `);
    console.log('  pipeline open: ' + pipeR.result.result.value);
    await sleep(500);

    let pipeSteps = await evalJS(`document.querySelectorAll('.pl-step').length`);
    record('HOOK: Pipeline steps expandable', pipeSteps.result.result.value > 0, 'steps=' + pipeSteps.result.result.value);

    // ===== SUMMARY =====
    console.log('\n=== TRIPLE VERIFICATION SUMMARY ===');
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log('Passed: ' + passed + '/' + results.length);
    console.log('Failed: ' + failed + '/' + results.length);
    if (failed > 0) {
      console.log('Failed items:');
      results.filter(r => !r.pass).forEach(r => console.log('  - ' + r.name + (r.detail ? ' (' + r.detail + ')' : '')));
    }
    console.log('\nTime: ' + ts());

    // Save JSON report
    const report = { ts: ts(), passed, failed, total: results.length, results };
    fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/triple_verify_report.json', JSON.stringify(report, null, 2));
    console.log('\nReport saved to _audit/triple_verify_report.json');

    ws.close();
    process.exit(failed > 0 ? 1 : 0);
  });

  setTimeout(() => { console.log('[ERR] Timeout after 30s'); process.exit(1); }, 30000);
}

runVerify().catch(e => { console.log('[ERR] ' + e.message); process.exit(1); });
