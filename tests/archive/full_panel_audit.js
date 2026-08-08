const { chromium } = require('playwright');
const fs = require('fs');
const dir = 'test_evidence/full_panels_' + Date.now();
fs.mkdirSync(dir, { recursive: true });

const log = [];
const rec = s => log.push('[' + new Date().toISOString() + '] ' + s);

async function shot(page, name) {
  try { await page.screenshot({ path: dir + '/' + name, timeout: 10000 }); rec('shot ' + name); }
  catch(e) { rec('shot FAIL ' + name + ': ' + e.message); }
}

async function measurePanel(page, sel) {
  return await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const kids = [...el.querySelectorAll('.card, .card-item, .setting-card, .panel-section, [class*=card], [class*=section]')].slice(0,20).map(c => {
      const cr = c.getBoundingClientRect();
      return { cls: String(c.className).slice(0,40), text: (c.textContent||'').trim().slice(0,30), w: Math.round(cr.width), h: Math.round(cr.height), vis: cr.width>0 };
    });
    const btns = [...el.querySelectorAll('button, [role=button]')].slice(0,30).map(b => {
      const br = b.getBoundingClientRect();
      return { id: b.id||'', text: (b.textContent||'').trim().slice(0,15), w: Math.round(br.width), h: Math.round(br.height), disabled: b.disabled, vis: br.width>0 };
    });
    const inputs = [...el.querySelectorAll('input, select, textarea')].slice(0,15).map(i => ({
      type: i.type, id: i.id||'', ph: i.placeholder||'', w: Math.round(i.getBoundingClientRect().width), disabled: i.disabled
    }));
    const spinners = el.querySelectorAll('[class*=spin], [class*=loading], .loader').length;
    return { found: true, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, overflow: cs.overflow, zIndex: cs.zIndex, childCount: el.children.length, kids, btns, inputs, spinners };
  }, sel);
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const page = browser.contexts()[0].pages()[0];
  rec('connected');

  // ===== 1. MAIN VIEW =====
  await page.waitForTimeout(500);
  await shot(page, '01_main.png');
  const mainLayout = await page.evaluate(() => {
    const pick = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, bg: cs.backgroundColor }; };
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      sidebar: pick('#app-sidebar'),
      chapterTree: pick('#chapter-tree-panel, #chapter-tree, .chapter-tree-panel'),
      editorPanel: pick('#editor-panel, .editor-panel'),
      editorContent: pick('#editor-content'),
      chatPanel: pick('#chat-panel, .chat-panel'),
      skillArea: pick('#skill-area, .skill-area, #skill-bar')
    };
  });
  rec('main layout: ' + JSON.stringify(mainLayout));

  // ===== 2. SETTINGS PANEL =====
  await page.evaluate(() => document.getElementById('btn-settings').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(2000);
  await shot(page, '02_settings.png');
  const settings = await measurePanel(page, '#settings-modal');
  rec('settings: ' + JSON.stringify(settings).slice(0, 500));

  // click through settings nav items
  const settingsNav = await page.evaluate(() => {
    const modal = document.getElementById('settings-modal');
    if (!modal) return [];
    return [...modal.querySelectorAll('.settings-nav-item, .tab, [data-section], [class*=nav-item]')].map(n => ({
      text: (n.textContent||'').trim().slice(0,15), cls: String(n.className).slice(0,40), id: n.id||'', ds: n.getAttribute('data-section')||''
    }));
  });
  rec('settings nav items: ' + JSON.stringify(settingsNav));

  // click each settings nav item and screenshot
  for (let i = 0; i < settingsNav.length; i++) {
    const nav = settingsNav[i];
    await page.evaluate((idx) => {
      const modal = document.getElementById('settings-modal');
      if (!modal) return;
      const items = [...modal.querySelectorAll('.settings-nav-item, .tab, [data-section], [class*=nav-item]')];
      if (items[idx]) items[idx].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, i);
    await page.waitForTimeout(800);
    await shot(page, '02_settings_nav_' + i + '_' + (nav.text || nav.ds || 'unk') + '.png');
  }

  // close settings
  await page.evaluate(() => {
    const closeBtn = document.querySelector('#settings-modal .close, #settings-modal [class*=close], #settings-close');
    if (closeBtn) closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    else document.getElementById('settings-modal').style.display = 'none';
  });
  await page.waitForTimeout(500);

  // ===== 3. PIPELINE PANEL =====
  await page.evaluate(() => document.getElementById('btn-pipeline').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(2000);
  await shot(page, '03_pipeline.png');
  const pipeline = await measurePanel(page, '#pipeline-panel');
  rec('pipeline: ' + JSON.stringify(pipeline).slice(0, 500));

  // close pipeline
  await page.evaluate(() => {
    const closeBtn = document.querySelector('#pipeline-panel .close, #pipeline-panel [class*=close]');
    if (closeBtn) closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    else document.getElementById('pipeline-panel').style.display = 'none';
  });
  await page.waitForTimeout(500);

  // ===== 4. OUTLINE WORKSPACE =====
  await page.evaluate(() => document.getElementById('btn-outline-workspace').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(2000);
  await shot(page, '04_outline.png');
  const outline = await measurePanel(page, '#outline-workspace');
  rec('outline: ' + JSON.stringify(outline).slice(0, 500));

  await page.evaluate(() => {
    const closeBtn = document.querySelector('#outline-workspace .close, #outline-workspace [class*=close]');
    if (closeBtn) closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    else document.getElementById('outline-workspace').style.display = 'none';
  });
  await page.waitForTimeout(500);

  // ===== 5. SETTINGS COLLECTION =====
  await page.evaluate(() => document.getElementById('btn-settings-collection').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(2000);
  await shot(page, '05_settings_collection.png');
  const sc = await measurePanel(page, '#settings-collection-panel');
  rec('settings collection: ' + JSON.stringify(sc).slice(0, 500));

  await page.evaluate(() => {
    const closeBtn = document.querySelector('#settings-collection-panel .close, #settings-collection-panel [class*=close]');
    if (closeBtn) closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    else document.getElementById('settings-collection-panel').style.display = 'none';
  });
  await page.waitForTimeout(500);

  // ===== 6. MEMORY PANEL =====
  await page.evaluate(() => document.getElementById('btn-memory').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(2000);
  await shot(page, '06_memory.png');
  const memory = await measurePanel(page, '#memory-panel');
  rec('memory: ' + JSON.stringify(memory).slice(0, 500));

  await page.evaluate(() => {
    const closeBtn = document.querySelector('#memory-panel .close, #memory-panel [class*=close]');
    if (closeBtn) closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    else document.getElementById('memory-panel').style.display = 'none';
  });
  await page.waitForTimeout(500);

  // ===== 7. PLUGIN MARKET =====
  await page.evaluate(() => document.getElementById('btn-plugin-market').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(2000);
  await shot(page, '07_plugin_market.png');
  const plugin = await measurePanel(page, '#plugin-market-modal');
  rec('plugin market: ' + JSON.stringify(plugin).slice(0, 500));

  await page.evaluate(() => {
    const closeBtn = document.querySelector('#plugin-market-modal .close, #plugin-market-modal [class*=close]');
    if (closeBtn) closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    else document.getElementById('plugin-market-modal').style.display = 'none';
  });
  await page.waitForTimeout(500);

  // ===== 8. DASHBOARD =====
  await page.evaluate(() => document.getElementById('btn-dashboard').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(2000);
  await shot(page, '08_dashboard.png');

  // ===== OUTPUT =====
  const report = { mainLayout, settings, settingsNav, pipeline, outline, sc, memory, plugin, log };
  fs.writeFileSync(dir + '/full_report.json', JSON.stringify(report, null, 2));
  fs.writeFileSync(dir + '/audit_log.txt', log.join('\n'));
  console.log('DIR=' + dir);
  console.log('SHOTS=' + log.filter(l => l.includes('shot ')).length);
  await browser.close();
})().catch(e => { console.error('ERR', e.message); fs.writeFileSync(dir + '/error.txt', e.stack); process.exit(1); });
