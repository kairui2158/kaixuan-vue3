const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  const consoleMsgs = [];

  page.on('console', msg => {
    consoleMsgs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', err => {
    errors.push(err.message + '\n' + err.stack);
  });
  page.on('requestfailed', req => {
    errors.push('REQ FAIL: ' + req.url() + ' - ' + req.failure()?.errorText);
  });

  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  console.log('=== Console Messages ===');
  consoleMsgs.forEach(m => console.log('[' + m.type + '] ' + m.text));
  console.log('=== Page Errors ===');
  errors.forEach(e => console.log(e));
  console.log('=== App Content ===');
  const html = await page.evaluate(() => document.getElementById('app')?.innerHTML?.substring(0, 500) || 'EMPTY');
  console.log(html);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
