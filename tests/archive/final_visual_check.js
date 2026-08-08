const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  if (!fs.existsSync("test_evidence")) fs.mkdirSync("test_evidence");

  // Close all modals
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none";
      m.classList.remove("visible");
    });
  });
  await page.waitForTimeout(500);

  // 1. Main view
  await page.screenshot({ path: `test_evidence/final_main_${ts}.png`, fullPage: false });
  console.log("[1] main captured");

  // 2. Open settings
  await page.evaluate(() => {
    const btn = document.querySelector("[data-action='settings'], #btn-settings");
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test_evidence/final_settings_${ts}.png` });
  console.log("[2] settings captured");

  // 3. Switch to skills tab
  await page.evaluate(() => {
    const tabs = document.querySelectorAll(".modal-tab");
    if (tabs.length > 1) tabs[1].click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test_evidence/final_skills_${ts}.png` });
  console.log("[3] skills tab captured");

  // 4. Switch to agents tab
  await page.evaluate(() => {
    const tabs = document.querySelectorAll(".modal-tab");
    if (tabs.length > 2) tabs[2].click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test_evidence/final_agents_${ts}.png` });
  console.log("[4] agents tab captured");

  // 5. Switch to appearance tab
  await page.evaluate(() => {
    const tabs = document.querySelectorAll(".modal-tab");
    if (tabs.length > 3) tabs[3].click();
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test_evidence/final_appearance_${ts}.png` });
  console.log("[5] appearance tab captured");

  // 6. Close settings, open pipeline
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none";
      m.classList.remove("visible");
    });
  });
  await page.waitForTimeout(300);

  // Try opening pipeline panel
  await page.evaluate(() => {
    const btn = document.querySelector("[data-action='pipeline'], #btn-pipeline, .nav-item[data-panel='pipeline'], [data-action='generator']");
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test_evidence/final_pipeline_${ts}.png` });
  console.log("[6] pipeline captured");

  // 7. Check the full computed style audit on pipeline
  const pipelineAudit = await page.evaluate(() => {
    const results = {};
    const panels = document.querySelectorAll(".panel, .pipeline-panel, [class*=pipeline]");
    if (panels.length > 0) {
      const cs = getComputedStyle(panels[0]);
      results.pipelinePanel = {
        display: cs.display,
        bg: cs.backgroundColor.slice(0, 40),
        padding: cs.padding,
        radius: cs.borderRadius
      };
    }

    // Check all visible step cards
    const cards = document.querySelectorAll(".step-card, .pl-step, [class*=step]");
    results.stepCards = cards.length;
    if (cards.length > 0) {
      const cs = getComputedStyle(cards[0]);
      results.stepCard = {
        radius: cs.borderRadius,
        padding: cs.padding,
        bg: cs.backgroundColor.slice(0, 40),
        border: cs.border.slice(0, 40)
      };
    }

    // Check all visible buttons in pipeline
    const btns = document.querySelectorAll(".panel button, .pipeline-panel button, [class*=pipeline] button");
    results.pipelineBtns = btns.length;
    if (btns.length > 0) {
      const cs = getComputedStyle(btns[0]);
      results.pipelineBtn = {
        radius: cs.borderRadius,
        padding: cs.padding,
        font: cs.fontSize
      };
    }

    return results;
  });
  console.log("[PIPELINE_AUDIT] " + JSON.stringify(pipelineAudit, null, 2));

  // 8. Close pipeline, open settings collection
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none";
      m.classList.remove("visible");
    });
  });
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const btn = document.querySelector("[data-action='settings-collection'], #btn-sc, [data-action='sc'], .nav-item[data-panel='sc']");
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test_evidence/final_sc_${ts}.png` });
  console.log("[7] settings collection captured");

  // 9. Final comprehensive style check
  const finalCheck = await page.evaluate(() => {
    const results = {};
    
    // Count all visible interactive elements
    const visible = (el) => {
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" && el.offsetWidth > 0;
    };
    
    const allBtns = Array.from(document.querySelectorAll("button, .btn")).filter(visible);
    const allInputs = Array.from(document.querySelectorAll("input, textarea, select")).filter(visible);
    
    // Check radius distribution
    let btnR = {};
    allBtns.forEach(b => {
      const r = getComputedStyle(b).borderRadius;
      btnR[r] = (btnR[r] || 0) + 1;
    });
    results.btnRadiusDist = btnR;
    results.visibleBtns = allBtns.length;
    results.visibleInputs = allInputs.length;
    
    return results;
  });
  console.log("[FINAL_CHECK] " + JSON.stringify(finalCheck, null, 2));

  // Close everything
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none";
      m.classList.remove("visible");
    });
  });

  await browser.close();
  console.log("[DONE] All views captured");
})();
