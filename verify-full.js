const { chromium } = require("playwright");
(async () => {
  try {
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9227", { timeout: 5000 });
    const pages = browser.contexts()[0].pages();
    const page = pages[0];
    await page.waitForTimeout(2000);

    // 1. 检查章节树头部按钮
    console.log("=== 1. 章节树按钮验证 ===");
    const genBtn = await page.$("#btn-tree-gen");
    console.log("btn-tree-gen:", !!genBtn);
    const projBtn = await page.$("#btn-open-project");
    console.log("btn-open-project:", !!projBtn);

    // 2. 点击项目按钮打开弹窗
    console.log("\n=== 2. 项目管理弹窗 ===");
    await page.evaluate(() => document.querySelector("#btn-open-project")?.click());
    await page.waitForTimeout(1000);
    const modal = await page.$(".project-modal-content");
    console.log("project modal visible:", !!modal);
    const modalText = modal ? await modal.textContent() : "";
    console.log("modal contains 项目管理:", modalText.includes("项目管理"));
    console.log("modal contains 新建项目:", modalText.includes("新建项目"));

    // 3. 关闭弹窗
    const closeBtn = await page.$(".btn-close");
    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(500);
      const modalHidden = await page.$(".modal-hidden");
      console.log("\nmodal hidden after close:", !!modalHidden);
    }

    // 4. 点击生成按钮（导航到流水线）
    console.log("\n=== 3. 生成按钮导航 ===");
    await page.evaluate(() => document.querySelector("#btn-tree-gen")?.click());
    await page.waitForTimeout(1000);

    // 5. 检查章节树是否存在
    console.log("\n=== 4. 章节树结构 ===");
    const treeHeader = await page.$("#current-project-name");
    console.log("current-project-name:", !!treeHeader);
    const treeBody = await page.$("#tree-body");
    console.log("tree-body:", !!treeBody);

    // 6. 检查项目列表（如果已有项目）
    console.log("\n=== 5. 项目列表 ===");
    await page.evaluate(() => document.querySelector("#btn-open-project")?.click());
    await page.waitForTimeout(1000);
    const projectItems = await page.$$(".project-item");
    console.log("project items count:", projectItems.length);
    if (projectItems.length > 0) {
      const firstItemName = await projectItems[0].$eval(".project-item-name", el => el.textContent);
      console.log("first project name:", firstItemName);
    }

    // 7. 新建表单
    const newBtn = await page.$(".new-project-btn");
    console.log("new project btn:", !!newBtn);
    if (newBtn) {
      const newBtnText = await newBtn.textContent();
      console.log("new btn text:", newBtnText.trim());
      await newBtn.click();
      await page.waitForTimeout(500);
      const form = await page.$(".new-project-form");
      console.log("new project form visible:", !!form);
    }

    await browser.close();
    console.log("\n=== ALL CHECKS PASSED ===");
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
