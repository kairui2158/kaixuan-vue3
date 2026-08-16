const { chromium } = require('playwright');
async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  const state = await page.evaluate(() => {
    const proj = window.electronAPI.storageRead('wa_project_prj_msbtqnpe_q24wr3');
    const cfg = window.electronAPI.storageRead('wa_pipeline_step_config') || {};
    return {
      volCount: proj?.volumes?.length,
      volNames: (proj?.volumes || []).map(v => v.name),
      settings: (proj?.settings || []).length,
      providerCfgStored: window.electronAPI.storageRead('wa_providers'),
      preferredGenerateProvider: window.electronAPI.storageRead('wa_appSettings'),
      pipelineCfg: cfg
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
