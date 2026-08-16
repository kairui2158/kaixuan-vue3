const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const state = await page.evaluate(() => {
    const lastProjectId = window.electronAPI?.storageRead?.('wa_lastProjectId');
    const proj = window.electronAPI?.storageRead?.('wa_project_prj_msbtqnpe_q24wr3');
    return {
      lastProjectId,
      projOutline: proj?.outlineText,
      projLocked: proj?.outlineLocked,
      currentOutline: document.querySelector('#pl-outline')?.value,
      apiKeys: Object.keys(window.electronAPI || {}),
      bodyText: document.body.innerText.includes('测试大纲txt内容') ? 'yes' : 'no'
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
