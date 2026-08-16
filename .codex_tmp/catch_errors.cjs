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

  // Check for error states and console history
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.querySelector('#app');
      const vueApp = app.__vue_app__;
      const comp = vueApp._component;
      // Try accessing component setup to see if there's any error info
      return JSON.stringify({
        componentKeys: comp ? Object.keys(comp).slice(0, 20) : 'none',
        appConfig: vueApp._config ? Object.keys(vueApp._config) : 'none'
      });
    })()`,
    returnByValue: true
  });
  console.log('COMPONENT:', r1.result?.result?.value);

  // Check if Pinia stores are available
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const pinia = window.__pinia;
        if (!pinia) return 'NO_PINIA';
        const stores = pinia._s;
        return JSON.stringify(Array.from(stores.keys()));
      } catch(e) { return 'ERR: ' + e.message; }
    })()`,
    returnByValue: true
  });
  console.log('PINIA:', r2.result?.result?.value);

  // Try reloading page and capture console messages
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  
  const messages = [];
  ws.on('message', (data) => {
    const obj = JSON.parse(data);
    if (obj.method === 'Runtime.exceptionThrown') {
      const desc = obj.params.exceptionDetails;
      messages.push('EXCEPTION: ' + JSON.stringify({
        text: desc.text,
        url: desc.url,
        line: desc.lineNumber,
        column: desc.columnNumber,
        exception: desc.exception?.description
      }));
    }
    if (obj.method === 'Runtime.consoleAPICalled') {
      const type = obj.params.type;
      const text = obj.params.args.map(a => a.value || a.description || '').join(' ');
      messages.push('CONSOLE[' + type + ']: ' + text.substr(0, 200));
    }
    if (obj.method === 'Log.entryAdded') {
      const e = obj.params.entry;
      messages.push('LOG[' + e.level + ']: ' + e.text);
    }
  });

  // Clear messages then reload
  await send('Page.reload', { ignoreCache: true });
  await new Promise(res => setTimeout(res, 4000));
  console.log('CAPTURED ' + messages.length + ' messages:');
  messages.slice(0, 50).forEach(m => console.log(m));
  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
