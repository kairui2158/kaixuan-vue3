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

      // 截图大纲工作台头部区域
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('.ow-content'); var rect = el.getBoundingClientRect(); JSON.stringify({w:rect.width, h:rect.height, top:rect.top, left:rect.left})" });
      console.log("ow dimensions:", r.result.value);

      // 遍历所有按钮
      r = await send("Runtime.evaluate", { expression: "var btns=document.querySelector('#outline-workspace').querySelectorAll('button'); var res=[]; for(var b of btns){res.push({id:b.id,text:b.textContent.trim(),top:b.getBoundingClientRect().top});} JSON.stringify(res)" });
      console.log("all buttons:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
