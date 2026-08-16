const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

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
  
  // Check 1: Pinia stores
  const r1 = await send('Runtime.evaluate', { expression: 'typeof __pinia', returnByValue: true });
  console.log('1. Pinia:', r1.result ? r1.result.value : r1.error);
  
  const r2 = await send('Runtime.evaluate', { expression: 'typeof __pinia.state.value.project', returnByValue: true });
  console.log('2. Project store:', r2.result ? r2.result.value : r2.error);
  
  const r3 = await send('Runtime.evaluate', { expression: 'typeof __pinia.state.value.pipeline', returnByValue: true });
  console.log('3. Pipeline store:', r3.result ? r3.result.value : r3.error);
  
  const r4 = await send('Runtime.evaluate', { expression: 'typeof __pinia.state.value.chat', returnByValue: true });
  console.log('4. Chat store:', r4.result ? r4.result.value : r4.error);
  
  const r5 = await send('Runtime.evaluate', { expression: 'typeof __pinia.state.value.agent', returnByValue: true });
  console.log('5. Agent store:', r5.result ? r5.result.value : r5.error);
  
  const r6 = await send('Runtime.evaluate', { expression: 'typeof __pinia.state.value.skill', returnByValue: true });
  console.log('6. Skill store:', r6.result ? r6.result.value : r6.error);
  
  const r7 = await send('Runtime.evaluate', { expression: 'typeof __pinia.state.value.settings', returnByValue: true });
  console.log('7. Settings store:', r7.result ? r7.result.value : r7.error);
  
  const r8 = await send('Runtime.evaluate', { expression: 'typeof __pinia.state.value.theme', returnByValue: true });
  console.log('8. Theme store:', r8.result ? r8.result.value : r8.error);
  
  const r9 = await send('Runtime.evaluate', { expression: 'typeof __pinia.state.value.provider', returnByValue: true });
  console.log('9. Provider store:', r9.result ? r9.result.value : r9.error);
  
  // Check 2: electronAPI
  const r10 = await send('Runtime.evaluate', { expression: 'typeof window.electronAPI', returnByValue: true });
  console.log('10. electronAPI:', r10.result ? r10.result.value : r10.error);
  
  const r11 = await send('Runtime.evaluate', { expression: 'typeof window.electronAPI.storageRead', returnByValue: true });
  console.log('11. storageRead:', r11.result ? r11.result.value : r11.error);
  
  const r12 = await send('Runtime.evaluate', { expression: 'typeof window.electronAPI.storageWrite', returnByValue: true });
  console.log('12. storageWrite:', r12.result ? r12.result.value : r12.error);
  
  // Check 3: Screenshot
  await send('Page.enable');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    fs.writeFileSync('_audit/final_regression.png', Buffer.from(shot.result.data, 'base64'));
    console.log('13. Screenshot: ' + Math.round(shot.result.data.length / 1024) + 'KB');
  } else {
    console.log('13. Screenshot: FAILED');
  }
  
  ws.close();
}
main().catch(e => console.log('FATAL:' + e.message));
