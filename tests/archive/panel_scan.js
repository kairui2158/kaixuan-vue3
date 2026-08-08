const { chromium } = require('playwright');
const fs = require('fs');
const dir = 'test_evidence/pnl_' + Date.now();
fs.mkdirSync(dir, { recursive: true });

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const page = browser.contexts()[0].pages()[0];

  // snapshot all panels at once WITHOUT clicking - read their current CSS state
  const allPanels = await page.evaluate(() => {
    const panelIds = ['settings-modal','pipeline-panel','memory-panel','outline-workspace','settings-collection-panel','plugin-market-modal','settings-panel'];
    const out = {};
    for (const id of panelIds) {
      const el = document.getElementById(id);
      if (!el) { out[id] = { exists: false }; continue; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[id] = {
        exists: true, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        display: cs.display, visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex,
        position: cs.position, overflow: cs.overflow,
        childCount: el.children.length,
        hasContent: el.innerHTML.length > 100,
        // detect spinners / loading
        spinners: el.querySelectorAll('.spinner, .loading, [class*=spin], [class*=loading]').length
      };
    }
    // also find ALL elements with position:fixed and inset:0 (full-screen takeover candidates)
    const fixedFull = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && (cs.inset === '0px' || el.style.inset === '0')) {
        const r = el.getBoundingClientRect();
        if (r.width > 500) fixedFull.push({ id: el.id||'', cls: String(el.className).slice(0,30), w: Math.round(r.width), h: Math.round(r.height), display: cs.display });
      }
    }
    out._fixedFullscreen = fixedFull;
    return out;
  });
  console.log('PANELS:', JSON.stringify(allPanels, null, 1));

  // now screenshot main view
  await page.screenshot({ path: dir + '/main.png' });

  // dispatch click on settings, then IMMEDIATELY evaluate (no waitForTimeout)
  await page.evaluate(() => { document.getElementById('btn-settings').dispatchEvent(new MouseEvent('click',{bubbles:true})); });
  const settingsState = await page.evaluate(() => {
    const el = document.getElementById('settings-modal');
    if (!el) return { error: 'no modal' };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const nav = [...el.querySelectorAll('.settings-nav-item, .tab, [class*=nav-item], [data-section]')].map(n => ({
      text: (n.textContent||'').trim().slice(0,15), cls: String(n.className).slice(0,40), w: Math.round(n.getBoundingClientRect().width), active: String(n.className).includes('active')
    }));
    const cards = [...el.querySelectorAll('.setting-card, .card, [class*=card]')].slice(0,10).map(c => {
      const cr = c.getBoundingClientRect();
      return { text: (c.textContent||'').trim().slice(0,40), w: Math.round(cr.width), h: Math.round(cr.height), vis: cr.width>0 };
    });
    const inputs = [...el.querySelectorAll('input, select, textarea')].slice(0,15).map(i => ({
      type: i.type, id: i.id||'', ph: i.placeholder||'', val: (i.value||'').slice(0,20), w: Math.round(i.getBoundingClientRect().width), disabled: i.disabled
    }));
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, nav, cards, inputs, spinnerCount: el.querySelectorAll('[class*=spin],[class*=loading]').length };
  });
  await page.screenshot({ path: dir + '/settings.png' });
  console.log('SETTINGS_OPEN:', JSON.stringify(settingsState, null, 1));

  // close settings
  await page.evaluate(() => {
    const closeBtn = document.querySelector('#settings-modal .close, #settings-modal [class*=close], #settings-close');
    if (closeBtn) closeBtn.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    else document.getElementById('settings-modal').style.display = 'none';
  });

  fs.writeFileSync(dir + '/report.json', JSON.stringify({ allPanels, settingsState }, null, 2));
  console.log('DIR=' + dir);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
