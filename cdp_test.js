const WebSocket = require('ws');
const port = 9227;

async function main() {
  // Get target
  const resp = await fetch(http://localhost:/json);
  const targets = await resp.json();
  const target = targets.find(t => t.title.includes('神意') || t.url.includes('index.html'));
  if (!target) { console.log('No target found'); return; }
  
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  
  ws.on('open', () => {
    console.log('CDP connected');
    
    // Enable Page and Console
    ws.send(JSON.stringify({ id: 1, method: 'Page.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Console.enable' }));
    
    // Get console messages
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'Console.messageAdded') {
        console.log('CONSOLE:', msg.params.message.level, msg.params.message.text);
      }
    });
    
    // Wait a bit then click buttons
    setTimeout(() => {
      // List all buttons
      ws.send(JSON.stringify({
        id: 3,
        method: 'Runtime.evaluate',
        params: {
          expression: document.querySelectorAll('button').length,
          returnByValue: true
        }
      }));
    }, 1000);
    
    setTimeout(() => {
      // Click 保存大纲
      ws.send(JSON.stringify({
        id: 4,
        method: 'Runtime.evaluate',
        params: {
          expression: (function() {
            const btn = document.querySelector('.pl-step-panel:not([style*="display: none"]) button:contains("保存大纲")');
            if (btn) { btn.click(); return 'clicked'; }
            return 'not found';
          })(),
          returnByValue: true
        }
      }));
    }, 2000);
  });
  
  ws.on('error', (err) => console.log('WS error:', err.message));
}

main().catch(console.error);
