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
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,s) => { ws.addEventListener("open", r); ws.addEventListener("error", s); });
  
  // 追踪第一个 modal-hidden 元素的匹配规则
  const result = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector(".modal-hidden");
      if (!el) return JSON.stringify({error: "no modal-hidden found"});
      const sheets = Array.from(document.styleSheets);
      const matching = [];
      for (const sheet of sheets) {
        try {
          const rules = sheet.cssRules || [];
          for (const rule of rules) {
            if (rule.selectorText && el.matches(rule.selectorText)) {
              if (rule.style.display || rule.style.cssText.includes("display")) {
                matching.push({
                  sheet: sheet.href ? sheet.href.split("/").pop() : "inline",
                  selector: rule.selectorText,
                  display: rule.style.display,
                  cssText: rule.style.cssText.substring(0, 100)
                });
              }
            }
          }
        } catch(e) {}
      }
      const cs = getComputedStyle(el);
      return JSON.stringify({
        computedDisplay: cs.display,
        matchingRules: matching
      }, null, 2);
    })()`
  });
  console.log("=== modal-hidden matching rules ===");
  console.log(result.result.value);
  
  // 追踪第一个 32px 按钮的匹配规则
  const btnResult = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(() => {
      const btns = document.querySelectorAll(".btn-sm");
      const tall = Array.from(btns).find(b => getComputedStyle(b).height === "32px");
      if (!tall) return JSON.stringify({error: "no 32px btn-sm found"});
      const sheets = Array.from(document.styleSheets);
      const matching = [];
      for (const sheet of sheets) {
        try {
          const rules = sheet.cssRules || [];
          for (const rule of rules) {
            if (rule.selectorText && tall.matches(rule.selectorText)) {
              if (rule.style.height || rule.style.minHeight || rule.style.cssText.includes("height")) {
                matching.push({
                  sheet: sheet.href ? sheet.href.split("/").pop() : "inline",
                  selector: rule.selectorText,
                  height: rule.style.height,
                  minHeight: rule.style.minHeight,
                  cssText: rule.style.cssText.substring(0, 120)
                });
              }
            }
          }
        } catch(e) {}
      }
      return JSON.stringify({ matchingRules: matching }, null, 2);
    })()`
  });
  console.log("\\n=== 32px btn-sm matching rules ===");
  console.log(btnResult.result.value);
  
  ws.close();
}
main().catch(e => console.error(e));
