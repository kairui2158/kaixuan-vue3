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
      
      // First ensure pipeline is open
      await send("Runtime.evaluate", {
        expression: "document.getElementById('btn-pipeline').click()",
        returnByValue: true
      });
      await new Promise(r => setTimeout(r, 500));
      
      // Get all buttons in pipeline panel
      const r = await send("Runtime.evaluate", {
        expression: "Array.from(document.querySelectorAll('#pipeline-panel button')).map(b => ({id:b.id||'',txt:b.textContent.trim().slice(0,30),vis:b.offsetParent!==null,dis:b.disabled})).filter(b => b.vis)",
        returnByValue: true
      });
      console.log("VISIBLE BTNS:", JSON.stringify(r.result));
      
      // Now try clicking each button
      const btns = r.result.value;
      for (const b of btns) {
        console.log("Clicking:", b.id || b.txt);
        await send("Runtime.evaluate", {
          expression: "document.getElementById('" + b.id + "') ? document.getElementById('" + b.id + "').click() : 'not found'",
          returnByValue: true
        });
        await new Promise(r => setTimeout(r, 200));
      }
      
      console.log("DONE");
      ws.close();
    });
  });
}).on("error", (e) => console.log("Error:", e.message));
