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

        // Open outline workspace
        var r = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-outline-workspace')?.click()",
          returnByValue: true
        });
        await new Promise(r => setTimeout(r, 2000));

        // Check import button style
        r = await send("Runtime.evaluate", {
          expression: "(function(){ var b = document.getElementById('btn-import-outline'); if(!b) return 'NOT_FOUND'; var cs = getComputedStyle(b); return 'bg=' + cs.background + ' color=' + cs.color + ' border=' + cs.border + ' fw=' + cs.fontWeight; })()",
          returnByValue: true
        });
        console.log("P2.STYLE:" + r.result.result.value);

        // Verify import still works
        const fs = require("fs");
        const path = require("path");
        const testFile = path.join("C:", "Users", "凯瑞", "Documents", "test_import2.txt");
        fs.writeFileSync(testFile, "测试导入功能", "utf8");

        // Get doc node
        var doc = await send("DOM.getDocument");
        const docNodeId = doc.result.root.nodeId;

        // Find file input
        r = await send("DOM.querySelector", {
          nodeId: docNodeId,
          selector: "input[type=file]"
        });
        await send("DOM.setFileInputFiles", {
          nodeId: r.result.nodeId,
          files: [testFile]
        });
        console.log("P2.IMPORT:set");
        await new Promise(r => setTimeout(r, 2000));

        // Check editor
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('outline-editor')?.value?.substring(0, 30) || 'NO_VALUE'",
          returnByValue: true
        });
        console.log("P2.IMPORT:content=" + r.result.result.value);

        finish("P2-DONE");
        ws.close();
      });
      ws.on("error", () => finish("WS_ERR"));
    } catch(e) { finish("PE:" + e.message); }
  });
}).on("error", e => finish("CE:" + e.message));
