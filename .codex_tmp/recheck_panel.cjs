const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:9227/devtools/page/758FD9469B14E631435B117C714CCD7E');
let id = 1;
function send(method, params) {
  return new Promise((resolve, reject) => {
    const msgId = id++;
    const handler = (data) => {
      const obj = JSON.parse(data);
      if (obj.id === msgId) {
        ws.removeListener('message', handler);
        resolve(obj);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({id: msgId, method, params}));
    setTimeout(() => reject(new Error('timeout: ' + method)), 5000);
  });
}
ws.on('open', async () => {
  await send('Runtime.enable');

  // Check current state
  const r0 = await send('Runtime.evaluate', {
    expression: `window.__getActivePanel?.()`,
    returnByValue: true
  });
  console.log('BEFORE:', r0.result?.result?.value);

  // Click pipeline button
  await send('Runtime.evaluate', {
    expression: `document.getElementById('btn-pipeline').click()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 200));

  // Check state after
  const r1 = await send('Runtime.evaluate', {
    expression: `window.__getActivePanel?.()`,
    returnByValue: true
  });
  console.log('AFTER:', r1.result?.result?.value);

  // Check if panel-backdrop exists
  const r2 = await send('Runtime.evaluate', {
    expression: `document.getElementById('panel-backdrop') !== null`,
    returnByValue: true
  });
  console.log('BACKDROP:', r2.result?.result?.value);

  // Check if pl-overlay exists
  const r3 = await send('Runtime.evaluate', {
    expression: `document.querySelector('.pl-overlay') !== null`,
    returnByValue: true
  });
  console.log('PL-OVERLAY:', r3.result?.result?.value);

  // Check if the main app container's internal state changed
  const r4 = await send('Runtime.evaluate', {
    expression: `(() => {
      // Vue 3.5: check if there are pending updates
      const app = document.querySelector("#app").__vue_app__;
      return JSON.stringify({
        uid: app._uid,
        children: document.querySelector("#app").children.length,
        containerChildren: app._container.children.length
      });
    })()`,
    returnByValue: true
  });
  console.log('APP:', r4.result?.result?.value);

  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
