const WebSocket = require("ws");
const http = require("http");

http.get("http://localhost:9227/json", (res) => {
  let d = "";
  res.on("data", c => d += c);
  res.on("end", () => {
    const ws = new WebSocket(JSON.parse(d)[0].webSocketDebuggerUrl);
    let id = 0; let ready = false;
    ws.on("open", () => { ready = true; });
    const queue = [];
    function send(m, p) { return new Promise(r => { const i=++id; queue.push({resolve:r,msgId:i}); ws.send(JSON.stringify({id:i,method:m,params:p||{}})); }); }
    ws.on("message", (raw) => { const r=JSON.parse(raw.toString()); if(!r.id)return; const item=queue.find(q=>q.msgId===r.id); if(item){item.resolve(r.result);queue.splice(queue.indexOf(item),1);} });

    setTimeout(async () => {
      if (!ready) { console.log("not ready"); ws.close(); return; }
      await send("Runtime.enable");

      // 检查当前activePanel
      let r = await send("Runtime.evaluate", { expression: "typeof window.__getActivePanel === 'function' ? window.__getActivePanel() : 'no_getter'" });
      console.log("activePanel:", r.result.value);

      // 检查侧边栏
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-outline-workspace'); el ? 'exists:' + el.textContent.trim() : 'missing'" });
      console.log("nav outline btn:", r.result.value);

      // 点击侧边栏打开
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-outline-workspace'); if(el){el.click();'clicked'}else{'missing'}" });
      await new Promise(r => setTimeout(r, 1000));

      r = await send("Runtime.evaluate", { expression: "typeof window.__getActivePanel === 'function' ? window.__getActivePanel() : 'no_getter'" });
      console.log("after click:", r.result.value);

      // 检查面板
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#outline-workspace'); el ? 'exists' : 'missing'" });
      console.log("outline-workspace:", r.result.value);

      if (r.result.value === 'exists') {
        r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-ai-co-create'); el ? 'exists:' + el.textContent.trim() : 'missing'" });
        console.log("ai-co-create:", r.result.value);
      }

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
