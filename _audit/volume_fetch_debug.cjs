const { chromium } = require('playwright');
const fs = require('fs');

const OUT = '_audit/volume_fetch_debug.json';
const report = { requests: [] };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];

  await page.evaluate(() => {
    const orig = window.fetch;
    window.__fetchLog = [];
    window.fetch = async (...args) => {
      const url = String(args[0]);
      const opts = args[1] || {};
      if (url.includes('chat/completions')) {
        let body = opts.body;
        try { body = JSON.parse(opts.body); } catch {}
        window.__fetchLog.push({ url, method: opts.method, body, headers: { ...opts.headers } });
      }
      const resp = await orig(...args);
      if (url.includes('chat/completions')) {
        try {
          const text = await resp.clone().text();
          const last = window.__fetchLog[window.__fetchLog.length - 1];
          last.status = resp.status;
          last.responseText = text.slice(0, 800);
        } catch {}
      }
      return resp;
    };
  });

  // go to volume step
  if (!(await page.locator('#pipeline-panel').count())) {
    await page.locator('#btn-pipeline').click();
    await page.waitForSelector('#pipeline-panel');
  }
  await page.locator('.pl-step').filter({ hasText: '卷纲' }).click();
  await page.waitForTimeout(200);

  await page.locator('#btn-pl-gen-volumes').click();
  await sleep(25000);
  report.requests = await page.evaluate(() => window.__fetchLog || []);
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
