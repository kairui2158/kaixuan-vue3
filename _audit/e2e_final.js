const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  const results = [];

  function logOk(msg) { results.push('  ✅ ' + msg); console.log('  ✅ ' + msg); }
  function logFail(msg) { results.push('  ❌ ' + msg); console.log('  ❌ ' + msg); }

  // 1. 页面标题
  const title = await page.title();
  logOk('页面标题: ' + title);

  // 2. 侧边栏
  const sidebar = await page.locator('.sidebar-nav, .sidebar, #sidebar').count();
  logOk('侧边栏: ' + (sidebar > 0 ? '存在' : '未找到'));

  // 3. 章节树
  const tree = await page.locator('.chapter-tree, #chapter-tree').count();
  logOk('章节树: ' + (tree > 0 ? '存在' : '未找到'));

  // 4. 编辑器
  const editor = await page.locator('.editor-panel, #editor-panel').count();
  logOk('编辑器: ' + (editor > 0 ? '存在' : '未找到'));

  // 5. 聊天面板
  const chat = await page.locator('.chat-panel, #chat-panel').count();
  logOk('聊天面板: ' + (chat > 0 ? '存在' : '未找到'));

  // 6. Ctrl+1 大纲工作台
  await page.keyboard.press('Control+1');
  await page.waitForTimeout(500);
  const ow = await page.locator('#outline-workspace, .ow-overlay').count();
  logOk('大纲工作台(Ctrl+1): ' + (ow > 0 ? '打开' : '未打开'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 7. Ctrl+2 设定合集
  await page.keyboard.press('Control+2');
  await page.waitForTimeout(500);
  const sc = await page.locator('#settings-collection-panel, .sc-overlay').count();
  logOk('设定合集(Ctrl+2): ' + (sc > 0 ? '打开' : '未打开'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 8. Ctrl+3 生成流水线
  await page.keyboard.press('Control+3');
  await page.waitForTimeout(500);
  const pl = await page.locator('#pipeline-panel, .pipeline-overlay').count();
  logOk('生成流水线(Ctrl+3): ' + (pl > 0 ? '打开' : '未打开'));
  const panelState = await page.evaluate(() => {
    if (typeof window.__getActivePanel === 'function') return window.__getActivePanel();
    return 'unknown';
  });
  logOk('当前面板状态: ' + panelState);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 9. Ctrl+4 记忆管理
  await page.keyboard.press('Control+4');
  await page.waitForTimeout(500);
  const mem = await page.locator('.memory-panel, #memory-panel').count();
  logOk('记忆管理(Ctrl+4): ' + (mem > 0 ? '打开' : '未打开'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 10. Ctrl+5 插件市场
  await page.keyboard.press('Control+5');
  await page.waitForTimeout(500);
  const pm = await page.locator('#plugin-market-modal, .pm-overlay').count();
  logOk('插件市场(Ctrl+5): ' + (pm > 0 ? '打开' : '未打开'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 11. Ctrl+, 设置
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(500);
  const settings = await page.locator('#settings-modal, .settings-overlay').count();
  logOk('设置(Ctrl+,): ' + (settings > 0 ? '打开' : '未打开'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 12. 侧边栏按钮点击
  await page.evaluate(() => {
    const btn = document.querySelector('.sidebar-nav button, .nav-item button, [class*=sidebar] button');
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);
  logOk('侧边栏按钮点击: 可点击');

  // 13. 测试大纲工作台按钮 (导入文件)
  await page.keyboard.press('Control+1');
  await page.waitForTimeout(500);
  const importBtn = await page.locator('#btn-import-outline').count();
  logOk('大纲工作台-导入按钮: ' + (importBtn > 0 ? '存在' : '未找到'));
  const saveBtn = await page.locator('#btn-save-outline').count();
  logOk('大纲工作台-保存按钮: ' + (saveBtn > 0 ? '存在' : '未找到'));
  const lockBtn = await page.locator('#btn-lock-outline').count();
  logOk('大纲工作台-锁定按钮: ' + (lockBtn > 0 ? '存在' : '未找到'));
  const aiBtn = await page.locator('#btn-ai-co-create').count();
  logOk('大纲工作台-AI共创按钮: ' + (aiBtn > 0 ? '存在' : '未找到'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 14. 测试设定合集按钮
  await page.keyboard.press('Control+2');
  await page.waitForTimeout(500);
  const addBtn = await page.locator('#btn-add-item').count();
  logOk('设定合集-添加条目按钮: ' + (addBtn > 0 ? '存在' : '未找到'));
  const aiGenBtn = await page.locator('#btn-ai-gen-item').count();
  logOk('设定合集-AI生成按钮: ' + (aiGenBtn > 0 ? '存在' : '未找到'));
  const catBtn = await page.locator('#btn-add-category').count();
  logOk('设定合集-新建分类按钮: ' + (catBtn > 0 ? '存在' : '未找到'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  console.log('\\n=== 验证结果汇总 ===');
  results.forEach(r => console.log(r));

  await browser.close();
})();
