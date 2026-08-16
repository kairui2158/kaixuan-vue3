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

      // 设置数据，curStep=3 显示步骤4
      let r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; if(!p.state.value.ui) p.state.value.ui={}; p.state.value.ui.activePanel='pipeline'; p.state.value.pipeline.currentStep=3; p.state.value.project.volumes=[{name:'v1',confirmed:false,chapters:[{title:'ch1',plot:'p1'}]}]; 'set'" });
      console.log("init:", r.result.value);
      await new Promise(r => setTimeout(r, 500));

      // 检查步骤4按钮
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-pl-confirm-chapters'); el ? 'exists:'+el.disabled+'|text:'+el.textContent : 'missing'" });
      console.log("chapters_btn:", r.result.value);

      // 检查步骤4面板
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#pl-step-4-content'); el ? 'exists:'+(el.style.display||'shown') : 'missing'" });
      console.log("step4:", r.result.value);

      // 设置curStep=4 显示步骤5
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.pipeline.currentStep=4; p.state.value.project.bodyResult='test body'; 'set step5'" });
      console.log("step5:", r.result.value);
      await new Promise(r => setTimeout(r, 500));

      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-pl-confirm-body'); el ? 'exists:'+el.disabled : 'missing'" });
      console.log("body_btn:", r.result.value);

      // 检查AI工具按钮
      r = await send("Runtime.evaluate", { expression: "var btns=['btn-ai-names','btn-writing-rules','btn-timeline','btn-batch-review','btn-revise','btn-translate','btn-style-convert','btn-regenerate','btn-modify']; var results={}; for(var b of btns){var el=document.querySelector('#'+b);results[b]=el?'exists':'missing';} JSON.stringify(results)" });
      console.log("AI tools:", r.result.value);

      // 检查弹出面板按钮
      r = await send("Runtime.evaluate", { expression: "var btns=['btn-skill-bind-modal','btn-save-chapter','btn-save-project','btn-export']; var results={}; for(var b of btns){var el=document.querySelector('#'+b);results[b]=el?'exists':'missing';} JSON.stringify(results)" });
      console.log("popup btns:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
