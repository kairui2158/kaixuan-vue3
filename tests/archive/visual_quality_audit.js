const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // 1. Check spacing consistency across panels
  const spacingAudit = await page.evaluate(() => {
    const results = { issues: [], stats: {} };
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
    };

    // Check padding consistency on panel-like containers
    const containers = document.querySelectorAll(".panel, .modal-content, .sidebar, .editor-area, .chat-area, [class*=panel]");
    const paddingValues = {};
    for (const c of containers) {
      if (!visible(c)) continue;
      const cs = getComputedStyle(c);
      const p = cs.padding;
      paddingValues[p] = (paddingValues[p] || 0) + 1;
    }
    results.stats.containerPadding = paddingValues;

    // Check gap consistency in flex/grid containers
    const flexContainers = document.querySelectorAll("[class*=grid], [class*=flex], [class*=row]");
    const gapValues = {};
    for (const fc of flexContainers) {
      if (!visible(fc)) continue;
      const cs = getComputedStyle(fc);
      if (cs.gap && cs.gap !== "normal" && cs.gap !== "0px") {
        gapValues[cs.gap] = (gapValues[cs.gap] || 0) + 1;
      }
    }
    results.stats.gapDistribution = gapValues;

    // Check for overlapping elements (elements with same z-index that might conflict)
    const allElements = document.querySelectorAll("*");
    const zMap = {};
    for (let i = 0; i < allElements.length && i < 1000; i++) {
      const el = allElements[i];
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const z = parseInt(cs.zIndex);
      if (!isNaN(z) && z > 10) {
        const key = z;
        if (!zMap[key]) zMap[key] = [];
        if (zMap[key].length < 3) {
          zMap[key].push((el.className || "").toString().slice(0, 30));
        }
      }
    }
    results.stats.zIndexMap = zMap;

    // Check for elements with no visible border/shadow that might look flat
    const cards = document.querySelectorAll(".card, .card-item, [class*=card]");
    let flatCards = 0;
    for (const card of cards) {
      if (!visible(card)) continue;
      const cs = getComputedStyle(card);
      if (cs.boxShadow === "none" && (cs.border === "0px none" || cs.border === "")) {
        flatCards++;
      }
    }
    results.stats.flatCards = flatCards;

    // Check font size distribution
    const textEls = document.querySelectorAll("span, p, label, button, a, td, th, div, h1, h2, h3, h4");
    const fontSizes = {};
    for (let i = 0; i < textEls.length && i < 500; i++) {
      const el = textEls[i];
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const fs = cs.fontSize;
      fontSizes[fs] = (fontSizes[fs] || 0) + 1;
    }
    results.stats.fontSizes = fontSizes;

    // Check for color contrast issues (text on similar bg)
    const textOnBg = [];
    const checkEls = document.querySelectorAll("span, p, label, button, a");
    for (let i = 0; i < checkEls.length && i < 200; i++) {
      const el = checkEls[i];
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const parent = el.parentElement;
      if (!parent) continue;
      const pcs = getComputedStyle(parent);
      const textColor = cs.color;
      const bgColor = pcs.backgroundColor;
      // Simple check: if both are very dark or both very light
      if (textColor === bgColor && textColor !== "rgba(0, 0, 0, 0)") {
        textOnBg.push({ tag: el.tagName, text: (el.textContent || "").trim().slice(0, 20), color: textColor.slice(0, 30) });
      }
    }
    results.issues = textOnBg.slice(0, 10);

    return results;
  });
  console.log("[SPACING] " + JSON.stringify(spacingAudit.stats, null, 2));
  if (spacingAudit.issues.length > 0) {
    console.log("[CONTRAST_ISSUES] " + JSON.stringify(spacingAudit.issues, null, 2));
  } else {
    console.log("[CONTRAST_ISSUES] none");
  }

  // 2. Check responsive behavior - resize window
  const originalSize = page.viewportSize();
  console.log("[RESPONSIVE] Original viewport: " + JSON.stringify(originalSize));

  // Take screenshots at different sizes
  await page.screenshot({ path: `test_evidence/quality_full_${ts}.png` });

  // 3. Check shadow hierarchy
  const shadowAudit = await page.evaluate(() => {
    const results = {};
    const visible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && r.width > 0 && r.height > 0;
    };

    // Collect shadow values
    const shadowEls = document.querySelectorAll(".modal-content, .card, .card-item, .btn-primary, [class*=card], .dropdown-menu, .context-menu, .toast");
    const shadows = {};
    for (const el of shadowEls) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const s = cs.boxShadow.slice(0, 50);
      shadows[s] = (shadows[s] || 0) + 1;
    }
    results.shadowDistribution = shadows;
    return results;
  });
  console.log("[SHADOWS] " + JSON.stringify(shadowAudit, null, 2));

  // 4. Open settings and check visual quality
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none"; m.classList.remove("visible");
    });
    const btn = document.querySelector("[data-action='settings'], #btn-settings");
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test_evidence/quality_settings_${ts}.png` });

  // 5. Check modal visual quality
  const modalQuality = await page.evaluate(() => {
    const modal = document.querySelector(".modal.visible, .modal[style*='flex'], .modal[style*='block']");
    if (!modal) return { found: false };
    const cs = getComputedStyle(modal);
    const content = modal.querySelector(".modal-content, .modal-dialog");
    const ccs = content ? getComputedStyle(content) : null;
    return {
      found: true,
      modalDisplay: cs.display,
      modalBg: cs.backgroundColor.slice(0, 30),
      contentRadius: ccs ? ccs.borderRadius : "N/A",
      contentShadow: ccs ? ccs.boxShadow.slice(0, 60) : "N/A",
      contentBg: ccs ? ccs.backgroundColor.slice(0, 30) : "N/A",
      contentMaxWidth: ccs ? ccs.maxWidth : "N/A"
    };
  });
  console.log("[MODAL_QUALITY] " + JSON.stringify(modalQuality, null, 2));

  // Close
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none"; m.classList.remove("visible");
    });
  });

  await browser.close();
  console.log("[DONE]");
})();
