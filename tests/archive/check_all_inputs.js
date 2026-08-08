const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const info = await page.evaluate(() => {
    const all = document.querySelectorAll("input, textarea, select");
    const results = [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const cs = getComputedStyle(el);
      if (cs.borderRadius !== "6px") {
        results.push({
          tag: el.tagName,
          type: el.type || "",
          id: el.id || "(none)",
          parent: el.parentElement ? (el.parentElement.id || el.parentElement.className.slice(0,40)) : "",
          radius: cs.borderRadius
        });
      }
    }
    return { total: all.length, nonStandard: results };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
