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

  // Open settings
  await cdpSend(ws, "Runtime.evaluate", {
    expression: `document.querySelector('#btn-settings').click()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 1000));

  // Click API tab
  await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const tabs = document.querySelectorAll('.settings-tab, [class*="tab"]');
      for (const t of tabs) {
        if (t.textContent.includes('API') || t.id === 'tab-api') { t.click(); return 'ok'; }
      }
      return 'not found';
    })()`,
    returnByValue: true
  }).then(r => console.log("API tab:", r.result?.value));
  await new Promise(r => setTimeout(r, 1000));

  // Check provider cards
  const a2 = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const list = document.querySelector('.provider-list');
      if (!list) return JSON.stringify({error: 'no .provider-list', alt: document.querySelector('#provider-list-view') ? 'has #provider-list-view' : 'no #provider-list-view'});
      const cards = list.querySelectorAll('.provider-card');
      const heights = Array.from(cards).map(c => Math.round(c.getBoundingClientRect().height));
      const widths = Array.from(cards).map(c => Math.round(c.getBoundingClientRect().width));
      const cs = getComputedStyle(list);
      return JSON.stringify({ count: cards.length, heights: heights, widths: widths, display: cs.display, alignItems: cs.alignItems });
    })()`,
    returnByValue: true
  });
  console.log("A2:", a2.result?.value);

  let ss = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/codex/novel-workshop-vue3/_audit/screenshots/v2_a2_provider.png", Buffer.from(ss.data, "base64"));

  // Click DeAI tab
  await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const tabs = document.querySelectorAll('.settings-tab, [class*="tab"]');
      for (const t of tabs) {
        if (t.textContent.includes('去AI') || t.textContent.includes('DeAI') || t.id === 'tab-deai') { t.click(); return 'ok'; }
      }
      return 'not found';
    })()`,
    returnByValue: true
  }).then(r => console.log("DeAI tab:", r.result?.value));
  await new Promise(r => setTimeout(r, 1000));

  // Check mode-card padding
  const a3 = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const card = document.querySelector('.mode-card');
      if (!card) return 'no mode-card';
      const cs = getComputedStyle(card);
      const header = card.querySelector('.card-header');
      const headerCs = header ? getComputedStyle(header) : null;
      const desc = card.querySelector('.card-desc');
      const descCs = desc ? getComputedStyle(desc) : null;
      return JSON.stringify({
        padding: cs.padding,
        paddingTop: cs.paddingTop,
        headerGap: headerCs ? headerCs.gap : 'n/a',
        headerMarginBottom: headerCs ? headerCs.marginBottom : 'n/a',
        descMarginBottom: descCs ? descCs.marginBottom : 'n/a',
        descLineHeight: descCs ? descCs.lineHeight : 'n/a'
      });
    })()`,
    returnByValue: true
  });
  console.log("A3:", a3.result?.value);

  ss = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/codex/novel-workshop-vue3/_audit/screenshots/v2_a3_deai.png", Buffer.from(ss.data, "base64"));

  ws.close();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
