const http = require('http');

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
  // Get CDP targets
  const targets = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9227/json', (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
  
  const pageTarget = targets.find(t => t.type === 'page');
  if (!pageTarget) { console.log('NO PAGE TARGET'); process.exit(1); }
  console.log('Found page target:', pageTarget.url);
  
  const WebSocket = require('ws');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  
  // Click pipeline button to open pipeline panel
  const pipelineBtn = await cdpSend(ws, 'Runtime.evaluate', {
    expression: `document.querySelector('#btn-pipeline') || document.querySelector('[class*="pipeline"]') || null`,
    returnByValue: true
  });
  console.log('Pipeline btn result:', JSON.stringify(pipelineBtn.result?.value));
  
  // Try to find and click the pipeline button
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
  }).then(r => console.log('Click result:', r.result?.value));
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Take screenshot
  const screenshot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  const fs = require('fs');
  fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/screenshots/v2_a1_pipeline_after.png', Buffer.from(screenshot.data, 'base64'));
  console.log('Screenshot saved');
  
  // Check close button position
  const closeBtnInfo = await cdpSend(ws, 'Runtime.evaluate', {
    expression: `(function() {
      const btn = document.querySelector('#btn-close-pl');
      if (!btn) return 'no close btn';
      const rect = btn.getBoundingClientRect();
      const header = btn.closest('.pl-header');
      const headerRect = header ? header.getBoundingClientRect() : null;
      return JSON.stringify({
        btnX: Math.round(rect.x),
        btnRight: Math.round(rect.right),
        btnY: Math.round(rect.y),
        headerWidth: headerRect ? Math.round(headerRect.width) : 'no header',
        headerRight: headerRect ? Math.round(headerRect.right) : 'no header',
        isAtRightEdge: headerRect ? Math.round(rect.right) >= Math.round(headerRect.right) - 50 : false
      });
    })()`,
    returnByValue: true
  });
  console.log('Close btn position:', closeBtnInfo.result?.value);
  
  ws.close();
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
