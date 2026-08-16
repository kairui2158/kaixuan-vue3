const WebSocket = require("ws");
const http = require("http");

const CDP_PORT = 9227;

http.get("http://localhost:" + CDP_PORT + "/json", (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    const ws = new WebSocket(JSON.parse(data)[0].webSocketDebuggerUrl);
    let msgId = 1;
    const pending = {};

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        pending[id] = resolve;
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    ws.on("message", (raw) => {
      const resp = JSON.parse(raw.toString());
      if (resp.id && pending[resp.id]) {
        pending[resp.id](resp);
        delete pending[resp.id];
      }
    });

    ws.on("open", async () => {
      await send("DOM.enable");
      await send("Runtime.enable");

      // 先检查 activePanel 状态
      let r = await send("Runtime.evaluate", { expression: `document.querySelector("#app").__vue_app__.config.globalProperties.$pinia.state.value.ui?.activePanel || "unknown"` });
      console.log("activePanel:", r.result.value);

      // 点击管道按钮
      const doc = await send("DOM.getDocument");
      const qNav = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: "#btn-pipeline" });
      console.log("btn-pipeline found:", qNav.result.nodeId !== 0);
      await send("DOM.click", { nodeId: qNav.result.nodeId });
      await new Promise(r => setTimeout(r, 1500));

      r = await send("Runtime.evaluate", { expression: `document.querySelector("#app").__vue_app__.config.globalProperties.$pinia.state.value.ui?.activePanel || "unknown"` });
      console.log("after click activePanel:", r.result.value);

      // 重新获取document
      const doc2 = await send("DOM.getDocument");
      const root2 = doc2.result.root.nodeId;

      // 设置数据
      await send("Runtime.evaluate", { expression: `
        (() => {
          const p = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia;
          p.state.value.project.outlineText = "测试大纲";
          p.state.value.project.hasOutline = true;
          p.state.value.project.volumes = [{ name: "第一卷", confirmed: false, chapters: [] }];
          return "ok";
        })()
      ` });
      await new Promise(r => setTimeout(r, 500));

      // 查找按钮
      for (const id of ["btn-pl-confirm-outline", "btn-pl-confirm-settings", "btn-pl-confirm-volumes", "btn-pl-confirm-chapters", "btn-pl-confirm-body"]) {
        const q = await send("DOM.querySelector", { nodeId: root2, selector: "#" + id });
        console.log(id + ":", q.result.nodeId !== 0 ? "EXISTS" : "MISSING");
      }

      // 尝试直接点击
      const qOutline = await send("DOM.querySelector", { nodeId: root2, selector: "#btn-pl-confirm-outline" });
      if (qOutline.result.nodeId !== 0) {
        await send("DOM.click", { nodeId: qOutline.result.nodeId });
        console.log("clicked outline");
      }
      await new Promise(r => setTimeout(r, 500));

      r = await send("Runtime.evaluate", { expression: `document.querySelector("#app").__vue_app__.config.globalProperties.$pinia.state.value.pipeline.currentStep` });
      console.log("currentStep after click:", r.result.value);

      ws.close();
      console.log("DONE");
    });
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
