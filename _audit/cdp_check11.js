const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  await p.waitForLoadState('networkidle');
  
  // Open outline via JS
  await p.evaluate(() => {
    const btn = document.querySelector('#btn-outline-workspace');
    if (btn) btn.click();
  });
  await p.waitForTimeout(800);
  
  // Use force:true to bypass Playwright overlay detection
  const aiBtn = await p.$('#btn-ai-co-create');
  if (aiBtn) {
    await aiBtn.click({ force: true });
    await p.waitForTimeout(500);
    console.log('AI共创 clicked via force');
  }
  
  const chat = await p.$('.ow-chat');
  const chatVis = chat ? await chat.isVisible() : false;
  console.log('Chat visible:', chatVis);
  
  // Check overlay style
  const style = await p.evaluate(() => {
    const ow = document.querySelector('#outline-workspace');
    if (!ow) return null;
    const s = getComputedStyle(ow);
    return {
      position: s.position,
      zIndex: s.zIndex,
      pointerEvents: s.pointerEvents,
      overflow: s.overflow
    };
  });
  console.log('Overlay style:', JSON.stringify(style));
  
  // Check if the overlay has pointer-events:auto causing the issue
  const allOverlayStyles = await p.evaluate(() => {
    const els = document.querySelectorAll('.ow-overlay, [class*=overlay]');
    const result = [];
    for (const el of els) {
      const s = getComputedStyle(el);
      result.push({
        tag: el.tagName,
        id: el.id,
        class: el.className,
        position: s.position,
        zIndex: s.zIndex,
        pointerEvents: s.pointerEvents,
        width: s.width,
        height: s.height
      });
    }
    return result;
  });
  console.log('All overlay elements:', JSON.stringify(allOverlayStyles, null, 2));
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
