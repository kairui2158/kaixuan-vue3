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
    
    function getResult(result) {
      if (result && result.result && result.result.value !== undefined) {
        return result.result.value;
      }
      if (result && result.result && result.result.description) {
        return result.result.description;
      }
      return JSON.stringify(result);
    }
    
    ws.on("open", async () => {
      console.log("CDP OK");
      await send("Page.enable");
      await send("Console.enable");
      
      // Open pipeline
      await send("Runtime.evaluate", {
        expression: "document.getElementById('btn-pipeline').click()"
      });
      await new Promise(r => setTimeout(r, 500));
      
      // Check callApiWithAgent logic
      const r = await send("Runtime.evaluate", {
        expression: "var pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; var provStore = pinia._s.get('provider'); JSON.stringify({genProvider: provStore.generateProvider, preferredGen: provStore.preferredGenerateProvider ? provStore.preferredGenerateProvider.id : 'none', callApi: typeof provStore.callApi, providers: provStore.providers.map(p => ({id: p.id, name: p.name, purpose: p.purpose}))})"
      });
      console.log("Provider detail:", getResult(r));
      
      // Check project store outline
      const r2 = await send("Runtime.evaluate", {
        expression: "var pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; var pstore = pinia._s.get('project'); JSON.stringify({outlineText: (pstore.outlineText||'').slice(0,50), hasOutline: pstore.hasOutline})"
      });
      console.log("Project:", getResult(r2));
      
      ws.close();
    });
  });
}).on("error", (e) => console.log("Error:", e.message));
