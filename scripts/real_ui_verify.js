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

  // Step 1: Reset pipeline to clean state with real outline
  log("=== STEP 1: Reset pipeline to clean state ===");
  var resetResult = await page.evaluate(() => {
    var app = window.app;
    var p = app._getProjectData();
    if (!p) return { error: "no_project" };
    if (!p._pipeline) p._pipeline = {};
    var pl = p._pipeline;
    // Copy REAL outline to pipeline
    pl.outlineText = p.outline || pl.outlineText || "";
    // Clear fake test data
    pl.styleTags = "";
    pl.pacingParams = "";
    pl.outlineAnalyzed = false;
    pl.outlineConfirmed = false;
    pl.settingsConfirmed = false;
    pl.volumesConfirmed = false;
    pl.chaptersConfirmed = false;
    pl.step = 1;
    pl.volumes = [];
    pl.chapters = {};
    pl.settingsText = "";
    pl.volumesText = "";
    pl.chaptersText = "";
    app._plPersist(pl);
    return { ok: true, outlineLen: pl.outlineText.length };
  });
  log("[RESET] " + JSON.stringify(resetResult));
  if (resetResult.error) { log("[ERR] " + resetResult.error); process.exit(1); }

  // Step 2: Install spy wrapper (NOT replacement) on apiGenerate
  log("=== STEP 2: Install spy wrapper on apiGenerate ===");
  var spyInstalled = await page.evaluate(() => {
    var app = window.app;
    if (app._originalApiGenerate) return { error: "spy_already_installed" };
    app._originalApiGenerate = app.apiGenerate.bind(app);
    window._spyCalls = [];
    app.apiGenerate = async function(type, params, onChunk, opts) {
      var callInfo = {
        type: type,
        paramsPreview: (params || "").substring(0, 500),
        paramsLen: (params || "").length,
        hasStyleContext: (params || "").indexOf("[风格与节奏分析]") >= 0,
        hasStyleTags: (params || "").indexOf("风格标签") >= 0,
        hasChapterWordCount: (params || "").indexOf("每章约") >= 0,
        hasBodyWordCount: (params || "").indexOf("字的正文") >= 0,
        timestamp: new Date().toISOString(),
        skillIds: opts && opts.skillIds ? opts.skillIds.length : 0
      };
      window._spyCalls.push(callInfo);
      console.log("[SPY] apiGenerate called: type=" + type + " paramsLen=" + callInfo.paramsLen + " hasStyle=" + callInfo.hasStyleContext);
      // Call ORIGINAL - real API, not mock
      var result = await app._originalApiGenerate(type, params, onChunk, opts);
      callInfo.resultLen = result ? result.length : 0;
      callInfo.resultPreview = result ? result.substring(0, 200) : "";
      return result;
    };
    return { ok: true };
  });
  log("[SPY] " + JSON.stringify(spyInstalled));
  if (spyInstalled.error) { log("[ERR] " + spyInstalled.error); process.exit(1); }

  // Step 3: Navigate to pipeline panel and click confirm outline
  log("=== STEP 3: Navigate to pipeline, click confirm outline ===");
  await page.evaluate(() => { var b = document.getElementById("btn-pipeline"); if (b) b.click(); });
  await sleep(1500);
  await page.screenshot({ path: EVIDENCE_DIR + "/real_ui_step1_pipeline_" + TS + ".png" });
  log("[SHOT] pipeline panel saved");

  // Click confirm outline button
  var confirmClicked = await page.evaluate(() => {
    var btn = document.getElementById("btn-pl-confirm-outline");
    if (!btn) {
      // Try to find it by text
      var btns = document.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent.indexOf("确认大纲") >= 0 || btns[i].textContent.indexOf("保存") >= 0) {
          btns[i].click();
          return { ok: true, method: "text_search", text: btns[i].textContent.trim().substring(0, 30) };
        }
      }
      return { error: "confirm_outline_btn_not_found" };
    }
    btn.click();
    return { ok: true, method: "id" };
  });
  log("[CONFIRM] " + JSON.stringify(confirmClicked));

  // Step 4: Wait for _plAnalyzeOutline real API call (up to 3 minutes)
  log("=== STEP 4: Wait for _plAnalyzeOutline real API call (up to 180s) ===");
  var analyzeResult = null;
  for (var wait = 0; wait < 36; wait++) {
    await sleep(5000);
    var state = await page.evaluate(() => {
      var p = window.app._getProjectData();
      var pl = p ? p._pipeline : null;
      var spyOutlineCalls = (window._spyCalls || []).filter(function(c) { return c.type === "outline-analysis"; });
      return {
        outlineAnalyzed: pl ? pl.outlineAnalyzed : false,
        styleTags: pl ? pl.styleTags : "",
        pacingParams: pl ? pl.pacingParams : "",
        outlineConfirmed: pl ? pl.outlineConfirmed : false,
        spyCallCount: (window._spyCalls || []).length,
        outlineAnalysisCalls: spyOutlineCalls.length,
        lastSpyCall: spyOutlineCalls.length > 0 ? spyOutlineCalls[spyOutlineCalls.length - 1] : null
      };
    });
    log("[WAIT " + (wait*5+5) + "s] analyzed=" + state.outlineAnalyzed + " styleTags=" + (state.styleTags||"").substring(0,40) + " spyCalls=" + state.spyCallCount + " outlineCalls=" + state.outlineAnalysisCalls);
    if (state.outlineAnalyzed && state.styleTags) {
      analyzeResult = state;
      log("[OK] _plAnalyzeOutline completed!");
      break;
    }
    if (state.outlineAnalysisCalls > 0 && state.lastSpyCall && state.lastSpyCall.resultLen != null) {
      analyzeResult = state;
      log("[OK] Outline analysis API call returned");
      break;
    }
  }

  await page.screenshot({ path: EVIDENCE_DIR + "/real_ui_step2_after_outline_" + TS + ".png" });
  log("[SHOT] after outline analysis saved");

  // Step 5: Build report
  var report = {
    timestamp: new Date().toISOString(),
    testType: "real_ui_flow_no_mock",
    screenshot1: EVIDENCE_DIR + "/real_ui_step1_pipeline_" + TS + ".png",
    screenshot2: EVIDENCE_DIR + "/real_ui_step2_after_outline_" + TS + ".png",
    resetResult: resetResult,
    spyInstalled: spyInstalled,
    confirmClicked: confirmClicked,
    analyzeResult: analyzeResult,
    allSpyCalls: await page.evaluate(() => window._spyCalls || [])
  };

  // Determine pass/fail for _plAnalyzeOutline
  report.analyzePass = !!(analyzeResult && analyzeResult.outlineAnalyzed && analyzeResult.styleTags);
  report.conclusion = report.analyzePass
    ? "PASS: _plAnalyzeOutline真实调用了API，styleTags/pacingParams被存储到pipeline数据模型"
    : "FAIL: _plAnalyzeOutline未完成或未存储styleTags";

  fs.writeFileSync(EVIDENCE_DIR + "/real_ui_verify_report.json", JSON.stringify(report, null, 2));
  log("=== REPORT ===");
  log("analyzePass=" + report.analyzePass);
  log("conclusion=" + report.conclusion);
  if (analyzeResult) {
    log("styleTags=" + (analyzeResult.styleTags||"").substring(0, 80));
    log("pacingParams=" + (analyzeResult.pacingParams||"").substring(0, 80));
    log("spyCalls=" + analyzeResult.spyCallCount + " outlineCalls=" + analyzeResult.outlineAnalysisCalls);
  }

  // Restore original apiGenerate
  await page.evaluate(() => {
    if (window.app._originalApiGenerate) {
      window.app.apiGenerate = window.app._originalApiGenerate;
      delete window.app._originalApiGenerate;
    }
  });
  log("[OK] apiGenerate restored to original");

  process.exit(report.analyzePass ? 0 : 1);
}
run().catch(function(e) { log("[ERR] " + e.message + "\n" + e.stack); process.exit(1); });
