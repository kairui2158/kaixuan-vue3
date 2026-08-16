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
      
      // Get all button IDs from pipeline panel
      const r = await send("Runtime.evaluate", {
        expression: "Array.from(document.querySelectorAll('#pipeline-panel button')).map(b => b.id || b.textContent.trim().slice(0,20)).join(' | ')",
        returnByValue: true
      });
      console.log("ALL BTN IDs:", r.result.value);
      
      // Now click each button by ID
      const btnIds = r.result.value.split(" | ");
      for (const bid of btnIds) {
        if (!bid || bid === "×") continue;
        console.log("Clicking:", bid);
        await send("Runtime.evaluate", {
          expression: "var el = document.getElementById('" + bid + "'); if (el) { el.click(); 'clicked' } else { 'not found by id, trying text...' }",
          returnByValue: true
        });
        await new Promise(r => setTimeout(r, 200));
      }
      
      console.log("DONE");
      ws.close();
    });
  });
}).on("error", (e) => console.log("Error:", e.message));
