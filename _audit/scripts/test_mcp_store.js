
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const pages = browser.contexts()[0].pages();
  const page = pages[0];
  await page.waitForTimeout(2000);
  const settBtn = page.locator("button").filter({ hasText: /璁剧疆|Settings/i }).first();
  await settBtn.click();
  await page.waitForTimeout(1000);
  const mcpTab = page.locator("button").filter({ hasText: /MCP/ }).first();
  await mcpTab.click();
  await page.waitForTimeout(800);
  const result = await page.evaluate(() => {
    const pinia = window.__pinia;
    return { hasPinia: !!pinia, hasMcp: pinia?._s?.has("mcp") || false, stores: pinia ? [...pinia._s.keys()] : [] };
  });
  console.log(JSON.stringify(result));
  await browser.close();
})();
