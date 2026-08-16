const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(500);
  
  // Open outline
  await p.evaluate(() => { document.querySelector("#btn-outline-workspace")?.click(); });
  await p.waitForTimeout(600);
  
  // Verify outline is open
  const owBefore = await p.evaluate(() => !!document.querySelector("#outline-workspace"));
  console.log("Outline open:", owBefore);
  
  // Click AI共创
  await p.evaluate(() => { document.querySelector("#btn-ai-co-create")?.click(); });
  await p.waitForTimeout(500);
  
  // Check if outline is still open
  const owAfter = await p.evaluate(() => !!document.querySelector("#outline-workspace"));
  console.log("Outline after AI click:", owAfter);
  
  if (owAfter) {
    const chat = await p.evaluate(() => {
      const c = document.querySelector(".ow-chat");
      return c ? getComputedStyle(c).display : "no .ow-chat";
    });
    console.log("Chat display:", chat);
  }
  
  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); });
