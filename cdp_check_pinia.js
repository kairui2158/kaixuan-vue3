const WebSocket = require("ws");
const http = require("http");

const CDP_PORT = 9227;

http.get("http://localhost:" + CDP_PORT + "/json", (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    const wsUrl = JSON.parse(data)[0].webSocketDebuggerUrl;
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    let lastId = 0;
    const results = {};

    ws.on("open", () => {
      ws.send(JSON.stringify({ id: ++msgId, method: "Runtime.enable" }));
    });

    ws.on("message", (raw) => {
      const resp = JSON.parse(raw.toString());
      if (!resp.id) return;
      
      if (resp.id === 2) {
        const id = ++msgId;
        lastId = id;
        ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression: "try { var a = document.querySelector('#app'); var v = a.__vue_app__; var p = v.config.globalProperties.$pinia; var keys = Object.keys(p.state.value); 'KEYS:' + keys.join(',') } catch(e) { 'ERR:' + e.message }" } }));
      } else if (resp.id === lastId) {
        console.log("pinia:", resp.result.value || JSON.stringify(resp.result));
        ws.close();
      }
    });
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
