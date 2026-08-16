const WebSocket = require("ws");
const http = require("http");

http.get("http://localhost:9227/json", (res) => {
  let d = "";
  res.on("data", c => d += c);
  res.on("end", () => {
    const ws = new WebSocket(JSON.parse(d)[0].webSocketDebuggerUrl);
    let id = 0;
    let ready = false;
    ws.on("open", () => { ready = true; });
    const queue = [];
    function send(method, params) {
      return new Promise((resolve) => {
        const msgId = ++id;
        queue.push({ resolve, msgId });
        ws.send(JSON.stringify({id: msgId, method, params: params || {}}));
      });
    }
    ws.on("message", (raw) => {
      const r = JSON.parse(raw.toString());
      if (!r.id) return;
      const item = queue.find(q => q.msgId === r.id);
      if (item) { item.resolve(r.result); queue.splice(queue.indexOf(item), 1); }
    });

    setTimeout(async () => {
      if (!ready) { console.log("not ready"); ws.close(); return; }
      await send("Runtime.enable");

      // 1. 打开面板 + 设置数据
      let r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; if(!p.state.value.ui) p.state.value.ui={}; p.state.value.ui.activePanel='pipeline'; p.state.value.pipeline.currentStep=0; p.state.value.project.outlineText='test'; p.state.value.project.hasOutline=true; p.state.value.project.settings=[{name:'s1',category:'其他',attrsText:'a1'}]; p.state.value.project.volumes=[{name:'v1',confirmed:false,chapters:[]}]; 'ready'" });
      console.log("init:", r.result.value);
      await new Promise(r => setTimeout(r, 500));

      // 2. 检查按钮
      r = await send("Runtime.evaluate", { expression: "var e1=document.querySelector('#btn-pl-confirm-outline'),e2=document.querySelector('#btn-pl-confirm-settings'),e3=document.querySelector('#btn-pl-confirm-volumes'); 'outline:'+(e1?'exists':'missing')+'|settings:'+(e2?'exists':'missing')+'|volumes:'+(e3?'exists':'missing')" });
      console.log("btns:", r.result.value);

      // 3. 步骤1确认
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-pl-confirm-outline');if(el&&!el.disabled){el.click();'confirmed'}else{'no'}" });
      console.log("click1:", r.result.value);
      await new Promise(r => setTimeout(r, 500));
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value; 'step1:curStep='+p.pipeline.currentStep" });
      console.log("after1:", r.result.value);

      // 4. 步骤2确认
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-pl-confirm-settings');if(el&&!el.disabled){el.click();'confirmed'}else{'no'}" });
      console.log("click2:", r.result.value);
      await new Promise(r => setTimeout(r, 500));
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value; 'step2:curStep='+p.pipeline.currentStep" });
      console.log("after2:", r.result.value);

      // 5. 步骤3确认
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-pl-confirm-volumes');if(el&&!el.disabled){el.click();'confirmed'}else{'no'}" });
      console.log("click3:", r.result.value);
      await new Promise(r => setTimeout(r, 500));
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value; 'step3:curStep='+p.pipeline.currentStep+'|volsConfirmed='+p.project.volumesConfirmed" });
      console.log("FINAL:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
