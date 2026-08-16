const WebSocket = require("ws");
const http = require("http");

const port = 9227;

http.get("http://localhost:" + port + "/json", (res) => {
  let data = "";
  res.on("data", (chunk) => data += chunk);
  res.on("end", () => {
    const targets = JSON.parse(data);
    const target = targets.find(t => t.url.includes("index.html"));
    if (!target) { console.log("No target"); return; }
    
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let msgId = 1;
    
    function send(method, params) {
      return new Promise((resolve) => {
        const id = msgId++;
        ws.send(JSON.stringify({ id, method, params: params || {} }));
        const handler = (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.id === id) { ws.removeListener("message", handler); resolve(msg); }
        };
        ws.on("message", handler);
      });
    }
    
    ws.on("open", async () => {
      console.log("=== CDP DIAGNOSTIC ===");
      await send("Page.enable");
      await send("Console.enable");
      
      // 1. Click pipeline button to open
      console.log("1. Opening pipeline panel...");
      await send("Runtime.evaluate", {
        expression: "document.getElementById('btn-pipeline').click()",
        returnByValue: true
      });
      await new Promise(r => setTimeout(r, 500));
      
      // 2. Check if pipeline panel is open
      const panelCheck = await send("Runtime.evaluate", {
        expression: "JSON.stringify({exists:!!document.getElementById('pipeline-panel'),display:document.getElementById('pipeline-panel')?.style?.display||'no panel'})",
        returnByValue: true
      });
      console.log("2. Panel:", panelCheck.result.value);
      
      if (panelCheck.result.value.includes('exists:true')) {
        // 3. Get all buttons in pipeline panel
        const plBtns = await send("Runtime.evaluate", {
          expression: "JSON.stringify(Array.from(document.querySelectorAll('#pipeline-panel button:not([disabled])')).map(b => ({id:b.id||'',txt:b.textContent.trim().slice(0,30),vis:b.offsetParent!==null})))",
          returnByValue: true
        });
        console.log("3. Pipeline buttons:", plBtns.result.value);
        
        // 4. Try clicking each button
        const btnData = JSON.parse(plBtns.result.value);
        for (const b of btnData) {
          if (!b.vis) continue;
          console.log("4. Clicking:", b.txt, "(id=" + b.id + ")");
          await send("Runtime.evaluate", {
            expression: "try { document.getElementById('" + b.id + "').click(); 'OK' } catch(e) { 'ERR: ' + e.message }",
            returnByValue: true
          });
          await new Promise(r => setTimeout(r, 200));
        }
      }
      
      console.log("=== DONE ===");
      ws.close();
    });
  });
}).on("error", (e) => console.log("Error:", e.message));
