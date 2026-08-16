const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const state = await page.evaluate(async () => {
    const cfg = window.electronAPI.storageRead('wa_providers');
    const active = cfg?.providers?.find(p => p.id === cfg.generateProvider);
    return {
      id: active?.id,
      name: active?.name,
      baseUrl: active?.baseUrl,
      apiKeyPrefix: active?.apiKey?.slice(0, 30),
      apiKeyEncrypted: (active?.apiKey || '').startsWith('enc:'),
      selectedModel: active?.selectedModel,
      streamMode: active?.streamMode,
      temperature: active?.temperature,
      maxTokens: active?.maxTokens,
      rawModel: active?.models?.[0]
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
