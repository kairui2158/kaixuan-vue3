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
  if (!pt) { console.log('[ERR] No page target'); process.exit(1); }
  console.log('[OK] Target: ' + pt.url);
  const ws = new WebSocket(pt.webSocketDebuggerUrl);
  let mid = 1; const pend = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  function ev(expr) { return new Promise(r => { const id = mid++; pend.set(id, r); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); }); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  ws.addEventListener('open', async () => {
    console.log('[OK] WS connected\n');

    // --- Diag 1: List all mode cards with full text ---
    console.log('=== Diag 1: Mode card contents ===');
    await ev(`var b=document.querySelectorAll('[data-tooltip]');var s=Array.from(b).find(x=>x.getAttribute('data-tooltip')==='设置');if(s)s.click()`);
    await sleep(500);
    await ev(`var t=document.querySelectorAll('.settings-tab');var d=Array.from(t).find(x=>x.textContent.includes('去AI'));if(d)d.click()`);
    await sleep(300);
    let r = await ev(`(function(){var cards=document.querySelectorAll('.deai-mode-card');var info=[];cards.forEach(function(c,i){info.push('card'+i+': title=['+c.querySelector('.deai-mode-card-title')?.textContent+'] desc=['+c.querySelector('.deai-mode-card-desc')?.textContent+'] active='+c.classList.contains('active'))});return info.join('\n')})()`);
    console.log(r.result?.result?.value || 'ERR');

    // --- Diag 2: Click each card by index and check mode ---
    console.log('\n=== Diag 2: Click by index ===');
    for (let i = 0; i < 3; i++) {
      await ev(`document.querySelectorAll('.deai-mode-card')[${i}].click()`);
      await sleep(400);
      r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;return 'mode='+pinia.state.value.deai.mode})()`);
      console.log('  click card[' + i + ']: ' + (r.result?.result?.value || 'ERR'));
      r = await ev(`(function(){var el=document.querySelector('.deai-flow-preview')||document.querySelector('.deai-flow-section');return el?el.textContent.substring(0,80):'NO_FLOW'})()`);
      console.log('  flow: ' + (r.result?.result?.value || 'ERR'));
    }

    // --- Diag 3: Pinia store keys for provider ---
    console.log('\n=== Diag 3: Pinia stores ===');
    r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;return Object.keys(pinia.state.value).join(', ')})()`);
    console.log('  stores: ' + (r.result?.result?.value || 'ERR'));
    r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;var s=pinia.state.value.provider;if(!s)return'no provider store';return JSON.stringify(Object.keys(s))})()`);
    console.log('  provider store keys: ' + (r.result?.result?.value || 'ERR'));

    // --- Diag 4: P12 immediate state check ---
    console.log('\n=== Diag 4: genSettings immediate state ===');
    await ev(`var ov=document.querySelector('.modal-overlay');if(ov){ov.click()}`);
    await sleep(300);
    await ev(`(function(){var b=document.querySelectorAll('button,[data-tooltip]');var p=Array.from(b).find(x=>x.textContent.includes('生成流水线'));if(p)p.click()})()`);
    await sleep(500);
    await ev(`var s=document.querySelectorAll('.pl-step');if(s.length>1)s[1].click()`);
    await sleep(300);
    r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;return 'before: isGenerating='+pinia.state.value.pipeline.isGenerating+' progress='+pinia.state.value.pipeline.progress})()`);
    console.log('  ' + (r.result?.result?.value || 'ERR'));
    await ev(`(function(){var p=document.querySelector('.pl-content')||document.querySelector('.pl-overlay');var btn=p.querySelector('button.btn-primary');if(btn)btn.click()})()`);
    r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;return 'immediate: isGenerating='+pinia.state.value.pipeline.isGenerating+' progress='+pinia.state.value.pipeline.progress+' step='+pinia.state.value.pipeline.currentStep})()`);
    console.log('  ' + (r.result?.result?.value || 'ERR'));
    await sleep(100);
    r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;return '100ms: isGenerating='+pinia.state.value.pipeline.isGenerating+' progress='+pinia.state.value.pipeline.progress+' errorMsg='+(pinia.state.value.pipeline.errorMsg||'none')})()`);
    console.log('  ' + (r.result?.result?.value || 'ERR'));
    await sleep(500);
    r = await ev(`(function(){var app=document.querySelector('#app').__vue_app__;var pinia=app.config.globalProperties.$pinia;return '500ms: isGenerating='+pinia.state.value.pipeline.isGenerating+' progress='+pinia.state.value.pipeline.progress+' errorMsg='+(pinia.state.value.pipeline.errorMsg||'none')})()`);
    console.log('  ' + (r.result?.result?.value || 'ERR'));

    ws.close(); process.exit(0);
  });
  setTimeout(() => { console.log('[ERR] Timeout'); process.exit(1); }, 20000);
}
main().catch(e => { console.log('[ERR] ' + e.message); process.exit(1); });
