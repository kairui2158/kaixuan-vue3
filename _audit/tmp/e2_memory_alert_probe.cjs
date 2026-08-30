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
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
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
  await ev(cdp, `document.querySelector('#btn-memory').click()`);
  if (!await wait(cdp, `!!document.querySelector('#memory-panel')`)) throw new Error('memory panel did not open');
  await ev(cdp, `document.querySelector('#btn-add-mem').click()`);
  if (!await wait(cdp, `!!document.querySelector('.mem-form')`)) throw new Error('memory form did not open');
  await ev(cdp, `(() => { const btn=Array.from(document.querySelectorAll('.mem-form button')).find(e=>e.textContent.trim()==='保存'); btn.click(); })()`);
  const shown = await wait(cdp, `!!document.querySelector('.app-confirm-overlay')`);
  const text = shown ? await ev(cdp, `(document.querySelector('.app-confirm-message')||{}).textContent||''`) : '';
  if (shown) {
    await ev(cdp, `(() => { const btn=Array.from(document.querySelectorAll('.app-confirm-content button')).find(e=>e.textContent.trim()==='确定'); btn.click(); })()`);
  }
  const closed = shown ? await wait(cdp, `!document.querySelector('.app-confirm-overlay')`) : false;
  console.log(JSON.stringify({ shown, text, closed, nativeDialogCount: cdp.nativeCount, pass: shown && text.includes('键名和内容不能为空') && closed && cdp.nativeCount === 0 }));
  cdp.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
