const { chromium } = require('playwright');
(async () => {
  console.log('connect start');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  console.log('connected');
  const context = browser.contexts()[0];
  console.log('contexts', context ? context.pages().length : 0);
  const page = context.pages()[0];
  console.log('page title:', await page.title());
  const url = page.url();
  console.log('url:', url);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
