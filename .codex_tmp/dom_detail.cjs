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

  // First check current DOM state
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      // Check all children of app
      const app = document.getElementById('app');
      const children = [];
      for (let i = 0; i < app.children.length; i++) {
        const c = app.children[i];
        children.push({
          tag: c.tagName,
          id: c.id,
          class: c.className,
          visible: c.style.display !== 'none' && c.style.visibility !== 'hidden'
        });
      }
      // Check for any vue comment nodes
      const allNodes = [];
      const walker = document.createTreeWalker(app, 4, null, false);
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeType === 8) {
          allNodes.push(node.nodeValue?.substring(0, 100));
        }
      }
      return JSON.stringify({children, commentNodes: allNodes.slice(0, 20)});
    })()`,
    returnByValue: true
  });
  console.log('DOM:', r1.result?.result?.value);

  // Click pipeline button
  await send('Runtime.evaluate', {
    expression: `document.getElementById('btn-pipeline').click()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 1000));

  // Check DOM after click
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      const app = document.getElementById('app');
      const children = [];
      for (let i = 0; i < app.children.length; i++) {
        const c = app.children[i];
        children.push({
          tag: c.tagName,
          id: c.id,
          class: c.className,
          visible: (c.style.display !== 'none' && c.style.visibility !== 'hidden') || !c.style.display,
          innerHTML: (c.innerHTML || '').substring(0, 100)
        });
      }
      // Check for any comment nodes
      const allNodes = [];
      const walker = document.createTreeWalker(app, 128, null, false);
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeType === 8) {
          allNodes.push(node.nodeValue?.substring(0, 100));
        }
      }
      return JSON.stringify({children, commentNodes: allNodes.slice(0, 20)});
    })()`,
    returnByValue: true
  });
  console.log('DOM AFTER:', r2.result?.result?.value);

  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
