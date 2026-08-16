const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const pages = browser.contexts()[0].pages();
  const page = pages[0];
  await page.waitForTimeout(2000);
  const results = { passed: 0, failed: 0, checks: [] };
  function check(name, ok, detail) {
    if (ok) results.passed++; else results.failed++;
    results.checks.push({ name, ok, detail });
    console.log((ok ? "PASS" : "FAIL") + ": " + name + (detail ? " - " + detail : ""));
  }
  const mcpStoreExists = await page.evaluate(() => {
    try {
      const pinia = window.__pinia;
      if (!pinia) return false;
      return !!(pinia._s && pinia._s.has("mcp"));
    } catch(e) { return false; }
  });
  check("MCP store registered", mcpStoreExists, mcpStoreExists ? "found" : "not found");
  const settingsBtn = await page.$("#btn-settings");
  check("settings button (#btn-settings)", !!settingsBtn, settingsBtn ? "found" : "not found");
  if (settingsBtn) {
    await page.evaluate((el) => el.click(), settingsBtn);
    await page.waitForTimeout(1000);
    const mcpTab = await page.$("#tab-mcp");
    check("MCP tab in settings", !!mcpTab, mcpTab ? "found" : "not found");
    if (mcpTab) {
      const text = await mcpTab.textContent();
      check("MCP tab label", text === "MCP", text);
      await page.evaluate((el) => el.click(), mcpTab);
      await page.waitForTimeout(500);
      const mcpHeader = await page.$(".mcp-header h4");
      check("MCP settings header", !!mcpHeader, mcpHeader ? await mcpHeader.textContent() : "not found");
      const addBtn = await page.$(".mcp-header .btn-primary");
      check("MCP add server button", !!addBtn, addBtn ? "found" : "not found");
      const mcpStoreAfter = await page.evaluate(() => {
        try {
          const pinia = window.__pinia;
          if (!pinia) return false;
          return !!(pinia._s && pinia._s.has("mcp"));
        } catch(e) { return false; }
      });
      check("MCP store after tab click", mcpStoreAfter, mcpStoreAfter ? "found" : "not found");
    }
  }
  console.log("");
  console.log("========================================");
  console.log("Phase E: " + results.passed + "/" + (results.passed + results.failed) + " passed");
  console.log("========================================");
  await browser.close();
})();
