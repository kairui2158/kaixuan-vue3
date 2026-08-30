const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getPageWs() {
  const res = await fetch('http://127.0.0.1:9227/json');
  const targets = await res.json();
  const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
  return page.webSocketDebuggerUrl;
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    let nativeCount = 0;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Page.javascriptDialogOpening') nativeCount++;
      if (pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); }
    };
    ws.onopen = () => resolve({ send(method, params = {}) { return new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); }); }, close: () => ws.close(), get nativeCount() { return nativeCount; } });
    ws.onerror = reject;
  });
}
async function ev(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}
async function wait(cdp, expr, tries = 10) {
  for (let i = 0; i < tries; i++) {
    if (await ev(cdp, expr)) return true;
    await sleep(250);
  }
  return false;
}
(async () => {
  const cdp = await connect(await getPageWs());
  await cdp.send('Page.enable');
  const pre = await ev(cdp, `(() => { const app=document.querySelector('#app').__vue_app__; const ps=app.config.globalProperties.$pinia._s.get('project'); return {name:ps.projectName,hasVolume:(ps.volumes||[]).length>0,overlay:!!document.querySelector('.app-confirm-overlay')}; })()`);
  if (!pre.name || !pre.hasVolume) throw new Error('need a project with one volume');
  if (pre.overlay) {
    await ev(cdp, `(() => { const b=[...document.querySelectorAll('.app-confirm-content button')];(b.find(e=>e.textContent.trim()==='取消')||b[0]).click(); })()`);
    await sleep(300);
  }
  await ev(cdp, `(() => { const item=Array.from(document.querySelectorAll('.volume-item')).find(e=>e.textContent.trim()); item.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:120,clientY:180})); })()`);
  if (!await wait(cdp, `!!document.querySelector('.ctx-menu')`)) throw new Error('context menu did not open');
  await ev(cdp, `(() => { const btn=Array.from(document.querySelectorAll('.ctx-item.danger')).find(e=>e.textContent.includes('删除')); btn.click(); })()`);
  if (!await wait(cdp, `!!document.querySelector('.app-confirm-overlay')`)) throw new Error('app confirm did not open');
  await ev(cdp, `(() => { const btn=Array.from(document.querySelectorAll('.app-confirm-content button')).find(e=>e.textContent.trim()==='取消'); btn.click(); })()`);
  const closed = await wait(cdp, `!document.querySelector('.app-confirm-overlay')`);
  const storeKept = await ev(cdp, `(() => { const ps=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('project'); return (ps.volumes||[]).length>0; })()`);
  console.log(JSON.stringify({ nativeDialogCount: cdp.nativeCount, closed, storeKept, pass: cdp.nativeCount === 0 && closed && storeKept }));
  cdp.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
