const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const info = await page.evaluate(() => {
    const btns = document.querySelectorAll(".sidebar-btn");
    const results = [];
    for (const b of btns) {
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      results.push({
        text: (b.textContent || "").trim().slice(0, 30),
        html: b.innerHTML.slice(0, 80),
        width: Math.round(r.width),
        height: Math.round(r.height),
        fontSize: cs.fontSize,
        padding: cs.padding,
        overflow: cs.overflow,
        whiteSpace: cs.whiteSpace,
        scrollWidth: b.scrollWidth,
        clientWidth: b.clientWidth
      });
    }
    return results;
  });
  console.log(JSON.stringify(info, null, 2));
  
  // Also check the sidebar container
  const sidebarInfo = await page.evaluate(() => {
    const sidebar = document.querySelector("#sidebar, .sidebar, nav");
    if (!sidebar) return null;
    const cs = getComputedStyle(sidebar);
    const r = sidebar.getBoundingClientRect();
    return { width: Math.round(r.width), display: cs.display, flexDir: cs.flexDirection, gap: cs.gap };
  });
  console.log("[SIDEBAR] " + JSON.stringify(sidebarInfo, null, 2));
  
  await browser.close();
})();
