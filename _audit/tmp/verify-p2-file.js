const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const T = 25000;
let done = false;
function finish(m) { if (done) return; done = true; console.log(m); process.exit(0); }
setTimeout(() => finish("TMO"), T);

const testFile = path.join("C:", "Users", "凯瑞", "Documents", "test_import.txt");
fs.writeFileSync(testFile, "第一章 开端\n\n这是一个关于勇者的故事。\n\n第二章 冒险\n\n勇者踏上了旅程。\n\n第三章 结局\n\n勇者战胜了魔王。", "utf8");
console.log("FILE:" + testFile);

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
        await send("DOM.enable");
        await send("Runtime.enable");

        // Get document
        var doc = await send("DOM.getDocument");
        const docNodeId = doc.result.root.nodeId;
        console.log("P2.0: doc_node=" + docNodeId);

        // Open outline workspace
        var r = await send("Runtime.evaluate", {
          expression: "document.getElementById('outline-workspace') ? 1 : 0",
          returnByValue: true
        });
        if (r.result.result.value === 0) {
          await send("Runtime.evaluate", {
            expression: "document.getElementById('btn-outline-workspace')?.click()",
            returnByValue: true
          });
          await new Promise(r => setTimeout(r, 2000));
        }

        // Find file input via DOM.querySelector
        r = await send("DOM.querySelector", {
          nodeId: docNodeId,
          selector: "input[type=file]"
        });
        const fiNodeId = r.result.nodeId;
        console.log("P2.1: file_input_node=" + fiNodeId);

        // Set file
        r = await send("DOM.setFileInputFiles", {
          nodeId: fiNodeId,
          files: [testFile]
        });
        console.log("P2.2: setFile=" + (r ? "OK" : "FAIL"));
        await new Promise(r => setTimeout(r, 3000));

        // Check editor
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('outline-editor')?.value?.substring(0, 50) || 'NO_VALUE'",
          returnByValue: true
        });
        console.log("P2.3: editor=" + r.result.result.value);

        // Check word count
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('ow-word-count')?.innerText || 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P2.4: words=" + r.result.result.value);

        // Check project name
        r = await send("Runtime.evaluate", {
          expression: "document.querySelector('.project-name')?.innerText || 'NO_NAME'",
          returnByValue: true
        });
        console.log("P2.5: proj_name=" + r.result.result.value);

        // Check lock button
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-lock-outline')?.disabled",
          returnByValue: true
        });
        console.log("P2.6: lock=" + r.result.result.value);

        finish("P2-FILE-DONE");
        ws.close();
      });
      ws.on("error", () => finish("WS_ERR"));
    } catch(e) { finish("PE:" + e.message); }
  });
}).on("error", e => finish("CE:" + e.message));
