const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  await p.waitForLoadState('networkidle');
  
  // Full verification sequence
  async function checkStage(label, fn) {
    console.log(`\n=== ${label} ===`);
    try {
      await fn();
    } catch(e) {
      console.log(`  FAILED: ${e.message}`);
    }
  }
  
  await checkStage('打开大纲工作台', async () => {
    // Click sidebar outline button
    const btn = await p.$('#btn-outline-workspace');
    if (!btn) { console.log('  Sidebar button not found'); return; }
    await btn.click();
    await p.waitForTimeout(1000);
    
    const ow = await p.$('#outline-workspace');
    console.log('  Outline workspace open:', ow ? 'YES' : 'NO');
    if (ow) {
      console.log('  Visible:', await ow.isVisible());
    }
  });
  
  await checkStage('AI共创按钮', async () => {
    // Use page.$ which works with Shadow DOM
    const btn = await p.$('#btn-ai-co-create');
    console.log('  Found via page.$:', !!btn);
    if (btn) {
      console.log('  Visible:', await btn.isVisible());
      console.log('  Text:', await btn.textContent());
    }
    
    // Also try evaluate
    const exists = await p.evaluate(() => {
      return !!document.querySelector('#btn-ai-co-create');
    });
    console.log('  Found via evaluate:', exists);
    
    // Try all possible selectors
    for (const sel of ['#btn-ai-co-create', 'button.ow-chat-toggle', '.ow-chat-toggle', '[id*=ai-co-create]']) {
      const el = await p.$(sel);
      if (el) console.log('  Found via:', sel, 'visible:', await el.isVisible());
    }
  });
  
  await checkStage('保存按钮', async () => {
    const btn = await p.$('#btn-save-outline');
    console.log('  Found:', !!btn);
    if (btn) console.log('  Visible:', await btn.isVisible(), 'text:', await btn.textContent());
  });
  
  await checkStage('锁定按钮', async () => {
    const btn = await p.$('#btn-lock-outline');
    console.log('  Found:', !!btn);
    if (btn) console.log('  Visible:', await btn.isVisible(), 'text:', await btn.textContent());
  });
  
  await checkStage('导入按钮', async () => {
    const btn = await p.$('#btn-import-outline');
    console.log('  Found:', !!btn);
    if (btn) console.log('  Visible:', await btn.isVisible(), 'text:', await btn.textContent());
  });
  
  await p.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_07_verify2.png', fullPage: true });
  console.log('\nScreenshot saved');
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
