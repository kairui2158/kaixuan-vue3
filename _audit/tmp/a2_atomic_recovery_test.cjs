// A2 atomic write + corruption recovery probe
// Usage: node a2_atomic_recovery_test.cjs setup|verify-recovery|verify-nobak|loop
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
  const ev = (ex) => new Promise((res) => {
    const mid = ++id;
    pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression: ex, returnByValue: true, awaitPromise: true } }));
  });
  let out;
  if (mode === 'setup') {
    out = await ev(`(async()=>{
      const api=window.electronAPI;
      const w1=await api.storageWrite('probe_a2',{v:1});
      const w2=await api.storageWrite('probe_a2',{v:2});
      const r=await api.storageRead('probe_a2');
      const w3=await api.storageWrite('probe_a2_nobak',{v:9});
      return {w1,w2,r,w3};
    })()`);
  } else if (mode === 'verify-recovery') {
    out = await ev(`(async()=>{
      const api=window.electronAPI;
      const r=await api.storageRead('probe_a2');
      const log=await api.storageCorruptionLog();
      return {readAfterCorruption:r, logHasEntries:log&&log.hasEntries, lastEntry:log&&log.entries?log.entries[log.entries.length-1]:null};
    })()`);
  } else if (mode === 'verify-nobak') {
    out = await ev(`(async()=>{
      const api=window.electronAPI;
      const r=await api.storageRead('probe_a2_nobak');
      const log=await api.storageCorruptionLog();
      return {readAfterCorruptionNoBak:r, logHasEntries:log&&log.hasEntries, lastEntry:log&&log.entries?log.entries[log.entries.length-1]:null};
    })()`);
  } else if (mode === 'loop') {
    out = await ev(`(async()=>{
      const api=window.electronAPI;
      let okCount=0;
      for(let i=0;i<100;i++){
        const ok=await api.storageWrite('probe_a2_loop',{i});
        if(ok) okCount++;
      }
      return {okCount,total:100};
    })()`);
  }
  console.log(JSON.stringify(out.result.value, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
