const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const state = await page.evaluate(() => {
    const app = document.querySelector('#app');
    const pinia = app?.__vue_app__?.config?.globalProperties?.$pinia;
    let stores = {};
    if (pinia) {
      stores = {};
      for (const k of Object.keys(pinia._s || {})) {
        const s = pinia._s.get(k);
        stores[k] = Object.fromEntries(Object.entries(s || {}).map(([key, v]) => [key, typeof v === 'object' && v !== null ? 'obj' : v]));
      }
    }
    return {
      hasPinia: !!pinia,
      storeNames: pinia ? [...pinia._s.keys()] : [],
      stores: Object.fromEntries(Object.entries(stores).map(([k, v]) => [k, Object.keys(v).filter(x => x !== 'name' && x !== 'id').slice(0, 30)]))
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
