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

        // Set textarea value and trigger input event
        await send("Runtime.evaluate", {
          expression: `(function(){
            var ta = document.getElementById('outline-editor');
            if (!ta) return "NO_TEXTAREA";
            var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            nativeInputValueSetter.call(ta, "第一章 开端\\n\\n这是一个关于勇者的故事。\\n\\n第二章 冒险\\n\\n勇者踏上了旅程。\\n\\n第三章 结局\\n\\n勇者战胜了魔王。");
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            return "TEXT_SET:" + ta.value.length;
          })()`,
          returnByValue: true
        });
        console.log("P2.11: text_set=" + (r.result ? r.result.result.value : "FAIL"));
        await new Promise(r => setTimeout(r, 2000));

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

        finish("P2-SET-TEXT-DONE");
        ws.close();
      });
      ws.on("error", () => finish("WS_ERR"));
    } catch(e) { finish("PE:" + e.message); }
  });
}).on("error", e => finish("CE:" + e.message));
