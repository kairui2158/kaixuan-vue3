const { chromium } = require('playwright');
const fs = require('fs');
const dir = 'test_evidence/ps2_' + Date.now();
fs.mkdirSync(dir, { recursive: true });

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForTimeout(300);
  // use evaluate to dispatch click synchronously, then immediately read state
  const result = await page.evaluate(() => {
    const btn = document.querySelector('#btn-settings');
    if (!btn) return { error: 'no btn' };
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { clicked: true };
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: dir + '/settings.png' });
  const panel = await page.evaluate(() => {
    const el = document.querySelector('#settings-modal');
    if (!el) return { found: false, modals: [...document.querySelectorAll('.modal')].map(m=>({id:m.id,display:getComputedStyle(m).display,w:Math.round(m.getBoundingClientRect().width)})) };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const sections = [...el.querySelectorAll('.settings-section, .settings-nav-item, .tab, [class*=section], [class*=nav-item]')].slice(0,20).map(c => {
      const cr = c.getBoundingClientRect();
      return { cls: String(c.className).slice(0,45), text: (c.textContent||'').trim().slice(0,25), w: Math.round(cr.width), h: Math.round(cr.height), vis: cr.width>0 };
    });
    return { found: true, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, sections };
  });
  console.log('SETTINGS:', JSON.stringify(panel, null, 1));
  fs.writeFileSync(dir + '/report.json', JSON.stringify(panel, null, 2));
  console.log('DIR=' + dir);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
