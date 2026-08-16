const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(1000);
  console.log("Title:", await p.title());
  const btns = await p.$$("button");
  console.log("Button count:", btns.length);
  await p.screenshot({ path: "D:/codex/novel-workshop-vue3/_audit/stage1_main.png" });
  console.log("Screenshot done");
  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); });
