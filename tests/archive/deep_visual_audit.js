const { chromium } = require('playwright');
const fs = require('fs');

const ts = () => new Date().toISOString().replace(/[:.]/g, '-');
const stamp = ts();
const dir = 'test_evidence/deep_audit_' + stamp;
fs.mkdirSync(dir, { recursive: true });

const log = [];
const rec = (s) => { log.push('[' + new Date().toISOString() + '] ' + s); };

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  rec('connected to CDP 9223');
  await page.waitForTimeout(800);

  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }));
  rec('viewport: ' + JSON.stringify(vp));
  const issues = [];

  // 1) main view screenshot + measure layout regions
  await page.screenshot({ path: dir + '/00_main.png' });
  rec('shot 00_main.png');

  const layout = await page.evaluate(() => {
    const r = {};
    const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), display: cs.display, vis: cs.visibility, overflow: cs.overflow, bg: cs.backgroundColor }; };
    r.sidebar = pick('#app-sidebar, .app-sidebar, .sidebar, [class*=sidebar]');
    r.chapterTree = pick('#chapter-tree, .chapter-tree, [class*=chapter-tree]');
    r.editorPanel = pick('#editor-panel, .editor-panel, #main-editor, .main-editor');
    r.editorContent = pick('#editor-content, .editor-content, textarea');
    r.chatPanel = pick('#chat-panel, .chat-panel, .chat, [class*=chat]');
    r.skillBar = pick('#skill-bar, .skill-bar, [class*=skill-bar], #skill-area, .skill-area');
    // total visible widths
    r.vw = window.innerWidth; r.vh = window.innerHeight;
    return r;
  });
  rec('layout regions: ' + JSON.stringify(layout));
  issues.push({ cat: 'LAYOUT', detail: layout });

  // 2) detect large empty gaps by scanning top-level flex/grid children
  const gaps = await page.evaluate(() => {
    const out = [];
    const hosts = ['#app-root', '.app-root', '#main-container', '.main-container', 'body > *'];
    for (const sel of hosts) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (!/flex|grid/.test(cs.display)) continue;
      const kids = [...el.children].filter(k => k.getBoundingClientRect().width > 0);
      const rects = kids.map(k => k.getBoundingClientRect());
      // sum widths vs container width
      const cw = el.getBoundingClientRect().width;
      const used = rects.reduce((a, b) => a + b.width, 0);
      out.push({ sel, containerW: Math.round(cw), usedW: Math.round(used), gap: Math.round(cw - used), kids: rects.length, display: cs.display, flexDirection: cs.flexDirection });
    }
    return out;
  });
  rec('gap scan: ' + JSON.stringify(gaps));
  issues.push({ cat: 'GAPS', detail: gaps });

  // 3) zero-size / tiny buttons across whole DOM
  const tinyBtns = await page.evaluate(() => {
    const out = [];
    const all = document.querySelectorAll('button, [class*=btn], [role=button], .icon-btn, .icon-button, [data-action]');
    let i = 0;
    for (const el of all) {
      if (i++ > 600) break;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        out.push({ tag: el.tagName, id: el.id || '', cls: el.className.slice(0, 60), text: (el.textContent || '').trim().slice(0, 20), parent: el.parentElement ? (el.parentElement.id || el.parentElement.className.slice(0, 40)) : '' });
      } else if (r.width < 20 && r.height < 20 && el.tagName === 'BUTTON') {
        out.push({ tag: el.tagName, id: el.id || '', cls: el.className.slice(0, 60), text: (el.textContent || '').trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height), parent: el.parentElement ? (el.parentElement.id || el.parentElement.className.slice(0, 40)) : '' });
      }
    }
    return out;
  });
  rec('tiny/zero buttons: ' + tinyBtns.length);
  issues.push({ cat: 'TINY_BTN', count: tinyBtns.length, sample: tinyBtns.slice(0, 15) });

  // 4) color contrast sampling on text
  const contrast = await page.evaluate(() => {
    const out = [];
    const sample = document.querySelectorAll('h1, h2, h3, .card-title, .panel-title, .tab-label, .sidebar-item, label, .btn, button');
    let i = 0;
    for (const el of sample) {
      if (i++ > 40) break;
      const cs = getComputedStyle(el);
      const fg = cs.color; const bg = el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : cs.backgroundColor;
      out.push({ tag: el.tagName, text: (el.textContent || '').trim().slice(0, 25), fg, bg, fontSize: cs.fontSize });
    }
    return out;
  });
  rec('contrast sample: ' + contrast.length);
  issues.push({ cat: 'CONTRAST', detail: contrast });

  // 5) spacing token diversity — count distinct padding values
  const spacing = await page.evaluate(() => {
    const counts = {};
    const els = document.querySelectorAll('.card, .card-item, .panel-body, .modal-body, .form-group, .btn, button, input, .list-item, [class*=item]');
    let i = 0;
    for (const el of els) {
      if (i++ > 400) break;
      const p = getComputedStyle(el).padding;
      counts[p] = (counts[p] || 0) + 1;
    }
    return counts;
  });
  rec('spacing diversity: ' + JSON.stringify(spacing));
  issues.push({ cat: 'SPACING', detail: spacing });

  // 6) scrollbar visibility
  const scroll = await page.evaluate(() => {
    const out = [];
    const els = document.querySelectorAll('.panel-body, .modal-body, .list, .chapter-list, .messages-container, [class*=scroll]');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      out.push({ sel: (el.id || el.className.slice(0, 30)), scrollH: el.scrollHeight, clientH: el.clientHeight, overflow: getComputedStyle(el).overflowY, w: Math.round(r.width), h: Math.round(r.height) });
    }
    return out;
  });
  rec('scrollable regions: ' + scroll.length);
  issues.push({ cat: 'SCROLL', detail: scroll });

  fs.writeFileSync(dir + '/audit_report.json', JSON.stringify({ viewport: vp, layout, gaps, tinyBtns: tinyBtns.length, contrast, spacing, scroll, issues }, null, 2));
  fs.writeFileSync(dir + '/audit_log.txt', log.join('\n'));
  console.log('DIR=' + dir);
  console.log('TINY_BTN=' + tinyBtns.length);
  console.log('GAPS=' + JSON.stringify(gaps));
  console.log('SPACING_TOKENS=' + Object.keys(spacing).length);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
