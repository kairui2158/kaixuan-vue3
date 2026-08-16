const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9227');
  const p = b.contexts()[0]?.pages()[0];
  const info = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.modal-overlay, .pl-overlay, .pl-add-setting-overlay, .ow-overlay, [class*="overlay"]').forEach(el => {
      const cs = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display !== 'none' && cs.visibility !== 'hidden') {
        out.push({ cls: String(el.className).slice(0, 80), z: cs.zIndex, pos: cs.position, w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent||'').trim().slice(0,60), parentCls: el.parentElement ? String(el.parentElement.className).slice(0,50) : '' });
      }
    });
    return { count: out.length, overlays: out, bodyClasses: document.body.className };
  });
  console.log(JSON.stringify(info, null, 1));
  await p.screenshot({ path: '_audit/screenshots/overlay_probe.png' });
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
