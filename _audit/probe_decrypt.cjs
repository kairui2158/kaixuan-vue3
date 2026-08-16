const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const result = await page.evaluate(async () => {
    const cfg = window.electronAPI.storageRead('wa_providers');
    const p = cfg.providers.find(x => x.id === cfg.generateProvider);
    let key = '';
    try { key = window.electronAPI.decrypt(p.apiKey); } catch(e) { return { decrypt_error: String(e) } }
    return { decrypted: key.slice(0, 20) + '...' + key.slice(-10), len: key.length, startsBearer: key.startsWith('Bearer ') };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
