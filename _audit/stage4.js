const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(500);
  
  // Open outline
  await p.evaluate(() => { document.querySelector("#btn-outline-workspace")?.click(); });
  await p.waitForTimeout(500);
  
  // Test AI共创 click
  await p.evaluate(() => { document.querySelector("#btn-ai-co-create")?.click(); });
  await p.waitForTimeout(400);
  const chat = await p.$(".ow-chat");
  console.log("Chat area:", chat ? (await chat.isVisible() ? "VISIBLE" : "HIDDEN") : "NOT FOUND");
  
  // Test editor input
  const editor = await p.$("#outline-editor");
  if (editor) {
    await editor.fill("test outline content");
    console.log("Editor input:", await editor.inputValue());
  }
  
  // Test save click
  await p.evaluate(() => { document.querySelector("#btn-save-outline")?.click(); });
  await p.waitForTimeout(300);
  console.log("Save clicked");
  
  // Test lock click
  await p.evaluate(() => { document.querySelector("#btn-lock-outline")?.click(); });
  await p.waitForTimeout(500);
  
  // Check if pipeline appeared
  const pipeline = await p.$(".pipeline-panel");
  console.log("Pipeline panel:", pipeline ? "EXISTS" : "NOT FOUND");
  
  await p.screenshot({ path: "D:/codex/novel-workshop-vue3/_audit/stage4_interactions.png" });
  console.log("Screenshot saved");
  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); });
