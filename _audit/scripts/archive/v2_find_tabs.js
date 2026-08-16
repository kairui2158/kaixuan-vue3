const http = require("http");
const WebSocket = require("ws");

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    ws.send(JSON.stringify({ id, method, params }));
    const timer = setTimeout(() => reject(new Error("timeout: " + method)), 8000);
    ws.on("message", function handler(data) {
      const resp = JSON.parse(data.toString());
      if (resp.id === id) { clearTimeout(timer); ws.off("message", handler); resolve(resp.result); }
    });
  });
}

async function main() {
  const targets = await new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9227/json", (res) => {
      let data = ""; res.on("data", d => data += d); res.on("end", () => resolve(JSON.parse(data)));
    }).on("error", reject);
  });
  const pageTarget = targets.find(t => t.type === "page");
  if (!pageTarget) { console.log("NO PAGE"); process.exit(1); }
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((r, e) => { ws.on("open", r); ws.on("error", e); });

  const result = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const all = document.querySelectorAll("[id*=\"tab-\"], .settings-tab, [class*=\"tab\"]");
      return Array.from(all).filter(e => e.offsetParent !== null).map(e => ({
        tag: e.tagName, id: e.id, class: e.className.substring(0, 40), text: e.textContent.trim().substring(0, 15)
      }));
    })()`,
    returnByValue: true
  });
  console.log(JSON.stringify(result.result?.value, null, 2));

  ws.close();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
