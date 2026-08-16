const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const state = await page.evaluate(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
    const providerStore = pinia?._s.get('provider');
    if (!providerStore) return { error: 'no provider store' };
    // setup store keys are unwrapped by pinia
    const keys = Object.keys(providerStore).filter(k => !['_p','$id','$type'].includes(k));
    const providers = providerStore.providers || [];
    return {
      keys,
      providersIsArray: Array.isArray(providers),
      providerCount: Array.isArray(providers) ? providers.length : 0,
      providersSample: Array.isArray(providers) ? providers.slice(0,2).map(p => ({ id: p.id, name: p.name, model: p.selectedModel, keyPrefix: (p.apiKey || '').slice(0,12) })) : [],
      generateProvider: providerStore.generateProvider,
      preferredId: providerStore.preferredGenerateProvider?.id
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
