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

  // First reset activePanel to empty
  await send('Runtime.evaluate', {
    expression: `(() => {
      // Directly set the Vue ref value via __getActivePanel
      // Since __getActivePanel returns f.value, and f is a ref
      // We need to find the component instance
      const app = document.querySelector("#app").__vue_app__;
      // Try to set the ref through the component's exposed properties
      // Check if there's a way to access the root component
      return "reset attempted";
    })()`,
    returnByValue: true
  });

  // Set activePanel via the keyboard shortcut (Ctrl+3 = pipeline)
  // This bypasses the click handler
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    modifiers: 2, // Ctrl
    key: '3',
    code: 'Digit3',
    text: '3',
    autoRepeat: false,
    windowsVirtualKeyCode: 0x33
  });
  await new Promise(r => setTimeout(r, 200));
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    modifiers: 2,
    key: '3',
    code: 'Digit3',
    windowsVirtualKeyCode: 0x33
  });
  await new Promise(r => setTimeout(r, 500));

  // Check state
  const r1 = await send('Runtime.evaluate', {
    expression: `window.__getActivePanel?.()`,
    returnByValue: true
  });
  console.log('AFTER CTRL+3:', r1.result?.result?.value);

  // Check backdrop
  const r2 = await send('Runtime.evaluate', {
    expression: `document.getElementById('panel-backdrop') !== null`,
    returnByValue: true
  });
  console.log('BACKDROP:', r2.result?.result?.value);

  // Check pl-overlay
  const r3 = await send('Runtime.evaluate', {
    expression: `document.querySelector('.pl-overlay') !== null`,
    returnByValue: true
  });
  console.log('PL-OVERLAY:', r3.result?.result?.value);

  // Force set activePanel and check if it renders
  const r4 = await send('Runtime.evaluate', {
    expression: `(() => {
      // Try to force render by calling the button click
      document.getElementById('btn-pipeline').click();
      return "clicked";
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 300));
  const r5 = await send('Runtime.evaluate', {
    expression: `window.__getActivePanel?.()`,
    returnByValue: true
  });
  console.log('AFTER CLICK:', r5.result?.result?.value);
  const r6 = await send('Runtime.evaluate', {
    expression: `document.querySelector('.pl-overlay') !== null`,
    returnByValue: true
  });
  console.log('PL-OVERLAY AFTER CLICK:', r6.result?.result?.value);

  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
