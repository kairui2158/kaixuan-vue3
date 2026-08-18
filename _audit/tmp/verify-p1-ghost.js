const http = require("http");
const WebSocket = require("ws");
const T = 15000;
let done = false;
function finish(m) { if (done) return; done = true; console.log(m); process.exit(0); }
setTimeout(() => finish("TMO"), T);

http.get("http://127.0.0.1:9227/json", r => {
  let d = "";
  r.on("data", c => d += c);
  r.on("end", () => {
    try {
      const pages = JSON.parse(d);
      if (!pages.length) { finish("NO_PAGES"); return; }
      const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
      let mid = 1, pend = {};
      function send(m, p) {
        return new Promise(res => {
          const id = mid++;
          pend[id] = res;
          ws.send(JSON.stringify({ id, method: m, params: p || {} }));
        });
      }
      ws.on("message", raw => {
        const r = JSON.parse(raw.toString());
        if (r.id && pend[r.id]) { pend[r.id](r); delete pend[r.id]; }
      });
      ws.on("open", async () => {
        await send("Runtime.enable");

        // Check ghost keys
        var r = await send("Runtime.evaluate", {
          expression: `(function(){
            try {
              var allKeys = window.electronAPI.storageList();
              var ghostKeys = allKeys.filter(function(k) {
                return k.startsWith('wa_project-') || k.startsWith('project-') || k.startsWith('wa_project_');
              });
              var allProjectKeys = allKeys.filter(function(k) {
                return k.includes('project') || k.includes('wa_project');
              });
              return "ALL_PROJ=" + JSON.stringify(allProjectKeys) + " GHOST=" + JSON.stringify(ghostKeys);
            } catch(e) { return "ERR:" + e.message; }
          })()`,
          returnByValue: true
        });
        console.log("GHOST:" + r.result.result.value);

        // Check IndexedDB for any project data
        r = await send("Runtime.evaluate", {
          expression: `(function(){
            try {
              var allKeys = window.electronAPI.storageList();
              return "TOTAL_KEYS=" + allKeys.length + " KEYS=" + JSON.stringify(allKeys);
            } catch(e) { return "ERR:" + e.message; }
          })()`,
          returnByValue: true
        });
        console.log("ALL_KEYS:" + r.result.result.value);

        // Check lastProjectId
        r = await send("Runtime.evaluate", {
          expression: `(function(){
            try {
              var lastId = window.electronAPI.storageRead('wa_lastProjectId') || window.electronAPI.storageRead('lastProjectId') || 'NONE';
              return "lastProjectId=" + lastId;
            } catch(e) { return "ERR:" + e.message; }
          })()`,
          returnByValue: true
        });
        console.log("LAST:" + r.result.result.value);

        finish("P1-GHOST-DONE");
        ws.close();
      });
      ws.on("error", () => finish("WS_ERR"));
    } catch(e) { finish("PE:" + e.message); }
  });
}).on("error", e => finish("CE:" + e.message));
