const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const page = browser.contexts()[0].pages()[0];

  const sidebarInfo = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar, [class*="sidebar"], [class*="Sidebar"]');
    if (sidebar) return { found: true, cls: sidebar.className, children: sidebar.children.length };
    const navs = document.querySelectorAll('nav, [class*="nav"], [class*="Nav"]');
    return { found: false, navCount: navs.length, navs: Array.from(navs).map(n => n.className) };
  });
  console.log('Sidebar:', JSON.stringify(sidebarInfo));

  const piniaInfo = await page.evaluate(() => {
    try {
      const appEl = document.querySelector('#app');
      if (!appEl) return { error: 'no #app' };
      const vueApp = appEl.__vue_app__;
      if (!vueApp) return { error: 'no __vue_app__' };
      const pinia = vueApp.config.globalProperties.;
      if (!pinia) return { error: 'no ' };
      return { count: Object.keys(pinia._s).length, stores: Object.keys(pinia._s) };
    } catch(e) { return { error: e.message }; }
  });
  console.log('Pinia:', JSON.stringify(piniaInfo));

  const scInfo = await page.evaluate(() => {
    const sc = document.querySelector('.sc-overlay, [class*="settings-collection"], #settings-collection-panel');
    if (sc) return { found: true, display: getComputedStyle(sc).display, cls: sc.className };
    const btn = document.querySelector('[data-panel="settings-collection"]');
    if (btn) return { found: false, btnExists: true, btnText: btn.textContent.trim() };
    return { found: false, btnExists: false };
  });
  console.log('SC:', JSON.stringify(scInfo));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
