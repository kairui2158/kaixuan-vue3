const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'scan_screens');
fs.mkdirSync(OUT, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickKey(page, key) {
  const ok = await page.evaluate((k) => {
    const list = [
      ...document.querySelectorAll(
        'button, .btn, [role="button"], nav a, .sidebar-btn, .side-item, .menu-item'
      )
    ];
    const el = list.find((e) => {
      const visible = e.offsetWidth || e.offsetHeight || e.getClientRects().length;
      if (!visible) return false;
      const t = (e.textContent || '').trim();
      const attrs =
        (e.getAttribute('aria-label') || '') +
        '|' +
        (e.getAttribute('data-tooltip') || '') +
        '|' +
        (e.id || '');
      return t.includes(k) || attrs.includes(k);
    });
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, key);
  return ok;
}

async function scanPage(page) {
  return page.evaluate(() => {
    const num = (s) => Math.round(parseFloat(s) || 0);
    const els = [...document.querySelectorAll('button, [class*="btn"]')].filter(
      (el) => el.offsetWidth || el.offsetHeight || el.getClientRects().length
    );
    const problems = [];
    for (const el of els) {
      const cls = (el.className || '').toString().trim();
      const isStandard =
        /\bbtn-sm\b/.test(cls) ||
        /\bbtn-md\b/.test(cls) ||
        /\bbtn-lg\b/.test(cls) ||
        /\bbtn-xs\b/.test(cls) ||
        /\bbtn-send\b/.test(cls) ||
        /\bbtn-(primary|secondary|danger)\b/.test(cls);
      if (!isStandard) continue;
      const cs = getComputedStyle(el);
      const h = num(cs.height);
      const fs = cs.fontSize;
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
      let bad = false;
      if (/\bbtn-sm\b/.test(cls)) bad = h !== 28 || fs !== '12px';
      else if (/\bbtn-xs\b/.test(cls)) bad = h !== 24 || fs !== '11px';
      else if (/\bbtn-lg\b/.test(cls)) bad = h !== 38 || fs !== '15px';
      else if (/\bbtn-send\b/.test(cls)) bad = h !== 32 || fs !== '13px';
      else if (/\bbtn-md\b/.test(cls)) bad = h !== 32 || fs !== '13px';
      else bad = h !== 32 || fs !== '13px';
      if (bad) problems.push({ cls: cls.slice(0, 100), text, h, fs });
    }
    return { total: els.length, problems };
  });
}

async function shot(page, name) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  return fs.statSync(file).size;
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const ctx = browser.contexts()[0];
  if (!ctx) {
    console.log('NO_CONTEXT');
    await browser.close();
    return;
  }
  const page = ctx.pages()[0];
  await page.bringToFront().catch(() => {});
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await sleep(2500);

  const report = {};
  const targets = [
    ['项目', '02_project'],
    ['btn-outline-workspace', '03_outline'],
    ['btn-settings-collection', '04_sc'],
    ['btn-pipeline', '05_pipeline'],
    ['btn-memory', '06_memory'],
    ['btn-settings', '07_settings'],
    ['btn-plugin-market', '08_plugin'],
    ['btn-dashboard', '09_dashboard']
  ];

  let s = await scanPage(page);
  report['01_main'] = { opened: true, ...s };
  console.log('SCAN 01_main', 'buttons=', s.total, 'problems=', s.problems.length);
  console.log('SHOT 01_main', await shot(page, '01_main'));

  for (const [key, name] of targets) {
    const ok = await clickKey(page, key);
    await sleep(700);
    s = await scanPage(page);
    report[name] = { opened: ok, ...s };
    console.log('SCAN', name, ok, 'buttons=', s.total, 'problems=', s.problems.length);
    if (s.problems.length) console.log('PROBLEMS', JSON.stringify(s.problems));
    console.log('SHOT', name, await shot(page, name));
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(300);
    await clickKey(page, 'btn-outline-workspace');
    await sleep(300);
  }

  fs.writeFileSync(path.join(__dirname, 'ui_scan_report.json'), JSON.stringify(report, null, 2));
  const totalProblems = Object.values(report).reduce((n, r) => n + r.problems.length, 0);
  console.log('TOTAL_PROBLEMS', totalProblems);
  await browser.close();
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
