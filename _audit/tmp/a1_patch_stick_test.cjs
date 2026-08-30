const http = require('http');
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
  const ev = (ex) => new Promise((res) => {
    const mid = ++id;
    pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression: ex, returnByValue: true, awaitPromise: true } }));
  });
  const out = await ev(`(async()=>{
    const api=window.electronAPI;
    const orig=api.storageWrite;
    let assignError=null;
    try{api.storageWrite=async()=>false}catch(e){assignError=e.message}
    const readBack=api.storageWrite;
    let callResult=null;
    if(typeof readBack==='function' && readBack!==orig){callResult=await readBack('probe_patch_test','x')}
    api.storageWrite=orig;
    const restored=api.storageWrite===orig;
    return {assignError,patched:readBack!==orig,callResult,restored,frozen:Object.isFrozen(api)};
  })()`);
  console.log(JSON.stringify(out.result !== undefined ? out.result.value ?? out : out, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
