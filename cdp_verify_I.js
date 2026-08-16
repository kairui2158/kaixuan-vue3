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

      // 1. 打开大纲工作台
      let r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-outline-workspace');el.click();'clicked'" });
      await new Promise(r => setTimeout(r, 800));

      // 2. 检查大纲内部次级按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-export-outline-md','btn-export-outline-txt','btn-generate-outline-skills','btn-ai-co-create','btn-ow-send','btn-save-outline']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("outline sub btns:", r.result.value);

      // 检查大纲导出按钮是否可见
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('.ow-export-btn'); el ? 'export_btn_group_exists:'+el.textContent : 'missing'" });
      console.log("export group:", r.result.value);

      // 3. 关闭大纲，打开记忆面板
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-close-outline-workspace');el.click();'closed'" });
      await new Promise(r => setTimeout(r, 500));
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-memory');el.click();'clicked'" });
      await new Promise(r => setTimeout(r, 800));

      // 4. 检查记忆面板内部次级按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-add-mem-cat','btn-add-mem']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("memory sub btns:", r.result.value);

      // 5. 检查编辑器面板按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-undo','btn-redo','btn-save-editor','btn-generate-content','btn-de-ai','btn-export','btn-export-md','btn-export-txt','btn-export-epub']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("editor btns:", r.result.value);

      // 6. 检查查找替换按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-find-prev','btn-find-next','btn-replace-one','btn-replace-all','btn-find-close']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("find btns:", r.result.value);

      // 7. 检查章节树按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-tree-gen','btn-tree-generate','btn-add-volume','btn-open-project','btn-new-project','btn-open-file']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("tree btns:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
