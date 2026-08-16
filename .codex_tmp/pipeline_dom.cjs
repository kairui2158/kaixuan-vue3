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

  // Click pipeline button first
  await send('Runtime.evaluate', {
    expression: `document.getElementById('btn-pipeline').click()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 500));

  // Now inspect what's visible
  const r1 = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        // Check the pipeline panel's visibility
        const pipelineEl = document.querySelector('[id="pipeline-panel"], .pipeline-panel, .pipeline-panel-overlay');
        if (!pipelineEl) return JSON.stringify({found: false});
        
        const style = window.getComputedStyle(pipelineEl);
        const parent = pipelineEl.parentElement;
        const parentStyle = parent ? window.getComputedStyle(parent) : null;
        
        // Check all children
        const children = Array.from(pipelineEl.children).map(c => ({
          tag: c.tagName,
          id: c.id,
          class: c.className,
          text: (c.textContent || '').substring(0, 40)
        }));
        
        return JSON.stringify({
          found: true,
          tag: pipelineEl.tagName,
          id: pipelineEl.id,
          className: pipelineEl.className,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          zIndex: style.zIndex,
          parentTag: parent?.tagName,
          parentDisplay: parentStyle?.display,
          children: children.slice(0, 10)
        });
      } catch(e) {
        return "ERR: " + e.message;
      }
    })()`,
    returnByValue: true
  });
  console.log('PIPELINE:', r1.result?.result?.value);

  // Also check what the PipelinePanel component looks like via its rendered HTML
  const r2 = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        // Check all vue components that could be pipeline panel
        const all = document.querySelectorAll('*');
        const pipelineRelated = [];
        for (const el of all) {
          if (el.id && el.id.toLowerCase().includes('pipeline')) {
            pipelineRelated.push({id: el.id, tag: el.tagName, class: el.className});
          }
          if (el.className && (typeof el.className === 'string') && el.className.includes('pipeline')) {
            pipelineRelated.push({id: el.id || '(no id)', tag: el.tagName, class: el.className});
          }
        }
        return JSON.stringify(pipelineRelated);
      } catch(e) {
        return "ERR: " + e.message;
      }
    })()`,
    returnByValue: true
  });
  console.log('RELATED:', r2.result?.result?.value);

  ws.close();
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
