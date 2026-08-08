const http = require("http");
const WebSocket = global.WebSocket;
let msgId = 1;
function cdpSend(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) { ws.removeEventListener("message", handler); msg.error ? reject(msg.error) : resolve(msg.result); }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function main() {
  const targets = await new Promise((r,s) => http.get("http://127.0.0.1:9223/json", res => { let d=""; res.on("data",c=>d+=c); res.on("end",()=>r(JSON.parse(d))); }).on("error",s));
  const page = targets.find(t => t.type === "page");
  if (!page) { console.log("ERROR: no page target"); return; }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,s) => { ws.addEventListener("open", r); ws.addEventListener("error", s); });
  console.log("=== Deep Panel Verification ===\n");

  // 1. 递归扫描DOM树到第5层，找出所有按钮/输入框/卡片
  const deepScan = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const results = { buttons: [], inputs: [], cards: [], modals: [], depth5: [] };
      function scan(el, depth) {
        if (depth > 5) return;
        if (!el || !el.tagName) return;
        const cs = getComputedStyle(el);
        const cls = (el.className || "").toString().substring(0, 40);
        // 收集按钮
        if (el.tagName === "BUTTON" || cls.includes("btn-")) {
          if (results.buttons.length < 20) {
            results.buttons.push({
              depth, tag: el.tagName, cls,
              h: cs.height, w: cs.width.substring(0,30),
              radius: cs.borderRadius,
              bg: cs.backgroundColor.substring(0,20),
              fontSize: cs.fontSize,
              transition: cs.transitionDuration,
              visible: cs.display !== "none" && cs.visibility !== "hidden"
            });
          }
        }
        // 收集输入框
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
          if (results.inputs.length < 15) {
            results.inputs.push({
              depth, tag: el.tagName, cls,
              h: cs.height, radius: cs.borderRadius,
              bg: cs.backgroundColor.substring(0,20),
              border: cs.border.substring(0,30),
              fontSize: cs.fontSize
            });
          }
        }
        // 收集卡片
        if (cls.includes("card") || cls.includes("item-card")) {
          if (results.cards.length < 10) {
            results.cards.push({
              depth, cls,
              radius: cs.borderRadius,
              bg: cs.backgroundColor.substring(0,20),
              padding: cs.padding,
              shadow: cs.boxShadow.substring(0,25)
            });
          }
        }
        // 第5层元素
        if (depth === 5 && results.depth5.length < 10) {
          results.depth5.push({
            tag: el.tagName, cls,
            h: cs.height, radius: cs.borderRadius,
            display: cs.display.substring(0,15)
          });
        }
        // 递归子元素
        for (const child of el.children) {
          scan(child, depth + 1);
        }
      }
      scan(document.body, 0);
      return JSON.stringify(results, null, 2);
    })()`
  });
  console.log("=== Default view deep scan ===");
  console.log(deepScan.result.value);

  // 2. 点击设置面板按钮
  console.log("\n=== Opening settings panel ===");
  const openSettings = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const btn = document.querySelector("#btn-open-settings, [data-a=\"open-settings\"], .sidebar-btn[title*=\"\u8bbe\u7f6e\"]");
      if (btn) { btn.click(); return "clicked"; }
      // 尝试找设置相关按钮
      const btns = Array.from(document.querySelectorAll("button, .sidebar-btn"));
      const settingsBtn = btns.find(b => b.textContent.includes("\u8bbe\u7f6e") || b.title.includes("\u8bbe\u7f6e"));
      if (settingsBtn) { settingsBtn.click(); return "clicked: " + settingsBtn.className; }
      return "not found";
    })()`
  });
  console.log(openSettings.result.value);

  // 等待面板打开
  await new Promise(r => setTimeout(r, 1500));

  // 3. 扫描设置面板内的组件
  const settingsScan = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const modal = document.querySelector("#settings-modal, .modal:not(.modal-hidden)");
      if (!modal) return JSON.stringify({error: "no settings modal visible"});
      const cs = getComputedStyle(modal);
      const result = {
        modalDisplay: cs.display,
        modalBg: cs.backgroundColor,
        modalRadius: cs.borderRadius,
        modalShadow: cs.boxShadow.substring(0, 40),
        modalZIndex: cs.zIndex
      };
      // 扫描内部按钮
      const btns = modal.querySelectorAll("button, .btn-primary, .btn-secondary, .btn-sm");
      result.buttonCount = btns.length;
      result.buttonSamples = [];
      btns.forEach((b, i) => {
        if (i >= 8) return;
        const bcs = getComputedStyle(b);
        result.buttonSamples.push({
          cls: (b.className || "").substring(0, 30),
          h: bcs.height, radius: bcs.borderRadius,
          bg: bcs.backgroundColor.substring(0, 20),
          fontSize: bcs.fontSize,
          text: b.textContent.substring(0, 15)
        });
      });
      // 扫描内部输入框
      const inputs = modal.querySelectorAll("input, select, textarea");
      result.inputCount = inputs.length;
      result.inputSamples = [];
      inputs.forEach((inp, i) => {
        if (i >= 5) return;
        const ics = getComputedStyle(inp);
        result.inputSamples.push({
          tag: inp.tagName, cls: (inp.className || "").substring(0, 20),
          h: ics.height, radius: ics.borderRadius,
          bg: ics.backgroundColor.substring(0, 20),
          border: ics.border.substring(0, 25)
        });
      });
      // 扫描卡片
      const cards = modal.querySelectorAll(".card, .setting-card, .provider-card");
      result.cardCount = cards.length;
      result.cardSamples = [];
      cards.forEach((c, i) => {
        if (i >= 5) return;
        const ccs = getComputedStyle(c);
        result.cardSamples.push({
          cls: (c.className || "").substring(0, 25),
          radius: ccs.borderRadius,
          bg: ccs.backgroundColor.substring(0, 20),
          padding: ccs.padding,
          shadow: ccs.boxShadow.substring(0, 25)
        });
      });
      return JSON.stringify(result, null, 2);
    })()`
  });
  console.log(settingsScan.result.value);

  // 4. 关闭设置面板
  await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const closeBtn = document.querySelector("#settings-modal .btn-close, #settings-modal .modal-close");
      if (closeBtn) { closeBtn.click(); return "closed"; }
      const modal = document.querySelector("#settings-modal");
      if (modal) { modal.classList.add("modal-hidden"); return "hidden"; }
      return "not found";
    })()`
  });
  await new Promise(r => setTimeout(r, 500));

  // 5. 打开生成流水线面板
  console.log("\n=== Opening pipeline panel ===");
  const openPipeline = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const btn = document.querySelector("#btn-open-pipeline, [data-a=\"open-pipeline\"]");
      if (btn) { btn.click(); return "clicked"; }
      const btns = Array.from(document.querySelectorAll("button, .sidebar-btn"));
      const plBtn = btns.find(b => b.textContent.includes("\u6d41\u6c34\u7ebf") || b.title.includes("\u6d41\u6c34\u7ebf"));
      if (plBtn) { plBtn.click(); return "clicked: " + plBtn.className; }
      return "not found";
    })()`
  });
  console.log(openPipeline.result.value);
  await new Promise(r => setTimeout(r, 1500));

  // 6. 扫描流水线面板
  const pipelineScan = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const panel = document.querySelector("#pipeline-panel, .panel:not(.modal-hidden)");
      if (!panel) return JSON.stringify({error: "no pipeline panel visible"});
      const btns = panel.querySelectorAll("button, .btn-primary, .btn-secondary, .btn-sm");
      const result = {
        buttonCount: btns.length,
        buttonSamples: []
      };
      btns.forEach((b, i) => {
        if (i >= 10) return;
        const bcs = getComputedStyle(b);
        result.buttonSamples.push({
          cls: (b.className || "").substring(0, 30),
          h: bcs.height, radius: bcs.borderRadius,
          bg: bcs.backgroundColor.substring(0, 20),
          fontSize: bcs.fontSize,
          text: b.textContent.substring(0, 15)
        });
      });
      // 步骤导航
      const steps = panel.querySelectorAll(".pl-step");
      result.stepCount = steps.length;
      result.steps = [];
      steps.forEach((s, i) => {
        if (i >= 5) return;
        const scs = getComputedStyle(s);
        result.steps.push({
          cls: (s.className || "").substring(0, 25),
          text: s.textContent.substring(0, 20),
          color: scs.color.substring(0, 20),
          bg: scs.backgroundColor.substring(0, 20)
        });
      });
      return JSON.stringify(result, null, 2);
    })()`
  });
  console.log(pipelineScan.result.value);

  ws.close();
  console.log("\n=== Deep panel verification complete ===");
}
main().catch(e => console.error(e));
