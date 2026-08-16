const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");

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

  await cdpSend(ws, "Runtime.evaluate", { expression: `document.querySelector('#btn-settings').click()`, returnByValue: true });
  await new Promise(r => setTimeout(r, 1000));

  await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const tabs = document.querySelectorAll('.settings-tab, [class*="tab"]');
      for (const t of tabs) {
        if (t.textContent.includes('去AI') || t.id === 'tab-deai') { t.click(); return 'ok'; }
      }
      return 'not found';
    })()`,
    returnByValue: true
  }).then(r => console.log("DeAI tab:", r.result?.value));
  await new Promise(r => setTimeout(r, 1000));

  const a3 = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const card = document.querySelector('.deai-mode-card');
      if (!card) return 'no .deai-mode-card';
      const cs = getComputedStyle(card);
      const header = card.querySelector('.deai-mode-card-header');
      const hcs = header ? getComputedStyle(header) : null;
      const desc = card.querySelector('.mode-full-desc');
      const dcs = desc ? getComputedStyle(desc) : null;
      const flow = card.querySelector('.mode-flow');
      const fcs = flow ? getComputedStyle(flow) : null;
      return JSON.stringify({
        cardPadding: cs.padding,
        headerGap: hcs ? hcs.gap : 'n/a',
        headerPadding: hcs ? hcs.padding : 'n/a',
        descMargin: dcs ? dcs.margin : 'n/a',
        descLineHeight: dcs ? dcs.lineHeight : 'n/a',
        flowGap: fcs ? fcs.gap : 'n/a',
        flowPadding: fcs ? fcs.padding : 'n/a'
      });
    })()`,
    returnByValue: true
  });
  console.log("A3:", a3.result?.value);

  const ss = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/codex/novel-workshop-vue3/_audit/screenshots/v2_a3_deai.png", Buffer.from(ss.data, "base64"));
  console.log("Screenshot saved");

  ws.close();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
