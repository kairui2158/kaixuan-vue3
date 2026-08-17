const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9227");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().startsWith("file:"));
  const result = await page.evaluate(() => {
    const lastId = window.electronAPI.storageRead("wa_lastProjectId");
    const key = "wa_project_" + lastId;
    const data = window.electronAPI.storageRead(key);
    if (!data) return { error: "no data" };
    const sc = data.settingsCollection || { categories: [], items: {} };
    const beforeCount = Object.values(sc.items || {}).reduce((n, arr) => n + arr.length, 0);
    sc.items["其他"] = [];
    sc.categories = (sc.categories || []).filter((c) => (sc.items[c] || []).length > 0);
    data.settingsCollection = sc;
    const ok = window.electronAPI.storageWrite(key, data);
    const afterData = window.electronAPI.storageRead(key);
    const afterCount = Object.values(afterData.settingsCollection.items || {}).reduce((n, arr) => n + arr.length, 0);
    return { lastId, key, beforeCount, ok, afterCount };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
