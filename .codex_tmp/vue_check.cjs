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

  // Check if the ref is reactive  
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector("#app").__vue_app__;
      // In Vue 3, the return value of setup() is the render context
      // The render function needs _instance to be set up
      // Let's check if there's a component instance on the container
      const container = app._container;
      // Check for __vueParentComponent on the root element
      const rootEl = container.firstElementChild;
      if (!rootEl) return JSON.stringify({rootEl: null});
      
      // Check for Vue internal properties
      const vueProps = [];
      for (const key of Object.getOwnPropertyNames(rootEl)) {
        if (key.includes('__vue') || key.includes('__v')) vueProps.push(key);
      }
      
      // Check if any component instance exists on the DOM tree
      let el = rootEl;
      let foundComponent = false;
      while (el && !foundComponent) {
        if (el.__vueParentComponent) {
          foundComponent = true;
        }
        for (const key of Object.keys(el)) {
          if (key.includes('__vueParentComponent') && el[key]) {
            foundComponent = true;
          }
        }
        el = el.firstElementChild;
      }
      
      return JSON.stringify({
        hasContainer: !!app._container,
        rootTag: rootEl?.tagName,
        vueProps: vueProps,
        foundComponent: foundComponent,
        hasInstance: !!app._instance,
        version: app.version
      });
    })()`,
    returnByValue: true
  });
  console.log('VUE CHECK:', r1.result?.result?.value);

  // Check if the render function is actually being called
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector("#app").__vue_app__;
      const component = app._component;
      // Check if component has a render function
      const hasRender = typeof component.render === 'function';
      const hasSetup = typeof component.setup === 'function';
      
      // Try to access the component's scope
      let scope = null;
      try {
        // In Vue 3.5, the scope might be stored differently
        scope = component.__scopeId;
      } catch(e) {
        scope = 'ERR: ' + e.message;
      }
      
      return JSON.stringify({
        hasRender,
        hasSetup,
        scopeId: scope,
        componentKeys: Object.keys(component).filter(k => !k.startsWith('_'))
      });
    })()`,
    returnByValue: true
  });
  console.log('COMPONENT:', r2.result?.result?.value);

  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
