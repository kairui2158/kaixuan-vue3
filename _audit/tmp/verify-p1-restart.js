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

        // Wait a moment for app to load
        await new Promise(r => setTimeout(r, 2000));

        // Check project button
        var r = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-open-project') ? 'EXISTS' : 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("R1:btn=" + r.result.result.value);

        // Check project name
        r = await send("Runtime.evaluate", {
          expression: "document.querySelector('.project-name')?.innerText || 'NO_NAME'",
          returnByValue: true
        });
        console.log("R2:proj_name=" + r.result.result.value);

        // Open project modal
        await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-open-project').click()",
          returnByValue: true
        });
        await new Promise(r => setTimeout(r, 2000));

        // Check project list
        r = await send("Runtime.evaluate", {
          expression: "document.querySelectorAll('.project-item').length",
          returnByValue: true
        });
        console.log("R3:items=" + r.result.result.value);

        // Check empty hint
        r = await send("Runtime.evaluate", {
          expression: "document.querySelector('.project-list') ? document.querySelector('.project-list').innerText : 'NO_LIST'",
          returnByValue: true
        });
        console.log("R4:list=" + r.result.result.value);

        // Check storage for project keys
        r = await send("Runtime.evaluate", {
          expression: "JSON.stringify(window.electronAPI.storageList().filter(k => k.includes('project') || k.includes('wa_project')))",
          returnByValue: true
        });
        console.log("R5:storage=" + r.result.result.value);

        finish("P1-RESTART-DONE");
        ws.close();
      });
      ws.on("error", () => finish("WS_ERR"));
    } catch(e) { finish("PE:" + e.message); }
  });
}).on("error", e => finish("CE:" + e.message));
