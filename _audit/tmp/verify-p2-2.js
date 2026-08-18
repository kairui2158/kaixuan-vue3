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

        // Click outline workspace button
        console.log("P2.1: clicking btn-outline-workspace...");
        var r = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-outline-workspace')?.click()",
          returnByValue: true
        });
        console.log("P2.2: click result=" + (r.result ? "OK" : "FAIL"));
        await new Promise(r => setTimeout(r, 2000));

        // Check if outline workspace appeared
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('outline-workspace') ? 'VISIBLE' : 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P2.3: ow=" + r.result.result.value);

        // Check import button
        r = await send("Runtime.evaluate", {
          expression: "(function(){ var b = document.getElementById('btn-import-outline'); if(!b) return 'NOT_FOUND'; var cs = getComputedStyle(b); return 'display=' + cs.display + ' opacity=' + cs.opacity + ' text=' + b.innerText; })()",
          returnByValue: true
        });
        console.log("P2.4: btn=" + r.result.result.value);

        // Check save button
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-save-outline')?.innerText || 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P2.5: save=" + r.result.result.value);

        // Check lock button
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-lock-outline')?.innerText || 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P2.6: lock=" + r.result.result.value);

        // Check lock button disabled state
        r = await send("Runtime.evaluate", {
          expression: "(function(){ var b = document.getElementById('btn-lock-outline'); if(!b) return 'NOT_FOUND'; return 'disabled=' + b.disabled; })()",
          returnByValue: true
        });
        console.log("P2.7: lock_disabled=" + r.result.result.value);

        // Check outline editor
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('outline-editor') ? 'VISIBLE' : 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P2.8: editor=" + r.result.result.value);

        // Check word count
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('ow-word-count')?.innerText || 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P2.9: word_count=" + r.result.result.value);

        // Check file input element
        r = await send("Runtime.evaluate", {
          expression: "(function(){ var fi = document.querySelector('input[type=file]'); if(!fi) return 'NO_FILE_INPUT'; return 'accept=' + fi.accept; })()",
          returnByValue: true
        });
        console.log("P2.10: file_input=" + r.result.result.value);

        finish("P2-DONE");
        ws.close();
      });
      ws.on("error", () => finish("WS_ERR"));
    } catch(e) { finish("PE:" + e.message); }
  });
}).on("error", e => finish("CE:" + e.message));
