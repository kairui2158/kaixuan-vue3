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
  await new Promise(r => setTimeout(r, 2000));
  
  const stores = ['project','pipeline','chat','agent','skill','settings','theme','provider'];
  for (const s of stores) {
    const r = await send('Runtime.evaluate', { expression: 'typeof __pinia.state.value.' + s, returnByValue: true });
    console.log(s + ':', r.result ? r.result.value : 'ERROR');
  }
  
  const r2 = await send('Runtime.evaluate', { expression: 'Object.keys(window.electronAPI).length', returnByValue: true });
  console.log('electronAPI methods count:', r2.result ? r2.result.value : 'ERROR');
  
  // Check storageRead
  const r3 = await send('Runtime.evaluate', { expression: 'typeof window.electronAPI.storageRead === "function"', returnByValue: true });
  console.log('storageRead function:', r3.result ? r3.result.value : 'ERROR');
  
  ws.close();
}
main().catch(e => console.log('FATAL:' + e.message));
