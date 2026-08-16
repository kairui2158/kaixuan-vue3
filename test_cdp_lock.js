const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  
  // 1. 输入大纲内容
  console.log("step1: input outline");
  await page.evaluate(() => {
    const ta = document.querySelector('.outline-workspace textarea');
    if (ta) {
      ta.value = '测试大纲。\n第一章：开始\n第二章：发展\n第三章：高潮\n第四章：结局';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.waitForTimeout(200);
  
  // 2. 点击锁定按钮
  console.log("step2: click lock");
  await page.click('#btn-lock-outline');
  await page.waitForTimeout(800);
  
  // 3. 检查
  console.log("step3: check pipeline");
  const pipelineVisible = await page.evaluate(() => {
    return document.querySelector('#pipeline-panel') !== null;
  });
  console.log("pipeline:", pipelineVisible);
  
  // 4. 用 Pinia 访问 state
  const step = await page.evaluate(() => {
    try {
      const piniaKey = String.fromCharCode(36) + "pinia";
      const pinia = window.__vue_app__.config.globalProperties[piniaKey];
      return JSON.stringify({step: pinia.state.value.pipeline.currentStep, locked: pinia.state.value.project.outlineLocked});
    } catch(e) {
      return "error: " + e.message;
    }
  });
  console.log("state:", step);
  
  await page.screenshot({ path: 'D:\\codex\\novel-workshop-vue3\\test_ss_lock.png' });
  console.log("screenshot saved");
  
  await browser.close();
  console.log("done");
})();
