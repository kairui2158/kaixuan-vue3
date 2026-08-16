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
  
  // 打开面板
  await send("Runtime.evaluate", { expression: "document.getElementById('btn-pipeline').click()" });
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 步骤1: 输入大纲并锁定
  console.log("=== 步骤1: 输入大纲并锁定 ===");
  await send("Runtime.evaluate", {
    expression: `(function() {
      var ta = document.getElementById('pl-outline');
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(ta, '这是一个测试大纲。第一章：主角开始旅程。第二章：主角遇到挑战。第三章：主角战胜困难。');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return '大纲已输入';
    })()`,
    returnByValue: true
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 锁定
  await send("Runtime.evaluate", {
    expression: "document.querySelector('#pl-step-1-content .pl-actions').querySelectorAll('button')[1].click()"
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  
  let s = await send("Runtime.evaluate", {
    expression: "var p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value; 'step=' + p.pipeline.currentStep + ' locked=' + p.project.outlineLocked + ' step1_completed=' + p.project.outlineText.length",
    returnByValue: true
  });
  console.log("锁定后:", s.result.result);
  
  // 步骤2: 新增设定
  console.log("\n=== 步骤2: 新增设定 ===");
  await send("Runtime.evaluate", {
    expression: "document.querySelector('#pl-step-2-content .pl-actions button:first-child').click()"
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  
  s = await send("Runtime.evaluate", {
    expression: "var p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value; 'settings=' + p.project.settings.length",
    returnByValue: true
  });
  console.log("新增设定:", s.result.result);
  
  // 再次新增
  await send("Runtime.evaluate", {
    expression: "document.querySelector('#pl-step-2-content .pl-actions button:first-child').click()"
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  
  s = await send("Runtime.evaluate", {
    expression: "var p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value; 'settings=' + p.project.settings.length",
    returnByValue: true
  });
  console.log("再次新增:", s.result.result);
  
  // 确认完成
  await send("Runtime.evaluate", {
    expression: "document.getElementById('btn-pl-confirm-settings').click()"
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  
  s = await send("Runtime.evaluate", {
    expression: "var p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value; 'step=' + p.pipeline.currentStep + ' settings=' + p.project.settings.length",
    returnByValue: true
  });
  console.log("确认设定:", s.result.result);
  
  // 步骤3: 卷纲
  console.log("\n=== 步骤3: 卷纲 ===");
  await send("Runtime.evaluate", {
    expression: "var p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.pipeline.currentStep = 2;"
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const s3 = await send("Runtime.evaluate", {
    expression: "var e = document.getElementById('pl-step-3-content'); e ? 'display=' + getComputedStyle(e).display + ' has_volume_count=' + (document.getElementById('pl-volume-count') ? 'yes' : 'no') : 'not found'",
    returnByValue: true
  });
  console.log("步骤3:", s3.result.result);
  
  // 步骤4: 章节
  console.log("\n=== 步骤4: 章节 ===");
  await send("Runtime.evaluate", {
    expression: "var p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.pipeline.currentStep = 3;"
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const s4 = await send("Runtime.evaluate", {
    expression: "var e = document.getElementById('pl-step-4-content'); e ? 'display=' + getComputedStyle(e).display + ' ch_config=' + (document.getElementById('pl-ch-gen-bar') ? 'yes' : 'no') : 'not found'",
    returnByValue: true
  });
  console.log("步骤4:", s4.result.result);
  
  // 步骤5: 正文
  console.log("\n=== 步骤5: 正文 ===");
  await send("Runtime.evaluate", {
    expression: "var p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia; p.state.value.pipeline.currentStep = 4;"
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const s5 = await send("Runtime.evaluate", {
    expression: "var e = document.getElementById('pl-step-5-content'); e ? 'display=' + getComputedStyle(e).display + ' body_config=' + (document.getElementById('pl-context-summary') ? 'yes' : 'no') : 'not found'",
    returnByValue: true
  });
  console.log("步骤5:", s5.result.result);
  
  ws.close();
  console.log("\n=== 全部测试完成 ===");
}

main().catch(e => { console.error("错误:", e.message); process.exit(1); });
