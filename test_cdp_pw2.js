const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  console.log('Title:', await page.title());
  
  // 1. 点击大纲工作台按钮
  console.log('\\n=== 点击大纲工作台按钮 ===');
  await page.click('#btn-outline-workspace');
  await page.waitForTimeout(500);
  
  // 检查大纲工作台是否打开
  const outlineVisible = await page.evaluate(() => {
    const ow = document.querySelector('.outline-workspace');
    return ow ? ow.offsetParent !== null : false;
  });
  console.log('OutlineWorkspace visible:', outlineVisible);
  
  // 截图
  await page.screenshot({ path: 'D:\\codex\\novel-workshop-vue3\\test_ss1.png' });
  console.log('Screenshot 1 saved');
  
  // 2. 检查大纲工作台的按钮
  const owButtons = await page.evaluate(() => {
    const ow = document.querySelector('.outline-workspace');
    if (!ow) return 'no outline workspace';
    return Array.from(ow.querySelectorAll('button')).map(b => ({
      id: b.id, text: b.innerText.slice(0, 40), disabled: b.disabled, visible: b.offsetParent !== null
    }));
  });
  console.log('Outline buttons:', JSON.stringify(owButtons));
  
  // 3. 检查是否有 textarea 可输入大纲
  const textarea = await page.evaluate(() => {
    const ta = document.querySelector('.outline-workspace textarea');
    return ta ? { placeholder: ta.placeholder, readonly: ta.readonly } : 'no textarea';
  });
  console.log('Textarea:', JSON.stringify(textarea));
  
  await browser.close();
  console.log('\\nDone');
})();
