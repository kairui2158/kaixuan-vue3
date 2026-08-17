const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9227");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().startsWith("file:"));
  const state = await page.evaluate(() => ({
    pipelinePanel: !!document.querySelector("#pipeline-panel"),
    currentStep: document.querySelector(".pl-step.active")?.textContent?.trim() || "none",
    scCategories: !!document.querySelector("#pl-sc-categories"),
    modal: !!document.querySelector(".pl-add-setting-modal"),
  }));
  console.log(JSON.stringify(state));
  await browser.close();
})();
