const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9227");
  const page = browser.contexts()[0].pages()[0];
  
  const state = await page.evaluate((piniaKey) => {
    const app = document.querySelector("#app");
    const p = app.__vue_app__.config.globalProperties[piniaKey];
    return JSON.stringify({
      step: p.state.value.pipeline.currentStep,
      locked: p.state.value.project.outlineLocked,
      pipelinePanel: document.querySelector("#pipeline-panel") !== null
    });
  }, "$pinia");
  console.log("current state:", state);
  
  // 检查 pipeline panel 的步骤
  const steps = await page.evaluate(() => {
    const els = document.querySelectorAll(".pl-step");
    return Array.from(els).map(el => el.className + " " + el.innerText.slice(0, 20));
  });
  console.log("steps:", JSON.stringify(steps));
  
  await browser.close();
})();
