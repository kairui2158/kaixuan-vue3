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

      // 打开大纲工作台
      let r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-outline-workspace');if(el){el.click();'clicked'}else{'missing'}" });
      await new Promise(r => setTimeout(r, 800));

      // 截图
      r = await send("Runtime.evaluate", { expression: "document.querySelector('#outline-workspace') ? 'panel_open' : 'panel_missing'" });
      console.log("panel:", r.result.value);

      // 检查btn-ai-co-create
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-ai-co-create'); el ? 'exists:' + el.textContent.trim() + '|visible:' + (el.offsetParent !== null) : 'missing'" });
      console.log("ai-co-create:", r.result.value);

      // 检查整个大纲工作台的HTML结构（顶部区域）
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('.ow-content'); el ? el.innerHTML.substring(0, 1500) : 'missing'" });
      console.log("ow-content HTML:", r.result.value);

      // 检查chatArea
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('.ow-chat'); el ? 'chat_exists:' + (el.style.display || 'visible') : 'chat_missing'" });
      console.log("chat area:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
