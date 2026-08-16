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

  // Try to get activePanel value and force it to pipeline
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        // Check if the app container has vue data
        const app = document.querySelector('#app');
        const vueApp = app.__vue_app__;
        const container = vueApp._container;
        
        // Check root component instance via non-standard API
        const root = container.__vue_app__;
        const results = {};
        
        // Try to access the rendered component's setup state
        // In Vue 3.5, the root component instance might be accessible through _container
        // Let's find it through the component tree
        const allElements = app.querySelectorAll('[data-v-5a85b9ac]');
        results.rootElements = allElements.length;
        results.firstRootClass = allElements[0]?.className;
        
        // Check if __getActivePanel was set
        results.getActivePanel = typeof window.__getActivePanel;
        if (window.__getActivePanel) {
          results.activePanel = window.__getActivePanel();
        }
        
        return JSON.stringify(results);
      } catch(e) {
        return "ERR: " + e.message;
      }
    })()`,
    returnByValue: true
  });
  console.log('STATE:', r1.result?.result?.value);

  // Try to invoke the panel navigation by dispatching a keyboard event
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        // Check if the activePanel can be retrieved via internal state
        // Check the component's vnode tree
        const app = document.getElementById('app');
        const vueApp = app.__vue_app__;
        
        // Look for all component instances via __vue_component__
        const results = {};
        
        // Check if btn-pipeline button exists
        const btn = document.getElementById('btn-pipeline');
        results.btnPipeline = btn ? 'EXISTS' : 'NOT FOUND';
        if (btn) {
          results.btnText = btn.textContent?.substring(0, 50);
          results.btnClassName = btn.className;
          results.btnOnClick = typeof btn.onclick;
        }
        
        // Check if the button has Vue event listeners
        const pipelineBtn = document.getElementById('btn-pipeline');
        if (pipelineBtn) {
          const listeners = [];
          for (const key of Object.keys(pipelineBtn)) {
            if (key.startsWith('__vue_')) listeners.push(key);
          }
          results.vueListeners = listeners;
        }
        
        return JSON.stringify(results);
      } catch(e) {
        return "ERR: " + e.message;
      }
    })()`,
    returnByValue: true
  });
  console.log('BTN:', r2.result?.result?.value);

  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
