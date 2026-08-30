// B4 real UI import verification: 10 keys via importData(), 1 forced write failure
// (pre-created "<key>.json.tmp" directory makes that key's tmp write fail with EISDIR).
// Usage: node b4_import_test.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dataDir = path.join(process.env.USERPROFILE, 'Documents', '神意助手数据');
const failKey = 'b4_probe_key_3';
const keys = [];
const payload = {};
for (let i = 0; i < 10; i++) { keys.push('b4_probe_key_' + i); payload['b4_probe_key_' + i] = 'v' + i; }
const payloadJson = JSON.stringify(payload);

(async () => {
  // Give the failing key a distinct old value on disk so "unchanged" is provable.
  const failFile = path.join(dataDir, failKey + '.json');
  fs.writeFileSync(failFile, JSON.stringify({ old: true }), 'utf8');
  const failTmpDir = path.join(dataDir, failKey + '.json.tmp');
  if (fs.existsSync(failTmpDir)) { try { fs.rmdirSync(failTmpDir) } catch(e) {} }
  fs.mkdirSync(failTmpDir);

  const pages = await new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9227, path: '/json' }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); let alertText = null; let alertWaiter = null;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Page.javascriptDialogOpening') {
      alertText = m.params.message;
      ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
      if (alertWaiter) { alertWaiter(); alertWaiter = null; }
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params) => new Promise((res) => {
    const mid = ++id; pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  const ev = (ex) => send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
  await send('Page.enable');

  // Open settings modal on the appearance tab.
  await ev(`(async()=>{
    if (!document.getElementById('settings-modal')) { document.getElementById('btn-settings')?.click(); await new Promise(r=>setTimeout(r,500)); }
    document.getElementById('tab-appearance')?.click();
    await new Promise(r=>setTimeout(r,300));
    return true;
  })()`);

  // Intercept the dynamic .json file input: feed it our payload via DataTransfer.
  const inject = `(function(){
    window.__b4Alert = null;
    const payload = ${JSON.stringify(payloadJson)};
    window.__origInputClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function() {
      if (this.accept === '.json') {
        const dt = new DataTransfer();
        dt.items.add(new File([payload], 'probe-import.json', { type: 'application/json' }));
        this.files = dt.files;
        this.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      return window.__origInputClick.apply(this, arguments);
    };
    document.getElementById('btn-import-data').click();
    return true;
  })()`;
  await ev(inject);

  // Wait for the summary alert (blocks renderer until auto-accepted).
  await Promise.race([
    new Promise((r) => { alertWaiter = r; }),
    new Promise((r) => setTimeout(r, 15000)),
  ]);
  await ev(`HTMLInputElement.prototype.click = window.__origInputClick; delete window.__origInputClick;`);
  ws.close();

  // Read back every key from disk; the denied key must be untouched.
  const results = {};
  for (const k of keys) {
    const f = path.join(dataDir, k + '.json');
    results[k] = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '(missing)';
  }
  let tmpDirCleaned = true;
  try { fs.rmdirSync(failTmpDir) } catch (e) { tmpDirCleaned = false; }
  const expected = {};
  for (let i = 0; i < 10; i++) expected['b4_probe_key_' + i] = '"v' + i + '"';
  const failed = keys.filter((k) => results[k] !== expected[k]);
  console.log(JSON.stringify({
    alert: alertText,
    failKeyDisk: results[failKey],
    unexpectedDiffs: failed,
    tmpDirCleaned: tmpDirCleaned,
    verdict: alertText && alertText.includes('成功 9 项') && alertText.includes(failKey) && failed.length === 1 && failed[0] === failKey && results[failKey] === '{"old":true}' ? 'PASS' : 'FAIL',
  }, null, 2));
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
