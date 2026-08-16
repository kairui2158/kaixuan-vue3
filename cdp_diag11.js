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
    let consoleLogs = [];
    
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
    
    ws.on("open", async () => {
      console.log("CDP OK");
      await send("Page.enable");
      await send("Console.enable");
      
      // Capture console errors
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "Console.messageAdded") {
          const level = msg.params.message.level;
          const text = msg.params.message.text;
          if (level === "error" || level === "warning") {
            consoleLogs.push(level + ": " + text);
          }
        }
      });
      
      // Open pipeline
      await send("Runtime.evaluate", {
        expression: "document.getElementById('btn-pipeline').click()"
      });
      await new Promise(r => setTimeout(r, 500));
      
      // Inject error capture
      await send("Runtime.evaluate", {
        expression: "window.__clickErrors = []"
      });
      
      // Click each button
      const btnIds = "btn-close-pl|btn-ai-names|btn-writing-rules|btn-timeline|btn-batch-review|btn-revise|btn-translate|btn-style-convert|btn-regenerate|btn-modify|pl-s1-add-skill|保存大纲|锁定大纲|btn-pl-confirm-outline|pl-s2-add-skill|+ 新增设定|btn-pl-gen-settings|btn-pl-save-settings|btn-pl-confirm-settings|pl-s3-add-skill|btn-pl-gen-volumes|btn-pl-gen-single-volume|btn-pl-create-volumes|btn-pl-continue-volumes|btn-pl-confirm-volumes|pl-s4-add-skill|btn-pl-gen-chapters|btn-pl-autogen-chapters|btn-pl-confirm-chapters|pl-s5-add-skill|btn-pl-gen-body|btn-pl-insert-body|btn-pl-confirm-body".split("|");
      
      for (const bid of btnIds) {
        console.log("Clicking:", bid);
        try {
          await send("Runtime.evaluate", {
            expression: "(function(){ try { var el = document.getElementById('" + bid + "'); if (el) { el.click(); return 'ok'; } var btns = Array.from(document.querySelectorAll('#pipeline-panel button')).filter(b => b.textContent.trim() === '" + bid + "'); if (btns.length > 0) { btns[0].click(); return 'clicked by text'; } return 'not found'; } catch(e) { window.__clickErrors.push('" + bid + ": ' + e.message); return 'err: ' + e.message; } })()"
          });
        } catch(e) {
          console.log("  EVAL ERROR:", e.message);
        }
        await new Promise(r => setTimeout(r, 300));
      }
      
      // Print console errors
      console.log("\n=== CONSOLE ERRORS ===");
      for (const log of consoleLogs) {
        console.log(log);
      }
      
      console.log("\n=== CLICK ERRORS ===");
      const errResult = await send("Runtime.evaluate", {
        expression: "window.__clickErrors.length > 0 ? window.__clickErrors.join('\\n') : 'no errors'"
      });
      console.log(errResult.result.value);
      
      console.log("\n=== DONE ===");
      ws.close();
    });
  });
}).on("error", (e) => console.log("Error:", e.message));
