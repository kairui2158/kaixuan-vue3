const { chromium } = require("playwright");
(async () => {
  try {
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
    const ctx = browser.contexts()[0] || await browser.newContext();
    const pages = ctx.pages();
    const page = pages[0] || await ctx.newPage();
    await page.waitForTimeout(1500);
    if (!require("fs").existsSync("test_evidence")) require("fs").mkdirSync("test_evidence");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    await page.screenshot({ path: `test_evidence/ui_beauty_${ts}.png`, fullPage: false });
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 200) : "no body");
    console.log(`[OK] screenshot saved: test_evidence/ui_beauty_${ts}.png`);
    console.log(`[INFO] title: ${title}`);
    console.log(`[INFO] body preview: ${bodyText.replace(/\n/g, " ").slice(0, 120)}`);
    await browser.close();
  } catch (e) {
    console.error("[ERR] " + e.message);
    process.exit(1);
  }
})();