const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const pages = browser.contexts()[0]?.pages() || [];
  const p = pages[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(2000);
  
  const PASS = []; const FAIL = [];
  const V = async (label, fn) => { try { await fn(); PASS.push(label); console.log("[PASS] "+label); } catch(e) { FAIL.push(label+": "+e.message); console.log("[FAIL] "+label+": "+e.message); } };
  
  console.log("\n=== STAGE 1: MAIN PAGE ===");
  await V("chapter-tree visible", async () => { const el = await p.$("#chapter-tree"); if (!el||!(await el.isVisible())) throw "not visible"; });
  await V("chat-panel visible", async () => { const el = await p.$(".chat-panel"); if (!el||!(await el.isVisible())) throw "not visible"; });
  await V("editor-panel visible", async () => { const el = await p.$("#editor-panel"); if (!el||!(await el.isVisible())) throw "not visible"; });
  await V("sidebar outline btn", async () => { const el = await p.$("#btn-outline-workspace"); if (!el||!(await el.isVisible())) throw "not visible"; });
  await V("sidebar pipeline btn", async () => { const el = await p.$("#btn-pipeline"); if (!el||!(await el.isVisible())) throw "not visible"; });
  
  console.log("\n=== STAGE 2: OUTLINE WORKSPACE ===");
  await p.evaluate(() => { document.querySelector("#btn-outline-workspace")?.click(); });
  await p.waitForTimeout(800);
  
  await V("outline-workspace open", async () => { const el = await p.$("#outline-workspace"); if (!el||!(await el.isVisible())) throw "not visible"; });
  await V("AI共创 button", async () => { const el = await p.$("#btn-ai-co-create"); if (!el||!(await el.isVisible())) throw "not visible"; });
  await V("save button", async () => { const el = await p.$("#btn-save-outline"); if (!el||!(await el.isVisible())) throw "not visible"; });
  await V("lock button", async () => { const el = await p.$("#btn-lock-outline"); if (!el||!(await el.isVisible())) throw "not visible"; });
  await V("import button", async () => { const el = await p.$("#btn-import-outline"); if (!el||!(await el.isVisible())) throw "not visible"; });
  
  await V("editor input", async () => { const el = await p.$("#outline-editor"); if (!el) throw "not found"; await el.fill("test outline"); const v = await el.inputValue(); if (v !== "test outline") throw "input failed: "+v; });
  
  await V("AI共创 toggle chat", async () => { await p.evaluate(() => { document.querySelector("#btn-ai-co-create")?.click(); }); await p.waitForTimeout(400); const el = await p.$(".ow-chat"); if (!el||!(await el.isVisible())) throw "chat not visible"; });
  
  await p.evaluate(() => { document.querySelector("#btn-close-outline-workspace")?.click(); });
  await p.waitForTimeout(500);
  await V("close outline", async () => { const el = await p.$("#outline-workspace"); if (el&&(await el.isVisible())) throw "still visible"; });
  
  console.log("\n=== RESULTS ===");
  console.log("PASS: "+PASS.length+", FAIL: "+FAIL.length);
  FAIL.forEach(f => console.log("  FAIL: "+f));
  
  await p.screenshot({ path: "D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_final.png", fullPage: true });
  console.log("Screenshot saved");
  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); process.exit(1); });
