const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForSelector('#app', { timeout: 15000 }).catch(() => {});

  const ids = ['pl-s1-mode', 'pl-s2-mode', 'pl-s3-mode', 'pl-s4-mode', 'pl-s5-mode'];

  async function snap(label) {
    const data = await page.evaluate((modeIds) => {
      function info(id) {
        const el = document.getElementById(id);
        if (!el) return { id, found: false };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        let hiddenBy = null;
        let cur = el.parentElement;
        let depth = 0;
        while (cur && cur !== document.body && depth < 16) {
          const c = getComputedStyle(cur);
          if (c.display === 'none' || c.visibility === 'hidden') {
            hiddenBy = {
              tag: cur.tagName,
              id: cur.id || '',
              cls: String(cur.className || '').slice(0, 90),
              display: c.display,
              visibility: c.visibility
            };
            break;
          }
          cur = cur.parentElement;
          depth += 1;
        }
        return {
          id,
          found: true,
          visible: !!(r.width || r.height),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          display: cs.display,
          visibility: cs.visibility,
          offsetParent: !!el.offsetParent,
          hiddenBy
        };
      }

      const btn = document.querySelector('#btn-pipeline');
      const panel = document.querySelector('.pipeline-panel, #pipeline-panel');
      const pr = panel ? panel.getBoundingClientRect() : null;
      const pcs = panel ? getComputedStyle(panel) : null;
      return {
        url: location.href,
        button: btn
          ? {
              rect: [
                Math.round(btn.getBoundingClientRect().x),
                Math.round(btn.getBoundingClientRect().y),
                Math.round(btn.getBoundingClientRect().width),
                Math.round(btn.getBoundingClientRect().height)
              ]
            }
          : null,
        panel: panel
          ? {
              id: panel.id || '',
              cls: String(panel.className || '').slice(0, 100),
              rect: [Math.round(pr.x), Math.round(pr.y), Math.round(pr.width), Math.round(pr.height)],
              display: pcs.display,
              visibility: pcs.visibility
            }
          : null,
        selects: modeIds.map(info)
      };
    }, ids);
    console.log('=== ' + label + ' ===');
    console.log(JSON.stringify(data, null, 2));
  }

  await snap('before');
  const btn = await page.$('#btn-pipeline');
  if (btn) {
    await btn.click();
    await page.waitForTimeout(1000);
    await snap('after-click');
  }
  await page.screenshot({
    path: path.join(__dirname, '..', 'screenshots', 'phaseB_probe.png'),
    fullPage: true
  });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
