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
      
      // Open pipeline
      await send("Runtime.evaluate", {
        expression: "document.getElementById('btn-pipeline').click()",
        returnByValue: true
      });
      await new Promise(r => setTimeout(r, 1000));
      
      // Check pipeline panel HTML structure
      const r = await send("Runtime.evaluate", {
        expression: "document.getElementById('pipeline-panel') ? document.getElementById('pipeline-panel').innerHTML.slice(0, 2000) : 'no panel'",
        returnByValue: true
      });
      console.log("PANEL HTML:", JSON.stringify(r.result));
      
      // Check what step is active
      const r2 = await send("Runtime.evaluate", {
        expression: "document.querySelector('.pl-step.active') ? document.querySelector('.pl-step.active').textContent.trim() : 'no active step'",
        returnByValue: true
      });
      console.log("ACTIVE STEP:", JSON.stringify(r2.result));
      
      // Check all buttons inside panel
      const r3 = await send("Runtime.evaluate", {
        expression: "document.querySelectorAll('#pipeline-panel button').length + ' buttons total'",
        returnByValue: true
      });
      console.log("BTN COUNT:", JSON.stringify(r3.result));
      
      ws.close();
    });
  });
}).on("error", (e) => console.log("Error:", e.message));
