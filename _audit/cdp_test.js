const { chromium } = require('playwright');
(async () => {
  try {
    const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
    const contexts = browser.contexts();
    const pages = contexts[0].pages();
    console.log('Connected: ' + pages.length + ' pages');
    for (const p of pages) {
      console.log('  Page: ' + p.url().substring(0, 100));
    }
    await browser.close();
    console.log('CDP DONE');
  } catch(e) {
    console.error('CDP ERROR: ' + e.message);
  }
})();
