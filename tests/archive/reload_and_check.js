const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  
  // Reload to pick up new CSS
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  console.log("[OK] page reloaded");
  
  // Take screenshot
  const ts = Date.now();
  await page.screenshot({ path: `test_evidence/beauty_after_reload_${ts}.png` });
  console.log("[OK] screenshot saved");
  
  // Check inputs again
  const info = await page.evaluate(() => {
    const all = document.querySelectorAll("input, textarea, select");
    const nonStd = [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const cs = getComputedStyle(el);
      const r = cs.borderRadius;
      const isCheckbox = el.type === "checkbox";
      const isRange = el.type === "range";
      // Only report text inputs and selects that aren't 6px
      if (!isCheckbox && !isRange && r !== "6px") {
        nonStd.push({
          tag: el.tagName,
          type: el.type || "",
          id: el.id || "(none)",
          parent: el.parentElement ? (el.parentElement.id || el.parentElement.className.slice(0,40)) : "",
          radius: r
        });
      }
    }
    return { total: all.length, nonStandard: nonStd };
  });
  console.log("[RESULT] " + JSON.stringify(info, null, 2));
  
  // Also check button styles
  const btnInfo = await page.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { radius: cs.borderRadius, font: cs.fontSize, shadow: cs.boxShadow.slice(0,50) };
    };
    return {
      btnPrimary: get(".btn-primary"),
      btnSecondary: get(".btn-secondary"),
      input: get("input[type='text']"),
      select: get("select"),
      textarea: get("textarea"),
      editor: get(".editor-header"),
      modal: get(".modal-content")
    };
  });
  console.log("[BTNS] " + JSON.stringify(btnInfo, null, 2));
  
  await browser.close();
})();
