const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const pages = ctx?.pages() || [];
  const page = pages[0];
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  console.log('=== PAGE INFO ===');
  console.log('Title:', await page.title());
  console.log('URL:', page.url());
  
  // Check all buttons
  const buttons = await page.$$('button');
  console.log('\n=== ALL BUTTONS (' + buttons.length + ') ===');
  for (const btn of buttons) {
    const visible = await btn.isVisible();
    const text = await btn.textContent();
    const id = await btn.getAttribute('id');
    const cls = await btn.getAttribute('class');
    console.log('  [' + (visible ? 'VIS' : 'HID') + '] id=' + (id || 'none') + ' class=' + (cls || 'none') + ' text="' + (text || '').trim().substring(0, 30) + '"');
  }
  
  // Check for specific elements
  const checks = [
    '#btn-ai-co-create', '.ow-chat-toggle', '.modal-close',
    '.skill-bind-modal', '#btn-lock-outline', '#btn-save-outline',
    '.pipeline-panel', '#pipeline-panel', '.chapter-tree',
    '#chapter-tree', '.chat-panel', '#chat-panel',
    '.editor-panel', '#editor-panel', '.exit-confirm-modal'
  ];
  console.log('\n=== ELEMENT CHECKS ===');
  for (const sel of checks) {
    const el = await page.$(sel);
    const visible = el ? await el.isVisible() : false;
    console.log('  ' + sel + ': ' + (el ? (visible ? 'VISIBLE' : 'HIDDEN') : 'NOT FOUND'));
  }
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
