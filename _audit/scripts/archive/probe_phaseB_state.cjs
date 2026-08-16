const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages().find((p) => p.url().startsWith('file:'));
  if (!page) throw new Error('no file page');
  await page.waitForSelector('#app', { timeout: 15000 });
  await page.waitForTimeout(1200);

  const data = await page.evaluate(() => {
    const app = document.querySelector('#app');
    const pinia = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$pinia;
    const pipelineStore = pinia && pinia._s && pinia._s.get('pipeline');
    const providerStore = pinia && pinia._s && pinia._s.get('provider');
    const skillStore = pinia && pinia._s && pinia._s.get('skill');
    const engine = window.SkillExecutionEngine;
    const steps = [...document.querySelectorAll('.pl-steps .pl-step')].map((el, i) => {
      const id = 'pl-s' + (i + 1) + '-mode';
      const s = document.getElementById(id);
      const r = s ? s.getBoundingClientRect() : null;
      return {
        i,
        label: el.querySelector('.pl-step-label')?.textContent.trim(),
        active: el.classList.contains('active'),
        modeFound: !!s,
        modeVisible: !!(s && (r.width || r.height)),
        modeValue: s ? s.value : null,
        modeOptions: s ? [...s.options].map((o) => o.value) : []
      };
    });
    return {
      url: location.href,
      title: document.title,
      hasBtnPipeline: !!document.querySelector('#btn-pipeline'),
      hasPanel: !!document.querySelector('#pipeline-panel, .pipeline-panel'),
      stepCount: steps.length,
      steps,
      hasEngine: !!engine,
      engineMethods: engine ? Object.keys(engine) : [],
      hasPipelineStore: !!pipelineStore,
      pipelineCurrentStep: pipelineStore ? pipelineStore.currentStep : null,
      hasProviderStore: !!providerStore,
      providerCount: providerStore && providerStore.providers ? providerStore.providers.length : 0,
      preferred: providerStore ? providerStore.preferredGenerateProvider : null,
      hasSkillStore: !!skillStore,
      skillCount: skillStore && skillStore.skills ? skillStore.skills.length : 0,
      storedConfig: window.electronAPI && window.electronAPI.storageRead
        ? JSON.stringify(window.electronAPI.storageRead('shenyi__pipeline_step_config') || null).slice(0, 800)
        : 'no storageRead'
    };
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
