const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  
  const audit = await page.evaluate(() => {
    const results = { spacing: {}, fonts: {}, transitions: {}, issues: [] };
    
    // Check all visible buttons for consistency
    const btns = document.querySelectorAll("button, .btn, [class*=btn]");
    let btnRadiuses = {};
    for (let i = 0; i < btns.length; i++) {
      const cs = getComputedStyle(btns[i]);
      const r = cs.borderRadius;
      btnRadiuses[r] = (btnRadiuses[r] || 0) + 1;
    }
    results.btnRadiusDistribution = btnRadiuses;
    
    // Check all inputs for consistency
    const inputs = document.querySelectorAll("input[type='text'], input[type='password'], input[type='url'], input[type='number'], textarea, select");
    let inputRadiuses = {};
    for (let i = 0; i < inputs.length; i++) {
      const cs = getComputedStyle(inputs[i]);
      const r = cs.borderRadius;
      inputRadiuses[r] = (inputRadiuses[r] || 0) + 1;
    }
    results.inputRadiusDistribution = inputRadiuses;
    
    // Check transition consistency on interactive elements
    const interactive = document.querySelectorAll("button, .btn, a, input, select, textarea, [role='button']");
    let transitionStats = { hasTransition: 0, noTransition: 0 };
    for (let i = 0; i < interactive.length && i < 100; i++) {
      const cs = getComputedStyle(interactive[i]);
      if (cs.transition && cs.transition !== "all" && cs.transition !== "none") {
        transitionStats.hasTransition++;
      } else {
        transitionStats.noTransition++;
      }
    }
    results.transitions = transitionStats;
    
    // Check z-index stacking
    const overlays = document.querySelectorAll(".modal, .overlay, .toast, .tooltip, .context-menu");
    let zIndices = [];
    for (let i = 0; i < overlays.length && i < 20; i++) {
      const cs = getComputedStyle(overlays[i]);
      const z = parseInt(cs.zIndex);
      if (!isNaN(z) && z > 0) {
        zIndices.push({ cls: (overlays[i].className || "").slice(0, 30), z: z });
      }
    }
    results.zIndices = zIndices;
    
    // Check for any text with very small font (accessibility)
    let smallFonts = 0;
    const allText = document.querySelectorAll("span, p, label, button, a, td, th, div");
    for (let i = 0; i < allText.length && i < 500; i++) {
      const cs = getComputedStyle(allText[i]);
      const fs = parseFloat(cs.fontSize);
      if (fs > 0 && fs < 10) {
        smallFonts++;
      }
    }
    results.accessibility = { fontsBelow10px: smallFonts };
    
    return results;
  });
  
  console.log(JSON.stringify(audit, null, 2));
  await browser.close();
})();
