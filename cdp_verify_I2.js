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

      // 1. 点击导出按钮展开子菜单
      let r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-export'); if(el){el.click();'clicked'}else{'missing'}" });
      console.log("click export:", r.result.value);
      await new Promise(r => setTimeout(r, 500));

      // 2. 检查导出子菜单按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-export-md','btn-export-txt','btn-export-epub']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("export sub:", r.result.value);

      // 3. 打开查找栏
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.editor.findOpen=true; 'set findOpen'" });
      await new Promise(r => setTimeout(r, 500));

      // 4. 检查查找按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-find-prev','btn-find-next','btn-replace-one','btn-replace-all','btn-find-close']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("find btns:", r.result.value);

      // 5. 检查scope面板按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-add-category','btn-add-item','btn-ai-gen-item','btn-close-sc-detail','btn-close-sc']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("scope btns:", r.result.value);

      // 6. 检查DIFF面板按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-diff-prev','btn-diff-next','btn-diff-accept-all','btn-diff-reject-all','btn-diff-apply','btn-diff-cancel','btn-close-diff']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("diff btns:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
