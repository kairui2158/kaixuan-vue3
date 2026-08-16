const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForTimeout(2000);
  
  // Check page state
  const state = await page.evaluate(() => {
    const pipelinePanel = document.querySelector('#pipeline-panel');
    const pipelineBtn = document.querySelector('#btn-pipeline');
    return {
      pipelinePanel: !!pipelinePanel,
      pipelineBtn: !!pipelineBtn,
      pipelineBtnText: pipelineBtn ? pipelineBtn.textContent : 'N/A',
      execLogBtn: !!document.querySelector('#btn-exec-log'),
      execLogPanel: !!document.querySelector('.pl-exec-log'),
    };
  });
  console.log('Page state:', JSON.stringify(state, null, 2));
  
  // If pipeline panel is not open, open it
  if (!state.pipelinePanel && state.pipelineBtn) {
    console.log('Opening pipeline panel...');
    await page.evaluate(() => {
      document.querySelector('#btn-pipeline').click();
    });
    await page.waitForTimeout(1500);
    
    const state2 = await page.evaluate(() => {
      return {
        pipelinePanel: !!document.querySelector('#pipeline-panel'),
        execLogBtn: !!document.querySelector('#btn-exec-log'),
      };
    });
    console.log('After click:', JSON.stringify(state2));
  }
  
  // If pipeline panel is open, check for exec log button
  const btn = await page.$('#btn-exec-log');
  console.log('exec log button:', btn ? 'found' : 'not found');
  
  if (btn) {
    // Click it via evaluate
    await page.evaluate(() => {
      document.querySelector('#btn-exec-log').click();
    });
    await page.waitForTimeout(500);
    
    const panel = await page.$('.pl-exec-log');
    console.log('exec log panel after click:', panel ? 'visible' : 'hidden');
    
    if (panel) {
      const html = await panel.evaluate(el => el.outerHTML.substring(0, 300));
      console.log('Panel HTML:', html);
    }
  }
  
  // Check Pinia stores
  const stores = await page.evaluate(() => {
    try {
      const pinia = window.__pinia;
      if (!pinia) return { error: 'no __pinia', keys: [] };
      const keys = pinia._s ? Array.from(pinia._s.keys()) : [];
      return { keys };
    } catch(e) {
      return { error: e.message };
    }
  });
  console.log('Pinia stores:', JSON.stringify(stores));
  
  await browser.close();
})();
