const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const page = ctx?.pages() || [];
  if (page.length === 0) { await browser.close(); return; }
  const p = page[0];
  await p.waitForLoadState('networkidle');
  
  // Click the outline workspace button
  const btn = await p.$('#btn-outline-workspace');
  if (btn) {
    await btn.click();
    console.log('Clicked outline workspace button');
    await p.waitForTimeout(800);
  }
  
  // Check for outline workspace elements
  const checks = [
    '#btn-ai-co-create', '.ow-chat-toggle', '.ow-body', '.ow-editor',
    '#btn-lock-outline', '#btn-save-outline', '.modal-close',
    '.skill-bind-modal', '.pipeline-panel'
  ];
  console.log('\n=== AFTER CLICKING OUTLINE ===');
  for (const sel of checks) {
    const el = await p.$(sel);
    const visible = el ? await el.isVisible() : false;
    console.log('  ' + sel + ': ' + (el ? (visible ? 'VISIBLE' : 'HIDDEN') : 'NOT FOUND'));
  }
  
  // Screenshot
  await p.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_03_outline_open.png', fullPage: true });
  console.log('\nScreenshot saved');
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
