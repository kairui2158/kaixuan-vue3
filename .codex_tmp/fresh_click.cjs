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

  // Close all panels first via Escape
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    modifiers: 0,
    windowsVirtualKeyCode: 0x1B
  });
  await new Promise(r => setTimeout(r, 200));
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    modifiers: 0,
    windowsVirtualKeyCode: 0x1B
  });
  await new Promise(r => setTimeout(r, 300));

  const r0 = await send('Runtime.evaluate', {
    expression: `window.__getActivePanel?.()`,
    returnByValue: true
  });
  console.log('AFTER ESC:', r0.result?.result?.value);

  // Now click the pipeline button
  await send('Runtime.evaluate', {
    expression: `document.getElementById('btn-pipeline').click()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 500));

  const r1 = await send('Runtime.evaluate', {
    expression: `window.__getActivePanel?.()`,
    returnByValue: true
  });
  console.log('AFTER CLICK:', r1.result?.result?.value);

  const r2 = await send('Runtime.evaluate', {
    expression: `document.querySelector('.pl-overlay') !== null`,
    returnByValue: true
  });
  console.log('PL-OVERLAY:', r2.result?.result?.value);

  // Check the sidebar button's click handler
  const r3 = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById('btn-pipeline');
      // Check for Vue event listeners
      const listeners = [];
      btn.__vueParentComponent?.();
      // Check parent component tree
      let el = btn;
      while (el) {
        if (el.__vueParentComponent) {
          listeners.push('found parent component at ' + el.tagName);
          break;
        }
        el = el.parentElement;
      }
      return JSON.stringify({
        id: btn.id,
        parent: btn.parentElement?.tagName,
        grandparent: btn.parentElement?.parentElement?.tagName,
        onclick: typeof btn.onclick,
        listeners: listeners
      });
    })()`,
    returnByValue: true
  });
  console.log('BTN:', r3.result?.result?.value);

  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
