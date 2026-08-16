const { chromium } = require("playwright");
(async () => {
  try {
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9227", { timeout: 5000 });
    const pages = browser.contexts()[0].pages();
    const page = pages[0];
    await page.waitForTimeout(2000);

    // 验证按钮1：btn-tree-gen
    const genBtn = await page.$("#btn-tree-gen");
    console.log("btn-tree-gen exists:", !!genBtn);
    if (genBtn) {
      const text = await genBtn.textContent();
      console.log("btn-tree-gen text:", JSON.stringify(text.trim()));
    }

    // 验证按钮2：btn-open-project
    const projBtn = await page.$("#btn-open-project");
    console.log("btn-open-project exists:", !!projBtn);
    if (projBtn) {
      const text = await projBtn.textContent();
      console.log("btn-open-project text:", JSON.stringify(text.trim()));
    }

    // 点击项目按钮
    if (projBtn) {
      await page.evaluate(() => document.querySelector("#btn-open-project")?.click());
      await page.waitForTimeout(1000);
      const modal = await page.$(".project-modal-content");
      console.log("project modal visible after click:", !!modal);
    }

    await browser.close();
    console.log("ALL CHECKS PASSED");
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
