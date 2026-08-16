const WebSocket = require("ws");
const http = require("http");

http.get("http://localhost:9227/json", (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    const pages = JSON.parse(data);
    const wsUrl = pages[0]?.webSocketDebuggerUrl;
    console.log("WS URL:", wsUrl);
    if (!wsUrl) { console.log("No page"); return; }
    
    const ws = new WebSocket(wsUrl);
    ws.on("open", () => {
      console.log("WebSocket connected");
      // Get page info
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "document.title" } }));
      ws.send(JSON.stringify({ id: 2, method: "Runtime.evaluate", params: { expression: "document.querySelectorAll('button').length" } }));
      ws.send(JSON.stringify({ id: 3, method: "Runtime.evaluate", params: { expression: "JSON.stringify(Array.from(document.querySelectorAll('button')).map(b=>({id:b.id,visible:b.offsetParent!==null,text:b.textContent.trim().substring(0,30)})))" } }));
    });
    
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === 1) console.log("Title:", msg.result?.value);
      if (msg.id === 2) console.log("Button count:", msg.result?.value);
      if (msg.id === 3) {
        const buttons = JSON.parse(msg.result?.value || "[]");
        console.log("Buttons:");
        buttons.forEach(b => console.log("  ["+(b.visible?"VIS":"HID")+"] id="+b.id+" text="+b.text));
      }
      if (msg.id === 3) {
        ws.close();
        process.exit(0);
      }
    });
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
