const { chromium } = require('playwright');
const fs = require('fs');

const OUT = '_audit/volume_gen_debug.json';
const report = { errors: [], networkErrors: [], steps: [] };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];

  page.on('console', msg => {
    const t = msg.text();
    if (/error|fail|warn|gener|cannot|failed/i.test(t)) report.errors.push({ type: msg.type(), text: t.slice(0, 500) });
  });
  page.on('pageerror', err => report.errors.push({ type: 'pageerror', text: String(err).slice(0, 500) }));
  page.on('requestfailed', req => report.networkErrors.push({ url: req.url(), err: req.failure()?.errorText }));

  // ensure pipeline open
  if (!(await page.locator('#pipeline-panel').count())) {
    await page.locator('#btn-pipeline').click();
    await page.waitForSelector('#pipeline-panel');
  }
  // go to volume step
  await page.locator('.pl-step').filter({ hasText: '卷纲' }).click();
  await page.waitForTimeout(300);

  report.steps.push('goto_volume_step');

  const btnVol = page.locator('#btn-pl-gen-volumes');
  report.steps.push({ before_click: await btnVol.isDisabled() });
  await btnVol.click();
  report.steps.push('clicked_ai_generate_volumes');

  // wait for generating to finish or timeout
  try {
    await page.waitForFunction(() => {
      const btn = document.querySelector('#btn-pl-gen-volumes');
      return btn && /生成/.test(btn.textContent || '') === false;
    }, { timeout: 150000 });
    report.steps.push('generation_finished');
  } catch (e) {
    report.steps.push('generation_timeout: ' + e.message);
  }

  await sleep(500);
  const state = await page.evaluate(() => {
    const proj = window.electronAPI.storageRead('wa_project_prj_msbtqnpe_q24wr3');
    const errors = window.__lastErrors || [];
    document.title = '';
    const progress = document.querySelector('#pipeline-progress-text, [class*="progress"]')?.textContent?.trim();
    return {
      volumes: (proj?.volumes || []).map(v => v.name),
      volCount: (proj?.volumes || []).length,
      toast: document.body.innerText.match(/生成|失败|错误|成功|API[\s\S]{0,80}/g)?.slice(-5),
      progress
    };
  });
  report.state = state;
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  await browser.close();
}

main().catch(e => {
  console.error('FATAL', e);
  process.exit(1);
});
