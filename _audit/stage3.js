const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(800);
  
  // Use evaluate to trigger Vue event
  await p.evaluate(() => {
    document.querySelector("#btn-outline-workspace")?.click();
  });
  await p.waitForTimeout(600);
  
  const ow = await p.$("#outline-workspace");
  console.log("Outline workspace:", ow ? "EXISTS" : "NOT FOUND");
  if (ow) console.log("Visible:", await ow.isVisible());
  
  if (ow) {
    const aiBtn = await p.$("#btn-ai-co-create");
    console.log("AI共创:", aiBtn ? "EXISTS" : "NOT FOUND");
    if (aiBtn) console.log("Visible:", await aiBtn.isVisible(), "Text:", await aiBtn.textContent());
    
    const saveBtn = await p.$("#btn-save-outline");
    console.log("Save:", saveBtn ? "EXISTS" : "NOT FOUND");
    if (saveBtn) console.log("Visible:", await saveBtn.isVisible());
    
    const lockBtn = await p.$("#btn-lock-outline");
    console.log("Lock:", lockBtn ? "EXISTS" : "NOT FOUND");
    if (lockBtn) console.log("Visible:", await lockBtn.isVisible());
  }
  
  await p.screenshot({ path: "D:/codex/novel-workshop-vue3/_audit/stage3_outline_buttons.png" });
  console.log("Screenshot saved");
  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); });
