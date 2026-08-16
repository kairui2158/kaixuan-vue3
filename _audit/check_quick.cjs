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
  
  const checks = [
    ['typeof __pinia', 'Pinia store'],
    ['typeof __pinia.state.value.project', 'Project store'],
    ['typeof __pinia.state.value.pipeline', 'Pipeline store'],
    ['typeof __pinia.state.value.chat', 'Chat store'],
    ['typeof __pinia.state.value.agent', 'Agent store'],
    ['typeof __pinia.state.value.skill', 'Skill store'],
    ['typeof __pinia.state.value.settings', 'Settings store'],
    ['typeof __pinia.state.value.theme', 'Theme store'],
    ['typeof __pinia.state.value.provider', 'Provider store'],
    ['typeof window.electronAPI', 'electronAPI'],
    ['typeof window.electronAPI.storageRead', 'storageRead func'],
    ['typeof window.electronAPI.storageWrite', 'storageWrite func'],
    ['typeof window.electronAPI.windowClose', 'windowClose func'],
    ['typeof window.electronAPI.fetchModels', 'fetchModels func'],
  ];
  
  for (const [expr, label] of checks) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    const val = r.result && r.result.result ? r.result.result.value : '?';
    console.log(label + ': ' + val);
  }
  
  // Screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    fs.writeFileSync('_audit/final_regression.png', Buffer.from(shot.result.data, 'base64'));
    console.log('Screenshot: ' + Math.round(shot.result.data.length / 1024) + 'KB');
  } else {
    console.log('Screenshot: FAILED');
  }
  
  ws.close();
}
main().catch(e => console.log('FATAL:' + e.message));
