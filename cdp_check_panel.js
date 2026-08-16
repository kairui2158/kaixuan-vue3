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

      // 检查activePanel
      let r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value; 'activePanel=' + (p.ui ? p.ui.activePanel : 'no_ui')" });
      console.log("before:", r.result.value);

      // 点击btn-pipeline
      r = await send("Runtime.evaluate", { expression: "document.querySelector('#btn-pipeline').click(); 'clicked'" });
      console.log("clicked:", r.result.value);
      await new Promise(r => setTimeout(r, 800));

      // 再次检查
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value; 'activePanel=' + (p.ui ? p.ui.activePanel : 'no_ui')" });
      console.log("after click:", r.result.value);

      // 检查body结构
      r = await send("Runtime.evaluate", { expression: "var body = document.body.innerHTML; body.includes('pipeline-panel') ? 'pipeline_in_DOM' : 'no_pipeline_in_DOM'" });
      console.log("DOM:", r.result.value);

      // 检查v-if
      r = await send("Runtime.evaluate", { expression: "var el = document.querySelector('#pipeline-panel'); el ? 'panel_exists:' + (el.style.display || 'visible') : 'panel_missing'" });
      console.log("panel:", r.result.value);

      // 尝试直接设置activePanel
      r = await send("Runtime.evaluate", { expression: "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; if(!p.state.value.ui) p.state.value.ui={}; p.state.value.ui.activePanel='pipeline'; 'set activePanel=pipeline'" });
      console.log("force set:", r.result.value);
      await new Promise(r => setTimeout(r, 500));

      // 检查
      r = await send("Runtime.evaluate", { expression: "var el = document.querySelector('#btn-pl-confirm-outline'); el ? 'exists:' + el.disabled : 'missing'" });
      console.log("btn:", r.result.value);

      r = await send("Runtime.evaluate", { expression: "var el = document.querySelector('#pl-step-1-content'); el ? 'exists:' + (el.style.display || 'shown') : 'missing'" });
      console.log("step1:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
