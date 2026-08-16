const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  await p.waitForLoadState('networkidle');
  
  // Open outline workspace
  await p.evaluate(() => {
    const btn = document.querySelector('#btn-outline-workspace');
    if (btn) btn.click();
  });
  await p.waitForTimeout(600);
  
  // Check AI共创 button
  const aiBtn = await p.$('#btn-ai-co-create');
  console.log('AI共创 exists:', !!aiBtn);
  if (aiBtn) {
    const visible = await aiBtn.isVisible();
    const box = await aiBtn.boundingBox();
    const text = await aiBtn.textContent();
    console.log('AI共创 visible:', visible, 'box:', JSON.stringify(box), 'text:', text);
  }
  
  // Try clicking the overlay to dismiss it first
  const overlay = await p.$('#outline-workspace');
  console.log('Overlay z-index check...');
  const zIndex = await p.evaluate(() => {
    const ow = document.querySelector('#outline-workspace');
    return ow ? getComputedStyle(ow).zIndex : 'no';
  });
  console.log('Overlay z-index:', zIndex);
  
  // Check what is intercepting the click
  const pointInfo = await p.evaluate(() => {
    const btn = document.querySelector('#btn-ai-co-create');
    if (!btn) return 'no button';
    const rect = btn.getBoundingClientRect();
    const x = rect.left + rect.width/2;
    const y = rect.top + rect.height/2;
    const el = document.elementFromPoint(x, y);
    return {
      x, y,
      targetTag: el?.tagName || 'null',
      targetId: el?.id || 'null',
      targetClass: el?.className || 'null'
    };
  });
  console.log('Point info:', JSON.stringify(pointInfo));
  
  // Try direct JS click
  await p.evaluate(() => {
    const btn = document.querySelector('#btn-ai-co-create');
    if (btn) btn.click();
  });
  await p.waitForTimeout(500);
  
  const chatArea = await p.$('.ow-chat');
  const chatVisible = chatArea ? await chatArea.isVisible() : false;
  console.log('Chat area after JS click:', chatVisible ? 'VISIBLE' : 'NOT VISIBLE');
  
  await p.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_05_js_click.png', fullPage: true });
  console.log('Screenshot saved');
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
