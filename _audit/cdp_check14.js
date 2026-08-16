const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(500);
  
  const V = async (label, fn) => {
    try {
      await fn();
      console.log(`[PASS] ${label}`);
    } catch(e) {
      console.log(`[FAIL] ${label}: ${e.message}`);
    }
  };
  
  // === STAGE 1: Main page ===
  console.log('=== STAGE 1: 主页面验证 ===');
  await V('章节树可见', async () => {
    const el = await p.$('#chapter-tree');
    if (!el || !(await el.isVisible())) throw new Error('not visible');
  });
  await V('右侧对话框可见', async () => {
    const el = await p.$('.chat-panel');
    if (!el || !(await el.isVisible())) throw new Error('not visible');
  });
  await V('编辑器面板可见', async () => {
    const el = await p.$('#editor-panel');
    if (!el || !(await el.isVisible())) throw new Error('not visible');
  });
  await V('侧边栏按钮可见', async () => {
    for (const id of ['btn-outline-workspace', 'btn-pipeline', 'btn-settings', 'btn-memory']) {
      const btn = await p.$('#' + id);
      if (!btn || !(await btn.isVisible())) throw new Error(id + ' not visible');
    }
  });
  
  // === STAGE 2: Open outline workspace ===
  console.log('\n=== STAGE 2: 大纲工作台 ===');
  await p.evaluate(() => document.querySelector('#btn-outline-workspace')?.click());
  await p.waitForTimeout(800);
  
  await V('大纲工作台打开', async () => {
    const ow = await p.$('#outline-workspace');
    if (!ow || !(await ow.isVisible())) throw new Error('not visible');
  });
  
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
    await editor.fill('测试大纲内容');
    const val = await editor.inputValue();
    if (val !== '测试大纲内容') throw new Error('input failed');
  });
  
  await p.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_10_outline_verify.png', fullPage: true });
  console.log('\nScreenshot saved');
  
  await browser.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
