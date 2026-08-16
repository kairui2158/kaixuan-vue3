const { chromium } = require('C:/Users/凯瑞/AppData/Local/ms-playwright/chromium-1228/node_modules/playwright-core');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const pages = browser.contexts()[0]?.pages() || [];
  if (pages.length === 0) {
    console.log('No pages found');
    await browser.close();
    return;
  }
  const page = pages[0];
  await page.waitForLoadState('networkidle');
  
  // Screenshot 1: Full page
  await page.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_01_full.png', fullPage: true });
  console.log('Screenshot 1 saved: full page');
  
  // Check for AI共创 button
  const btn = await page.$('#btn-ai-co-create');
  console.log('AI共创 button exists:', !!btn);
  if (btn) {
    const visible = await btn.isVisible();
    const text = await btn.textContent();
    console.log('AI共创 button visible:', visible, 'text:', text);
  }
  
  // Screenshot 2: Outline area
  const outlineEl = await page.$('.ow-body, .ow-editor, .outline-workspace');
  if (outlineEl) {
    await outlineEl.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_02_outline.png' });
    console.log('Screenshot 2 saved: outline area');
  }
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
