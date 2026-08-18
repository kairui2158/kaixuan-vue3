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

        // Make sure outline workspace is open
        var r = await send("Runtime.evaluate", {
          expression: "document.getElementById('outline-workspace') ? 'VISIBLE' : 'NOT_FOUND'",
          returnByValue: true
        });
        if (r.result.result.value === "NOT_FOUND") {
          await send("Runtime.evaluate", {
            expression: "document.getElementById('btn-outline-workspace')?.click()",
            returnByValue: true
          });
          await new Promise(r => setTimeout(r, 2000));
        }

        // Simulate file import by setting the outline editor text directly
        // This tests the "import → editor → project name → storage" flow
        await send("Runtime.evaluate", {
          expression: `(function(){
            // Simulate what handleImport does
            var text = "第一章 开端\\n\\n这是一个关于勇者的故事。\\n\\n第二章 冒险\\n\\n勇者踏上了旅程。\\n\\n第三章 结局\\n\\n勇者战胜了魔王。";
            // Get the project store via Vue internals
            var app = document.querySelector("#app").__vue_app__;
            if (!app) return "NO_APP";
            try {
              // Find Pinia instance
              var provides = app._context.provides;
              var piniaInstance = null;
              for (var key of Object.getOwnPropertySymbols(provides)) {
                if (key.toString().includes("pinia")) {
                  piniaInstance = provides[key];
                  break;
                }
              }
              if (!piniaInstance) return "NO_PINIA";
              // Access project store state
              var projectState = piniaInstance.state.value.project;
              if (!projectState) return "NO_PROJECT_STATE";
              // Set project ID if not set
              if (!projectState.currentProjectId) {
                projectState.currentProjectId = "proj-" + Date.now();
              }
              projectState.projectName = "test_outline";
              projectState.outlineText = text;
              projectState.hasOutline = true;
              return "STORE_SET: id=" + projectState.currentProjectId + " name=" + projectState.projectName + " len=" + projectState.outlineText.length;
            } catch(e) { return "ERR:" + e.message; }
          })()`,
          returnByValue: true
        });
        console.log("P2.11: store_set=" + (r.result ? r.result.result.value : "FAIL"));
        await new Promise(r => setTimeout(r, 1000));

        // Check if editor was updated
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('outline-editor')?.value?.substring(0, 50) || 'NO_VALUE'",
          returnByValue: true
        });
        console.log("P2.12: editor=" + r.result.result.value);

        // Check word count
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('ow-word-count')?.innerText || 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P2.13: words=" + r.result.result.value);

        // Check project name
        r = await send("Runtime.evaluate", {
          expression: "document.querySelector('.project-name')?.innerText || 'NO_NAME'",
          returnByValue: true
        });
        console.log("P2.14: proj_name=" + r.result.result.value);

        // Check lock button state
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-lock-outline')?.disabled",
          returnByValue: true
        });
        console.log("P2.15: lock_disabled=" + r.result.result.value);

        // Check storage
        r = await send("Runtime.evaluate", {
          expression: "(function(){ try { return JSON.stringify(window.electronAPI.storageList().filter(function(k) { return k.includes('project') || k.includes('outline'); })); } catch(e) { return 'ERR:' + e.message; } })()",
          returnByValue: true
        });
        console.log("P2.16: storage=" + r.result.result.value);

        // Read the saved project data
        r = await send("Runtime.evaluate", {
          expression: "(function(){ try { var allKeys = window.electronAPI.storageList(); var projKey = allKeys.find(function(k) { return k.startsWith('wa_project_'); }); if (!projKey) return 'NO_PROJ_KEY'; var data = window.electronAPI.storageRead(projKey); return 'SAVED:' + (data ? data.substring(0, 100) : 'EMPTY'); } catch(e) { return 'ERR:' + e.message; } })()",
          returnByValue: true
        });
        console.log("P2.17: saved=" + r.result.result.value);

        finish("P2-IMPORT-DONE");
        ws.close();
      });
      ws.on("error", () => finish("WS_ERR"));
    } catch(e) { finish("PE:" + e.message); }
  });
}).on("error", e => finish("CE:" + e.message));
