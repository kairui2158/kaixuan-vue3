const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(1000);
  
  const PASS = [], FAIL = [];
  const V = async (label, fn) => { try { await fn(); PASS.push(label); console.log("[PASS] "+label); } catch(e) { FAIL.push(label+": "+e.message); console.log("[FAIL] "+label+": "+e.message); } };
  
  console.log("=== STAGE 1: MAIN PAGE ===");
  await V("chapter-tree", async () => { const e = await p.$("#chapter-tree"); if (!e||!(await e.isVisible())) throw "nv"; });
  await V("chat-panel", async () => { const e = await p.$(".chat-panel"); if (!e||!(await e.isVisible())) throw "nv"; });
  await V("editor-panel", async () => { const e = await p.$("#editor-panel"); if (!e||!(await e.isVisible())) throw "nv"; });
  await V("sidebar-outline", async () => { const e = await p.$("#btn-outline-workspace"); if (!e||!(await e.isVisible())) throw "nv"; });
  await V("sidebar-pipeline", async () => { const e = await p.$("#btn-pipeline"); if (!e||!(await e.isVisible())) throw "nv"; });
  
  console.log("=== STAGE 2: OUTLINE WORKSPACE ===");
  await p.evaluate(() => { document.querySelector("#btn-outline-workspace")?.click(); });
  await p.waitForTimeout(600);
  
  await V("outline-open", async () => { const e = await p.$("#outline-workspace"); if (!e||!(await e.isVisible())) throw "nv"; });
  await V("ai-co-create", async () => { const e = await p.$("#btn-ai-co-create"); if (!e||!(await e.isVisible())) throw "nv"; });
  await V("save-outline", async () => { const e = await p.$("#btn-save-outline"); if (!e||!(await e.isVisible())) throw "nv"; });
  await V("lock-outline", async () => { const e = await p.$("#btn-lock-outline"); if (!e||!(await e.isVisible())) throw "nv"; });
  await V("import-outline", async () => { const e = await p.$("#btn-import-outline"); if (!e||!(await e.isVisible())) throw "nv"; });
  await V("outline-editor", async () => { const e = await p.$("#outline-editor"); if (!e) throw "nf"; await e.fill("test"); if (await e.inputValue()!=="test") throw "input fail"; });
  
  console.log("=== STAGE 3: AI CHAT TOGGLE ===");
  await V("ai-chat-toggle", async () => { await p.evaluate(() => { document.querySelector("#btn-ai-co-create")?.click(); }); await p.waitForTimeout(400); const e = await p.$(".ow-chat"); if (!e||!(await e.isVisible())) throw "chat nv"; });
  
  await V("close-outline", async () => { await p.evaluate(() => { document.querySelector("#btn-close-outline-workspace")?.click(); }); await p.waitForTimeout(400); const e = await p.$("#outline-workspace"); if (e&&(await e.isVisible())) throw "still visible"; });
  
  console.log("=== STAGE 4: PIPELINE ===");
  await p.evaluate(() => { document.querySelector("#btn-pipeline")?.click(); });
  await p.waitForTimeout(600);
  await V("pipeline-open", async () => { const e = await p.$(".pipeline-panel"); if (!e) throw "nf"; });
  
  await p.screenshot({ path: "D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_final.png" });
  
  console.log("\n=== RESULTS: PASS="+PASS.length+" FAIL="+FAIL.length);
  FAIL.forEach(f => console.log("  FAIL: "+f));
  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); process.exit(1); });
