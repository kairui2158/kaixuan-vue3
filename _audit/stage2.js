const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(800);
  
  // Click using force bypass
  const btn = await p.$("#btn-outline-workspace");
  if (btn) {
    await btn.click({ force: true });
    await p.waitForTimeout(600);
    console.log("Clicked outline btn");
  }
  
  const ow = await p.$("#outline-workspace");
  console.log("Outline workspace:", ow ? "EXISTS" : "NOT FOUND");
  if (ow) {
    console.log("Visible:", await ow.isVisible());
  }
  
  await p.screenshot({ path: "D:/codex/novel-workshop-vue3/_audit/stage2_outline.png" });
  console.log("Screenshot saved");
  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); });
