const http = require("http");
const WebSocket = require("ws");
const T = 20000;
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

        // Step 1: Override confirm
        var r = await send("Runtime.evaluate", {
          expression: "window.confirm = function() { return true; }; 'OK'",
          returnByValue: true
        });
        console.log("1:confirm_override=" + r.result.result.value);

        // Step 2: Check items
        r = await send("Runtime.evaluate", {
          expression: "document.querySelectorAll('.project-item').length",
          returnByValue: true
        });
        console.log("2:items=" + r.result.result.value);

        if (r.result.result.value > 0) {
          // Step 3: Click delete on first item
          r = await send("Runtime.evaluate", {
            expression: "document.querySelectorAll('.project-item .btn-danger')[0].click()",
            returnByValue: true
          });
          console.log("3:clicked=" + (r.result ? "OK" : "FAIL"));
          await new Promise(r => setTimeout(r, 2000));

          // Step 4: Check items after delete
          r = await send("Runtime.evaluate", {
            expression: "document.querySelectorAll('.project-item').length",
            returnByValue: true
          });
          console.log("4:after_del=" + r.result.result.value);

          // Step 5: Check storage
          r = await send("Runtime.evaluate", {
            expression: "JSON.stringify(window.electronAPI.storageList().filter(k => k.includes('project') || k.includes('wa_project')))",
            returnByValue: true
          });
          console.log("5:storage=" + r.result.result.value);

          // Step 6: Check empty hint
          r = await send("Runtime.evaluate", {
            expression: "document.querySelector('.empty-hint')?.innerText || 'NO_EMPTY'",
            returnByValue: true
          });
          console.log("6:empty=" + r.result.result.value);
        }

        // Step 7: Verify project name cleared
        r = await send("Runtime.evaluate", {
          expression: "document.querySelector('.project-name')?.innerText || 'NO_NAME'",
          returnByValue: true
        });
        console.log("7:proj_name=" + r.result.result.value);

        finish("P1-DONE");
        ws.close();
      });
      ws.on("error", () => finish("WS_ERR"));
    } catch(e) { finish("PE:" + e.message); }
  });
}).on("error", e => finish("CE:" + e.message));
