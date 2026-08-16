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

  // List all stores
  const r1 = await send('Runtime.evaluate', { expression: 'Object.keys(__pinia.state.value).join(\",\")', returnByValue: true });
  console.log('Stores:', r1.result ? r1.result.value : r1.error);

  // Check project store
  const r2 = await send('Runtime.evaluate', { expression: 'JSON.stringify({hasProject: !!__pinia.state.value.project, keys: Object.keys(__pinia.state.value.project||{})})', returnByValue: true });
  console.log('Project:', r2.result ? r2.result.value : r2.error);

  // Check pipeline store
  const r3 = await send('Runtime.evaluate', { expression: 'JSON.stringify({hasPipeline: !!__pinia.state.value.pipeline, keys: Object.keys(__pinia.state.value.pipeline||{})})', returnByValue: true });
  console.log('Pipeline:', r3.result ? r3.result.value : r3.error);

  // Check chat store
  const r4 = await send('Runtime.evaluate', { expression: 'JSON.stringify({hasChat: !!__pinia.state.value.chat, keys: Object.keys(__pinia.state.value.chat||{})})', returnByValue: true });
  console.log('Chat:', r4.result ? r4.result.value : r4.error);

  // Check agent store
  const r5 = await send('Runtime.evaluate', { expression: 'JSON.stringify({hasAgent: !!__pinia.state.value.agent, keys: Object.keys(__pinia.state.value.agent||{})})', returnByValue: true });
  console.log('Agent:', r5.result ? r5.result.value : r5.error);

  // Check skill store
  const r6 = await send('Runtime.evaluate', { expression: 'JSON.stringify({hasSkill: !!__pinia.state.value.skill, keys: Object.keys(__pinia.state.value.skill||{})})', returnByValue: true });
  console.log('Skill:', r6.result ? r6.result.value : r6.error);

  // Check settings store
  const r7 = await send('Runtime.evaluate', { expression: 'JSON.stringify({hasSettings: !!__pinia.state.value.settings, keys: Object.keys(__pinia.state.value.settings||{})})', returnByValue: true });
  console.log('Settings:', r7.result ? r7.result.value : r7.error);

  // Check theme store
  const r8 = await send('Runtime.evaluate', { expression: 'JSON.stringify({hasTheme: !!__pinia.state.value.theme, keys: Object.keys(__pinia.state.value.theme||{})})', returnByValue: true });
  console.log('Theme:', r8.result ? r8.result.value : r8.error);

  // Check provider store
  const r9 = await send('Runtime.evaluate', { expression: 'JSON.stringify({hasProvider: !!__pinia.state.value.provider, keys: Object.keys(__pinia.state.value.provider||{})})', returnByValue: true });
  console.log('Provider:', r9.result ? r9.result.value : r9.error);

  // Check electronAPI method availability
  const r10 = await send('Runtime.evaluate', { expression: 'Object.keys(window.electronAPI).join(\",\")', returnByValue: true });
  console.log('electronAPI methods:', r10.result ? r10.result.value : r10.error);

  // Check key electronAPI methods work
  const r11 = await send('Runtime.evaluate', { expression: 'typeof window.electronAPI.storageRead', returnByValue: true });
  console.log('storageRead:', r11.result ? r11.result.value : r11.error);

  const r12 = await send('Runtime.evaluate', { expression: 'typeof window.electronAPI.storageWrite', returnByValue: true });
  console.log('storageWrite:', r12.result ? r12.result.value : r12.error);

  ws.close();
}
main().catch(e => console.log('FATAL:' + e.message));
