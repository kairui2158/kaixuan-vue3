// B1 real UI verification: setup | verify
// Usage: node b1_token_test.cjs setup|verify
const http = require('http');
const mode = process.argv[2] || 'setup';
function getJson(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9227, path }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}
(async () => {
  const pages = await getJson('/json');
  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  await new Promise((res) => {
    const mid = ++id;
    pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method: 'Page.enable', params: {} }));
  });
  // dismiss any dialog left open by a previous crashed probe
  ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
  await new Promise((r) => setTimeout(r, 300));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Page.javascriptDialogOpening') {
      const did = ++id;
      ws.send(JSON.stringify({ id: did, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    }
  });
  const ev = (ex) => new Promise((res) => {
    const mid = ++id;
    pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression: ex, returnByValue: true, awaitPromise: true } }));
  });
  let out;
  if (mode === 'setup') {
    out = await ev(`(async()=>{
      await window.electronAPI.storageWrite('github_token','ghp_probe_token_abc');
      setTimeout(()=>location.reload(),100);
      return {wrote:true};
    })()`);
  } else if (mode === 'verify') {
    out = await ev(`(async()=>{
      if (!document.getElementById('settings-modal')) {
        const btn=document.getElementById('btn-settings');
        btn?.click();
        await new Promise(r=>setTimeout(r,500));
      }
      const tab=document.getElementById('tab-appearance');
      tab?.click();
      await new Promise(r=>setTimeout(r,400));
      const input=document.querySelector('.gh-input');
      const echoed=input?input.value:null;
      input.value='  ghp_trim_test  ';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('change'));
      await new Promise(r=>setTimeout(r,500));
      const saved=await window.electronAPI.storageRead('github_token');
      return {inputFound:!!input, echoed, saved};
    })()`);
  }
  if (out.exceptionDetails) {
    console.log(JSON.stringify({ __err: out.exceptionDetails.exception?.description || out.exceptionDetails.text }, null, 2));
  } else {
    console.log(JSON.stringify(out.result.value, null, 2));
  }
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
