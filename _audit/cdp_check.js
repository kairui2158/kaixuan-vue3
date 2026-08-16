const { chromium } = require('playwright');
const path = require('path');

async function main() {
  console.log('Connecting to CDP on port 9227...');
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const pages = ctx?.pages() || [];
  console.log('Pages found:', pages.length);
  
  if (pages.length === 0) {
    console.log('No pages, closing');
    await browser.close();
    return;
  }
  const page = pages[0];
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  console.log('Page title:', await page.title());
  console.log('Page URL:', page.url());
  
  // Screenshot 1: Full page
  await page.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_01_full.png', fullPage: true });
  console.log('Screenshot 1 saved');
  
  // Check for AI共创 button
  const btn = await page.$('#btn-ai-co-create');
  console.log('AI共创 button exists:', !!btn);
  if (btn) {
    const visible = await btn.isVisible();
    const text = await btn.textContent();
    const box = await btn.boundingBox();
    console.log('AI共创 button visible:', visible, 'text:', text, 'box:', JSON.stringify(box));
  }
  
  await browser.close();
  console.log('Done');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
