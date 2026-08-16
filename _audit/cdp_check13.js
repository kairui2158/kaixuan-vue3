const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  await p.waitForLoadState('networkidle');
  
  const V = async (label, fn) => {
    try {
      await fn();
      console.log(`[PASS] ${label}`);
    } catch(e) {
      console.log(`[FAIL] ${label}: ${e.message}`);
    }
  };
  
  // Open outline workspace
  await p.evaluate(() => document.querySelector('#btn-outline-workspace')?.click());
  await p.waitForTimeout(800);
  
  await V('AI共创按钮可见', async () => {
    const btn = await p.$('#btn-ai-co-create');
    if (!btn || !(await btn.isVisible())) throw new Error('not visible');
  });
  
  await V('AI共创点击切换聊天区', async () => {
    await p.evaluate(() => document.querySelector('#btn-ai-co-create')?.click());
    await p.waitForTimeout(400);
    const chat = await p.$('.ow-chat');
    if (!chat || !(await chat.isVisible())) throw new Error('chat not visible');
  });
  
  await V('保存大纲按钮可见', async () => {
    const btn = await p.$('#btn-save-outline');
    if (!btn || !(await btn.isVisible())) throw new Error('not visible');
  });
  
  await V('锁定按钮可见', async () => {
    const btn = await p.$('#btn-lock-outline');
    if (!btn || !(await btn.isVisible())) throw new Error('not visible');
  });
  
  await V('编辑器可输入', async () => {
    const editor = await p.$('#outline-editor');
    if (!editor) throw new Error('editor not found');
    await editor.fill('测试大纲');
    const val = await editor.inputValue();
    if (val !== '测试大纲') throw new Error('input failed: ' + val);
  });
  
  await V('保存按钮可点击', async () => {
    await p.evaluate(() => document.querySelector('#btn-save-outline')?.click());
    await p.waitForTimeout(300);
  });
  
  await V('导入按钮可见', async () => {
    const btn = await p.$('#btn-import-outline');
    if (!btn || !(await btn.isVisible())) throw new Error('not visible');
  });
  
  // Close outline workspace
  await p.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click());
  await p.waitForTimeout(500);
  
  await V('关闭大纲工作台', async () => {
    const ow = await p.$('#outline-workspace');
    if (ow && (await ow.isVisible())) throw new Error('still visible');
  });
  
  await V('章节树可见', async () => {
    const tree = await p.$('#chapter-tree');
    if (!tree || !(await tree.isVisible())) throw new Error('not visible');
  });
  
  await V('右侧对话框可见', async () => {
    const chat = await p.$('.chat-panel');
    if (!chat || !(await chat.isVisible())) throw new Error('not visible');
  });
  
  await V('编辑器面板可见', async () => {
    const editor = await p.$('#editor-panel');
    if (!editor || !(await editor.isVisible())) throw new Error('not visible');
  });
  
  await p.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_09_verify_all.png', fullPage: true });
  console.log('\nScreenshot saved');
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
