const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(1000);
  await p.screenshot({ path: "D:/codex/novel-workshop-vue3/_audit/cdp_check_initial.png" });
  console.log("Screenshot taken");
  const btns = await p.$$("button");
  console.log("Buttons: " + btns.length);
  for (const b of btns) {
    const v = await b.isVisible();
    const t = (await b.textContent() || "").trim();
    if (t) console.log("  " + (v?"VIS":"HID") + " " + t.substring(0, 25));
  }
  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); process.exit(1); });
