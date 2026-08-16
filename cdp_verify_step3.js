const WebSocket = require("ws");
const http = require("http");

const CDP_PORT = 9227;

http.get("http://localhost:" + CDP_PORT + "/json", (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    const pages = JSON.parse(data);
    const wsUrl = pages[0].webSocketDebuggerUrl;
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const pending = {};

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const msg = JSON.stringify({ id, method, params });
        pending[id] = resolve;
        ws.send(msg);
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
      const doc = await send("DOM.getDocument");
      const rootId = doc.result.root.nodeId;

      // 点击 btn-pipeline
      const qNav = await send("DOM.querySelector", { nodeId: rootId, selector: "#btn-pipeline" });
      console.log("btn-pipeline:", qNav.result.nodeId !== 0 ? "EXISTS" : "MISSING");
      if (qNav.result.nodeId !== 0) {
        await send("DOM.click", { nodeId: qNav.result.nodeId });
        console.log("clicked");
      }
      await new Promise(r => setTimeout(r, 800));

      // 重新获取document
      const doc2 = await send("DOM.getDocument");
      const rootId2 = doc2.result.root.nodeId;

      // 查询所有按钮
      const btnIds = ["btn-pl-confirm-outline", "btn-pl-confirm-settings", "btn-pl-confirm-volumes", "btn-pl-confirm-chapters", "btn-pl-confirm-body"];
      for (const id of btnIds) {
        const q = await send("DOM.querySelector", { nodeId: rootId2, selector: "#" + id });
        console.log(id + ":", q.result.nodeId !== 0 ? "EXISTS" : "MISSING");
      }

      // step-3 panel
      const qPanel = await send("DOM.querySelector", { nodeId: rootId2, selector: "#pl-step-3-content" });
      console.log("pl-step-3-content:", qPanel.result.nodeId !== 0 ? "EXISTS" : "MISSING");

      ws.close();
      console.log("DONE");
    });
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
