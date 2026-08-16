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
  await new Promise(r => setTimeout(r, 1000));
  const r = await send('Runtime.evaluate', {
    expression: (function(){ let overlays = document.querySelectorAll('.modal-overlay'); let out = []; overlays.forEach(o=>{ let content = o.querySelector('.modal-content'); let title = ''; let h = content ? content.querySelector('h3, .modal-header span, .modal-header') : null; if (h) title = h.textContent.trim().slice(0,60); let cs = window.getComputedStyle(o); out.push({cls: o.className.slice(0,80), display: cs.display, title: title, childCount: o.children.length, contentRect: content ? Math.round(content.getBoundingClientRect().width)+'x'+Math.round(content.getBoundingClientRect().height) : 'N/A'}); }); return out; })(),
    returnByValue: true
  });
  console.log(JSON.stringify(r.result && r.result.result ? r.result.result.value : r, null, 2));
  ws.close();
}
main().catch(e => console.log('FATAL: ' + e.message));
