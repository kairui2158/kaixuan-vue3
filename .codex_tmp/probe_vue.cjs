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

  // The problem: _instance is null but DOM rendered. This might be because
  // mount() throws AFTER rendering starts. Let's try manually remounting to catch the error.

  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector('#app');
      const vueApp = app.__vue_app__;
      // Check mount method
      const mountResult = (() => {
        try {
          // Save app files before trying to probe
          const oldInnerHTML = document.querySelector('#app').innerHTML;
          return 'app has __vue_app__ and container has ' + document.querySelector('#app').children.length + ' children';
        } catch(e) {
          return 'ERR: ' + e.message;
        }
      })();
      return mountResult;
    })()`,
    returnByValue: true
  });
  console.log('PROBE:', r1.result?.result?.value);

  // Check the Vue app's error handler config
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        // Try to access Vue internals to see what happened
        const app = document.querySelector('#app').__vue_app__;
        const vnode = app._container ? 'container-set' : 'no-container';
        
        // Check if there's a component that failed - look at the vnode tree
        return JSON.stringify({
          hasContainer: !!app._container,
          containerText: app._container ? app._container.textContent.substring(0, 100) : 'none',
          hasInstance: !!app._instance,
          hasEffects: app._effects ? app._effects.length : 0,
          appVersion: app.version || 'unknown'
        });
      } catch(e) { return 'ERR: ' + e.message; }
    })()`,
    returnByValue: true
  });
  console.log('VUE INTERNALS:', r2.result?.result?.value);

  // Let's look at what the setup function does step by step by monkey-patching before reload
  // First check the current state of key globals
  const r3 = await send('Runtime.evaluate', {
    expression: `(() => {
      const results = {};
      results.electronAPI = typeof window.electronAPI;
      results.hasDecrypt = window.electronAPI && typeof window.electronAPI.decrypt;
      results.hasStorageRead = window.electronAPI && typeof window.electronAPI.storageRead;
      try {
        results.providersData = window.electronAPI.storageRead('wa-providers');
        results.providersType = Array.isArray(results.providersData) ? 'array' : typeof results.providersData;
      } catch(e) { results.providersData = 'ERR: ' + e.message; }
      return JSON.stringify(results);
    })()`,
    returnByValue: true
  });
  console.log('ELECTRON API:', r3.result?.result?.value);

  // Check Vue VirtualScroller - this can cause issues in Electron
  const r4 = await send('Runtime.evaluate', {
    expression: `(() => {
      // Check if virtual scroller components are registered
      const app = document.querySelector('#app').__vue_app__;
      return JSON.stringify({
        componentKeys: app._component && Object.keys(app._component).join(','),
        directives: app._directives ? Object.keys(app._directives) : [],
      });
    })()`,
    returnByValue: true
  });
  console.log('APP REG:', r4.result?.result?.value);
  
  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
