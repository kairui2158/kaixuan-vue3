const { chromium } = require('playwright');
const fs = require('fs');
const dir = 'test_evidence/panel_settings_' + Date.now();
fs.mkdirSync(dir, { recursive: true });

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForTimeout(500);

  // find settings button in sidebar
  const info = await page.evaluate(() => {
    const out = { sidebarBtns: [], navItems: [] };
    const sidebar = document.querySelector('#app-sidebar, .app-sidebar, .sidebar');
    if (sidebar) {
      [...sidebar.querySelectorAll('button, [role=button], .nav-item, .sidebar-item, [class*=nav]')].forEach(b => {
        const r = b.getBoundingClientRect();
        if (r.width === 0) return;
        out.sidebarBtns.push({ tag: b.tagName, id: b.id, cls: b.className.slice(0,50), text: (b.textContent||'').trim().slice(0,20), title: b.title||'', w: Math.round(r.width), h: Math.round(r.height) });
      });
    }
    // also list all elements with data-view / data-panel attrs
    document.querySelectorAll('[data-view], [data-panel], [data-action]').forEach(b => {
      const r = b.getBoundingClientRect();
      out.navItems.push({ tag: b.tagName, cls: b.className.slice(0,40), text: (b.textContent||'').trim().slice(0,20), attrs: b.getAttributeNames().map(n=>n+'='+b.getAttribute(n)).join(' '), w: Math.round(r.width) });
    });
    return out;
  });
  console.log('SIDEBAR_BTNS:', JSON.stringify(info.sidebarBtns, null, 1));
  console.log('NAV_ITEMS:', JSON.stringify(info.navItems.slice(0,30), null, 1));

  await page.screenshot({ path: dir + '/01_before_click.png' });

  // try to open settings - look for button with text or title containing 设置/setting
  const clicked = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('button, .nav-item, .sidebar-item, [data-view]')];
    for (const b of cands) {
      const t = (b.textContent || '') + (b.title || '') + (b.getAttribute('data-view') || '');
      if (/设置|setting|api|供应商/i.test(t)) {
        const r = b.getBoundingClientRect();
        if (r.width === 0) continue;
        b.click();
        return { found: true, text: (b.textContent||'').trim().slice(0,30), cls: b.className.slice(0,40) };
      }
    }
    return { found: false };
  });
  console.log('CLICK_RESULT:', JSON.stringify(clicked));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: dir + '/02_settings_opened.png' });

  // measure settings panel internal structure
  const panel = await page.evaluate(() => {
    const sel = '#settings-panel, .settings-panel, [class*=settings-panel], #settings-modal, .modal.show, .modal[style*=flex]';
    const el = document.querySelector(sel);
    if (!el) return { found: false, sel };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // list direct children cards
    const cards = [...el.querySelectorAll('.card, .card-item, .setting-card, .settings-card, .provider-card, [class*=card]')].map(c => {
      const cr = c.getBoundingClientRect();
      return { cls: c.className.slice(0,40), text: (c.textContent||'').trim().slice(0,40), w: Math.round(cr.width), h: Math.round(cr.height), visible: cr.width > 0 };
    });
    const btns = [...el.querySelectorAll('button, [role=button]')].map(b => {
      const br = b.getBoundingClientRect();
      return { text: (b.textContent||'').trim().slice(0,20), id: b.id, w: Math.round(br.width), h: Math.round(br.height), disabled: b.disabled };
    });
    return { found: true, sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, overflow: cs.overflow, cards: cards.slice(0,20), buttons: btns.slice(0,25) };
  });
  console.log('SETTINGS_PANEL:', JSON.stringify(panel, null, 1));

  fs.writeFileSync(dir + '/report.json', JSON.stringify({ info, clicked, panel }, null, 2));
  console.log('DIR=' + dir);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
