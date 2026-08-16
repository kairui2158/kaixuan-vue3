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

  // Add debug instrumentation before reload
  const r0 = await send('Runtime.evaluate', {
    expression: `(() => {
      // Intercept all unhandled errors and Vue warnings
      window.__capturedErrors = [];
      window.addEventListener('error', (e) => {
        window.__capturedErrors.push({type: 'error', message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, error: e.error ? String(e.error.stack || e.error) : ''});
      });
      window.addEventListener('unhandledrejection', (e) => {
        window.__capturedErrors.push({type: 'rejection', reason: String(e.reason && (e.reason.stack || e.reason.message || e.reason))});
      });
      // Also intercept Vue's app.config.errorHandler before mount... but app already mounted.
      // Let's override console.error to capture
      const origErr = console.error;
      console.error = function(...args) {
        try { window.__capturedErrors.push({type: 'console.error', msg: String(args[0]), stack: args[1] && args[1].stack ? args[1].stack : ''}); } catch(e) {}
        return origErr.apply(this, args);
      };
      return 'instrumented';
    })()`,
    returnByValue: true
  });
  console.log('INSTRUMENT:', r0.result?.result?.value);

  // Now reload
  await send('Page.reload', { ignoreCache: true });
  await new Promise(res => setTimeout(res, 5000));

  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const captured = window.__capturedErrors || [];
      return JSON.stringify({
        count: captured.length,
        errors: captured.map(e => e.message || e.reason || e.msg || JSON.stringify(e)).slice(0, 30)
      });
    })()`,
    returnByValue: true
  });
  console.log('CAPTURED ERRORS:', r1.result?.result?.value);

  // Check mount state after reload
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector('#app');
      const vueApp = app.__vue_app__;
      return JSON.stringify({
        hasInstance: !!vueApp._instance,
        isMounted: vueApp._instance ? vueApp._instance.isMounted : false,
        children: app.children.length
      });
    })()`,
    returnByValue: true
  });
  console.log('MOUNT STATE:', r2.result?.result?.value);
  
  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
