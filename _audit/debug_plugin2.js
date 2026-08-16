const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];

  // 先按 Escape 确保所有面板关闭
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  
  const before = await page.evaluate(() => {
    if (typeof window.__getActivePanel === 'function') return window.__getActivePanel();
    return 'no getter';
  });
  console.log('After Escape: ' + before);

  // 按 Ctrl+5
  await page.keyboard.press('Control+5');
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    if (typeof window.__getActivePanel === 'function') return window.__getActivePanel();
    return 'no getter';
  });
  console.log('After Ctrl+5: ' + after);

  // 检查 DOM 中有什么
  const dom = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return 'no main';
    return Array.from(main.children).map(el => {
      const tag = el.tagName.toLowerCase();
      const id = el.id || '';
      const cls = el.className.toString().substring(0, 30);
      const display = getComputedStyle(el).display;
      return tag + '#' + id + '.' + cls + ' display=' + display;
    });
  });
  dom.forEach(d => console.log('  ' + d));

  await browser.close();
})();
