const http = require('http');
const fs = require('fs');

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9227, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

(async () => {
  const pages = await getJson('/json');
  const page = pages.find((p) => p.type === 'page');
  const WebSocket = global.WebSocket || require('ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = new Map();
  function send(method, params) {
    return new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Runtime.enable');
  await send('Page.enable');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('_audit/tmp/p0_baseline.png', Buffer.from(shot.data, 'base64'));
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.value;
  };
  const checks = {
    title: await evalJs('document.title'),
    appMounted: await evalJs('!!document.querySelector("#app")'),
    sidebar: await evalJs('!!document.querySelector(".chapter-tree, [class*=tree], #chapter-tree") || !!document.querySelector("aside, nav")'),
    chatPanel: await evalJs('!!document.querySelector("#chat-panel")'),
    editor: await evalJs('!!document.querySelector(".editor-container, .ProseMirror, [contenteditable], textarea")'),
    topMenuHelp: await evalJs('Array.from(document.querySelectorAll("button, a, [role=menuitem]")).map(e=>e.textContent.trim()).filter(t=>t.includes("帮助")).length'),
    bodyScrollW: await evalJs('document.body.scrollWidth'),
    viewportW: await evalJs('window.innerWidth'),
    electronAPI: await evalJs('typeof window.electronAPI'),
    consoleErrors: []
  };
  ws.addEventListener('message', () => {});
  await send('Runtime.evaluate', { expression: 'console.clear(); window.__scanErrors=[]; console.error=(...a)=>window.__scanErrors.push(String(a[0])); 1', returnByValue: true });
  // give a moment, then re-evaluate errors captured so far (pre-clear errors not recoverable; note in report)
  checks.note = 'console cleared at probe time; prior errors not captured';
  console.log(JSON.stringify(checks, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('PROBE_FAIL', e.message); process.exit(1); });
