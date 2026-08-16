const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'shots_b11');
fs.mkdirSync(OUT, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function screenshot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log('SHOT', name, fs.statSync(file).size);
}

async function clickText(page, text) {
  const ok = await page.evaluate((txt) => {
    const els = [
      ...document.querySelectorAll(
        'button, .btn, [role="button"], nav a, .nav-item, .sidebar-item, .side-item, .menu-item'
      )
    ];
    const el = els.find((e) => {
      const t = (e.textContent || '').trim();
      const attrs =
        (e.getAttribute('aria-label') || '') +
        '|' +
        (e.getAttribute('data-tooltip') || '') +
        '|' +
        (e.id || '');
      return (
        (t.includes(txt) || attrs.includes(txt)) &&
        (e.offsetWidth || e.offsetHeight || e.getClientRects().length)
      );
    });
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, text);
  return ok;
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
  await sleep(1200);

  console.log('URL:', page.url());
  console.log('TITLE:', await page.title());

  const metrics = await page.evaluate(() => {
    const els = [
      ...document.querySelectorAll('button, .btn, [class*="btn"]')
    ].filter((el) => el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const rows = els.map((el, i) => {
      const cs = getComputedStyle(el);
      return {
        i,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24),
        cls: (el.className || '').toString().replace(/\s+/g, ' ').slice(0, 100),
        h: Math.round(parseFloat(cs.height) || 0),
        fs: cs.fontSize,
        bg: cs.backgroundColor
      };
    });
    const agg = {};
    for (const r of rows) {
      const btnCls = r.cls
        .split(' ')
        .filter((c) => c.startsWith('btn'))
        .join(' ');
      const key = `${r.h}px|${r.fs}|${btnCls}`;
      agg[key] = (agg[key] || 0) + 1;
    }
    return {
      count: rows.length,
      agg: Object.entries(agg)
        .map(([k, v]) => ({ k, v }))
        .sort((a, b) => b.v - a.v),
      rows
    };
  });

  console.log('BTN_COUNT:', metrics.count);
  console.log('BTN_AGGS:', JSON.stringify(metrics.agg));
  fs.writeFileSync(path.join(OUT, 'buttons.json'), JSON.stringify(metrics, null, 2));

  await screenshot(page, '01_main.png');

  const targets = [
    ['项目', '02_project.png'],
    ['btn-outline-workspace', '03_outline.png'],
    ['btn-settings-collection', '04_sc.png'],
    ['btn-pipeline', '05_pipeline.png'],
    ['btn-memory', '06_memory.png'],
    ['btn-settings', '07_settings.png'],
    ['btn-plugin-market', '08_plugin.png'],
    ['btn-dashboard', '09_dashboard.png']
  ];
  for (const [txt, name] of targets) {
    const ok = await clickText(page, txt);
    console.log('OPEN', txt, ok);
    await sleep(700);
    await screenshot(page, name);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(400);
    await clickText(page, 'btn-outline-workspace');
    await sleep(400);
  }

  await browser.close();
  console.log('DONE');
}

main().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
