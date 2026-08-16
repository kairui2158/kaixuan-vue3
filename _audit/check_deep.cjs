const WebSocket = require('ws');
const http = require('http');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
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
      const timer = setTimeout(() => resolve({ error: 'timeout' }), 5000);
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
  await new Promise(r => setTimeout(r, 3000));
  
  const checks = [
    'window.__pinia !== undefined',
    'window.__app !== undefined',
    'typeof window.electronAPI',
    'document.querySelector("#app") ? document.querySelector("#app").children.length : -1',
    'typeof window.__pinia !== "undefined" ? "store_ok" : "store_missing"',
  ];
  
  for (const expr of checks) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, timeout: 5000 });
    const val = r.result ? JSON.stringify(r.result.value) : (r.error || 'no_result');
    console.log(expr + ' => ' + val);
  }
  
  ws.close();
}
main().catch(e => console.log('FATAL:' + e.message));
