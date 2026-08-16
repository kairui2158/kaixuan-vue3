const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];

  // 先检查 activePanel 的值
  const panelState = await page.evaluate(() => {
    // 尝试通过 window.__getActivePanel 获取
    if (typeof window.__getActivePanel === 'function') {
      return window.__getActivePanel();
    }
    return 'no getter';
  });
  console.log('Current activePanel: ' + panelState);

  // 按 Ctrl+5
  await page.keyboard.press('Control+5');
  await page.waitForTimeout(500);

  const panelState2 = await page.evaluate(() => {
    if (typeof window.__getActivePanel === 'function') {
      return window.__getActivePanel();
    }
    return 'no getter';
  });
  console.log('After Ctrl+5 activePanel: ' + panelState2);

  // 检查所有元素的可见性
  const allVisible = await page.evaluate(() => {
    const results = [];
    // 检查 PluginMarket 组件
    const pm = document.querySelector('.plugin-market');
    if (pm) {
      const style = getComputedStyle(pm);
      results.push('PluginMarket: display=' + style.display + ' visible=' + (pm.offsetParent !== null));
    } else {
      results.push('PluginMarket element not found in DOM');
    }
    // 检查所有 v-if 渲染的元素
    const allChildren = document.querySelectorAll('main > *');
    allChildren.forEach(el => {
      const tag = el.tagName.toLowerCase();
      const id = el.id || '';
      const cls = el.className.toString().substring(0, 40);
      const style = getComputedStyle(el);
      if (style.display !== 'none' && el.offsetParent !== null) {
        results.push('Visible in main: ' + tag + ' #' + id + ' .' + cls);
      }
    });
    return results;
  });
  allVisible.forEach(r => console.log('  ' + r));

  await browser.close();
})();
