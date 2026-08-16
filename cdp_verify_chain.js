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
      if (item) {
        item.resolve(r.result);
        const idx = queue.indexOf(item);
        if (idx >= 0) queue.splice(idx, 1);
      }
    });

    setTimeout(async () => {
      if (!ready) { console.log("not ready"); ws.close(); return; }

      await send("Runtime.enable");

      // 1. 重置所有状态
      let r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.pipeline.currentStep=0; p.state.value.project.outlineText=''; p.state.value.project.hasOutline=false; p.state.value.project.outlineConfirmed=false; p.state.value.project.settingsConfirmed=false; p.state.value.project.volumesConfirmed=false; p.state.value.project.volumes=[]; p.state.value.project.settings=[]; p.state.value.project.chapters={}; 'reset ok'" });
      console.log("reset:", r.result.value);

      // 2. 设置完整数据
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.project.outlineText='测试大纲：勇者冒险'; p.state.value.project.hasOutline=true; p.state.value.project.settings=[{name:'魔法体系',category:'魔法体系',attrsText:'火球术'}]; p.state.value.project.volumes=[{name:'第一卷',confirmed:false,chapters:[],outline:'卷概要',summary:'摘要'}]; 'data ok'" });
      console.log("data:", r.result.value);

      // 3. 打开流水线
      r = await send("Runtime.evaluate", { expression: "document.querySelector('#btn-pipeline').click();'clicked'" });
      console.log("pipeline:", r.result.value);
      await new Promise(r => setTimeout(r, 1000));

      // 4. 检查curStep
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value;'curStep='+p.pipeline.currentStep+'|vols='+p.project.volumes.length+'|settings='+p.project.settings.length" });
      console.log("state:", r.result.value);

      // 5. 步骤1确认
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-pl-confirm-outline');if(el&&!el.disabled){el.click();'confirmed'}else{'no:'+(el?'disabled':'missing')}" });
      console.log("click1:", r.result.value);
      await new Promise(r => setTimeout(r, 500));
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value;'step1:curStep='+p.pipeline.currentStep" });
      console.log("after1:", r.result.value);

      // 6. 步骤2确认
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-pl-confirm-settings');if(el&&!el.disabled){el.click();'confirmed'}else{'no:'+(el?'disabled':'missing')}" });
      console.log("click2:", r.result.value);
      await new Promise(r => setTimeout(r, 500));
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value;'step2:curStep='+p.pipeline.currentStep" });
      console.log("after2:", r.result.value);

      // 7. 步骤3确认
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-pl-confirm-volumes');if(el&&!el.disabled){el.click();'confirmed'}else{'no:'+(el?'disabled':'missing')}" });
      console.log("click3:", r.result.value);
      await new Promise(r => setTimeout(r, 500));
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value;'step3:curStep='+p.pipeline.currentStep+'|vols='+p.project.volumes.length" });
      console.log("FINAL:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
