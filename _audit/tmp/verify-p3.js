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

        // Check provider config
        var r = await send("Runtime.evaluate", {
          expression: "(function(){ try { var data = window.electronAPI.storageRead('wa_providers'); if(data) { return JSON.stringify({ providers: (Array.isArray(data) ? data : []).map(function(p) { return { name: p.name, baseUrl: p.baseUrl, hasKey: !!(p.apiKey && p.apiKey.length > 5), model: p.selectedModel || (p.models ? p.models[0] : '') }; }) }); } return 'NO_PROVIDERS'; } catch(e) { return 'ERR:' + e.message; } })()",
          returnByValue: true
        });
        console.log("P3.1:providers=" + r.result.result.value);

        // Open outline workspace
        var r = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-outline-workspace')?.click()",
          returnByValue: true
        });
        await new Promise(r => setTimeout(r, 2000));

        // Check AI co-create button
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-ai-co-create') ? 'EXISTS' : 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P3.2:ai_btn=" + r.result.result.value);

        // Toggle chat on
        await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-ai-co-create')?.click()",
          returnByValue: true
        });
        await new Promise(r => setTimeout(r, 1000));

        // Check chat area
        r = await send("Runtime.evaluate", {
          expression: "(function(){ var c = document.querySelector('.ow-chat'); if(!c) return 'NOT_FOUND'; return 'display=' + getComputedStyle(c).display + ' msgs=' + c.querySelectorAll('.ow-msg').length; })()",
          returnByValue: true
        });
        console.log("P3.3:chat=" + r.result.result.value);

        // Check input
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('ow-chat-input') ? 'EXISTS' : 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P3.4:input=" + r.result.result.value);

        // Check send button
        r = await send("Runtime.evaluate", {
          expression: "document.getElementById('btn-ow-send')?.innerText || 'NOT_FOUND'",
          returnByValue: true
        });
        console.log("P3.5:send=" + r.result.result.value);

        finish("P3-DONE");
        ws.close();
      });
      ws.on("error", () => finish("WS_ERR"));
    } catch(e) { finish("PE:" + e.message); }
  });
}).on("error", e => finish("CE:" + e.message));
