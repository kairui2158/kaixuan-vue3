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
  
  const btnPipeline = await page.$("#btn-pipeline, button:has-text(\"生成\")");
  check("pipeline button exists", !!btnPipeline, btnPipeline ? "found" : "not found");
  
  if (btnPipeline) {
    await page.evaluate((el) => el.click(), btnPipeline);
    await page.waitForTimeout(1500);
    
    // Use evaluate for all clicks to avoid overlay interception
    const flowToggleExists = await page.evaluate(() => {
      const el = document.querySelector("#btn-flow-toggle");
      return !!el;
    });
    check("flow toggle button (#btn-flow-toggle) exists", flowToggleExists, flowToggleExists ? "found" : "not found");
    
    if (flowToggleExists) {
      await page.evaluate(() => {
        document.querySelector("#btn-flow-toggle").click();
      });
      await page.waitForTimeout(500);
      
      const pfFlowExists = await page.evaluate(() => {
        return !!document.querySelector(".pf-flow");
      });
      check("PipelineFlow component visible", pfFlowExists, pfFlowExists ? "found" : "not found");
      
      if (pfFlowExists) {
        const nodeCount = await page.evaluate(() => {
          return document.querySelectorAll(".pf-node").length;
        });
        check("pipeline flow nodes count", nodeCount === 5, nodeCount + " nodes");
        
        const saveBtnExists = await page.evaluate(() => {
          return !!document.querySelector("#btn-pf-save");
        });
        check("save config button exists", saveBtnExists, saveBtnExists ? "found" : "not found");
        
        const loadBtnExists = await page.evaluate(() => {
          return !!document.querySelector("#btn-pf-load");
        });
        check("load config button exists", loadBtnExists, loadBtnExists ? "found" : "not found");
        
        if (saveBtnExists) {
          await page.evaluate(() => {
            document.querySelector("#btn-pf-save").click();
          });
          await page.waitForTimeout(500);
          const dialogExists = await page.evaluate(() => {
            return !!document.querySelector(".pf-dialog");
          });
          check("save dialog opens", dialogExists, dialogExists ? "found" : "not found");
          await page.evaluate(() => {
            const el = document.querySelector(".pf-dialog-overlay");
            if (el) el.style.display = "none";
          });
          await page.waitForTimeout(300);
        }
        
        const listToggleExists = await page.evaluate(() => {
          return !!document.querySelector("#btn-pf-list-toggle");
        });
        check("list toggle button exists", listToggleExists, listToggleExists ? "found" : "not found");
        
        if (listToggleExists) {
          await page.evaluate(() => {
            document.querySelector("#btn-pf-list-toggle").click();
          });
          await page.waitForTimeout(500);
          const step1Exists = await page.evaluate(() => {
            return !!document.querySelector("#pl-step-1-content");
          });
          check("step panels visible after toggle back", step1Exists, step1Exists ? "found" : "not found");
        }
      }
    }
  }
  
  console.log("");
  console.log("========================================");
  console.log("Phase F: " + results.passed + "/" + (results.passed + results.failed) + " passed");
  console.log("========================================");
  
  await browser.close();
})();
