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
  
  // Try simple expression
  const r1 = await send('Runtime.evaluate', { expression: '1+1', returnByValue: true });
  console.log('1+1:', JSON.stringify(r1.result));
  
  const r2 = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
  console.log('title:', JSON.stringify(r2.result));
  
  const r3 = await send('Runtime.evaluate', { expression: 'typeof window', returnByValue: true });
  console.log('typeof window:', JSON.stringify(r3.result));
  
  const r4 = await send('Runtime.evaluate', { expression: 'typeof __pinia', returnByValue: true });
  console.log('typeof __pinia:', JSON.stringify(r4.result));
  
  const r5 = await send('Runtime.evaluate', { expression: 'typeof globalThis.__pinia', returnByValue: true });
  console.log('typeof globalThis.__pinia:', JSON.stringify(r5.result));
  
  const r6 = await send('Runtime.evaluate', { expression: 'typeof window.electronAPI', returnByValue: true });
  console.log('typeof electronAPI:', JSON.stringify(r6.result));
  
  ws.close();
}
main().catch(e => console.log('FATAL:' + e.message));
