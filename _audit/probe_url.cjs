const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const state = await page.evaluate(() => {
    return {
      url: location.href,
      scripts: [...document.querySelectorAll('script[src]')].map(s => s.src),
      lastProj: window.electronAPI.storageRead('wa_lastProjectId'),
      rawLastProjLegacy: window.electronAPI.storageRead('lastProjectId'),
      appState: window.__getActivePanel ? window.__getActivePanel() : 'n/a'
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
