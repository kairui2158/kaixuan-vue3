const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const info = await page.evaluate(() => {
    const visible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && r.width > 0 && r.height > 0;
    };
    const targets = ["未选择智能体", "未启用技能", "deepseek-v4-flash", "字数: 0", "AI生成章节"];
    const results = [];
    const all = document.querySelectorAll("*");
    for (const el of all) {
      if (!visible(el)) continue;
      const text = (el.textContent || "").trim();
      for (const t of targets) {
        if (text.includes(t) && text.length < 40) {
          const cs = getComputedStyle(el);
          results.push({
            text: text.slice(0, 30),
            tag: el.tagName,
            id: el.id || "",
            cls: (el.className || "").toString().slice(0, 60),
            color: cs.color.slice(0, 30),
            parent: el.parentElement ? (el.parentElement.id || el.parentElement.className.toString().slice(0, 40)) : ""
          });
          break;
        }
      }
    }
    return results;
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
