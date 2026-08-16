const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    ws.send(JSON.stringify({ id, method, params }));
    const timer = setTimeout(() => reject(new Error('timeout: ' + method)), 8000);
    ws.on('message', function handler(data) {
      const resp = JSON.parse(data.toString());
      if (resp.id === id) { clearTimeout(timer); ws.off('message', handler); resolve(resp.result); }
    });
  });
}

async function main() {
  const targets = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9227/json', (res) => {
      let data = ''; res.on('data', d => data += d); res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
  const pageTarget = targets.find(t => t.type === 'page');
  if (!pageTarget) { console.log('NO PAGE TARGET'); process.exit(1); }
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  
  // Click #btn-pipeline
  const clickResult = await cdpSend(ws, 'Runtime.evaluate', {
    expression: `(function() {
      const btn = document.querySelector('#btn-pipeline');
      if (!btn) return 'btn not found';
      btn.click();
      return 'clicked';
    })()`,
    returnByValue: true
  });
  console.log('Click:', clickResult.result?.value);
  
  await new Promise(r => setTimeout(r, 1500));
  
  // Check DOM structure
  const domInfo = await cdpSend(ws, 'Runtime.evaluate', {
    expression: `(function() {
      const header = document.querySelector('.pl-header');
      if (!header) {
        // Maybe panel not open, check if pipeline-panel exists
        const panel = document.querySelector('#pipeline-panel');
        return JSON.stringify({
          error: 'no .pl-header',
          pipelinePanelExists: !!panel,
          pipelinePanelDisplay: panel ? getComputedStyle(panel).display : 'n/a'
        });
      }
      const children = [];
      for (const child of header.children) {
        const rect = child.getBoundingClientRect();
        children.push({
          tag: child.tagName, class: child.className.substring(0, 30),
          text: child.textContent.trim().substring(0, 15),
          x: Math.round(rect.x), right: Math.round(rect.right), width: Math.round(rect.width)
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
  console.log('DOM:', domInfo.result?.value);
  
  // Screenshot
  const screenshot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/screenshots/v2_a1_after.png', Buffer.from(screenshot.data, 'base64'));
  console.log('Screenshot saved');
  
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
