const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const state = await page.evaluate(() => {
    const app = document.querySelector('#app');
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia;
    if (!pinia) return { error: 'no pinia' };
    const projectStore = pinia._s.get('project');
    const providerStore = pinia._s.get('provider');
    const result = {
      project: {},
      providers: []
    };
    const getVal = (v) => {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
      if (Array.isArray(v)) return 'array(' + v.length + ')';
      if (v && typeof v === 'object') return 'obj';
      return v;
    };
    if (projectStore) {
      for (const k of Object.keys(projectStore)) {
        if (['loadProject','saveProject','loadProjectList','setOutline','lockOutline','syncTreeToPipeline','refreshTree','setSettings','setVolumes','setChapters','updateVolume','confirmVolumes','confirmChapters'].includes(k)) continue;
        const raw = projectStore[k]?.value ?? projectStore[k];
        result.project[k] = getVal(raw);
      }
    }
    if (providerStore) {
      result.providers = (providerStore.providers?.value || []).map(p => ({ id: p.id, key: (p.apiKey || '').slice(0, 15), model: p.selectedModel, baseUrl: p.baseUrl }));
      result.generateProvider = providerStore.generateProvider?.value;
      result.preferred = providerStore.preferredGenerateProvider?.value?.id;
    }
    return result;
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
