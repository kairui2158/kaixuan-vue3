const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const contrast = await page.evaluate(() => {
    const visible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
    };
    const parseRgb = (str) => {
      const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
    };
    const luminance = (c) => {
      if (!c) return 0;
      const [r, g, b] = [c.r/255, c.g/255, c.b/255].map(v =>
        v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4)
      );
      return 0.2126*r + 0.7152*g + 0.0722*b;
    };
    const contrastRatio = (c1, c2) => {
      const l1 = luminance(c1);
      const l2 = luminance(c2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    };
    const getEffectiveBg = (el) => {
      let current = el;
      while (current && current !== document.body) {
        const cs = getComputedStyle(current);
        const bg = cs.backgroundColor;
        if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        current = current.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };

    const issues = [];
    const textEls = document.querySelectorAll("span, p, label, button, a, td, th, h1, h2, h3, h4, h5, h6");
    let checked = 0;
    let lowContrast = 0;

    for (const el of textEls) {
      if (!visible(el)) continue;
      const text = (el.textContent || "").trim();
      if (!text || text.length < 2) continue;
      const cs = getComputedStyle(el);
      const textColor = parseRgb(cs.color);
      const bgColor = parseRgb(getEffectiveBg(el));
      if (!textColor || !bgColor) continue;
      const ratio = contrastRatio(textColor, bgColor);
      checked++;
      if (ratio < 3.0) {
        lowContrast++;
        if (issues.length < 10) {
          issues.push({ text: text.slice(0, 25), ratio: ratio.toFixed(2), color: cs.color.slice(0, 30) });
        }
      }
    }
    return { checked, lowContrast, issues };
  });

  console.log("[CONTRAST] Checked: " + contrast.checked + ", Low contrast: " + contrast.lowContrast);
  if (contrast.issues.length > 0) {
    console.log("[ISSUES] " + JSON.stringify(contrast.issues, null, 2));
  } else {
    console.log("[ISSUES] none - all text meets WCAG contrast standards");
  }

  await browser.close();
})();
