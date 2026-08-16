const http = require("http");
const WebSocket = require("ws");

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } }); }).on("error", reject);
  });
}

async function main() {
  const pages = await httpGet("http://127.0.0.1:9227/json");
  const page = pages.find(p => p.title === "神意助手");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 0, pending = {};
  ws.on("message", data => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
  });
  await new Promise(resolve => ws.on("open", resolve));
  
  function send(m, p={}) {
    return new Promise(resolve => { const id = ++msgId; pending[id] = resolve; ws.send(JSON.stringify({id, method:m, params:p})); });
  }
  
  await send("Page.enable");
  await send("Runtime.enable");
  
  await send("Runtime.evaluate", { expression: "document.getElementById('btn-pipeline').click()" });
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 输入大纲
  await send("Runtime.evaluate", {
    expression: `(function() {
      var ta = document.getElementById('pl-outline');
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(ta, '测试大纲文本');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`,
    returnByValue: true
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 锁定
  await send("Runtime.evaluate", {
    expression: "document.querySelector('#pl-step-1-content .pl-actions').querySelectorAll('button')[1].click()"
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const r = await send("Runtime.evaluate", {
    expression: "var s = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value; 'step=' + s.pipeline.currentStep + ' locked=' + s.project.outlineLocked",
    returnByValue: true
  });
  console.log("锁定后:", r.result.result);
  
  // 检查步骤2
  const s2 = await send("Runtime.evaluate", {
    expression: "var e = document.getElementById('pl-step-2-content'); e ? 'display=' + getComputedStyle(e).display : 'not found'",
    returnByValue: true
  });
  console.log("步骤2:", s2.result.result);
  
  ws.close();
  console.log("完成");
}

main().catch(e => { console.error("错误:", e.message); process.exit(1); });
