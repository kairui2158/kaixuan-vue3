const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const ctx = b.contexts()[0];
  const p = ctx.pages()[0];
  await p.evaluate(() => { if (typeof app !== "undefined" && app.showSettingsCollection) app.showSettingsCollection(); });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const c = document.querySelector(".sc-items-area"); if (c) c.scrollTop = 0; });
  await p.waitForTimeout(500);
  const items = await p.$$(".sc-item");
  if (items.length >= 5) {
    const box = await items[0].boundingBox();
    const box5 = await items[4].boundingBox();
    const clip = {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box5.y + box5.height - box.y + 10)
    };
    const f = "test_evidence/sc_cards_detail_" + Date.now() + ".png";
    await p.screenshot({ path: f, clip: clip });
    console.log("[OK]", f, fs.statSync(f).size + "B", "clip:", JSON.stringify({ x: clip.x, y: clip.y, w: clip.width, h: clip.height }));
  } else {
    console.log("not enough items:", items.length);
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
