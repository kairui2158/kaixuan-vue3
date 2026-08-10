const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check if missing CSS classes now have real styles
  const result = await page.evaluate(() => {
    const classes = ['dashboard-card','stat-card','provider-card-add','provider-card-header','provider-card-models','btn-send','btn-var','dashboard-card-title','dashboard-card-value','chapter-overview-header','pl-toggle-btn','form-actions','btn-primary','btn-secondary','modal-overlay','modal-content'];
    const report = {};
    for (const cls of classes) {
      const el = document.createElement('div');
      el.className = cls;
      document.body.appendChild(el);
      const cs = window.getComputedStyle(el);
      report[cls] = {
        display: cs.display,
        bg: cs.backgroundColor,
        border: cs.border,
        borderRadius: cs.borderRadius
      };
      el.remove();
    }
    return report;
  });
  console.log('CSS CLASS VERIFICATION:');
  console.log(JSON.stringify(result, null, 2));

  // Take main page screenshot
  await page.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/css_verify_1_main.png', fullPage: false });
  console.log('Screenshot 1 saved');

  // Try to open settings modal
  try {
    const settingsBtn = await page.$('button:has-text("设置"), [class*=setting], [class*=Settings], .sidebar-icon:last-child');
    if (settingsBtn) {
      await settingsBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/css_verify_2_settings.png', fullPage: false });
      console.log('Screenshot 2 (settings) saved');
    } else {
      // Try clicking sidebar icons
      const icons = await page.$$('.sidebar-icon');
      console.log('Found sidebar icons:', icons.length);
      if (icons.length > 0) {
        await icons[icons.length - 1].click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/css_verify_2_settings.png', fullPage: false });
        console.log('Screenshot 2 (settings via icon) saved');
      }
    }
  } catch(e) {
    console.log('Settings open failed:', e.message);
  }

  // Check app mount status
  const mountInfo = await page.evaluate(() => {
    const app = document.querySelector('#app');
    return {
      appExists: !!app,
      appChildCount: app ? app.children.length : 0,
      bodyChildCount: document.body.children.length,
      bodyHTMLLength: document.body.innerHTML.length
    };
  });
  console.log('MOUNT INFO:', JSON.stringify(mountInfo, null, 2));

  await browser.close();
  console.log('DONE');
})();