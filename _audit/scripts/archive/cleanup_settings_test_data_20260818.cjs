const { createRequire } = require('module');
const requireFromProject = createRequire(process.cwd() + '/package.json');
const { chromium } = requireFromProject('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const result = await page.evaluate(() => {
    const removeItem = (name) => {
      const input = [...document.querySelectorAll('.pl-setting-item input.pl-input')].find((el) => el.value === name);
      if (!input) return false;
      const card = input.closest('.pl-setting-item');
      const button = card && card.querySelector('button.btn-danger');
      if (!button) return false;
      button.click();
      return true;
    };
    const removedItem = removeItem('临时UI测量设定');
    const removedCategories = [];
    for (const name of ['测试分类', '测试']) {
      const row = [...document.querySelectorAll('.pl-sc-cat-item')].find((el) => (el.querySelector('.pl-sc-cat-label')?.textContent || '').trim() === name);
      const button = row && row.querySelector('.pl-sc-cat-del');
      if (button) {
        button.click();
        removedCategories.push(name);
      }
    }
    return { removedItem, removedCategories };
  });
  await page.waitForTimeout(300);
  console.log(JSON.stringify(result));
  await browser.close();
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
