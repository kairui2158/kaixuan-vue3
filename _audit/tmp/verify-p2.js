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

        // Check if outline workspace is visible
        var r = await send("Runtime.evaluate", {
          expression: "document.getElementById('outline-workspace') ? 'VISIBLE' : 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P2.1:ow=" + r.result.result.value);

        // Check import button
        r = await send("Runtime.evaluate", {
          expression: "(function(){ var b = document.getElementById('btn-import-outline'); if(!b) return 'NOT_FOUND'; var cs = getComputedStyle(b); return 'display=' + cs.display + ' opacity=' + cs.opacity + ' pointer=' + cs.pointerEvents + ' text=' + b.innerText; })()",
          returnByValue: true
        });
        console.log("P2.2:btn=" + r.result.result.value);

        // Check outline editor
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('outline-editor') ? 'VISIBLE' : 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P2.3:editor=" + r.result.result.value);

        // Check project name
        r = await send("Runtime.evaluate", {
          expression: "document.querySelector('.project-name')?.innerText || 'NO_NAME'",
          returnByValue: true
        });
        console.log("P2.4:proj_name=" + r.result.result.value);

        // Check if we can navigate to outline workspace
        // First, check if there's a way to open it
        r = await send("Runtime.evaluate", {
          expression: "document.querySelectorAll('button').length",
          returnByValue: true
        });
        console.log("P2.5:total_buttons=" + r.result.result.value);

        // List all buttons on the page
        r = await send("Runtime.evaluate", {
          expression: "Array.from(document.querySelectorAll('button')).map(function(b){ return b.id || b.innerText.substring(0,20); }).join(' | ')",
          returnByValue: true
        });
        console.log("P2.6:buttons=" + r.result.result.value);

        finish("P2-DONE");
        ws.close();
      });
      ws.on("error", () => finish("WS_ERR"));
    } catch(e) { finish("PE:" + e.message); }
  });
}).on("error", e => finish("CE:" + e.message));
