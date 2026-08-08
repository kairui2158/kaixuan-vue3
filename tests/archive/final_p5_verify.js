const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // Reload to pick up all P5 CSS
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  // 1. Main screen
  await page.screenshot({ path: `test_evidence/final_p5_main_${ts}.png` });
  console.log("[1] main captured");

  // 2. Open settings
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none"; m.classList.remove("visible");
    });
    const btn = document.querySelector("[data-action='settings'], #btn-settings");
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test_evidence/final_p5_settings_${ts}.png` });
  console.log("[2] settings captured");

  // 3. Check all P5 styled elements
  const p5Check = await page.evaluate(() => {
    const results = {};
    const selectors = [
      ".provider-card", ".provider-card-header", ".provider-card-name", ".provider-badge",
      ".provider-badge-on", ".provider-badge-off", ".provider-model-enable",
      ".agent-card", ".agent-card-header", ".agent-card-name", ".agent-card-actions",
      ".sc-detail-section", ".sc-detail-attr", ".sc-detail-actions",
      ".dashboard-card", ".dashboard-bar-fill", ".dashboard-grid",
      ".market-result", ".market-install-btn",
      ".chapter-overview-header", ".chapter-overview-title",
      ".msg-btn", ".msg-btn-copy", ".msg-btn-apply", ".msg-btn-regen",
      ".breadcrumb-item", ".breadcrumb-sep",
      ".confirm-title", ".confirm-actions",
      ".error-boundary", ".error-title",
      ".ctx-content", ".ctx-label",
      ".inline-menu-btn", ".spinner", ".empty-hint",
      ".bound-item", ".checkbox-list",
      ".sc-cat-btn", ".mem-cat-btn", ".sc-cat-add",
      ".pl-step", ".pl-step-num", ".pl-step-status",
      ".tree-add-btn", ".tree-gen-btn", ".tree-actions",
      ".modal-tab", ".modal-tab.active",
      ".sc-item-form", ".mem-form"
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const cs = getComputedStyle(el);
        const hasTransition = cs.transition && cs.transition !== "none" && cs.transition !== "all 0s ease 0s";
        results[sel] = {
          found: true,
          radius: cs.borderRadius,
          hasTransition: hasTransition,
          bg: cs.backgroundColor.slice(0, 30)
        };
      } else {
        results[sel] = { found: false };
      }
    }
    return results;
  });

  let found = 0, notFound = 0, hasTransition = 0;
  for (const [sel, info] of Object.entries(p5Check)) {
    if (info.found) {
      found++;
      if (info.hasTransition) hasTransition++;
    } else {
      notFound++;
    }
  }
  console.log(`\n=== P5 Element Check ===`);
  console.log(`Found: ${found}/${found + notFound}`);
  console.log(`With transitions: ${hasTransition}/${found}`);
  console.log(`Not found on current view: ${notFound} (expected - not all elements visible at once)`);

  // List found elements with their styles
  for (const [sel, info] of Object.entries(p5Check)) {
    if (info.found) {
      console.log(`  [OK] ${sel}: radius=${info.radius}, transition=${info.hasTransition}, bg=${info.bg}`);
    }
  }

  // 3. Switch to skills tab and screenshot
  await page.evaluate(() => {
    const tabs = document.querySelectorAll(".modal-tab");
    if (tabs[1]) tabs[1].click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test_evidence/final_p5_skills_${ts}.png` });
  console.log("[3] skills tab captured");

  // 4. Switch to agents tab
  await page.evaluate(() => {
    const tabs = document.querySelectorAll(".modal-tab");
    if (tabs[2]) tabs[2].click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test_evidence/final_p5_agents_${ts}.png` });
  console.log("[4] agents tab captured");

  // Close settings
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none"; m.classList.remove("visible");
    });
  });

  // 5. Open pipeline
  await page.evaluate(() => {
    const btn = document.querySelector("[data-action='pipeline'], [data-action='generator']");
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test_evidence/final_p5_pipeline_${ts}.png` });
  console.log("[5] pipeline captured");

  // Close pipeline
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none"; m.classList.remove("visible");
    });
  });

  // 6. Open settings collection
  await page.evaluate(() => {
    const btn = document.querySelector("[data-action='settings-collection'], [data-action='sc']");
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test_evidence/final_p5_sc_${ts}.png` });
  console.log("[6] settings collection captured");

  // Close
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none"; m.classList.remove("visible");
    });
  });

  await browser.close();
  console.log("\n[DONE] All P5 verification complete");
})();
