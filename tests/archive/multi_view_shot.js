const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  if (!fs.existsSync("test_evidence")) fs.mkdirSync("test_evidence");
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const shots = [];

  // 1. Main screen
  await page.waitForTimeout(500);
  await page.screenshot({ path: `test_evidence/view_main_${ts}.png` });
  shots.push("main");

  // 2. Close any open panels first
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none";
      m.classList.remove("visible");
    });
  });
  await page.waitForTimeout(300);

  // 3. Open settings panel
  try {
    const settingsBtn = await page.$("[data-action='settings'], #btn-settings");
    if (settingsBtn) {
      await settingsBtn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `test_evidence/view_settings_${ts}.png` });
      shots.push("settings");
    }
  } catch(e) { console.log("[SKIP] settings: " + e.message.slice(0,60)); }

  // 4. Check computed styles on broader elements
  const styleAudit = await page.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        radius: cs.borderRadius,
        font: cs.fontSize,
        shadow: cs.boxShadow.slice(0, 60),
        padding: cs.padding,
        bg: cs.backgroundColor.slice(0, 40)
      };
    };
    return {
      btnPrimary: get(".btn-primary"),
      btnSecondary: get(".btn-secondary"),
      btnDanger: get(".btn-danger"),
      modal: get(".modal-content"),
      modalHeader: get(".modal-header"),
      modalFooter: get(".modal-footer"),
      input: get("input[type='text']"),
      select: get("select"),
      textarea: get("textarea"),
      sidebar: get(".sidebar"),
      tree: get(".tree-node"),
      card: get(".card-item"),
      tab: get(".tab"),
      panel: get(".panel"),
      editor: get(".editor-header"),
      chatMsg: get(".message-content"),
      toast: get(".toast")
    };
  });
  console.log("[STYLES] " + JSON.stringify(styleAudit, null, 2));
  console.log("[SHOTS] " + shots.join(", "));

  // 5. Close settings
  await page.evaluate(() => {
    document.querySelectorAll(".modal.visible, .modal").forEach(m => {
      m.style.display = "none";
      m.classList.remove("visible");
    });
  });

  await browser.close();
})();
