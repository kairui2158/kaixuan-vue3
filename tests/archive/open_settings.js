const { chromium } = require('playwright');
const fs = require('fs');
const dir = 'test_evidence/ps_' + Date.now();
fs.mkdirSync(dir, { recursive: true });

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForTimeout(300);

  // click settings button by ID
  await page.click('#btn-settings', { timeout: 3000 }).catch(e => console.log('click err:', e.message));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: dir + '/settings_open.png' });

  const panel = await page.evaluate(() => {
    const el = document.querySelector('#settings-modal, .modal.show, #settings-panel, [class*=settings-modal]');
    if (!el) return { found: false, openModals: [...document.querySelectorAll('.modal')].map(m=>({id:m.id,cls:String(m.className).slice(0,40),display:getComputedStyle(m).display})) };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const kids = [...el.querySelectorAll('.settings-section, .setting-card, .card, .nav, .tab, [class*=section], [class*=card]')].slice(0,15).map(c => {
      const cr = c.getBoundingClientRect();
      return { cls: String(c.className).slice(0,40), text: (c.textContent||'').trim().slice(0,30), w: Math.round(cr.width), h: Math.round(cr.height) };
    });
    const btns = [...el.querySelectorAll('button')].slice(0,30).map(b => {
      const br = b.getBoundingClientRect();
      return { id: b.id||'', text: (b.textContent||'').trim().slice(0,15), w: Math.round(br.width), h: Math.round(br.height), disabled: b.disabled };
    });
    return { found: true, sel: el.id||String(el.className).slice(0,30), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, children: kids, buttons: btns };
  });
  console.log('SETTINGS:', JSON.stringify(panel, null, 1));
  fs.writeFileSync(dir + '/report.json', JSON.stringify(panel, null, 2));
  console.log('DIR=' + dir);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
