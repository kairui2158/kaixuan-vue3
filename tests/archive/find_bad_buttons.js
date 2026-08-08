const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const info = await page.evaluate(() => {
    const btns = document.querySelectorAll("button, .btn, [class*=btn]");
    const bad = [];
    for (let i = 0; i < btns.length; i++) {
      const el = btns[i];
      const cs = getComputedStyle(el);
      const r = cs.borderRadius;
      if (r === "4px") {
        bad.push({
          tag: el.tagName,
          id: el.id || "(none)",
          cls: (el.className || "").slice(0, 60),
          text: (el.textContent || "").trim().slice(0, 30),
          parent: el.parentElement ? (el.parentElement.id || el.parentElement.className.slice(0, 40)) : ""
        });
      }
    }
    return bad;
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
