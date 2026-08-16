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

  // A1: verify pipeline header still correct
  await cdpSend(ws, "Runtime.evaluate", {
    expression: `document.querySelector('#btn-pipeline').click()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 1000));
  const a1 = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const h = document.querySelector('.pl-header');
      if (!h) return 'no header';
      return JSON.stringify({ childCount: h.children.length, children: Array.from(h.children).map(c => c.tagName + '.' + c.className.substring(0,20)) });
    })()`,
    returnByValue: true
  });
  console.log("A1 verify:", a1.result?.value);

  // Screenshot pipeline
  let ss = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/codex/novel-workshop-vue3/_audit/screenshots/v2_a1_pipeline.png", Buffer.from(ss.data, "base64"));

  // Close pipeline
  await cdpSend(ws, "Runtime.evaluate", {
    expression: `document.querySelector('#btn-close-pl').click()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 500));

  // A2: Open settings, go to API tab, check provider cards
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
        if (t.textContent.trim() === 'API' || t.textContent.includes('API') || t.id === 'tab-api') {
          t.click();
          return 'clicked API tab';
        }
      }
      return 'no API tab found';
    })()`,
    returnByValue: true
  }).then(r => console.log("API tab:", r.result?.value));
  await new Promise(r => setTimeout(r, 1000));

  // Check provider cards
  const a2 = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const cards = document.querySelectorAll('.provider-card');
      if (cards.length === 0) return 'no provider cards';
      const heights = Array.from(cards).map(c => Math.round(c.getBoundingClientRect().height));
      const widths = Array.from(cards).map(c => Math.round(c.getBoundingClientRect().width));
      const list = document.querySelector('.provider-list');
      const listDisplay = list ? getComputedStyle(list).display : 'no list';
      return JSON.stringify({ count: cards.length, heights: heights, widths: widths, listDisplay: listDisplay });
    })()`,
    returnByValue: true
  });
  console.log("A2 verify:", a2.result?.value);

  ss = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/codex/novel-workshop-vue3/_audit/screenshots/v2_a2_provider.png", Buffer.from(ss.data, "base64"));

  // A3: Check DeAiModeCard padding
  const a3 = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const card = document.querySelector('.mode-card');
      if (!card) return 'no mode-card found';
      const cs = getComputedStyle(card);
      return JSON.stringify({
        padding: cs.padding,
        paddingTop: cs.paddingTop,
        paddingLeft: cs.paddingLeft
      });
    })()`,
    returnByValue: true
  });
  console.log("A3 verify:", a3.result?.value);

  ss = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/codex/novel-workshop-vue3/_audit/screenshots/v2_a3_settings.png", Buffer.from(ss.data, "base64"));

  ws.close();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
