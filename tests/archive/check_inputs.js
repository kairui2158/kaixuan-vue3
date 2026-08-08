const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const info = await page.evaluate(() => {
    const inputs = document.querySelectorAll("input[type=\"text\"]");
    const results = [];
    for (let i = 0; i < Math.min(inputs.length, 10); i++) {
      const el = inputs[i];
      const cs = getComputedStyle(el);
      const parent = el.parentElement;
      results.push({
        idx: i,
        id: el.id || "(none)",
        parentId: parent ? parent.id : "(none)",
        parentClass: parent ? parent.className.slice(0, 80) : "(none)",
        radius: cs.borderRadius,
        font: cs.fontSize
      });
    }
    return results;
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
