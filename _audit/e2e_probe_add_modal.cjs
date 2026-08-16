const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForTimeout(300);
  if (!(await page.locator('.pl-add-setting-modal').count())) {
    if (!(await page.locator('#pipeline-panel').count())) await page.locator('#btn-pipeline').click();
    await page.waitForSelector('#pipeline-panel');
    await page.locator('.pl-step').filter({ hasText: '设定' }).click();
    await page.locator('button').filter({ hasText: '+ 新增设定' }).click();
    await page.waitForSelector('.pl-add-setting-modal');
  }
  const probe = await page.evaluate(() => {
    const btn = document.querySelector('.pl-add-setting-modal button.btn-primary');
    const modal = document.querySelector('.pl-add-setting-modal');
    const overlay = document.querySelector('.pl-add-setting-overlay');
    const pipOverlay = document.querySelector('#pipeline-panel');
    const r1 = btn?.getBoundingClientRect();
    const r2 = modal?.getBoundingClientRect();
    const r3 = pipOverlay?.getBoundingClientRect();
    const at = r1 ? document.elementFromPoint(r1.x + r1.width / 2, r1.y + r1.height / 2) : null;
    return {
      btn: r1 ? { x: r1.x, y: r1.y, w: r1.width, h: r1.height } : null,
      modal: r2 ? { x: r2.x, y: r2.y, w: r2.width, h: r2.height } : null,
      pipOverlay: r3 ? { x: r3.x, y: r3.y, w: r3.width, h: r3.height } : null,
      z: {
        btn: getComputedStyle(btn).zIndex,
        modal: getComputedStyle(modal).zIndex,
        overlay: getComputedStyle(overlay).zIndex,
        pip: getComputedStyle(pipOverlay).zIndex,
        pipPos: getComputedStyle(pipOverlay).position
      },
      topEl: at ? { tag: at.tagName, cls: at.className, id: at.id, text: at.textContent.slice(0, 30) } : null,
      modalChildren: [...modal.querySelectorAll('*')].map(e => ({ tag: e.tagName, cls: typeof e.className === 'string' ? e.className : '', text: (e.textContent || '').trim().slice(0, 20) }))
    };
  });
  console.log(JSON.stringify(probe, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
