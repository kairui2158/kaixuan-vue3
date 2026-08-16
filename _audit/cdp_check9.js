const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  await p.waitForLoadState('networkidle');
  
  // Open outline workspace
  await (await p.$('#btn-outline-workspace')).click();
  await p.waitForTimeout(800);
  
  // Test 1: Click AI共创 - toggle chat area
  console.log('=== TEST 1: AI共创 toggle ===');
  const aiBtn = await p.$('#btn-ai-co-create');
  const chatBefore = await p.$('.ow-chat');
  console.log('Chat before click:', chatBefore ? await chatBefore.isVisible() : 'no element');
  
  await aiBtn.click();
  await p.waitForTimeout(500);
  
  const chatAfter = await p.$('.ow-chat');
  console.log('Chat after click:', chatAfter ? await chatAfter.isVisible() : 'no element');
  
  // Toggle again to close
  await aiBtn.click();
  await p.waitForTimeout(300);
  
  // Test 2: Type in outline editor
  console.log('\n=== TEST 2: Editor input ===');
  const editor = await p.$('#outline-editor');
  if (editor) {
    await editor.fill('这是一个测试大纲内容');
    await p.waitForTimeout(300);
    const val = await editor.inputValue();
    console.log('Editor value:', val);
  }
  
  // Test 3: Click save
  console.log('\n=== TEST 3: Save button ===');
  const saveBtn = await p.$('#btn-save-outline');
  if (saveBtn) {
    await saveBtn.click();
    await p.waitForTimeout(500);
    console.log('Save clicked');
  }
  
  // Test 4: Click lock button
  console.log('\n=== TEST 4: Lock button ===');
  const lockBtn = await p.$('#btn-lock-outline');
  if (lockBtn) {
    await lockBtn.click();
    await p.waitForTimeout(500);
    console.log('Lock clicked');
    
    // Check if pipeline panel appeared
    const pipeline = await p.$('.pipeline-panel, #pipeline-panel');
    console.log('Pipeline panel after lock:', pipeline ? 'YES (checking visibility)' : 'NOT FOUND');
  }
  
  await p.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_08_interactions.png', fullPage: true });
  console.log('\nScreenshot saved');
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
