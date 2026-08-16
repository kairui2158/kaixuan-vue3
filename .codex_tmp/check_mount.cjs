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
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector('#app');
      const vueApp = app && app.__vue_app__;
      if (!vueApp) return 'NO_VUE_APP';
      return JSON.stringify({
        hasComponent: !!vueApp._component,
        instance: vueApp._instance ? 'SET' : 'NULL',
        isMounted: vueApp._instance ? vueApp._instance.isMounted : false,
        containerChildren: app.children.length,
        containerHTML: app.innerHTML.substring(0, 500)
      });
    })()`,
    returnByValue: true
  });
  console.log('APP STATE:', r1.result ? r1.result.result.value : JSON.stringify(r1));
  
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector('#app');
      const tree = app.querySelector('*');
      if (!tree) return 'NO_TREE';
      const pipeline = Array.from(app.querySelectorAll('*')).find(el => 
        el.textContent && el.textContent.includes('Pipeline') || el.id && el.id.includes('pipeline'));
      return pipeline ? 'FOUND: ' + pipeline.tagName + ' id=' + pipeline.id : 'NOT FOUND';
    })()`,
    returnByValue: true
  });
  console.log('PIPELINE:', r2.result ? r2.result.result.value : JSON.stringify(r2));
  
  const r3 = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const app = document.querySelector('#app');
        const vueApp = app.__vue_app__;
        const inst = vueApp._instance;
        if (!inst) return 'NO_INSTANCE';
        return 'INSTANCE_OK setup=' + (inst.setupState ? Object.keys(inst.setupState).slice(0, 20).join(',') : 'none');
      } catch(e) { return 'ERR: ' + e.message; }
    })()`,
    returnByValue: true
  });
  console.log('INSTANCE:', r3.result ? r3.result.result.value : JSON.stringify(r3));
  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
