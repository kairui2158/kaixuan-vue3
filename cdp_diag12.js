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
      
      // Check provider state
      const r = await send("Runtime.evaluate", {
        expression: "JSON.stringify({providers: window.__vue_app__ ? 'vue exists' : 'no vue', providerStore: 'providerStore' in window ? 'yes' : 'no'})"
      });
      console.log("Vue:", r.result.value);
      
      // Check if providers are configured
      const r2 = await send("Runtime.evaluate", {
        expression: "var ps = window.__vue_app__ ? window.__vue_app__.config.globalProperties.$pinia : null; if (ps) { var store = ps._s.get('provider'); store ? JSON.stringify({count: store.providers.length, gen: store.generateProvider, ver: store.verifyProvider}) : 'no store' } else { 'no pinia' }"
      });
      console.log("Provider state:", r2.result.value);
      
      ws.close();
    });
  });
}).on("error", (e) => console.log("Error:", e.message));
