const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const result = await page.evaluate(async () => {
    const cfg = window.electronAPI.storageRead('wa_providers');
    const p = cfg.providers.find(x => x.id === cfg.generateProvider);
    let key = p.apiKey;
    if (key.startsWith('enc:')) key = window.electronAPI.decrypt(key);
    const url = p.baseUrl + '/chat/completions';
    const body = { model: p.selectedModel, messages: [{ role: 'user', content: 'hi' }], temperature: 0.7, max_tokens: 128000, stream: false };
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const text = await resp.text();
      return { status: resp.status, statusText: resp.statusText, body: text.slice(0, 800), url };
    } catch (e) {
      return { error: String(e), url };
    }
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
