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
      
      // Open pipeline first
      await send("Runtime.evaluate", {
        expression: "document.getElementById('btn-pipeline').click()"
      });
      await new Promise(r => setTimeout(r, 500));
      
      // Check provider in pinia store
      const r = await send("Runtime.evaluate", {
        expression: "var pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; var store = pinia._s.get('provider'); JSON.stringify({count: store.providers.length, gen: store.generateProvider, ver: store.verifyProvider})"
      });
      console.log("PROVIDER:", getResult(r));
      
      // Check project store
      const r2 = await send("Runtime.evaluate", {
        expression: "var pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; var store = pinia._s.get('project'); JSON.stringify({hasOutline: store.hasOutline, outlineLocked: store.outlineLocked, settingsCount: store.settings.length, volumesCount: store.volumes.length})"
      });
      console.log("PROJECT:", getResult(r2));
      
      // Check pipeline store
      const r3 = await send("Runtime.evaluate", {
        expression: "var pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; var store = pinia._s.get('pipeline'); JSON.stringify({currentStep: store.currentStep, isGenerating: store.isGenerating})"
      });
      console.log("PIPELINE:", getResult(r3));
      
      // Try clicking saveOutline and check if it works
      const r4 = await send("Runtime.evaluate", {
        expression: "var pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; var pstore = pinia._s.get('project'); pstore.setOutline('测试大纲内容'); pstore.hasOutline;"
      });
      console.log("After setOutline:", getResult(r4));
      
      ws.close();
    });
  });
}).on("error", (e) => console.log("Error:", e.message));
