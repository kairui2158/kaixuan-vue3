const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(500);
  
  // Open outline
  await p.evaluate(() => { document.querySelector("#btn-outline-workspace")?.click(); });
  await p.waitForTimeout(600);
  
  // Check all elements in outline workspace
  const allEls = await p.evaluate(() => {
    const ow = document.querySelector("#outline-workspace");
    if (!ow) return "no ow";
    const all = ow.querySelectorAll("*");
    const result = [];
    for (const el of all) {
      if (el.id || (el.className && typeof el.className === "string")) {
        result.push({
          tag: el.tagName,
          id: el.id || "",
          class: (typeof el.className === "string") ? el.className.substring(0, 40) : "",
          display: getComputedStyle(el).display,
          text: (el.textContent || "").trim().substring(0, 30)
        });
      }
    }
    return result;
  });
  
  console.log("All elements in outline:");
  allEls.forEach(el => {
    if (el.class.includes("ow-chat") || el.id.includes("chat") || el.class.includes("chat")) {
      console.log("  CHAT:", JSON.stringify(el));
    }
  });
  
  const chatEls = allEls.filter(el => el.class.includes("ow-chat") || el.id.includes("chat"));
  console.log("\nChat-related elements:", chatEls.length);
  
  await p.screenshot({ path: "D:/codex/novel-workshop-vue3/_audit/stage5_ow_detail.png" });
  console.log("Screenshot saved");
  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); });
