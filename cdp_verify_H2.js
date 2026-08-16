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

      // 通过 window.__getActivePanel 访问
      let r = await send("Runtime.evaluate", { expression: "typeof window.__getActivePanel === 'function' ? window.__getActivePanel() : 'no_getter'" });
      console.log("getActivePanel:", r.result.value);

      // 尝试通过 SidebarNav 的点击来打开面板
      // 检查 btn-outline-workspace
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-outline-workspace'); el ? 'exists:' + el.textContent : 'missing'" });
      console.log("outline nav btn:", r.result.value);

      // 点击打开大纲工作台
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-outline-workspace'); if(el){el.click();'clicked'}else{'missing'}" });
      console.log("click outline nav:", r.result.value);
      await new Promise(r => setTimeout(r, 800));

      // 检查activePanel
      r = await send("Runtime.evaluate", { expression: "typeof window.__getActivePanel === 'function' ? window.__getActivePanel() : 'no_getter'" });
      console.log("after click panel:", r.result.value);

      // 检查大纲工作台按钮
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-import-outline','btn-save-outline','btn-lock-outline','btn-close-outline-workspace']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("outline btns:", r.result.value);

      // 关闭大纲工作台
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-close-outline-workspace'); if(el){el.click();'closed'}else{'missing'}" });
      console.log("close outline:", r.result.value);
      await new Promise(r => setTimeout(r, 500));

      // 打开设置面板
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-settings'); if(el){el.click();'clicked'}else{'missing'}" });
      console.log("click settings:", r.result.value);
      await new Promise(r => setTimeout(r, 800));
      r = await send("Runtime.evaluate", { expression: "typeof window.__getActivePanel === 'function' ? window.__getActivePanel() : 'no_getter'" });
      console.log("settings panel:", r.result.value);
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-save-settings','btn-test-connection','btn-close-settings']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("settings btns:", r.result.value);

      // 关闭后打开记忆面板
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-close-settings'); if(el){el.click();'closed'}else{var p=document.querySelector('#btn-settings');if(p){p.click();'toggle'}}" });
      await new Promise(r => setTimeout(r, 500));
      r = await send("Runtime.evaluate", { expression: "var el=document.querySelector('#btn-memory'); if(el){el.click();'clicked'}else{'missing'}" });
      console.log("click memory:", r.result.value);
      await new Promise(r => setTimeout(r, 800));
      r = await send("Runtime.evaluate", { expression: "var ids=['btn-add-mem-cat','btn-add-mem','btn-close-mem']; var res={}; for(var i of ids){var el=document.querySelector('#'+i);res[i]=el?'exists':'missing';} JSON.stringify(res)" });
      console.log("memory btns:", r.result.value);

      ws.close();
    }, 500);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
