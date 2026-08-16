const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  console.log('Connected to browser');
  const pages = browser.contexts()[0].pages();
  console.log('Pages:', pages.length);
  const page = pages[0];
  console.log('Title:', await page.title());
  
  // 检查按钮
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      id: b.id, text: b.innerText.slice(0, 30), visible: b.offsetParent !== null
    }));
  });
  console.log('All buttons:', JSON.stringify(buttons));
  
  // 检查 nav
  const nav = await page.evaluate(() => {
    const nav = document.querySelector('nav');
    return nav ? nav.innerText.slice(0, 500) : 'no nav';
  });
  console.log('Nav:', nav);
  
  // 截图
  await page.screenshot({ path: 'D:\\codex\\novel-workshop-vue3\\test_ss_playwright.png', fullPage: true });
  console.log('Screenshot saved');
  
  await browser.close();
  console.log('Done');
})();
