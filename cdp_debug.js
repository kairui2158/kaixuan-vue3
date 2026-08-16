const WebSocket = require("ws");
const http = require("http");

http.get("http://localhost:9227/json", (res) => {
  let d = "";
  res.on("data", c => d += c);
  res.on("end", () => {
    const ws = new WebSocket(JSON.parse(d)[0].webSocketDebuggerUrl);
    ws.on("open", () => {
      ws.send(JSON.stringify({id:1, method:"Runtime.evaluate", params:{expression:"1+1"}}));
    });
    ws.on("message", (raw) => {
      console.log("RAW:", raw.toString().substring(0, 500));
      ws.close();
    });
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
