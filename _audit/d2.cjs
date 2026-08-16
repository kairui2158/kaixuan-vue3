const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9227');
  const p = b.contexts()[0].pages()[0];
  const r = await p.evaluate(() => {
    const s = document.querySelector(".sidebar, [class*=""sidebar""], [class*=""Sidebar""]");
    if (s) return { sidebar: true, cls: s.className };
    const n = document.querySelectorAll("nav, [class*=""nav""]");
    return { sidebar: false, navCount: n.length };
  });
  console.log('SIDEBAR:', JSON.stringify(r));
  const p2 = await p.evaluate(() => {
    try {
      const a = document.querySelector("#app").__vue_app__;
      const pi = a.config.globalProperties["$pinia"];
      return { count: Object.keys(pi._s).length, stores: Object.keys(pi._s) };
    } catch(e) { return { error: e.message }; }
  });
  console.log('PINIA:', JSON.stringify(p2));
  const sc = await p.evaluate(() => {
    const el = document.querySelector(".sc-overlay, [class*=""settings-collection""], #settings-collection-panel");
    if (el) return { found: true, cls: el.className };
    const btn = document.querySelector("[data-panel=""settings-collection""]");
    return { found: false, btnExists: !!btn };
  });
  console.log('SC:', JSON.stringify(sc));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
