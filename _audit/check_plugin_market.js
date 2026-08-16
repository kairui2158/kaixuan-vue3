const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];

  // 检查插件市场相关元素
  await page.keyboard.press('Control+5');
  await page.waitForTimeout(800);
  
  // 查看所有可见的 modal/overlay
  const overlays = await page.evaluate(() => {
    const all = document.querySelectorAll('div[class*=\"overlay\"], div[class*=\"modal\"], div[class*=\"panel\"]');
    return Array.from(all).map(el => ({
      id: el.id,
      class: el.className.substring(0, 60),
      display: getComputedStyle(el).display,
      visible: el.offsetParent !== null
    }));
  });
  console.log('Visible overlays/panels:');
  overlays.filter(o => o.visible).forEach(o => console.log('  ' + o.id + ' | ' + o.class));

  // 检查是否有 PluginMarket 组件
  const pm = await page.locator('.plugin-market, #plugin-market, [class*=PluginMarket]').count();
  console.log('PluginMarket count: ' + pm);

  // 检查快捷键绑定
  const keyBindings = await page.evaluate(() => {
    const results = [];
    // 检查 App.vue 的快捷键监听
    const appEl = document.getElementById('app');
    if (appEl) results.push('app element found');
    // 检查是否有 closeAllPanels 函数
    if (typeof window.closeAllPanels !== 'undefined') results.push('closeAllPanels exists');
    return results;
  });
  console.log('Key bindings: ' + JSON.stringify(keyBindings));

  await browser.close();
})();
