const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  console.log("start", new Date().toISOString());
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  console.log("connected");
  const ctx = browser.contexts()[0];
  const pages = ctx.pages();
  const page = pages.length ? pages[0] : await ctx.newPage();
  console.log("page url:", page.url());

  // open SC panel
  await page.evaluate(() => { if (typeof app !== "undefined" && app.showSettingsCollection) app.showSettingsCollection(); });
  await page.waitForTimeout(2000);

  // scroll SC to top
  await page.evaluate(() => { const c = document.querySelector(".sc-items-area"); if (c) c.scrollTop = 0; });
  await page.waitForTimeout(800);

  // metrics
  const m = await page.evaluate(() => {
    const items = document.querySelectorAll(".sc-item");
    const rect = [];
    for (let i = 0; i < Math.min(items.length, 5); i++) {
      const r = items[i].getBoundingClientRect();
      rect.push({ t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height) });
    }
    const h = document.querySelector(".sc-item-header");
    const cs = h ? getComputedStyle(h) : null;
    const n = document.querySelector(".sc-item-name");
    const ns = n ? getComputedStyle(n) : null;
    const k = document.querySelector(".sc-item-attr-key");
    const ks = k ? getComputedStyle(k) : null;
    const a = document.querySelector(".sc-item-attr");
    const as = a ? getComputedStyle(a) : null;
    const panel = document.querySelector(".sc-items-area");
    const pr = panel ? panel.getBoundingClientRect() : null;
    return {
      count: items.length,
      rects: rect,
      overlap: rect.length > 1 && rect[1].t < rect[0].b,
      header_justify: cs ? cs.justifyContent : null,
      header_gap: cs ? cs.gap : null,
      name_flex: ns ? ns.flexGrow : null,
      name_weight: ns ? ns.fontWeight : null,
      attr_display: as ? as.display : null,
      attr_bg: as ? as.backgroundColor : null,
      key_color: ks ? ks.color : null,
      panel: pr ? { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height) } : null
    };
  });
  console.log("metrics:", JSON.stringify(m));

  // screenshot full page
  const f1 = "test_evidence/sc_pw_full_" + Date.now() + ".png";
  await page.screenshot({ path: f1, fullPage: false });
  console.log("[OK] full", f1, fs.statSync(f1).size + "B");

  // screenshot SC panel element only
  const panelEl = await page.$(".sc-items-area");
  if (panelEl) {
    const f2 = "test_evidence/sc_pw_panel_" + Date.now() + ".png";
    await panelEl.screenshot({ path: f2 });
    console.log("[OK] panel", f2, fs.statSync(f2).size + "B");
  } else {
    console.log("[FAIL] no .sc-items-area");
  }

  await browser.close();
  console.log("done", new Date().toISOString());
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
