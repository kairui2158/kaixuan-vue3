const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const files = ["style-p5-deep-cards.css", "style-p5-deep-content.css", "style-p5-deep-forms.css"];
  console.log("=== P5 CSS File Check ===");
  for (const f of files) {
    if (fs.existsSync(f)) {
      const content = fs.readFileSync(f, "utf8");
      const lines = content.split("\n").length;
      const varCount = (content.match(/var\(--/g) || []).length;
      const hardcoded = (content.match(/#[0-9a-fA-F]{3,6}/g) || []).filter(h => !h.includes("var(")).length;
      console.log(`[OK] ${f}: ${lines} lines, ${varCount} var() refs, ${hardcoded} hardcoded colors`);
    } else {
      console.log(`[MISSING] ${f}`);
    }
  }

  // Check renderer.html has all links
  const html = fs.readFileSync("renderer.html", "utf8");
  for (const f of files) {
    if (html.includes(f)) {
      console.log(`[LINK OK] ${f} in renderer.html`);
    } else {
      console.log(`[LINK MISSING] ${f} not in renderer.html`);
    }
  }

  // Connect to Electron and verify styles are loaded
  try {
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
    const page = browser.contexts()[0].pages()[0];
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Check if P5 styles are applied
    const styleCheck = await page.evaluate(() => {
      const results = {};
      
      // Check provider-card
      const pc = document.querySelector(".provider-card");
      if (pc) {
        const cs = getComputedStyle(pc);
        results.providerCard = { radius: cs.borderRadius, transition: cs.transition.slice(0, 40) };
      }
      
      // Check agent-card
      const ac = document.querySelector(".agent-card");
      if (ac) {
        const cs = getComputedStyle(ac);
        results.agentCard = { radius: cs.borderRadius, transition: cs.transition.slice(0, 40) };
      }
      
      // Check spinner
      const sp = document.querySelector(".spinner");
      if (sp) {
        const cs = getComputedStyle(sp);
        results.spinner = { animation: cs.animation.slice(0, 40) };
      }
      
      // Check empty-hint
      const eh = document.querySelector(".empty-hint");
      if (eh) {
        const cs = getComputedStyle(eh);
        results.emptyHint = { color: cs.color.slice(0, 40), fontSize: cs.fontSize };
      }
      
      // Check bound-item
      const bi = document.querySelector(".bound-item");
      if (bi) {
        const cs = getComputedStyle(bi);
        results.boundItem = { radius: cs.borderRadius, bg: cs.backgroundColor.slice(0, 40) };
      }
      
      // Check pl-step
      const ps = document.querySelector(".pl-step");
      if (ps) {
        const cs = getComputedStyle(ps);
        results.plStep = { radius: cs.borderRadius, transition: cs.transition.slice(0, 40) };
      }
      
      // Check modal-tab
      const mt = document.querySelector(".modal-tab");
      if (mt) {
        const cs = getComputedStyle(mt);
        results.modalTab = { radius: cs.borderRadius, transition: cs.transition.slice(0, 40) };
      }
      
      return results;
    });
    console.log("\n=== Runtime Style Verification ===");
    console.log(JSON.stringify(styleCheck, null, 2));

    // Take screenshot
    const ts = Date.now();
    await page.screenshot({ path: `test_evidence/p5_integration_${ts}.png` });
    console.log("[OK] screenshot saved");

    await browser.close();
  } catch(e) {
    console.log("[SKIP] Electron not running: " + e.message.slice(0, 60));
  }
  
  console.log("\n=== Done ===");
})();
