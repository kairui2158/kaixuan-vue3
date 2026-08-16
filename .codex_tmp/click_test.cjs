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

  // Click the pipeline button and check state
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const btn = document.getElementById('btn-pipeline');
        if (!btn) return "NO_BTN";
        btn.click();
        return "clicked, activePanel=" + (window.__getActivePanel?.() || 'N/A');
      } catch(e) {
        return "ERR: " + e.message;
      }
    })()`,
    returnByValue: true
  });
  console.log('CLICK:', r1.result?.result?.value);

  // Check if activePanel changed
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const panel = window.__getActivePanel?.();
        const backdrop = document.getElementById('panel-backdrop');
        const pipelinePanel = document.querySelector('[id="pipeline-panel"], .pipeline-panel, .pipeline-panel-overlay');
        return JSON.stringify({
          activePanel: panel,
          backdrop: backdrop ? 'EXISTS' : 'NOT_FOUND',
          pipelinePanel: pipelinePanel ? 'EXISTS' : 'NOT_FOUND'
        });
      } catch(e) {
        return "ERR: " + e.message;
      }
    })()`,
    returnByValue: true
  });
  console.log('AFTER CLICK:', r2.result?.result?.value);

  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
