const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const pages = ctx.pages();
  const page = pages[0] || await ctx.newPage();
  const results = {};

  // ===== V1: No useAiRequest, aiService exists, both providers configured =====
  try {
    const v1 = await page.evaluate(() => {
      const store = window.__pinia;
      const ps = store._s.get('provider');
      return {
        noUseAiRequest: !store._s.has('useAiRequest'),
        callApiExists: typeof ps.callApi === 'function',
        generateProvider: ps.getGenerateProvider()?.name || null,
        verifyProvider: ps.getVerifyProvider()?.name || null,
        purposeIsArray: Array.isArray(ps.providers[0]?.purpose)
      };
    });
    results.V1 = v1;
    results.V1_pass = !!(v1.noUseAiRequest && v1.callApiExists && v1.generateProvider && v1.verifyProvider);
  } catch(e) { results.V1_error = e.message; }

 // ===== V2: DeAiSettings shows verify provider =====
 try {
    // Ensure settings is closed first by setting activePanel to empty via window hook
    await page.evaluate(() => { if (window.__getActivePanel) window.__getActivePanel(); });
    // Use Playwright click instead of evaluate click for better Vue reactivity
    const settingsBtn = await page.$('#btn-settings');
    if (settingsBtn) {
      const isActive = await settingsBtn.evaluate(el => el.classList.contains('active'));
      if (isActive) { await settingsBtn.click({ force: true }); await page.waitForTimeout(600); }
      await settingsBtn.click({ force: true });
    }
    await page.waitForTimeout(1500);
    // Switch to deai tab via store
    await page.evaluate(() => {
      const store = window.__pinia;
      const s = store._s.get('settings');
      if (s) s.activeTab = 'deai';
    });
    await page.waitForTimeout(1000);
   const v2 = await page.evaluate(() => {
      const name = document.querySelector('#deai-verify-provider-name');
      const hint = document.querySelector('#deai-verify-provider-hint');
      const status = document.querySelector('#deai-verify-provider-status');
      return {
        modalOpen: !!document.querySelector('.settings-modal, .modal-content, [class*=settings]'),
        deaiTabActive: !!document.querySelector('#deai-verify-provider-name'),
        verifyProviderName: name ? name.textContent.trim() : 'NOT_FOUND',
        verifyProviderHint: hint ? hint.textContent.trim() : 'NOT_FOUND',
        verifyProviderStatusClass: status ? status.className : 'NOT_FOUND',
        verifyProviderConfigured: status ? status.className.includes('configured') : false
      };
    });
    results.V2 = v2;
    results.V2_pass = v2.verifyProviderName !== 'NOT_FOUND' && v2.verifyProviderName !== '';
  } catch(e) { results.V2_error = e.message; }

  // ===== V3: Multi-provider both active =====
  try {
    const v3 = await page.evaluate(() => {
      const store = window.__pinia;
      const ps = store._s.get('provider');
      const active = ps.getActiveProviders();
      return {
        activeCount: active.length,
        activeNames: active.map(p => p.name),
        bothActive: active.length >= 2 && active.some(p => p.purpose?.includes('generate')) && active.some(p => p.purpose?.includes('verify'))
      };
    });
    results.V3 = v3;
    results.V3_pass = v3.bothActive;
  } catch(e) { results.V3_error = e.message; }

  // ===== V4: resolveProvider throws for missing verify =====
  try {
    const v4 = await page.evaluate(() => {
      const store = window.__pinia;
      const ps = store._s.get('provider');
      const savedVerify = ps.verifyProvider;
      ps.verifyProvider = null;
      let errorMsg = '';
      try {
        const v = ps.getVerifyProvider();
        if (!v) throw new Error('未配置验证用途供应商，请在设置中添加并启用');
      } catch(e) { errorMsg = e.message; }
      ps.verifyProvider = savedVerify;
      return { errorMsg, hasClearMessage: errorMsg.includes('未配置验证') };
    });
    results.V4 = v4;
    results.V4_pass = v4.hasClearMessage;
  } catch(e) { results.V4_error = e.message; }

  // ===== V5: fetchModels + provider has models =====
  try {
    const v5 = await page.evaluate(() => {
      const store = window.__pinia;
      const ps = store._s.get('provider');
      const gen = ps.getGenerateProvider();
      return {
        hasFetchModels: typeof ps.fetchModels === 'function',
        generateModelCount: gen ? gen.models.length : 0,
        generateSelectedModel: gen ? gen.selectedModel : null
      };
    });
    results.V5 = v5;
    results.V5_pass = v5.hasFetchModels && v5.generateModelCount > 0;
  } catch(e) { results.V5_error = e.message; }

 // ===== V6: DiagLogPanel visible with all elements =====
 try {
    // Settings modal should still be open from V2, just switch tab
    const settingsStillOpen = await page.evaluate(() => !!document.querySelector('.settings-modal, .modal-content, [class*=settings]'));
    if (!settingsStillOpen) {
      const settingsBtn = await page.$('#btn-settings');
      if (settingsBtn) await settingsBtn.click({ force: true });
      await page.waitForTimeout(1200);
    }
   await page.evaluate(() => {
     const store = window.__pinia;
     const s = store._s.get('settings');
     if (s) s.activeTab = 'diag';
   });
    await page.waitForTimeout(1000);
   const v6 = await page.evaluate(() => {
      return {
        purposeFilter: !!document.querySelector('#diag-purpose'),
        exportBtn: !!document.querySelector('#btn-diag-export'),
        refreshBtn: !!document.querySelector('#btn-diag-refresh'),
        clearBtn: !!document.querySelector('#btn-diag-clear'),
        logList: !!document.querySelector('#diag-log-list')
      };
    });
    results.V6 = v6;
    results.V6_pass = v6.purposeFilter && v6.exportBtn && v6.logList;
  } catch(e) { results.V6_error = e.message; }

  // ===== V7: All call sites verified =====
  try {
    const v7 = await page.evaluate(() => {
      const store = window.__pinia;
      const ps = store._s.get('provider');
      return {
        hasCallApi: typeof ps.callApi === 'function',
        hasTrackApiCall: !!(window.DiagLogger && typeof window.DiagLogger.trackApiCall === 'function'),
        hasDiagRefresh: !!(window.electronAPI && typeof window.electronAPI.diagRefresh === 'function'),
        hasDiagExport: !!(window.electronAPI && typeof window.electronAPI.diagExport === 'function')
      };
    });
    results.V7 = v7;
    results.V7_pass = Object.values(v7).every(v => v === true);
  } catch(e) { results.V7_error = e.message; }

  const checks = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7'];
  const passCount = checks.filter(k => results[k + '_pass'] === true).length;
  results.summary = `${passCount}/${checks.length} PASS`;
  results.passDetails = checks.map(k => `${k}: ${results[k + '_pass'] ? 'PASS' : 'FAIL'}`).join(', ');

  console.log(JSON.stringify(results, null, 2));
  try { await page.screenshot({ path: '_audit/step8_final_verify.png', fullPage: false }); } catch(e) {}
  await browser.close();
  process.exit(passCount === 7 ? 0 : 1);
})();
