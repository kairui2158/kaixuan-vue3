const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5174';
const results = {};

async function shot(page, name) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  const size = fs.statSync(file).size;
  results[name] = { file, size, ok: size > 1000 };
  console.log('[OK] ' + name + ' -> ' + size + ' bytes');
}

async function getDomInfo(page, selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const styles = window.getComputedStyle(el);
    return {
      tag: el.tagName,
      cls: el.className,
      visible: rect.width > 0 && rect.height > 0,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      bg: styles.backgroundColor,
      color: styles.color,
      borderRadius: styles.borderRadius,
      padding: styles.padding,
      margin: styles.margin,
      border: styles.border,
      boxShadow: styles.boxShadow,
      display: styles.display,
      fontSize: styles.fontSize,
      childCount: el.children.length
    };
  }, selector);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 1. Main page
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await shot(page, '01_main');

  // Collect DOM info for key elements
  const domInfo = {};
  const selectors = [
    '.app-layout', '#app', '.sidebar', '.sidebar-nav', '.sidebar-icon',
    '.editor-panel', '.chat-panel', '.pipeline-panel',
    '.card', '.mode-card', '.deai-mode-card',
    '.btn-primary', '.form-actions',
    '.settings-modal', '.modal-overlay', '.modal-content',
    '.provider-card', '.skill-card',
    '.deai-btn-label', '.step-name', '.pl-tools-section', '.pl-tools-grid',
    '.pl-vol-card', '.pl-vol-card-header',
    '.sc-editor', '.sc-panel'
  ];
  for (const sel of selectors) {
    domInfo[sel] = await getDomInfo(page, sel);
  }
  results.domInfo = domInfo;

  // 2. Try opening settings modal
  try {
    // Click settings button if exists
    const settingsBtn = await page.$('[class*="setting"], [data-action="settings"], #btn-settings, .nav-item-settings, button:has-text("\u8bbe\u7f6e")');
    if (settingsBtn) {
      await settingsBtn.click();
      await page.waitForTimeout(1500);
      await shot(page, '02_settings_modal');

      // Try clicking API tab
      const apiTab = await page.$('[class*="api"], [data-tab="api"], button:has-text("API")');
      if (apiTab) {
        await apiTab.click();
        await page.waitForTimeout(1000);
        await shot(page, '03_settings_api');
      }

      // Try clicking skill tab
      const skillTab = await page.$('[class*="skill"], [data-tab="skill"], button:has-text("\u6280\u80fd")');
      if (skillTab) {
        await skillTab.click();
        await page.waitForTimeout(1000);
        await shot(page, '04_settings_skill');
      }

      // Try clicking deai tab
      const deaiTab = await page.$('[class*="deai"], [data-tab="deai"], button:has-text("\u53bbAI")');
      if (deaiTab) {
        await deaiTab.click();
        await page.waitForTimeout(1000);
        await shot(page, '05_settings_deai');
      }

      // Try clicking appearance tab
      const appearanceTab = await page.$('[class*="appearance"], [data-tab="appearance"], button:has-text("\u5916\u89c2")');
      if (appearanceTab) {
        await appearanceTab.click();
        await page.waitForTimeout(1000);
        await shot(page, '06_settings_appearance');
      }
    } else {
      console.log('[WARN] No settings button found');
    }
  } catch(e) {
    console.log('[WARN] Settings modal interaction: ' + e.message);
  }

  // 3. Try pipeline panel
  try {
    const pipelineBtn = await page.$('[class*="pipeline"], [data-action="pipeline"], button:has-text("\u6d41\u6c34\u7ebf")');
    if (pipelineBtn) {
      await pipelineBtn.click();
      await page.waitForTimeout(1500);
      await shot(page, '07_pipeline');
    }
  } catch(e) {
    console.log('[WARN] Pipeline: ' + e.message);
  }

  // Collect all CSS classes actually rendered
  const allClasses = await page.evaluate(() => {
    const classes = new Set();
    document.querySelectorAll('*').forEach(el => {
      if (el.className && typeof el.className === 'string') {
        el.className.split(/\s+/).forEach(c => { if (c.trim()) classes.add(c.trim()); });
      }
    });
    return Array.from(classes).sort();
  });
  results.renderedClasses = allClasses;

  // Collect computed styles for first card-like element
  const cardStyles = await page.evaluate(() => {
    const cards = document.querySelectorAll('.card, .mode-card, .deai-mode-card, .provider-card, .skill-card, .pl-vol-card');
    const out = [];
    cards.forEach((el, i) => {
      if (i >= 5) return;
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out.push({
        cls: el.className,
        bg: s.backgroundColor,
        border: s.border,
        borderRadius: s.borderRadius,
        boxShadow: s.boxShadow,
        padding: s.padding,
        margin: s.margin,
        w: r.width,
        h: r.height
      });
    });
    return out;
  });
  results.cardStyles = cardStyles;

  // Collect button styles
  const btnStyles = await page.evaluate(() => {
    const btns = document.querySelectorAll('.btn-primary, .form-actions button, button');
    const out = [];
    btns.forEach((el, i) => {
      if (i >= 10) return;
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out.push({
        cls: el.className,
        text: el.textContent.trim().substring(0, 30),
        bg: s.backgroundColor,
        color: s.color,
        border: s.border,
        borderRadius: s.borderRadius,
        padding: s.padding,
        w: r.width,
        h: r.height,
        fontSize: s.fontSize
      });
    });
    return out;
  });
  results.btnStyles = btnStyles;

  // Collect modal styles if visible
  const modalStyles = await page.evaluate(() => {
    const modals = document.querySelectorAll('.modal-overlay, .modal-content, .settings-modal, [class*="modal"]');
    const out = [];
    modals.forEach((el, i) => {
      if (i >= 5) return;
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out.push({
        cls: el.className,
        display: s.display,
        bg: s.backgroundColor,
        backdropFilter: s.backdropFilter,
        w: r.width,
        h: r.height,
        borderRadius: s.borderRadius,
        padding: s.padding
      });
    });
    return out;
  });
  results.modalStyles = modalStyles;

  // Write results
  fs.writeFileSync(
    path.join(__dirname, 'screenshot_results.json'),
    JSON.stringify(results, null, 2),
    'utf8'
  );
  console.log('[DONE] Results saved to screenshot_results.json');

  await browser.close();
})().catch(e => {
  console.error('[ERR] ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
