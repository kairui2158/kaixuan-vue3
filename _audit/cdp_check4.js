const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  await p.waitForLoadState('networkidle');
  
  // Open outline workspace
  await (await p.$('#btn-outline-workspace')).click();
  await p.waitForTimeout(500);
  
  // Click AI共创 button
  const aiBtn = await p.$('#btn-ai-co-create');
  console.log('AI共创 button before click:', await aiBtn.isVisible(), await aiBtn.textContent());
  await aiBtn.click();
  await p.waitForTimeout(500);
  
  // Check if chat area appeared
  const chatArea = await p.$('.ow-chat');
  const chatVisible = chatArea ? await chatArea.isVisible() : false;
  console.log('Chat area after AI click:', chatVisible ? 'VISIBLE' : 'NOT VISIBLE');
  
  // Check lock button
  const lockBtn = await p.$('#btn-lock-outline');
  console.log('Lock button:', await lockBtn.isVisible(), await lockBtn.textContent());
  
  // Check save button
  const saveBtn = await p.$('#btn-save-outline');
  console.log('Save button:', await saveBtn.isVisible(), await saveBtn.textContent());
  
  // Screenshot
  await p.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_04_ai_chat.png', fullPage: true });
  console.log('Screenshot saved');
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
