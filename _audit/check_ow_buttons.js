const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];

  // 先关所有面板
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 打开大纲工作台
  await page.keyboard.press('Control+1');
  await page.waitForTimeout(500);

  // 直接在 DOM 中搜索按钮
  const btns = await page.evaluate(() => {
    const ow = document.querySelector('#outline-workspace');
    if (!ow) return { error: 'outline-workspace not found' };
    const buttons = ow.querySelectorAll('button');
    return Array.from(buttons).map(b => b.id || b.className.substring(0,20) || b.textContent.substring(0,20));
  });
  console.log('大纲工作台按钮:');
  btns.forEach(b => console.log('  ' + (typeof b === 'string' ? b : JSON.stringify(b))));

  await browser.close();
})();
