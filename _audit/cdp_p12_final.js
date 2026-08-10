const http = require('http');
function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9223/json', (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}
async function main() {
  const targets = await getTargets();
  const pt = targets.find(t => t.type === 'page' && t.url.includes('localhost'));
  if (!pt) { console.log('[ERR]'); process.exit(1); }
  const ws = new WebSocket(pt.webSocketDebuggerUrl);
  let mid = 1; const pend = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  function ev(expr) { return new Promise(r => { const id = mid++; pend.set(id, r); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); }); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  ws.addEventListener('open', async () => {
    // Open pipeline, go to step 1, click genSettings, check generationStatus
    await ev(`(function(){var b=document.querySelectorAll('button,[data-tooltip]');var p=Array.from(b).find(x=>x.textContent.includes('生成流水线'));if(p)p.click()})()`);
    await sleep(500);
    await ev(`var s=document.querySelectorAll('.pl-step');if(s.length>1)s[1].click()`);
    await sleep(300);
    // Before
    let r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var p=app.config.globalProperties.$pinia.state.value.pipeline;return 'before: isGenerating='+p.isGenerating+' status='+p.generationStatus+' progress='+p.generationProgress})()`);
    console.log(r.result?.result?.value || 'ERR');
    // Click
    await ev(`(function(){var p=document.querySelector('.pl-content')||document.querySelector('.pl-overlay');var btn=p.querySelector('button.btn-primary');if(btn)btn.click()})()`);
    await sleep(50);
    r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var p=app.config.globalProperties.$pinia.state.value.pipeline;return '50ms: isGenerating='+p.isGenerating+' status='+p.generationStatus+' progress='+p.generationProgress})()`);
    console.log(r.result?.result?.value || 'ERR');
    await sleep(500);
    r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var p=app.config.globalProperties.$pinia.state.value.pipeline;return '500ms: isGenerating='+p.isGenerating+' status='+p.generationStatus+' progress='+p.generationProgress})()`);
    console.log(r.result?.result?.value || 'ERR');
    // Check outlineText (needed for genSettings to work)
    r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var p=app.config.globalProperties.$pinia.state.value.project;return 'outlineText='+(p.outlineText?p.outlineText.substring(0,30):'EMPTY')})()`);
    console.log(r.result?.result?.value || 'ERR');
    // Check provider config
    r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var p=app.config.globalProperties.$pinia.state.value.provider;return 'providers='+p.providers.length+' gen='+p.generateProvider+' ver='+p.verifyProvider})()`);
    console.log(r.result?.result?.value || 'ERR');
    ws.close(); process.exit(0);
  });
  setTimeout(() => { console.log('[ERR] Timeout'); process.exit(1); }, 15000);
}
main().catch(e => { console.log('[ERR] ' + e.message); process.exit(1); });
