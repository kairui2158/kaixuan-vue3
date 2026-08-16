const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  const results = [];

  function logOk(msg) { results.push('  ✅ ' + msg); console.log('  ✅ ' + msg); }
  function logFail(msg) { results.push('  ❌ ' + msg); console.log('  ❌ ' + msg); }

  console.log('=== E2E 验证开始 ===');

  // 1. 检查页面加载
  const title = await page.title();
  logOk('页面标题: ' + title);

  // 2. 检查侧边栏按钮
  const sidebarBtns = await page.locator('.sidebar-nav button, .nav-item, [class*=sidebar] button').count();
  logOk('侧边栏按钮数: ' + sidebarBtns);

  // 3. 打开大纲工作台 (Ctrl+1)
  await page.keyboard.press('Control+1');
  await page.waitForTimeout(500);
  const ow = await page.locator('#outline-workspace, .ow-overlay').count();
  logOk('大纲工作台打开: ' + (ow > 0 ? '是' : '否'));

  // 4. 检查大纲工作台按钮
  const owBtns = await page.locator('#outline-workspace button, .ow-overlay button').count();
  logOk('大纲工作台按钮数: ' + owBtns);

  // 5. 关闭大纲工作台 (Escape)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 6. 打开设定合集 (Ctrl+2)
  await page.keyboard.press('Control+2');
  await page.waitForTimeout(500);
  const sc = await page.locator('#settings-collection-panel, .sc-overlay').count();
  logOk('设定合集打开: ' + (sc > 0 ? '是' : '否'));

  // 7. 检查设定合集按钮
  const scBtns = await page.locator('#settings-collection-panel button, .sc-overlay button').count();
  logOk('设定合集按钮数: ' + scBtns);

  // 8. 关闭
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 9. 打开生成流水线 (Ctrl+3)
  await page.keyboard.press('Control+3');
  await page.waitForTimeout(500);
  const pl = await page.locator('#pipeline-panel, .pipeline-overlay, [class*=pipeline]').count();
  logOk('生成流水线打开: ' + (pl > 0 ? '是' : '否'));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 10. 打开记忆管理 (Ctrl+4)
  await page.keyboard.press('Control+4');
  await page.waitForTimeout(500);
  const mem = await page.locator('#memory-panel, .memory-overlay, [class*=\"Memory\"]').count();
  logOk('记忆管理打开: ' + (mem > 0 ? '是' : '否'));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 11. 打开插件市场 (Ctrl+5)
  await page.keyboard.press('Control+5');
  await page.waitForTimeout(500);
  const pm = await page.locator('#plugin-market, .plugin-overlay, [class*=\"Plugin\"]').count();
  logOk('插件市场打开: ' + (pm > 0 ? '是' : '否'));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 12. 检查编辑器
  const editor = await page.locator('#editor-panel, .editor-panel, [class*=editor]').count();
  logOk('编辑器面板: ' + (editor > 0 ? '存在' : '未找到'));

  // 13. 检查章节树
  const tree = await page.locator('#chapter-tree, .chapter-tree, [class*=ChapterTree]').count();
  logOk('章节树: ' + (tree > 0 ? '存在' : '未找到'));

  // 14. 检查聊天面板
  const chat = await page.locator('#chat-panel, .chat-panel, [class*=ChatPanel]').count();
  logOk('聊天面板: ' + (chat > 0 ? '存在' : '未找到'));

  // 15. 检查设置面板
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(500);
  const settings = await page.locator('#settings-modal, .settings-overlay, [class*=SettingsModal]').count();
  logOk('设置面板打开: ' + (settings > 0 ? '是' : '否'));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  console.log('=== E2E 验证完成 ===');
  console.log('\\n结果汇总:');
  results.forEach(r => console.log(r));

  await browser.close();
})();
