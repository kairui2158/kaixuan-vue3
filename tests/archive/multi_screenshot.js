const { chromium } = require("playwright");
(async () => {
  try {
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0];
    if (!require("fs").existsSync("test_evidence")) require("fs").mkdirSync("test_evidence");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    // 1. Main screen
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `test_evidence/beauty_main_${ts}.png` });
    console.log("[OK] main screen captured");

    // 2. Try opening settings
    const settingsBtn = await page.$("[data-action=\"settings\"], #btn-settings, .sidebar-btn:nth-child(1)");
    if (settingsBtn) {
      await settingsBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `test_evidence/beauty_settings_${ts}.png` });
      console.log("[OK] settings panel captured");
    } else {
      console.log("[SKIP] settings button not found");
    }

    // 3. Try to capture provider/API section
    const providerSection = await page.$("#provider-list, .provider-card, [data-panel=\"api\"]");
    if (providerSection) {
      await providerSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `test_evidence/beauty_provider_${ts}.png` });
      console.log("[OK] provider section captured");
    }

    // 4. Check computed styles on key elements
    const styleInfo = await page.evaluate(() => {
      const results = {};
      const selectors = [".btn-primary", ".modal-content", ".tree-node", "input[type=\"text\"]", "select", ".editor-header"];
      selectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
          const cs = getComputedStyle(el);
          results[sel] = {
            borderRadius: cs.borderRadius,
            fontSize: cs.fontSize,
            boxShadow: cs.boxShadow.slice(0, 60),
            transition: cs.transition.slice(0, 60)
          };
        }
      });
      return results;
    });
    console.log("[STYLE] " + JSON.stringify(styleInfo, null, 2).slice(0, 500));

    await browser.close();
  } catch (e) {
    console.error("[ERR] " + e.message);
    process.exit(1);
  }
})();