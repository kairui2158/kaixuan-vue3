const http = require('http');
const WebSocket = require('ws');

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    const msg = JSON.stringify({ id, method, params });
    ws.send(msg);
    const timer = setTimeout(() => reject(new Error('timeout: ' + method)), 5000);
    ws.on('message', function handler(data) {
      const resp = JSON.parse(data.toString());
      if (resp.id === id) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(resp.result);
      }
    });
  });
}

async function main() {
  const targets = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9227/json', (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
  
  const pageTarget = targets.find(t => t.type === 'page');
  if (!pageTarget) { console.log('NO PAGE TARGET'); process.exit(1); }
  
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  
  // Click pipeline button
  await cdpSend(ws, 'Runtime.evaluate', {
    expression: `(function() {
      const btns = document.querySelectorAll('button, [role="button"]');
      for (const b of btns) {
        if (b.textContent.includes('流水线') || b.id.includes('pipeline') || b.className.includes('pipeline')) {
          b.click();
          return 'clicked: ' + b.textContent.trim().substring(0, 20);
        }
      }
      return 'not found';
    })()`,
    returnByValue: true
  }).then(r => console.log('Click:', r.result?.value));
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Check actual DOM structure of pl-header
  const domInfo = await cdpSend(ws, 'Runtime.evaluate', {
    expression: `(function() {
      const header = document.querySelector('.pl-header');
      if (!header) return 'no .pl-header found';
      const children = [];
      for (const child of header.children) {
        const rect = child.getBoundingClientRect();
        children.push({
          tag: child.tagName,
          class: child.className,
          id: child.id,
          text: child.textContent.trim().substring(0, 20),
          x: Math.round(rect.x),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        });
      }
      const headerRect = header.getBoundingClientRect();
      return JSON.stringify({
        headerWidth: Math.round(headerRect.width),
        headerRight: Math.round(headerRect.right),
        childCount: header.children.length,
        children: children
      }, null, 2);
    })()`,
    returnByValue: true
  });
  console.log('DOM structure:', domInfo.result?.value);
  
  ws.close();
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
