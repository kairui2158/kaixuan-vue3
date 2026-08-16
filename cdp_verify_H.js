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
      let r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; if(!p.state.value.ui) p.state.value.ui={}; p.state.value.ui.activePanel='outline'; 'set'" });
      console.log("open outline:", r.result.value);
      await new Promise(r => setTimeout(r, 500));

      // 2. 检查大纲工作台按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-import-outline','btn-save-outline','btn-lock-outline','btn-generate-outline-skills','btn-ai-co-create','btn-close-outline-workspace','btn-export-outline-md','btn-export-outline-txt']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("outline btns:", r.result.value);

      // 3. 打开设置面板
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.ui.activePanel='settings'; 'set'" });
      await new Promise(r => setTimeout(r, 500));

      r = await send("Runtime.evaluate", { expression: "var ids=['btn-save-settings','btn-test-connection','btn-close-settings']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("settings btns:", r.result.value);

      // 4. 打开技能面板
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.ui.activePanel='skill'; 'set'" });
      await new Promise(r => setTimeout(r, 500));

      r = await send("Runtime.evaluate", { expression: "var ids=['btn-add-skill','btn-save-skill','btn-cancel-skill']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("skill btns:", r.result.value);

      // 5. 打开智能体面板
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.ui.activePanel='agent'; 'set'" });
      await new Promise(r => setTimeout(r, 500));

      r = await send("Runtime.evaluate", { expression: "var ids=['btn-add-agent','btn-save-agent','btn-cancel-agent']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("agent btns:", r.result.value);

      // 6. 打开记忆面板
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.ui.activePanel='memory'; 'set'" });
      await new Promise(r => setTimeout(r, 500));

      r = await send("Runtime.evaluate", { expression: "var ids=['btn-add-mem-cat','btn-add-mem','btn-close-mem']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("memory btns:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
