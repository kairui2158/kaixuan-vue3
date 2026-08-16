const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const file = 'D:/codex/novel-workshop-vue3/_audit/project_ui_verified.png';
  await page.screenshot({ path: file, fullPage: false });
  console.log('saved', file, fs.statSync(file).size);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
