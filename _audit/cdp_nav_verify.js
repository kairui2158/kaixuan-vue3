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
  ws.addEventListener('open', async () => {
    console.log('[OK] WS connected\n');
    // Step 1: Click settings button
    console.log('--- Step 1: Open Settings ---');
    let r = await evalJS(`
      var btns = document.querySelectorAll('[data-tooltip]');
      var settingsBtn = Array.from(btns).find(b => b.getAttribute('data-tooltip') === '\u8bbe\u7f6e');
      if (settingsBtn) { settingsBtn.click(); 'clicked' } else { 'not found' }
    `);
    console.log('Settings btn: ' + (r.result?.result?.value || 'ERR'));
    await sleep(500);
    r = await evalJS(`!!document.querySelector('.modal-overlay') && !!document.querySelector('.settings-tabs')`);
    console.log('SettingsModal open: ' + (r.result?.result?.value ? 'OK' : 'FAIL'));
    results.push({ name: 'SettingsModal open', pass: r.result?.result?.value });
    // Step 2: API tab
    console.log('\n--- Step 2: API Tab ---');
    r = await evalJS(`var tabs = document.querySelectorAll('.settings-tab'); if (tabs.length > 0) { tabs[0].click(); 'clicked' } else { 'no tabs' }`);
    console.log('API tab: ' + (r.result?.result?.value || 'ERR'));
    await sleep(300);
    r = await evalJS(`!!document.querySelector('.api-settings')`);
    console.log('ApiSettings rendered: ' + (r.result?.result?.value ? 'OK' : 'FAIL'));
    results.push({ name: 'ApiSettings rendered', pass: r.result?.result?.value });
    r = await evalJS(`!!document.querySelector('.purpose-select')`);
    console.log('purpose-select dropdown: ' + (r.result?.result?.value ? 'OK' : 'FAIL'));
    results.push({ name: 'purpose-select dropdown', pass: r.result?.result?.value });
    r = await evalJS(`Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('\u83b7\u53d6\u6a21\u578b')).length > 0`);
    console.log('fetchModels button: ' + (r.result?.result?.value ? 'OK' : 'FAIL'));
    results.push({ name: 'fetchModels button', pass: r.result?.result?.value });
    r = await evalJS(`Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('\u6d4b\u8bd5\u8fde\u63a5')).length > 0`);
    console.log('testConnection button: ' + (r.result?.result?.value ? 'OK' : 'FAIL'));
    results.push({ name: 'testConnection button', pass: r.result?.result?.value });
    // Step 3: DeAI tab
    console.log('\n--- Step 3: DeAI Tab ---');
    r = await evalJS(`var tabs = document.querySelectorAll('.settings-tab'); var deaiTab = Array.from(tabs).find(t => t.textContent.includes('\u53bbAI')); if (deaiTab) { deaiTab.click(); 'clicked' } else { 'not found' }`);
    console.log('DeAI tab: ' + (r.result?.result?.value || 'ERR'));
    await sleep(300);
    r = await evalJS(`!!document.querySelector('.deai-settings')`);
    console.log('DeAiSettings rendered: ' + (r.result?.result?.value ? 'OK' : 'FAIL'));
    results.push({ name: 'DeAiSettings rendered', pass: r.result?.result?.value });
    r = await evalJS(`document.querySelectorAll('.deai-mode-card').length`);
    const cardCount = r.result?.result?.value || 0;
    console.log('Mode cards count: ' + cardCount);
    results.push({ name: '3 mode cards exist', pass: cardCount === 3 });
    // Click chain card
    r = await evalJS(`var cards = document.querySelectorAll('.deai-mode-card'); var chainCard = Array.from(cards).find(c => c.textContent.includes('\u4e32\u884c')); if (chainCard) { chainCard.click(); 'clicked' } else { 'not found' }`);
    console.log('Chain card click: ' + (r.result?.result?.value || 'ERR'));
    await sleep(300);
    r = await evalJS(`var cards = document.querySelectorAll('.deai-mode-card'); var chainCard = Array.from(cards).find(c => c.textContent.includes('\u4e32\u884c')); var body = chainCard ? chainCard.querySelector('.deai-mode-card-body') : null; body ? 'visible' : 'NOT visible'`);
    console.log('Chain card body: ' + (r.result?.result?.value || 'ERR'));
    results.push({ name: 'chain card body visible', pass: r.result?.result?.value === 'visible' });
    // Click multi-step card
    r = await evalJS(`var cards = document.querySelectorAll('.deai-mode-card'); var msCard = Array.from(cards).find(c => c.textContent.includes('Multi')); if (msCard) { msCard.click(); 'clicked' } else { 'not found' }`);
    console.log('Multi-step card click: ' + (r.result?.result?.value || 'ERR'));
    await sleep(300);
    r = await evalJS(`var cards = document.querySelectorAll('.deai-mode-card'); var msCard = Array.from(cards).find(c => c.textContent.includes('Multi')); var body = msCard ? msCard.querySelector('.deai-mode-card-body') : null; body ? 'visible' : 'NOT visible'`);
    console.log('Multi-step card body: ' + (r.result?.result?.value || 'ERR'));
    results.push({ name: 'multi-step card body visible', pass: r.result?.result?.value === 'visible' });
    // hardrule toggle
    r = await evalJS(`!!document.querySelector('.toggle-btn')`);
    console.log('Hardrule toggle: ' + (r.result?.result?.value ? 'OK' : 'FAIL'));
    results.push({ name: 'hardrule toggle', pass: r.result?.result?.value });
    // flow preview
    r = await evalJS(`!!document.querySelector('.deai-flow-section')`);
    console.log('Flow preview: ' + (r.result?.result?.value ? 'OK' : 'FAIL'));
    results.push({ name: 'flow preview', pass: r.result?.result?.value });
    // verify provider status
    r = await evalJS(`!!document.querySelector('.deai-verify-status')`);
    console.log('Verify provider status: ' + (r.result?.result?.value ? 'OK' : 'FAIL'));
    results.push({ name: 'verify provider status', pass: r.result?.result?.value });
    // Summary
    console.log('\n=== SUMMARY ===');
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log('Passed: ' + passed + '/' + results.length);
    console.log('Failed: ' + failed + '/' + results.length);
    if (failed > 0) { console.log('Failed items:'); results.filter(r => !r.pass).forEach(r => console.log('  - ' + r.name)); }
    ws.close();
    process.exit(0);
  });
  setTimeout(() => { console.log('[ERR] Timeout'); process.exit(1); }, 20000);
}
main().catch(e => { console.log('[ERR] ' + e.message); process.exit(1); });
