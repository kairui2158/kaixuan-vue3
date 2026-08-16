const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  await p.waitForLoadState('networkidle');
  
  // Step 1: Open outline workspace
  await p.evaluate(() => {
    const btn = document.querySelector('#btn-outline-workspace');
    if (btn) btn.click();
  });
  await p.waitForTimeout(600);
  
  // Step 2: Check AI共创 button
  const aiBtn = await p.$('#btn-ai-co-create');
  console.log('STAGE 1: AI共创按钮验证');
  console.log('  Button exists:', !!aiBtn);
  if (aiBtn) {
    const visible = await aiBtn.isVisible();
    const text = await aiBtn.textContent();
    console.log('  Button visible:', visible, 'text:', text);
    
    // Click AI共创 using JS
    await p.evaluate(() => {
      const btn = document.querySelector('#btn-ai-co-create');
      if (btn) btn.click();
    });
    await p.waitForTimeout(500);
    
    const chatArea = await p.$('.ow-chat');
    const chatVisible = chatArea ? await chatArea.isVisible() : false;
    console.log('  Chat area after click:', chatVisible ? 'VISIBLE' : 'NOT VISIBLE');
  }
  
  // Step 3: Check save button
  const saveBtn = await p.$('#btn-save-outline');
  console.log('\nSTAGE 2: 保存按钮验证');
  if (saveBtn) {
    console.log('  Save button exists, visible:', await saveBtn.isVisible());
    // Try clicking save
    const beforeMsgs = await p.evaluate(() => {
      const msgs = document.querySelector('#ow-chat-messages');
      return msgs?.children?.length || 0;
    });
    console.log('  Messages before save:', beforeMsgs);
  }
  
  // Step 4: Check lock button
  const lockBtn = await p.$('#btn-lock-outline');
  console.log('\nSTAGE 3: 锁定按钮验证');
  if (lockBtn) {
    console.log('  Lock button exists, visible:', await lockBtn.isVisible(), 'text:', await lockBtn.textContent());
  }
  
  // Step 5: Check editor content
  const editor = await p.$('#outline-editor');
  console.log('\nSTAGE 4: 编辑器内容验证');
  if (editor) {
    const content = await editor.inputValue();
    console.log('  Editor content length:', content.length, 'text:', content.substring(0, 50));
  }
  
  await p.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_06_full_verify.png', fullPage: true });
  console.log('\nScreenshot saved');
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
