const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9227');
  const ctx = browser.contexts()[0];
  const p = ctx?.pages()?.[0];
  if (!p) { await browser.close(); return; }
  // Don't wait for networkidle - it may hang on file:// protocol
  await p.waitForTimeout(2000);
  
  const PASS = [];
  const FAIL = [];
  const V = async (label, fn) => {
    try {
      await fn();
      PASS.push(label);
      process.stdout.write(`[PASS] ${label}\n`);
    } catch(e) {
      FAIL.push(label + ': ' + e.message);
      process.stdout.write(`[FAIL] ${label}: ${e.message}\n`);
    }
  };
  
  process.stdout.write('\n=== STAGE 1: 主页面验证 ===\n');
  await V(章节树可见, async () => {
    const el = await p.$('#chapter-tree');
    if (!el || !(await el.isVisible())) throw new Error(not visible);
  });
  await V(右侧对话框可见, async () => {
    const el = await p.$('.chat-panel');
    if (!el || !(await el.isVisible())) throw new Error(not visible);
  });
  await V(编辑器面板可见, async () => {
    const el = await p.$('#editor-panel');
    if (!el || !(await el.isVisible())) throw new Error(not visible);
  });
  await V(侧边栏大纲工作台按钮, async () => {
    const btn = await p.$('#btn-outline-workspace');
    if (!btn || !(await btn.isVisible())) throw new Error(not visible);
  });
  await V(侧边栏生成流水线按钮, async () => {
    const btn = await p.$('#btn-pipeline');
    if (!btn || !(await btn.isVisible())) throw new Error(not visible);
  });
  
  process.stdout.write('\n=== STAGE 2: 大纲工作台 ===\n');
  await p.evaluate(() => document.querySelector('#btn-outline-workspace')?.click());
  await p.waitForTimeout(800);
  
  await V(大纲工作台弹窗打开, async () => {
    const ow = await p.$('#outline-workspace');
    if (!ow || !(await ow.isVisible())) throw new Error(not visible);
  });
  await V(AI共创按钮可见, async () => {
    const btn = await p.$('#btn-ai-co-create');
    if (!btn || !(await btn.isVisible())) throw new Error(not visible);
  });
  await V(保存按钮可见, async () => {
    const btn = await p.$('#btn-save-outline');
    if (!btn || !(await btn.isVisible())) throw new Error(not visible);
  });
  await V(锁定按钮可见, async () => {
    const btn = await p.$('#btn-lock-outline');
    if (!btn || !(await btn.isVisible())) throw new Error(not visible);
  });
  await V(导入按钮可见, async () => {
    const btn = await p.$('#btn-import-outline');
    if (!btn || !(await btn.isVisible())) throw new Error(not visible);
  });
  
  await V(编辑器可输入, async () => {
    const editor = await p.$('#outline-editor');
    if (!editor) throw new Error(not found);
    await editor.fill(测试大纲);
    const val = await editor.inputValue();
    if (val !== 测试大纲) throw new Error(input failed);
  });
  
  await V(AI共创点击切换聊天区, async () => {
    await p.evaluate(() => document.querySelector('#btn-ai-co-create')?.click());
    await p.waitForTimeout(400);
    const chat = await p.$('.ow-chat');
    if (!chat || !(await chat.isVisible())) throw new Error(chat not visible);
  });
  
  // Close outline
  await p.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click());
  await p.waitForTimeout(500);
  await V(关闭大纲工作台, async () => {
    const ow = await p.$('#outline-workspace');
    if (ow && (await ow.isVisible())) throw new Error(still visible);
  });
  
  process.stdout.write(`\n=== RESULTS ===\n`);
  process.stdout.write(`PASS: ${PASS.length}, FAIL: ${FAIL.length}\n`);
  FAIL.forEach(f => process.stdout.write(`  FAIL: ${f}\n`));
  
  await p.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/cdp_screenshot_12_final.png', fullPage: true });
  process.stdout.write(Screenshot saved\n);
  
  await browser.close();
}

main().catch(e => { process.stdout.write('Error: ' + e.message + '\n'); process.exit(1); });
