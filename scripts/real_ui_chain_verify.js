const { chromium } = require("playwright");
const fs = require("fs");

const CDP_PORT = 9223;
const EVIDENCE_DIR = "test_evidence";
const TS = Date.now();

function log(msg) { process.stdout.write("[" + new Date().toISOString() + "] " + msg + "\n"); }
function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function run() {
  log("Connecting CDP port " + CDP_PORT);
  var browser = await chromium.connectOverCDP("http://127.0.0.1:" + CDP_PORT);
  var page = browser.contexts()[0].pages()[0];
  log("[OK] Connected");

  // Verify current state has real styleTags from previous run
  var state0 = await page.evaluate(() => {
    var p = window.app._getProjectData();
    var pl = p._pipeline;
    return {
      outlineConfirmed: pl.outlineConfirmed,
      styleTags: (pl.styleTags||"").substring(0,60),
      pacingParams: (pl.pacingParams||"").substring(0,60),
      outlineAnalyzed: pl.outlineAnalyzed
    };
  });
  log("[STATE] " + JSON.stringify(state0));
  if (!state0.styleTags || state0.styleTags === "测试内容") {
    log("[ERR] styleTags not real, aborting"); process.exit(1);
  }

  // Install spy
  await page.evaluate(() => {
    var app = window.app;
    if (app._originalApiGenerate) return;
    app._originalApiGenerate = app.apiGenerate.bind(app);
    window._spyCalls2 = [];
    app.apiGenerate = async function(type, params, onChunk, opts) {
      var callInfo = {
        type: type,
        paramsLen: (params||"").length,
        hasStyleContext: (params||"").indexOf("[风格与节奏分析]") >= 0,
        hasStyleTags: (params||"").indexOf("硬科幻") >= 0 || (params||"").indexOf("风格标签") >= 0,
        hasChapterWordCount: (params||"").indexOf("每章约") >= 0,
        hasSuggestedWords: (params||"").indexOf("suggestedWords") >= 0,
        skillIds: opts && opts.skillIds ? opts.skillIds.length : 0,
        timestamp: new Date().toISOString()
      };
      window._spyCalls2.push(callInfo);
      console.log("[SPY2] type=" + type + " hasStyle=" + callInfo.hasStyleContext + " hasWC=" + callInfo.hasChapterWordCount);
      var result = await app._originalApiGenerate(type, params, onChunk, opts);
      callInfo.resultLen = result ? result.length : 0;
      callInfo.resultPreview = result ? result.substring(0, 150) : "";
      return result;
    };
  });
  log("[SPY2] installed");

  var report = { timestamp: new Date().toISOString(), steps: [] };

  // STEP A: Generate settings (AI生成设定)
  log("=== STEP A: Generate settings ===");
  await page.evaluate(() => {
    var b = document.getElementById("btn-pl-gen-settings");
    if (b) b.click();
  });
  // Wait up to 90s for settings generation
  for (var wa = 0; wa < 18; wa++) {
    await sleep(5000);
    var settingsDone = await page.evaluate(() => {
      var pl = window.app._getProjectData()._pipeline;
      var el = document.getElementById("pl-settings-result");
      return {
        settingsText: (pl.settingsText||"").substring(0,80),
        hasContent: el ? el.innerHTML.length > 20 : false,
        spyCount: (window._spyCalls2||[]).length
      };
    });
    log("[A wait " + (wa*5+5) + "s] settingsText=" + settingsDone.settingsText.substring(0,40) + " spy=" + settingsDone.spyCount);
    if (settingsDone.settingsText && settingsDone.settingsText !== "") break;
  }
  var spyA = await page.evaluate(() => (window._spyCalls2||[]).filter(c=>c.type==="settings"));
  report.steps.push({ name: "generate_settings", spyCalls: spyA, screenshot: null });
  log("[A] settings spy calls=" + spyA.length);

  // STEP B: Confirm settings, go to volumes
  log("=== STEP B: Confirm settings ===");
  await page.evaluate(() => {
    var pl = window.app._getProjectData()._pipeline;
    pl.settingsConfirmed = true;
    window.app._plPersist(pl);
    window.app._plShowStep(3);
    window.app._plRefreshSteps();
  });
  await sleep(1000);

  // STEP C: Generate volumes
  log("=== STEP C: Generate volumes ===");
  await page.evaluate(() => { window._spyCalls2 = []; });
  await page.evaluate(() => {
    var b = document.getElementById("btn-pl-gen-volumes");
    if (b) b.click();
  });
  for (var wc = 0; wc < 24; wc++) {
    await sleep(5000);
    var volDone = await page.evaluate(() => {
      var pl = window.app._getProjectData()._pipeline;
      return {
        volumesCount: pl.volumes ? pl.volumes.length : 0,
        volumesText: (pl.volumesText||"").substring(0,60),
        spyCount: (window._spyCalls2||[]).length
      };
    });
    log("[C wait " + (wc*5+5) + "s] volumes=" + volDone.volumesCount + " text=" + volDone.volumesText.substring(0,30) + " spy=" + volDone.spyCount);
    if (volDone.volumesCount > 0 && volDone.volumesText) break;
  }
  var spyC = await page.evaluate(() => (window._spyCalls2||[]).filter(c=>c.type==="volumes"));
  await page.screenshot({ path: EVIDENCE_DIR + "/real_ui_volumes_" + TS + ".png" });
  report.steps.push({ name: "generate_volumes", spyCalls: spyC, screenshot: EVIDENCE_DIR + "/real_ui_volumes_" + TS + ".png" });
  log("[C] volumes spy calls=" + spyC.length);

  // Check volume cards render suggestedWords
  var volRender = await page.evaluate(() => {
    var pl = window.app._getProjectData()._pipeline;
    var cards = document.querySelectorAll("#pl-volume-cards .pl-vol-card, #pl-volume-cards > div");
    var hasWordDisplay = false;
    cards.forEach(function(c) { if (c.textContent.indexOf("本卷字数") >= 0) hasWordDisplay = true; });
    return {
      volumeCount: pl.volumes.length,
      firstVolName: pl.volumes[0] ? pl.volumes[0].name : "none",
      firstVolWords: pl.volumes[0] ? pl.volumes[0].suggestedWords : "none",
      cardCount: cards.length,
      hasWordDisplay: hasWordDisplay
    };
  });
  log("[C-RENDER] " + JSON.stringify(volRender));
  report.volRender = volRender;

  // Build final report
  var allPass = true;
  report.checks = [];
  for (var i = 0; i < report.steps.length; i++) {
    var step = report.steps[i];
    for (var j = 0; j < step.spyCalls.length; j++) {
      var c = step.spyCalls[j];
      var pass = c.hasStyleContext;
      report.checks.push({ step: step.name, type: c.type, hasStyleContext: c.hasStyleContext, pass: pass });
      if (!pass) allPass = false;
    }
  }
  report.allPass = allPass;
  report.styleTagsFromAnalyze = state0.styleTags;

  fs.writeFileSync(EVIDENCE_DIR + "/real_ui_chain_report.json", JSON.stringify(report, null, 2));
  log("=== CHAIN REPORT ===");
  log("allPass=" + allPass);
  for (var k = 0; k < report.checks.length; k++) {
    log("  [" + (report.checks[k].pass?"PASS":"FAIL") + "] " + report.checks[k].step + "/" + report.checks[k].type + " hasStyle=" + report.checks[k].hasStyleContext);
  }
  if (volRender) log("volRender: " + JSON.stringify(volRender));

  // Restore
  await page.evaluate(() => { if (window.app._originalApiGenerate) { window.app.apiGenerate = window.app._originalApiGenerate; delete window.app._originalApiGenerate; } });

  process.exit(allPass ? 0 : 1);
}
run().catch(function(e) { log("[ERR] " + e.message + "\n" + e.stack); process.exit(1); });
