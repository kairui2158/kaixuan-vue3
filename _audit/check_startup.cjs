const WebSocket = require('ws');
const http = require('http');
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}});
  }).on('error', reject);
  });
}
async function main() {
  const pages = await fetchJSON('http://127.0.0.1:9227/json');
  if (!pages.length) { console.log('NO_PAGES'); return; }
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
  let msgId = 1;
  function send(method, params) {
    const id = msgId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'timeout' }), 8000);
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) { clearTimeout(timer); ws.removeListener('message', handler); resolve(msg); }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 2000));

  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : 'FAIL';
  }

  // 1. Check if activePanel is persisted
  let ap = await ev('typeof __getActivePanel === "function" ? __getActivePanel() : "NO_FUNC"');
  console.log('activePanel: ' + ap);

  // 2. Check localStorage
  let ls = await ev('(function(){ try { let k = Object.keys(localStorage); return k.length ? k.join(", ") : "EMPTY"; } catch(e) { return "ERROR: " + e.message; } })()');
  console.log('localStorage keys: ' + ls);

  // 3. Check IndexedDB databases
  let idb = await ev('(function(){ return new Promise((res) => { try { let r = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]); r.then(dbs => { res(dbs.map(d=>d.name).join(", ") || "EMPTY"); }).catch(e => res("ERROR: " + e.message)); } catch(e) { res("ERROR: " + e.message); }}); })()');
  console.log('IndexedDB databases: ' + idb);

  // 4. Check if ow-overlay exists and why
  let ow = await ev('(function(){ let el = document.querySelector(".ow-overlay"); if(!el) return "NOT_FOUND"; let cs = window.getComputedStyle(el); let r = el.getBoundingClientRect(); return {display:cs.display,parent:el.parentElement ? el.parentElement.tagName : "NONE",siblings: el.parentElement ? el.parentElement.children.length : 0,visible:cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0,rect: Math.round(r.width) + "x" + Math.round(r.height)}; })()');
  console.log('ow-overlay: ' + JSON.stringify(ow));

  // 5. Check if the ow-overlay is inside a v-if that's true
  if (typeof ow === 'object' && ow.visible) {
    let inside = await ev('(function(){ let el = document.querySelector(".ow-overlay"); let p = el.parentElement; let chain = []; while(p && p.tagName !== "BODY") { chain.push(p.tagName + (p.className ? "." + p.className.slice(0,30) : "")); p = p.parentElement; } return chain.join(" > "); })()');
    console.log('DOM chain: ' + inside);
  }

  // 6. Screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    require('fs').writeFileSync('_audit/regression_startup.png', Buffer.from(shot.result.data, 'base64'));
    console.log('Screenshot: ' + Math.round(shot.result.data.length / 1024) + 'KB');
  }

  ws.close();
}
main().catch(e => console.log('FATAL: ' + e.message));
