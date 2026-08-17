const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9227");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().startsWith("file:"));
  const info = await page.evaluate(() => {
    const lastId = window.electronAPI.storageRead("wa_lastProjectId");
    const data = lastId ? window.electronAPI.storageRead("wa_project_" + lastId) : null;
    const sc = (data && data.settingsCollection) || { categories: [], items: {} };
    const out = { lastId, categories: sc.categories, items: {} };
    for (const cat of sc.categories) {
      out.items[cat] = (sc.items[cat] || []).map((it) => ({ id: it.id, name: it.name, isBound: it.isBound }));
    }
    return out;
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
