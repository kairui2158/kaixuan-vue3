const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const info = await page.evaluate(() => {
    const cards = document.querySelectorAll("[class*=step]");
    const results = [];
    for (let i = 0; i < Math.min(cards.length, 10); i++) {
      const el = cards[i];
      const cs = getComputedStyle(el);
      results.push({
        cls: (el.className || "").slice(0, 60),
        tag: el.tagName,
        radius: cs.borderRadius,
        bg: cs.backgroundColor.slice(0, 40),
        padding: cs.padding,
        border: cs.border.slice(0, 40),
        text: (el.textContent || "").trim().slice(0, 30)
      });
    }
    return results;
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
