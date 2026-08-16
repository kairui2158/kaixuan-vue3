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

      // 调出查找栏
      let r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.editor.findVisible=true; 'set'" });
      console.log("set findVisible:", r.result.value);
      await new Promise(r => setTimeout(r, 500));

      // 检查查找按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-find-prev','btn-find-next','btn-find-close']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("find btns:", r.result.value);

      // 替换按钮可能在不同条件
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-replace-one','btn-replace-all']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("replace btns:", r.result.value);

      // 检查scope面板按钮 — 通过打开scope面板
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-sc-collection'); if(el){el.click();'clicked'}else{'missing'}" });
      console.log("click sc:", r.result.value);
      await new Promise(r => setTimeout(r, 800));

      r = await send("Runtime.evaluate", { expression: "var ids=['btn-add-category','btn-add-item','btn-ai-gen-item','btn-close-sc','btn-save-bind']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("scope btns:", r.result.value);

      // 检查退出确认面板按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-exit-cancel','btn-exit-direct','btn-exit-save']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("exit btns:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
