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
      if (result && result.result && result.result.value !== undefined) return result.result.value;
      if (result && result.result && result.result.description) return result.result.description;
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
      
      // Check callApiWithAgent - step 0 (outline)
      // The key function is at line 580 in the source
      const r = await send("Runtime.evaluate", {
        expression: "var pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; var provStore = pinia._s.get('provider'); var agentStore = pinia._s.get('agent'); JSON.stringify({providerCount: provStore.providers.length, genProviderId: provStore.generateProvider, genProviderDetails: provStore.providers.filter(p => p.id === provStore.generateProvider).map(p => ({id: p.id, name: p.name, baseUrl: p.baseUrl, model: p.selectedModel, purpose: p.purpose})), agents: agentStore.agents.map(a => ({id: a.id, name: a.name, providerId: a.providerId}))})"
      });
      console.log("State:", getResult(r));
      
      ws.close();
    });
  });
}).on("error", (e) => console.log("Error:", e.message));
