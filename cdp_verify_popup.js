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

      // 检查所有弹出面板按钮
      let r = await send("Runtime.evaluate", { expression: "var ids=['btn-save-bind','btn-save-volume','btn-create-project','btn-save-editor','btn-save-outline','btn-lock-outline','btn-save-settings','btn-save-skill','btn-save-agent','btn-add-agent','btn-add-skill','btn-add-volume','btn-open-project','btn-new-project','btn-export','btn-export-md','btn-export-txt','btn-export-epub','btn-import-outline','btn-generate-outline-skills','btn-ai-co-create','btn-close-outline-workspace']; var r={}; for(var i of ids){var el=document.querySelector('#'+i);r[i]=el?'exists':'missing';} JSON.stringify(r)" });
      console.log("popup check:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
