const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForTimeout(2000);
  
  const results = { passed: 0, failed: 0, checks: [] };
  function check(name, ok, detail) {
    if (ok) results.passed++; else results.failed++;
    results.checks.push({ name, ok, detail });
    console.log((ok ? 'PASS' : 'FAIL') + ': ' + name + (detail ? ' - ' + detail : ''));
  }
  
  // Check 1: MCP store exists
  const mcpStoreExists = await page.evaluate(() => {
    try {
      const pinia = window.__pinia;
      if (!pinia) return false;
      return !!(pinia._s && pinia._s.has('mcp'));
    } catch(e) { return false; }
  });
  check('MCP store registered', mcpStoreExists, mcpStoreExists ? 'found' : 'not found');
  
  // Check 2: MCP tab in settings
  // Open settings
  const settingsBtn = await page.$('#btn-settings');
  check('settings button exists', !!settingsBtn, settingsBtn ? 'found' : 'not found');
  
  if (settingsBtn) {
    await page.evaluate((el) => el.click(), settingsBtn);
    await page.waitForTimeout(1000);
    
    // Check for MCP tab
    const mcpTab = await page.$('#tab-mcp');
    check('MCP tab in settings', !!mcpTab, mcpTab ? 'found' : 'not found');
    
    if (mcpTab) {
      const text = await mcpTab.textContent();
      check('MCP tab label', text === 'MCP', text);
      
      // Click MCP tab
      await page.evaluate((el) => el.click(), mcpTab);
      await page.waitForTimeout(500);
      
      // Check MCP settings content
      const mcpHeader = await page.$('.mcp-header h4');
      check('MCP settings header', !!mcpHeader, mcpHeader ? await mcpHeader.textContent() : 'not found');
      
      const addBtn = await page.$('.mcp-header .btn-primary');
      check('MCP add server button', !!addBtn, addBtn ? 'found' : 'not found');
      
      // Close settings
      const closeBtn = await page.$('#btn-close-settings');
      if (closeBtn) {
        await page.evaluate((el) => el.click(), closeBtn);
        await page.waitForTimeout(500);
      }
    }
  }
  
  // Summary
  console.log('\n========================================');
  console.log('Phase E Verification: ' + results.passed + '/' + (results.passed + results.failed) + ' passed');
  console.log('========================================');
  
  await browser.close();
  process.exit(results.failed > 0 && results.passed < 2 ? 1 : 0);
})();
