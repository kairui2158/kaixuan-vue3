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
      console.log("CDP OK");
      await send("Page.enable");
      await send("Console.enable");
      
      // Check all buttons on the page with their click handlers
      const r = await send("Runtime.evaluate", {
        expression: "document.getElementById('btn-pipeline') ? 'exists' : 'not found'",
        returnByValue: true
      });
      console.log("btn-pipeline:", JSON.stringify(r.result));
      
      if (r.result.value === 'exists') {
        // Check button attributes
        const r2 = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-pipeline').outerHTML",
          returnByValue: true
        });
        console.log("HTML:", JSON.stringify(r2.result));
        
        // Try clicking
        const r3 = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-pipeline').dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}))",
          returnByValue: true
        });
        console.log("Click:", JSON.stringify(r3.result));
        await new Promise(r => setTimeout(r, 500));
        
        const r4 = await send("Runtime.evaluate", {
          expression: "!!document.getElementById('pipeline-panel')",
          returnByValue: true
        });
        console.log("Panel after click:", JSON.stringify(r4.result));
      }
      
      ws.close();
    });
  });
}).on("error", (e) => console.log("Error:", e.message));
