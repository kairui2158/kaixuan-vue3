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
      
      // Get buttons using simple string return
      const btns = await send("Runtime.evaluate", {
        expression: "JSON.stringify(Array.from(document.querySelectorAll(\"button:not([disabled])\")).map(b => ({id:b.id||\"\",txt:b.textContent.trim().slice(0,25),vis:b.offsetParent!==null})))",
        returnByValue: true
      });
      
      if (btns.result && btns.result.value) {
        console.log("BTNS:", btns.result.value);
      } else if (btns.result && btns.result.description) {
        console.log("BTNS desc:", btns.result.description);
      } else {
        console.log("BTNS raw:", JSON.stringify(btns.result));
      }
      
      ws.close();
    });
  });
}).on("error", (e) => console.log("Error:", e.message));
