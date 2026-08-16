const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const pages = await fetchJSON('http://127.0.0.1:9227/json');
  if (!pages || pages.length === 0) { console.log('NO_PAGES'); return; }
  const wsUrl = pages[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));
  let msgId = 1;
  function send(method, params) {
    const id = msgId++;
    return new Promise((resolve) => {
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) { ws.removeListener('message', handler); resolve(msg); }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  await send('Page.enable');
  await send('DOM.enable');
  await send('CSS.enable');
  const doc = await send('DOM.getDocument');
  const rootId = doc.result.root.nodeId;
  console.log('ROOT:' + rootId);
  const btns = await send('DOM.querySelectorAll', { nodeId: rootId, selector: '.btn' });
  console.log('BTNS:' + (btns.result.nodeIds ? btns.result.nodeIds.length : 0));
  const backdrop = await send('DOM.querySelectorAll', { nodeId: rootId, selector: '.modal-backdrop' });
  console.log('BACKDROP:' + (backdrop.result.nodeIds ? backdrop.result.nodeIds.length : 0));
  const overlay = await send('DOM.querySelectorAll', { nodeId: rootId, selector: '.modal-overlay' });
  console.log('OVERLAY:' + (overlay.result.nodeIds ? overlay.result.nodeIds.length : 0));
  const body = await send('DOM.querySelector', { nodeId: rootId, selector: 'body' });
  if (body.result && body.result.nodeId) {
    const style = await send('CSS.getComputedStyleForNode', { nodeId: body.result.nodeId });
    const fs = style.result.computedStyle.find(s => s.name === 'font-size');
    console.log('FONT:' + (fs ? fs.value : '?'));
  }
  const sidebar = await send('DOM.querySelector', { nodeId: rootId, selector: '.sidebar-nav' });
  console.log('SIDEBAR:' + (sidebar.result && sidebar.result.nodeId ? 'OK' : 'MISSING'));
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  if (screenshot.result && screenshot.result.data) {
    fs.writeFileSync('_audit/ui_regression_check.png', Buffer.from(screenshot.result.data, 'base64'));
    console.log('SCREENSHOT_OK');
  }
  ws.close();
  console.log('DONE');
}
main().catch(e => console.log('ERR:' + e.message));
