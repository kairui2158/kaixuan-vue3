const { chromium } = require("playwright");
(async () => {
  try {
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9227", { timeout: 5000 });
    const pages = browser.contexts()[0].pages();
    const page = pages[0];
    await page.waitForTimeout(2000);

    // 检查 modal 初始状态
    const modalHidden = await page.evaluate(() => {
      const el = document.querySelector(".modal");
      if (!el) return "NO_MODAL_FOUND";
      const classes = el.className;
      const computedStyle = window.getComputedStyle(el);
      return { classes, display: computedStyle.display };
    });
    console.log("modal initial state:", JSON.stringify(modalHidden));

    // 打开项目按钮
    await page.evaluate(() => document.querySelector("#btn-open-project")?.click());
    await page.waitForTimeout(1000);
    const modalOpen = await page.evaluate(() => {
      const el = document.querySelector(".modal");
      if (!el) return "NO_MODAL_FOUND";
      const classes = el.className;
      const computedStyle = window.getComputedStyle(el);
      return { classes, display: computedStyle.display };
    });
    console.log("modal after click:", JSON.stringify(modalOpen));

    // 点击 backdrop 关闭
    await page.evaluate(() => document.querySelector(".modal-backdrop")?.click());
    await page.waitForTimeout(1000);
    const modalAfterBackdrop = await page.evaluate(() => {
      const el = document.querySelector(".modal");
      if (!el) return "NO_MODAL_FOUND";
      const classes = el.className;
      const computedStyle = window.getComputedStyle(el);
      return { classes, display: computedStyle.display };
    });
    console.log("modal after backdrop click:", JSON.stringify(modalAfterBackdrop));

    // 再打开
    await page.evaluate(() => document.querySelector("#btn-open-project")?.click());
    await page.waitForTimeout(500);

    // 点击关闭按钮
    await page.evaluate(() => document.querySelector(".btn-close")?.click());
    await page.waitForTimeout(1000);
    const modalAfterClose = await page.evaluate(() => {
      const el = document.querySelector(".modal");
      if (!el) return "NO_MODAL_FOUND";
      const classes = el.className;
      const computedStyle = window.getComputedStyle(el);
      return { classes, display: computedStyle.display };
    });
    console.log("modal after close btn:", JSON.stringify(modalAfterClose));

    await browser.close();
    console.log("DONE");
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
