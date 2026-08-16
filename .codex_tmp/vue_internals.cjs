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

  // Check Vue internals in detail - maybe _instance has different property names
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector('#app').__vue_app__;
      // List all own keys
      return JSON.stringify({
        appKeys: Object.getOwnPropertyNames(app),
        version: app.version,
        hasContainer: app._container ? true : false,
        containerChildren: app._container ? app._container.children.length : 0
      });
    })()`,
    returnByValue: true
  });
  console.log('VUE APP KEYS:', r1.result?.result?.value);

  // Check what Vue internals are exposed
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      // Vue 3.5 changed internals. Let's check if something is mounted another way.
      // Check app._container for vnode reference
      const app = document.querySelector('#app').__vue_app__;
      const container = app._container;
      const result = {
        containerAttrs: {},
        rootChildren: []
      };
      for (const key of Object.keys(container.dataset || {})) {
        result.containerAttrs['data-' + key] = container.dataset[key];
      }
      const root = container.firstElementChild;
      if (root) {
        result.rootTag = root.tagName;
        result.rootClass = root.className;
        result.rootAttrs = {};
        for (let i = 0; i < root.attributes.length; i++) {
          const attr = root.attributes[i];
          result.rootAttrs[attr.name] = attr.value;
        }
      }
      return JSON.stringify(result);
    })()`,
    returnByValue: true
  });
  console.log('CONTAINER:', r2.result?.result?.value);

  // Check if there are vnode references hanging around
  const r3 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector('#app').__vue_app__;
      // Vue uses a vnode property in various places
      const results = {
        app_keys: Object.keys(app),
        container: app._container ? app._container.tagName : 'none',
      };
      // Check for devtools hooks
      results.devtools_hook = typeof window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
      if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__) {
        results.devtools_apps = window.__VUE_DEVTOOLS_GLOBAL_HOOK__.apps ? window.__VUE_DEVTOOLS_GLOBAL_HOOK__.apps.length : 0;
      }
      return JSON.stringify(results);
    })()`,
    returnByValue: true
  });
  console.log('DEVTOOLS:', r3.result?.result?.value);

  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
