const WebSocket = require('ws');
const port = 9227;

async function main() {
  const resp = await fetch(http://localhost:/json);
  const targets = await resp.json();
  const target = targets.find(t => t.url.includes('index.html'));
  if (!target) { console.log('No target found'); return; }
  
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 1;
  
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      ws.send(JSON.stringify({ id, method, params }));
      ws.on('message', function handler(data) {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.removeListener('message', handler);
          resolve(msg);
        }
      });
    });
  }
  
  ws.on('open', async () => {
    console.log('CDP connected');
    await send('Page.enable');
    await send('Console.enable');
    
    // Get all visible buttons and their click handlers
    const result = await send('Runtime.evaluate', {
      expression: 
        (function() {
          const results = [];
          const buttons = document.querySelectorAll('button');
          buttons.forEach((btn, i) => {
            const id = btn.id || '(no id)';
            const text = btn.textContent.trim().slice(0, 30);
            const visible = btn.offsetParent !== null;
            const disabled = btn.disabled;
            const rect = btn.getBoundingClientRect();
            // Get click listener
            const listeners = getEventListeners ? getEventListeners(btn) : [];
            results.push({
              index: i, id, text: text.slice(0, 20),
              visible, disabled,
              x: Math.round(rect.x), y: Math.round(rect.y),
              w: Math.round(rect.width), h: Math.round(rect.height)
            });
          });
          return JSON.stringify(results);
        })()
      ,
      returnByValue: true
    });
    console.log('BUTTONS:', result.result.value);
    
    // Now click each button and check for errors
    const buttons = JSON.parse(result.result.value);
    for (const btn of buttons) {
      if (!btn.visible || btn.disabled) continue;
      console.log('Clicking:', btn.text);
      const clickResult = await send('Runtime.evaluate', {
        expression: 
          (function() {
            const btn = document.querySelectorAll('button')[];
            if (!btn) return 'not found';
            let error = null;
            const origHandler = btn.onclick;
            btn.onclick = function(e) {
              try {
                if (origHandler) origHandler.call(this, e);
              } catch(err) { error = err.message; }
            };
            // Try both click() and dispatchEvent
            try {
              const event = new MouseEvent('click', { bubbles: true, cancelable: true });
              btn.dispatchEvent(event);
            } catch(err) { error = err.message; }
            return error ? 'ERROR: ' + error : 'OK';
          })()
        ,
        returnByValue: true
      });
      console.log('  Result:', clickResult.result.value);
      await new Promise(r => setTimeout(r, 300));
    }
    
    console.log('DONE');
    ws.close();
  });
  
  ws.on('error', (err) => console.log('WS error:', err.message));
}

main().catch(console.error);
