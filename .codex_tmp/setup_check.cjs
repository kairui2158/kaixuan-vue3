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

  // Check the _component's setup function
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector("#app").__vue_app__;
      const comp = app._component;
      const results = {};
      
      // Check if there's a render function
      results.hasRender = typeof comp.render === 'function';
      results.hasSetup = typeof comp.setup === 'function';
      
      // Check if setup returns a function (which would be the render function)
      if (comp.setup) {
        // Check setup length
        results.setupLen = comp.setup.length;
        // Try to check the setup's function source
        results.setupSource = (comp.setup + '').substring(0, 200);
      }
      
      // Check if render is inside the component another way
      results.ownKeys = Object.getOwnPropertyNames(comp).filter(k => !k.startsWith('_'));
      results.ownKeysAll = Object.getOwnPropertyNames(comp);
      
      return JSON.stringify(results);
    })()`,
    returnByValue: true
  });
  console.log('SETUP:', r1.result?.result?.value);

  // Check if the component's template string was compiled
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector("#app").__vue_app__;
      const comp = app._component;
      
      // Check for compiled function
      const results = {};
      // Check prototype chain
      const proto = Object.getPrototypeOf(comp);
      results.protoKeys = Object.getOwnPropertyNames(proto).filter(k => !k.startsWith('_'));
      
      // Check if the component has a method that is the render function
      for (const key of Object.keys(comp)) {
        const val = comp[key];
        if (typeof val === 'function') {
          results['fn_' + key] = (val + '').substring(0, 100);
        }
      }
      
      return JSON.stringify(results);
    })()`,
    returnByValue: true
  });
  console.log('FUNCTIONS:', r2.result?.result?.value);

  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
