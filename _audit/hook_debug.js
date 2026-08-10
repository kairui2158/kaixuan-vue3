const http = require('http');

const CDP_PORT = 9224;

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

async function debug() {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && t.url && t.url.includes('localhost:5173'));
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

  ws.addEventListener('open', async () => {
    // 1. Check provider store methods
    let r1 = await evalJS("try { var app = document.querySelector('#app').__vue_app__; var pinia = app.config.globalProperties.$pinia; var s = pinia._s.get('provider'); if(!s) 'no-store'; else { var methods = []; for(var k in s) { if(typeof s[k]==='function') methods.push(k); } var props = []; for(var k in s) { if(typeof s[k]!=='function') props.push(k+'='+String(s[k]).slice(0,50)); } JSON.stringify({storeKeys: Object.keys(s), methods: methods, props: props.slice(0,10), hasSetGen: typeof s.setGenerateProvider, hasSave: typeof s.saveProviders, provLen: s.providers ? s.providers.length : -1}); } } catch(e) { 'ERR: ' + e.message + ' STACK: ' + e.stack }");
    console.log('PROVIDER STORE: ' + (r1.result && r1.result.result ? JSON.stringify(r1.result.result.value) : JSON.stringify(r1)));

    // 2. Try calling setGenerateProvider with try-catch
    let r2 = await evalJS("try { var app = document.querySelector('#app').__vue_app__; var pinia = app.config.globalProperties.$pinia; var s = pinia._s.get('provider'); var providers = s.providers; if(!providers || providers.length===0) 'no-providers'; else { var fid = providers[0].id; s.setGenerateProvider(fid); 'OK set to ' + fid; } } catch(e) { 'ERR: ' + e.message + ' STACK: ' + (e.stack||'').slice(0,300); }");
    console.log('SET GEN PROV: ' + (r2.result && r2.result.result ? JSON.stringify(r2.result.result.value) : JSON.stringify(r2)));

    // 3. Check deai store
    let r3 = await evalJS("try { var app = document.querySelector('#app').__vue_app__; var pinia = app.config.globalProperties.$pinia; var s = pinia._s.get('deai'); if(!s) 'no-deai-store'; else { var methods = []; for(var k in s) { if(typeof s[k]==='function') methods.push(k); } JSON.stringify({storeKeys: Object.keys(s), methods: methods, mode: s.mode, hardrule: s.hardruleEnabled, hasSetMode: typeof s.setMode, hasSave: typeof s.saveConfig}); } } catch(e) { 'ERR: ' + e.message + ' STACK: ' + e.stack }");
    console.log('DEAI STORE: ' + (r3.result && r3.result.result ? JSON.stringify(r3.result.result.value) : JSON.stringify(r3)));

    // 4. Try deai setMode
    let r4 = await evalJS("try { var app = document.querySelector('#app').__vue_app__; var pinia = app.config.globalProperties.$pinia; var s = pinia._s.get('deai'); var cur = s.mode; var nm = cur === 'chain' ? 'split-merge' : 'chain'; s.setMode(nm); 'OK mode=' + s.mode; } catch(e) { 'ERR: ' + e.message + ' STACK: ' + (e.stack||'').slice(0,300); }");
    console.log('DEAI SETMODE: ' + (r4.result && r4.result.result ? JSON.stringify(r4.result.result.value) : JSON.stringify(r4)));

    // 5. Try hardrule toggle
    let r5 = await evalJS("try { var app = document.querySelector('#app').__vue_app__; var pinia = app.config.globalProperties.$pinia; var s = pinia._s.get('deai'); var prev = s.hardruleEnabled; s.hardruleEnabled = !prev; s.saveConfig(); 'OK prev=' + prev + ' now=' + s.hardruleEnabled; } catch(e) { 'ERR: ' + e.message + ' STACK: ' + (e.stack||'').slice(0,300); }");
    console.log('HARDRULE TOGGLE: ' + (r5.result && r5.result.result ? JSON.stringify(r5.result.result.value) : JSON.stringify(r5)));

    // 6. Check breadcrumb
    let r6 = await evalJS("try { var bc = document.querySelector('.breadcrumb-bar'); var bcItems = document.querySelectorAll('.breadcrumb-item'); JSON.stringify({hasBar: !!bc, barVisible: bc ? getComputedStyle(bc).display !== 'none' : false, itemCount: bcItems.length, html: bc ? bc.outerHTML.slice(0,200) : 'none'}); } catch(e) { 'ERR: ' + e.message; }");
    console.log('BREADCRUMB: ' + (r6.result && r6.result.result ? JSON.stringify(r6.result.result.value) : JSON.stringify(r6)));

    // 7. Check pipeline element in DOM (not rendered panel)
    let r7 = await evalJS("try { var pl = document.querySelector('[class*=pipeline]'); var plStep = document.querySelector('[class*=pl-step]'); JSON.stringify({hasPipeline: !!pl, hasPlStep: !!plStep, plClass: pl ? pl.className : 'none'}); } catch(e) { 'ERR: ' + e.message; }");
    console.log('PIPELINE DOM: ' + (r7.result && r7.result.result ? JSON.stringify(r7.result.result.value) : JSON.stringify(r7)));

    ws.close();
    process.exit(0);
  });

  setTimeout(() => { process.exit(1); }, 10000);
}

debug().catch(e => { console.log('[ERR] ' + e.message); process.exit(1); });
