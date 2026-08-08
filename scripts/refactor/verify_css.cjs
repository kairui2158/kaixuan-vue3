const fs = require("fs");
const http = require("http");

// 1. 获取 CDP target
function getTarget() {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9223/json", (res) => {
      let data = "";
      res.on("data", (d) => data += d);
      res.on("end", () => {
        const targets = JSON.parse(data);
        const page = targets.find(t => t.type === "page");
        if (page) resolve(page.webSocketDebuggerUrl);
        else reject("no page target");
      });
    }).on("error", reject);
  });
}

// 2. 全局 WebSocket
const WebSocket = global.WebSocket;
let msgId = 1;

function cdpSend(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener("message", handler);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

async function main() {
  const wsUrl = await getTarget();
  console.log("CDP target:", wsUrl);
  const ws = new WebSocket(wsUrl);
  await new Promise((r, s) => { ws.addEventListener("open", r); ws.addEventListener("error", s); });
  console.log("WS connected");

  // 3. 检查加载的 CSS 文件
  const cssResult = await cdpSend(ws, "Runtime.evaluate", {
    expression: `JSON.stringify(Array.from(document.styleSheets).map(s => s.href))`
  });
  console.log("\n=== CSS files loaded ===");
  const sheets = JSON.parse(cssResult.result.value);
  sheets.forEach((s, i) => console.log(i + ": " + s));

  // 4. 检查按钮样式
  const btnResult = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const btns = document.querySelectorAll(".btn-primary, .btn-secondary, .btn-sm, .btn-close, .btn-send, .btn-var");
      const results = [];
      btns.forEach((b, i) => {
        if (i >= 8) return;
        const cs = getComputedStyle(b);
        results.push({
          cls: b.className.substring(0, 40),
          h: cs.height,
          radius: cs.borderRadius,
          bg: cs.backgroundColor,
          color: cs.color,
          transition: cs.transitionDuration,
          fontSize: cs.fontSize
        });
      });
      return JSON.stringify(results, null, 2);
    })()`
  });
  console.log("\n=== Button styles (first 8) ===");
  console.log(btnResult.result.value);

  // 5. 检查 modal 样式
  const modalResult = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const modals = document.querySelectorAll(".modal, .modal-content, .modal-header, .modal-body");
      const results = [];
      modals.forEach((m, i) => {
        if (i >= 6) return;
        const cs = getComputedStyle(m);
        results.push({
          cls: m.className.substring(0, 30),
          bg: cs.backgroundColor,
          radius: cs.borderRadius,
          shadow: cs.boxShadow.substring(0, 30),
          padding: cs.padding,
          display: cs.display
        });
      });
      return JSON.stringify(results, null, 2);
    })()`
  });
  console.log("\n=== Modal styles (first 6) ===");
  console.log(modalResult.result.value);

  // 6. 检查表单样式
  const formResult = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const inputs = document.querySelectorAll("input, textarea, select, .form-group");
      const results = [];
      inputs.forEach((inp, i) => {
        if (i >= 6) return;
        const cs = getComputedStyle(inp);
        results.push({
          tag: inp.tagName,
          cls: (inp.className || "").substring(0, 25),
          h: cs.height,
          radius: cs.borderRadius,
          bg: cs.backgroundColor,
          border: cs.border.substring(0, 40),
          fontSize: cs.fontSize
        });
      });
      return JSON.stringify(results, null, 2);
    })()`
  });
  console.log("\n=== Form/Input styles (first 6) ===");
  console.log(formResult.result.value);

  // 7. 检查 CSS 变量是否正确解析
  const varResult = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const cs = getComputedStyle(document.documentElement);
      const vars = ["--accent", "--bg-primary", "--bg-elevated", "--radius-btn", "--btn-sm-height", "--space-md", "--font-size", "--transition-fast"];
      const result = {};
      vars.forEach(v => result[v] = cs.getPropertyValue(v).trim());
      return JSON.stringify(result, null, 2);
    })()`
  });
  console.log("\n=== CSS Variables (root) ===");
  console.log(varResult.result.value);

  // 8. 检查 !important 使用量
  const importantResult = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      let count = 0;
      const btns = document.querySelectorAll("button, .btn-primary, .btn-secondary, .btn-sm");
      btns.forEach(b => {
        const cs = getComputedStyle(b);
        // 检查是否有 important 覆盖（无法直接检测，但检查是否样式异常）
      });
      return JSON.stringify({ btnCount: btns.length });
    })()`
  });
  console.log("\n=== Button count ===");
  console.log(importantResult.result.value);

  // 9. 检查中文是否正常
  const textResult = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const body = document.body.innerText.substring(0, 200);
      return JSON.stringify(body);
    })()`
  });
  console.log("\n=== Chinese text check (first 200 chars) ===");
  console.log(textResult.result.value);

  ws.close();
  console.log("\n=== Verification complete ===");
}

main().catch(e => console.error("ERROR:", e));
