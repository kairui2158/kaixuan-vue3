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

  const results = {};
  const screenshots = {};

  // L1: Main page screenshot
  let ss = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/codex/novel-workshop-vue3/_audit/screenshots/v2_reg_l1_main.png", Buffer.from(ss.data, "base64"));
  screenshots.l1_main = "saved";

  // L1: Check chat message font-size
  const chatFont = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const msg = document.querySelector(".message-content");
      if (!msg) return "no message-content";
      return getComputedStyle(msg).fontSize;
    })()`,
    returnByValue: true
  });
  results.chatFontSize = chatFont.result?.value;

  // L1: Check chapter tree font-size
  const treeFont = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const item = document.querySelector(".chapter-item");
      if (!item) return "no chapter-item";
      return getComputedStyle(item).fontSize;
    })()`,
    returnByValue: true
  });
  results.chapterFontSize = treeFont.result?.value;

  // L2: Open pipeline, check header
  await cdpSend(ws, "Runtime.evaluate", { expression: `document.querySelector("#btn-pipeline").click()`, returnByValue: true });
  await new Promise(r => setTimeout(r, 1000));
  const plHeader = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const h = document.querySelector(".pl-header");
      if (!h) return "no header";
      const closeBtn = document.querySelector("#btn-close-pl");
      const hRect = h.getBoundingClientRect();
      const bRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
      return JSON.stringify({
        childCount: h.children.length,
        closeBtnRight: bRect ? Math.round(bRect.right) : "no btn",
        headerRight: Math.round(hRect.right),
        closeAtRight: bRect ? Math.round(bRect.right) >= Math.round(hRect.right) - 50 : false
      });
    })()`,
    returnByValue: true
  });
  results.pipelineHeader = plHeader.result?.value;
  ss = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/codex/novel-workshop-vue3/_audit/screenshots/v2_reg_l2_pipeline.png", Buffer.from(ss.data, "base64"));
  screenshots.l2_pipeline = "saved";

  // Close pipeline
  await cdpSend(ws, "Runtime.evaluate", { expression: `document.querySelector("#btn-close-pl").click()`, returnByValue: true });
  await new Promise(r => setTimeout(r, 500));

  // L2: Open settings, check API tab provider cards
  await cdpSend(ws, "Runtime.evaluate", { expression: `document.querySelector("#btn-settings").click()`, returnByValue: true });
  await new Promise(r => setTimeout(r, 1000));
  await cdpSend(ws, "Runtime.evaluate", { expression: `document.querySelector("#tab-api").click()`, returnByValue: true });
  await new Promise(r => setTimeout(r, 1000));
  const cards = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const list = document.querySelector(".provider-list");
      if (!list) return "no provider-list";
      const cs = getComputedStyle(list);
      const items = list.querySelectorAll(".provider-card");
      const heights = Array.from(items).map(c => Math.round(c.getBoundingClientRect().height));
      return JSON.stringify({ display: cs.display, count: items.length, heights: heights });
    })()`,
    returnByValue: true
  });
  results.providerCards = cards.result?.value;
  ss = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/codex/novel-workshop-vue3/_audit/screenshots/v2_reg_l2_settings_api.png", Buffer.from(ss.data, "base64"));
  screenshots.l2_settings = "saved";

  // L2: Switch to DeAI tab
  await cdpSend(ws, "Runtime.evaluate", { expression: `document.querySelector("#tab-deai").click()`, returnByValue: true });
  await new Promise(r => setTimeout(r, 1000));
  const deai = await cdpSend(ws, "Runtime.evaluate", {
    expression: `(function() {
      const card = document.querySelector(".deai-mode-card");
      if (!card) return "no deai-mode-card";
      const header = card.querySelector(".deai-mode-card-header");
      const hcs = header ? getComputedStyle(header) : null;
      return JSON.stringify({
        headerPadding: hcs ? hcs.padding : "n/a",
        headerGap: hcs ? hcs.gap : "n/a"
      });
    })()`,
    returnByValue: true
  });
  results.deaiCard = deai.result?.value;
  ss = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/codex/novel-workshop-vue3/_audit/screenshots/v2_reg_l2_settings_deai.png", Buffer.from(ss.data, "base64"));
  screenshots.l2_deai = "saved";

  // L3: Check skill edit modal (click skill tab then edit)
  await cdpSend(ws, "Runtime.evaluate", { expression: `document.querySelector("#tab-skill").click()`, returnByValue: true });
  await new Promise(r => setTimeout(r, 1000));
  ss = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("D:/codex/novel-workshop-vue3/_audit/screenshots/v2_reg_l3_skill.png", Buffer.from(ss.data, "base64"));
  screenshots.l3_skill = "saved";

  console.log("RESULTS:");
  console.log(JSON.stringify(results, null, 2));
  console.log("SCREENSHOTS:");
  console.log(JSON.stringify(screenshots, null, 2));

  ws.close();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
