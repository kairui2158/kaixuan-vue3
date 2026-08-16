const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const ctx = browser.contexts()[0];
  const page = ctx ? ctx.pages()[0] : await browser.newPage();
  if (!ctx) await page.goto("http://localhost:5173", { waitUntil: "networkidle" }).catch(()=>{});
  await page.waitForTimeout(2000);
  const settBtn = page.locator("button").filter({ hasText: /璁剧疆|鈿檤Settings/i }).first();
  await settBtn.click().catch(() => console.log("click settings failed"));
  await page.waitForTimeout(1000);
  const mcpTab = page.locator("button").filter({ hasText: /MCP/ }).first();
  await mcpTab.click().catch(() => console.log("click mcp tab failed"));
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    const pinia = window.__pinia;
    return { hasPinia: !!pinia, hasMcp: pinia?._s?.has("mcp") || false, stores: pinia ? [...pinia._s.keys()] : [] };
  });
  console.log(JSON.stringify(result));
  await browser.close();
  console.log("done");
})();
