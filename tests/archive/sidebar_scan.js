const { chromium } = require('playwright');
const fs = require('fs');
const dir = 'test_evidence/sb_' + Date.now();
fs.mkdirSync(dir, { recursive: true });

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const out = [];
    const sidebar = document.querySelector('#app-sidebar, .app-sidebar, .sidebar, nav.sidebar');
    if (!sidebar) return { error: 'no sidebar', all: [...document.querySelectorAll('nav, aside, [class*=side]')].map(e=>({id:e.id,cls:String(e.className).slice(0,40),w:Math.round(e.getBoundingClientRect().width)})) };
    for (const b of sidebar.querySelectorAll('*')) {
      const r = b.getBoundingClientRect();
      if (r.width === 0) continue;
      const cs = getComputedStyle(b);
      if (cs.cursor === 'pointer' || b.tagName === 'BUTTON' || b.getAttribute('role') === 'button') {
        out.push({ tag: b.tagName, id: b.id||'', cls: String(b.className).slice(0,40), text: (b.textContent||'').trim().slice(0,15), title: b.title||'', dv: b.getAttribute('data-view')||'', w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  fs.writeFileSync(dir + '/sidebar.json', JSON.stringify(info, null, 2));
  console.log('DIR=' + dir);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
