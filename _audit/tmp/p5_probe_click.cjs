const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];

  const before = await page.evaluate(() => {
    const btn = document.querySelector('#btn-outline-workspace');
    return btn ? { rect: btn.getBoundingClientRect().toJSON(), display: getComputedStyle(btn).display, visible: btn.offsetParent !== null, text: (btn.textContent || '').trim() } : null;
  });
  console.log('BEFORE:', JSON.stringify(before));

  await page.click('#btn-outline-workspace', { force: true });
  await page.waitForTimeout(1200);

  const after = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id).filter((id) => /outline|workspace|editor/i.test(id));
    const ws = document.querySelector('#outline-workspace');
    const editor = document.querySelector('#outline-editor');
    const locked = window.__pinia?._s.get('project')?.outlineLocked;
    const step = window.__pinia?._s.get('pipeline')?.currentStep;
    return { ids, ws: ws ? { display: getComputedStyle(ws).display, rect: ws.getBoundingClientRect().toJSON() } : null, editor: !!editor, locked, step };
  });
  console.log('AFTER:', JSON.stringify(after, null, 2));
  await browser.close();
}

main().catch((e) => { console.error('ERROR:' + (e.stack || e.message)); process.exit(1); });
