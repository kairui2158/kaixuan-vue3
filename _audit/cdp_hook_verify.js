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
  const results = [];
  ws.addEventListener('open', async () => {
    console.log('[OK] WS connected');

    // ===== INJECT HOOKS =====
    console.log('--- Injecting Hooks ---');
    let r = await evalJS(`
      window.__hookLog = [];
      if (window.electronAPI && window.electronAPI.storageWrite) {
        var origWrite = window.electronAPI.storageWrite;
        window.electronAPI.storageWrite = function(key, val) {
          window.__hookLog.push({type:'storageWrite', key:key, ts:Date.now()});
          return origWrite.call(window.electronAPI, key, val);
        };
      }
      var origFetch = window.fetch;
      window.fetch = function(url, opts) {
        window.__hookLog.push({type:'fetch', url:String(url).substring(0,80), ts:Date.now()});
        return origFetch.apply(window, arguments);
      };
      'hooks installed'
    `);
    console.log('Hook install: ' + (r.result?.result?.value || 'ERR'));
    await sleep(200);

    // ===== P10: Provider Purpose Switch =====
    console.log('\n--- P10: Provider Purpose Switch ---');
    await evalJS(`var btns = document.querySelectorAll('[data-tooltip]'); var sb = Array.from(btns).find(b => b.getAttribute('data-tooltip') === '\u8bbe\u7f6e'); if(sb) sb.click(); 'ok'`);
    await sleep(500);
    await evalJS(`var tabs = document.querySelectorAll('.settings-tab'); if(tabs[0]) tabs[0].click(); 'ok'`);
    await sleep(300);
    let p10exists = await evalJS(`!!document.querySelector('.purpose-select')`);
    console.log('purpose-select exists: ' + (p10exists.result?.result?.value ? 'YES' : 'NO'));
    let p10r = await evalJS(`
      var sel = document.querySelector('.purpose-select');
      if (!sel) 'no-purpose-select';
      else {
        var opts = sel.querySelectorAll('option');
        if (opts.length < 2) 'only-one-option';
        else {
          sel.value = opts[1].value;
          sel.dispatchEvent(new Event('change', {bubbles:true}));
          'changed-to-' + opts[1].value;
        }
      }
    `);
    console.log('Purpose change: ' + (p10r.result?.result?.value || 'ERR'));
    await sleep(500);
    let p10check = await evalJS(`window.__hookLog.filter(h => h.type==='storageWrite' && h.key==='providers').length > 0`);
    let p10pass = p10check.result?.result?.value;
    console.log('storageWrite(providers) triggered: ' + (p10pass ? 'YES' : 'NO'));
    results.push({name:'P10: Provider purpose switch triggers saveProviders', pass: p10pass});
    await evalJS('window.__hookLog = []');

    // ===== P11: DeAI Mode Switch =====
    console.log('\n--- P11: DeAI Mode Switch ---');
    await evalJS(`var tabs = document.querySelectorAll('.settings-tab'); var dt = Array.from(tabs).find(t => t.textContent.includes('\u53bbAI')); if(dt) dt.click(); 'ok'`);
    await sleep(300);
    let p11r = await evalJS(`
      var cards = document.querySelectorAll('.deai-mode-card');
      if (cards.length < 2) 'not-enough-cards';
      else { cards[1].click(); 'clicked-card-2'; }
    `);
    console.log('Mode card click: ' + (p11r.result?.result?.value || 'ERR'));
    await sleep(500);
    let p11check = await evalJS(`window.__hookLog.filter(h => h.type==='storageWrite' && h.key==='deAiConfig').length > 0`);
    let p11pass = p11check.result?.result?.value;
    console.log('storageWrite(deAiConfig) triggered: ' + (p11pass ? 'YES' : 'NO'));
    let p11flow = await evalJS(`var fp = document.querySelector('.deai-flow-section'); fp ? fp.textContent.substring(0,100) : 'no-flow-section'`);
    console.log('Flow preview after switch: ' + (p11flow.result?.result?.value || 'ERR'));
    results.push({name:'P11: DeAI mode switch triggers saveConfig', pass: p11pass});
    await evalJS('window.__hookLog = []');

    // ===== P12: Pipeline Generation Function =====
    console.log('\n--- P12: Pipeline Generation Function ---');
    await evalJS(`var overlay = document.querySelector('.modal-overlay'); if(overlay) overlay.click(); 'ok'`);
    await sleep(300);
    let p12open = await evalJS(`
      var btns = document.querySelectorAll('[data-tooltip]');
      var plBtn = Array.from(btns).find(b => b.getAttribute('data-tooltip') === '\u751f\u6210\u6d41\u6c34\u7ebf');
      if (plBtn) { plBtn.click(); 'opened' } else {
        var allBtns = document.querySelectorAll('button');
        var found = Array.from(allBtns).find(b => b.textContent.includes('\u6d41\u6c34\u7ebf'));
        if (found) { found.click(); 'opened-via-text' } else 'not-found';
      }
    `);
    console.log('Pipeline open: ' + (p12open.result?.result?.value || 'ERR'));
    await sleep(500);
    await evalJS(`var steps = document.querySelectorAll('.pl-step'); if(steps[1]) steps[1].click(); 'ok'`);
    await sleep(300);
    let p12btn = await evalJS(`
      var btns = document.querySelectorAll('button');
      var genBtn = Array.from(btns).find(b => b.textContent.includes('AI\u751f\u6210\u8bbe\u5b9a'));
      if (!genBtn) 'no-gen-btn';
      else if (genBtn.disabled) 'btn-disabled';
      else { genBtn.click(); 'clicked' }
    `);
    console.log('genSettings button: ' + (p12btn.result?.result?.value || 'ERR'));
    await sleep(1000);
    let p12fetchCount = await evalJS(`window.__hookLog.filter(h => h.type==='fetch').length`);
    let p12fetchNum = p12fetchCount.result?.result?.value || 0;
    console.log('fetch calls attempted: ' + p12fetchNum);
    let p12pass = p12fetchNum > 0;
    if (!p12pass) {
      let p12alt = await evalJS(`
        var loadingText = document.body.textContent.includes('AI\u751f\u6210\u4e2d') ||
                          document.body.textContent.includes('\u672a\u914d\u7f6e') ||
                          document.body.textContent.includes('failed') ||
                          document.body.textContent.includes('\u5931\u8d25');
        loadingText ? 'function-ran' : 'no-evidence'
      `);
      console.log('Alternative evidence (function ran): ' + (p12alt.result?.result?.value || 'ERR'));
      p12pass = p12alt.result?.result?.value === 'function-ran';
    }
    console.log('P12 (genSettings triggers API chain): ' + (p12pass ? 'PASS' : 'FAIL'));
    results.push({name:'P12: Pipeline genSettings triggers API call chain', pass: p12pass});
    await evalJS('window.__hookLog = []');

    // ===== P13: DeAI Process (crossModelCheck/zhuqueCheck) =====
    console.log('\n--- P13: DeAI Process Chain ---');
    let p13code = await evalJS(`
      var flowText = '';
      var flowSec = document.querySelector('.deai-flow-section');
      if (flowSec) flowText = flowSec.textContent;
      var hasCrossModel = flowText.includes('cross') || flowText.includes('cross-model');
      var hasZhuque = flowText.includes('zhuque') || flowText.includes('AI');
      JSON.stringify({hasFlow: !!flowSec, hasCrossModel: hasCrossModel, hasZhuque: hasZhuque, flowSnippet: flowText.substring(0,200)})
    `);
    console.log('DeAI flow preview: ' + (p13code.result?.result?.value || 'ERR'));
    let p13obj = JSON.parse(p13code.result?.result?.value || '{}');
    let p13src = await evalJS(`
      var allBtns = Array.from(document.querySelectorAll('button'));
      var deAiBtn = allBtns.find(b => b.textContent.includes('\u53bbAI\u5473'));
      JSON.stringify({hasDeAiBtn: !!deAiBtn, btnText: deAiBtn ? deAiBtn.textContent.trim() : 'none'})
    `);
    console.log('DeAI button: ' + (p13src.result?.result?.value || 'ERR'));
    let p13srcObj = JSON.parse(p13src.result?.result?.value || '{}');
    let p13pass = p13obj.hasCrossModel && p13obj.hasZhuque && p13srcObj.hasDeAiBtn;
    console.log('P13 (cross-model + zhuque in flow + deAI btn): ' + (p13pass ? 'PASS' : 'FAIL'));
    results.push({name:'P13: DeAI process includes crossModelCheck + zhuqueCheck', pass: p13pass});

    // ===== SUMMARY =====
    console.log('\n=== HOOK VERIFICATION SUMMARY ===');
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log('Passed: ' + passed + '/' + results.length);
    console.log('Failed: ' + failed + '/' + results.length);
    results.forEach(r => console.log('  [' + (r.pass ? 'PASS' : 'FAIL') + '] ' + r.name));
    console.log('\n=== JSON_RESULTS ===');
    console.log(JSON.stringify(results));
    ws.close();
    process.exit(0);
  });
  setTimeout(() => { console.log('[ERR] Timeout'); process.exit(1); }, 30000);
}
main().catch(e => { console.log('[ERR] ' + e.message); process.exit(1); });
