const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  await page.waitForTimeout(500);
  const ts = Date.now();
  await page.screenshot({ path: `test_evidence/beauty_main2_${ts}.png` });
  // Check key computed styles
  const info = await page.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { radius: cs.borderRadius, font: cs.fontSize, shadow: cs.boxShadow.slice(0,50) };
    };
    return {
      btnPrimary: get(".btn-primary"),
      sidebar: get(".sidebar-btn"),
      tree: get(".tree-node"),
      input: get("input[type='text']"),
      select: get("select")
    };
  });
  console.log("[OK] main2 captured");
  console.log("[STYLES] " + JSON.stringify(info));
  await browser.close();
})();