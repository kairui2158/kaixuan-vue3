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

async function getComputedStyles(page, selector) {
  return await page.evaluate((sel) => {
    const els = document.querySelectorAll(sel);
    if (!els.length) return null;
    const el = els[0];
    const s = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      cls: el.className,
      tag: el.tagName,
      visible: r.width > 0 && r.height > 0,
      bg: s.backgroundColor,
      color: s.color,
      border: s.border,
      borderRadius: s.borderRadius,
      boxShadow: s.boxShadow,
      padding: s.padding,
      margin: s.margin,
      display: s.display,
      flexDirection: s.flexDirection,
      justifyContent: s.justifyContent,
      alignItems: s.alignItems,
      gap: s.gap,
      width: r.width,
      height: r.height,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      childCount: el.children.length,
      innerHTML: el.innerHTML.substring(0, 200)
    };
  }, selector);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  // 1. Main page
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await shot(page, '01_main');

  // Collect main page styles
  const mainStyles = {};
  for (const sel of ['.app-container', '.app-header', '.sidebar-nav', '.sidebar-btn', '.editor-panel', '.chat-panel', '.statusbar', '.chapter-tree', '.breadcrumb-bar']) {
    mainStyles[sel] = await getComputedStyles(page, sel);
  }
  results.mainStyles = mainStyles;

  // 2. Click settings nav button (4th sidebar button based on rendered classes)
  const navButtons = await page.$$('.sidebar-btn');
  console.log('[INFO] Found ' + navButtons.length + ' sidebar buttons');

  // Try clicking each sidebar button to find settings
  for (let i = 0; i < navButtons.length; i++) {
    const title = await navButtons[i].getAttribute('title');
    const text = await navButtons[i].textContent();
    console.log('[INFO] btn[' + i + '] title=' + title + ' text=' + text);
  }

  // Click settings (should be one of the buttons)
  // Based on App.vue, the nav items are: pipeline, settings, outline, settings-collection, memory, plugin-market, dashboard
  // Let's try clicking by title or index
  try {
    // Try to find settings button
    let settingsBtn = null;
    for (const btn of navButtons) {
      const title = await btn.getAttribute('title');
      if (title && (title.includes('\u8bbe\u7f6e') || title.toLowerCase().includes('setting'))) {
        settingsBtn = btn;
        break;
      }
    }
    // Fallback: click 2nd button (settings is typically 2nd in nav)
    if (!settingsBtn && navButtons.length >= 2) {
      settingsBtn = navButtons[1];
    }
    if (settingsBtn) {
      await settingsBtn.click();
      await page.waitForTimeout(1500);
      await shot(page, '02_settings');

      // Collect settings modal styles
      const settingsStyles = {};
      for (const sel of ['.settings-modal', '.modal-overlay', '.modal-content', '.settings-tabs', '.settings-tab', '.tab-content', '.form-actions', '.btn-primary', '.btn-save']) {
        settingsStyles[sel] = await getComputedStyles(page, sel);
      }
      results.settingsStyles = settingsStyles;

      // Try clicking API tab
      const tabs = await page.$$('.settings-tab, .tab-btn, [class*="tab"]');
      console.log('[INFO] Found ' + tabs.length + ' tab elements in settings');
      for (let i = 0; i < Math.min(tabs.length, 8); i++) {
        const text = await tabs[i].textContent();
        console.log('[INFO] tab[' + i + '] = ' + text.trim().substring(0, 20));
      }

      // Click through tabs
      const tabTexts = ['API', '\u6280\u80fd', '\u667a\u80fd\u4f53', '\u5916\u89c2', '\u53bbAI', '\u8bca\u65ad'];
      for (const tabText of tabTexts) {
        try {
          const tab = await page.$('button:has-text("' + tabText + '"), .settings-tab:has-text("' + tabText + '"), [class*="tab"]:has-text("' + tabText + '")');
          if (tab) {
            await tab.click();
            await page.waitForTimeout(1000);
            const safeName = tabText.replace(/[^a-zA-Z0-9]/g, '_');
            await shot(page, '03_settings_' + safeName);

            // If deai tab, collect deai styles
            if (tabText.includes('AI') || tabText.includes('ai')) {
              const deaiStyles = {};
              for (const sel of ['.deai-mode-card', '.mode-card', '.deai-skill-selector', '.deai-flow-preview', '.deai-btn-label', '.hardrule-item', '.hardrule-toggle']) {
                deaiStyles[sel] = await getComputedStyles(page, sel);
              }
              results.deaiStyles = deaiStyles;
            }
          }
        } catch(e) {
          console.log('[WARN] Tab ' + tabText + ': ' + e.message);
        }
      }
    }
  } catch(e) {
    console.log('[WARN] Settings: ' + e.message);
  }

  // 3. Go back to main, click pipeline
  try {
    // Close settings first by clicking backdrop or close button
    const closeBtn = await page.$('.modal-close, [class*="close"], button:has-text("\u5173\u95ed")');
    if (closeBtn) { await closeBtn.click(); await page.waitForTimeout(500); }
    else { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }

    // Click pipeline button (1st sidebar button)
    if (navButtons.length >= 1) {
      await navButtons[0].click();
      await page.waitForTimeout(1500);
      await shot(page, '04_pipeline');

      const pipelineStyles = {};
      for (const sel of ['.pipeline-panel', '.pl-vol-card', '.pl-vol-card-header', '.pl-tools-section', '.pl-tools-grid', '.step-name', '.pl-step']) {
        pipelineStyles[sel] = await getComputedStyles(page, sel);
      }
      results.pipelineStyles = pipelineStyles;
    }
  } catch(e) {
    console.log('[WARN] Pipeline: ' + e.message);
  }

  // Collect all rendered classes
  const allClasses = await page.evaluate(() => {
    const classes = new Set();
    document.querySelectorAll('*').forEach(el => {
      if (el.className && typeof el.className === 'string') {
        el.className.split(/\s+/).forEach(c => { if (c.trim()) classes.add(c.trim()); });
      }
    });
    return Array.from(classes).sort();
  });
  results.allRenderedClasses = allClasses;

  // Collect CSS variable values from :root
  const cssVars = await page.evaluate(() => {
    const root = document.documentElement;
    const s = window.getComputedStyle(root);
    const vars = {};
    // Common patterns
    const prefixes = ['--bg', '--text', '--border', '--accent', '--shadow', '--font', '--spacing', '--radius', '--btn', '--modal', '--card', '--sidebar', '--editor', '--chat', '--deai', '--pipeline'];
    for (let i = 0; i < s.length; i++) {
      const prop = s[i];
      if (prop.startsWith('--')) {
        vars[prop] = s.getPropertyValue(prop).trim();
      }
    }
    return vars;
  });
  results.cssVars = cssVars;

  results.errors = errors;

  fs.writeFileSync(path.join(__dirname, 'screenshot2_results.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('[DONE] Results saved');
  console.log('[INFO] CSS vars count: ' + Object.keys(cssVars).length);
  console.log('[INFO] Rendered classes: ' + allClasses.length);
  console.log('[INFO] Errors: ' + errors.length);

  await browser.close();
})().catch(e => { console.error('[ERR] ' + e.message); console.error(e.stack); process.exit(1); });
