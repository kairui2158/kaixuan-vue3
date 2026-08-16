const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--remote-debugging-port=9224', '--no-first-run', '--no-default-browser-check'],
    headless: true
  });

  const page = await browser.newPage();
  
  // Collect console messages
  const consoleMsgs = [];
  page.on('console', msg => {
    consoleMsgs.push({ type: msg.type(), text: msg.text() });
  });
  
  // Collect page errors
  const pageErrors = [];
  page.on('pageerror', err => {
    pageErrors.push(err.message + '\n' + (err.stack || ''));
  });
  
  // Collect failed requests
  const failedReqs = [];
  page.on('requestfailed', req => {
    failedReqs.push(req.url() + ' - ' + req.failure().errorText);
  });
  
  // Collect responses with non-200 status
  const badResponses = [];
  page.on('response', resp => {
    if (resp.status() >= 400) {
      badResponses.push(resp.status() + ' ' + resp.url());
    }
  });
  
  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 15000 });
  
  // Wait extra for Vue mount
  await page.waitForTimeout(3000);
  
  // Get DOM info
  const domInfo = await page.evaluate(() => {
    const app = document.getElementById('app');
    return {
      appExists: !!app,
      appInnerHTML: app ? app.innerHTML.substring(0, 500) : 'N/A',
      appChildCount: app ? app.children.length : 0,
      bodyHTML: document.body.innerHTML.substring(0, 1000),
      totalElements: document.querySelectorAll('*').length
    };
  });
  
  console.log('\n=== DOM Info ===');
  console.log(JSON.stringify(domInfo, null, 2));
  
  console.log('\n=== Console Messages (' + consoleMsgs.length + ') ===');
  consoleMsgs.forEach(m => console.log('[' + m.type + '] ' + m.text));
  
  console.log('\n=== Page Errors (' + pageErrors.length + ') ===');
  pageErrors.forEach(e => console.log(e));
  
  console.log('\n=== Failed Requests (' + failedReqs.length + ') ===');
  failedReqs.forEach(r => console.log(r));
  
  console.log('\n=== Bad Responses (' + badResponses.length + ') ===');
  badResponses.forEach(r => console.log(r));
  
  await browser.close();
  console.log('\nDone.');
})();
