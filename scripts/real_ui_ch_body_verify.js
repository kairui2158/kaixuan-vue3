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

  // Verify preconditions
  var state0 = await page.evaluate(() => {
    var p = window.app._getProjectData();
    var pl = p._pipeline;
    return {
      styleTags: (pl.styleTags||"").substring(0,40),
      chapterWordCount: pl.chapterWordCount,
      settingsTextLen: (pl.settingsText||"").length,
      volumesCount: pl.volumes ? pl.volumes.length : 0,
      vol0Confirmed: pl.volumes[0] ? pl.volumes[0].confirmed : false,
      vol0Chapters: pl.volumes[0] ? (pl.volumes[0].chapters||[]).length : 0
    };
  });
  log("[STATE] " + JSON.stringify(state0));
  if (!state0.styleTags || state0.settingsTextLen === 0) {
    log("[ERR] preconditions not met"); process.exit(1);
  }

  // Install spy
  await page.evaluate(() => {
    var app = window.app;
    if (app._originalApiGenerate) return;
    app._originalApiGenerate = app.apiGenerate.bind(app);
    window._spyCh = [];
    app.apiGenerate = async function(type, params, onChunk, opts) {
      var info = {
        type: type,
        paramsLen: (params||"").length,
        hasStyleContext: (params||"").indexOf("[风格与节奏分析]") >= 0,
        hasStyleTags: (params||"").indexOf("硬科幻") >= 0,
        hasChapterWordCount: (params||"").indexOf("每章约") >= 0,
        hasBodyWordCount: (params||"").indexOf("字的正文") >= 0,
        hasSettings: (params||"").indexOf("[设定摘要]") >= 0,
        skillIds: opts && opts.skillIds ? opts.skillIds.length : 0,
        timestamp: new Date().toISOString(),
        paramsSnippet: (params||"").substring(0, 300)
      };
      window._spyCh.push(info);
      log_msg = "[SPY-CH] type=" + type + " hasStyle=" + info.hasStyleContext + " hasWC=" + info.hasChapterWordCount + " hasBody=" + info.hasBodyWordCount;
      console.log(log_msg);
      var result = await app._originalApiGenerate(type, params, onChunk, opts);
      info.resultLen = result ? result.length : 0;
      info.resultPreview = result ? result.substring(0, 150) : "";
      return result;
    };
  });
  log("[SPY] installed");

  var report = { timestamp: new Date().toISOString(), steps: [] };

  // STEP 1: Generate chapters for volume 0 via _plGenChaptersForVolume
  log("=== STEP 1: Generate chapters for volume 0 (real API) ===");
  await page.evaluate(() => { window._spyCh = []; });
  await page.evaluate(() => {
    try { window.app._plGenChaptersForVolume(0); }
    catch(e) { window._spyCh.push({error: e.message}); }
  });
  // Wait up to 120s
  var chDone = false;
  for (var w1 = 0; w1 < 24; w1++) {
    await sleep(5000);
    var chState = await page.evaluate(() => {
      var pl = window.app._getProjectData()._pipeline;
      var vol = pl.volumes[0];
      return {
        chapters: vol ? (vol.chapters||[]).length : 0,
        spyCount: (window._spyCh||[]).length,
        chaptersText: (pl.chaptersText||"").substring(0, 60)
      };
    });
    log("[CH wait " + (w1*5+5) + "s] chapters=" + chState.chapters + " spy=" + chState.spyCount + " text=" + chState.chaptersText.substring(0,30));
    if (chState.chapters > 0) { chDone = true; break; }
    if (chState.spyCount > 0) {
      var spyInfo = await page.evaluate(() => window._spyCh[window._spyCh.length-1]);
      if (spyInfo && spyInfo.resultLen != null) { chDone = true; break; }
    }
  }
  var spyCh = await page.evaluate(() => (window._spyCh||[]).filter(c=>!c.error));
  await page.screenshot({ path: EVIDENCE_DIR + "/real_ui_chapters_" + TS + ".png" });
  report.steps.push({ name: "generate_chapters", spyCalls: spyCh, screenshot: EVIDENCE_DIR + "/real_ui_chapters_" + TS + ".png" });
  log("[CH] done=" + chDone + " spyCalls=" + spyCh.length);

  // Check chapter card rendering
  var chRender = await page.evaluate(() => {
    var pl = window.app._getProjectData()._pipeline;
    var vol = pl.volumes[0];
    var cards = document.querySelectorAll("#pl-chapter-cards > div");
    var hasWordInput = false;
    cards.forEach(function(c) { if (c.textContent.indexOf("目标字数") >= 0 || c.querySelector("input[type=number]")) hasWordInput = true; });
    return {
      chapterCount: vol ? (vol.chapters||[]).length : 0,
      firstChTitle: vol && vol.chapters[0] ? vol.chapters[0].title : "none",
      firstChWordCount: vol && vol.chapters[0] ? vol.chapters[0].wordCount : "none",
      cardCount: cards.length,
      hasWordInput: hasWordInput
    };
  });
  log("[CH-RENDER] " + JSON.stringify(chRender));
  report.chRender = chRender;

  // Confirm all chapters
  if (chDone && chRender.chapterCount > 0) {
    await page.evaluate(() => {
      var pl = window.app._getProjectData()._pipeline;
      var vol = pl.volumes[0];
      vol.chapters.forEach(function(ch) { ch.confirmed = true; });
      pl.chaptersConfirmed = true;
      pl.step = 5;
      window.app._plPersist(pl);
    });
    log("[OK] Chapters confirmed, step=5");
  }

  // STEP 2: Generate body for chapter 0 via _plGenBodyForChapter
  log("=== STEP 2: Generate body for chapter 0 (real API) ===");
  await page.evaluate(() => { window._spyCh = []; });
  await page.evaluate(() => {
    try { window.app._plGenBodyForChapter(0, 0); }
    catch(e) { window._spyCh.push({error: e.message}); }
  });
  var bodyDone = false;
  for (var w2 = 0; w2 < 36; w2++) {
    await sleep(5000);
    var bodyState = await page.evaluate(() => {
      var pl = window.app._getProjectData()._pipeline;
      var vol = pl.volumes[0];
      var ch = vol && vol.chapters ? vol.chapters[0] : null;
      return {
        bodyLen: ch ? (ch.body||"").length : 0,
        bodyGenerated: ch ? ch.bodyGenerated : false,
        spyCount: (window._spyCh||[]).length
      };
    });
    log("[BODY wait " + (w2*5+5) + "s] bodyLen=" + bodyState.bodyLen + " generated=" + bodyState.bodyGenerated + " spy=" + bodyState.spyCount);
    if (bodyState.bodyGenerated && bodyState.bodyLen > 50) { bodyDone = true; break; }
    if (bodyState.spyCount > 0) {
      var spyInfo2 = await page.evaluate(() => window._spyCh[window._spyCh.length-1]);
      if (spyInfo2 && spyInfo2.resultLen != null && spyInfo2.resultLen > 50) { bodyDone = true; break; }
    }
  }
  var spyBody = await page.evaluate(() => (window._spyCh||[]).filter(c=>!c.error));
  await page.screenshot({ path: EVIDENCE_DIR + "/real_ui_body_" + TS + ".png" });
  report.steps.push({ name: "generate_body", spyCalls: spyBody, screenshot: EVIDENCE_DIR + "/real_ui_body_" + TS + ".png" });
  log("[BODY] done=" + bodyDone + " spyCalls=" + spyBody.length);

  // Build final report
  report.chRender = chRender;
  report.bodyDone = bodyDone;
  report.chDone = chDone;
  report.styleTags = state0.styleTags;
  report.chapterWordCount = state0.chapterWordCount;

  var checks = [];
  var allPass = true;
  for (var i = 0; i < report.steps.length; i++) {
    var step = report.steps[i];
    for (var j = 0; j < step.spyCalls.length; j++) {
      var c = step.spyCalls[j];
      var pass;
      if (step.name === "generate_chapters") {
        pass = c.hasStyleContext && c.hasChapterWordCount;
        checks.push({ step: step.name, type: c.type, hasStyleContext: c.hasStyleContext, hasChapterWordCount: c.hasChapterWordCount, resultLen: c.resultLen, pass: pass });
      } else if (step.name === "generate_body") {
        pass = c.hasStyleContext && c.hasBodyWordCount;
        checks.push({ step: step.name, type: c.type, hasStyleContext: c.hasStyleContext, hasBodyWordCount: c.hasBodyWordCount, resultLen: c.resultLen, pass: pass });
      }
      if (!pass) allPass = false;
    }
  }
  report.checks = checks;
  report.allPass = allPass;

  fs.writeFileSync(EVIDENCE_DIR + "/real_ui_ch_body_report.json", JSON.stringify(report, null, 2));
  log("=== FINAL REPORT ===");
  log("chDone=" + chDone + " bodyDone=" + bodyDone + " allPass=" + allPass);
  for (var k = 0; k < checks.length; k++) {
    log("  [" + (checks[k].pass?"PASS":"FAIL") + "] " + checks[k].step + "/" + checks[k].type + " style=" + checks[k].hasStyleContext + " wc=" + (checks[k].hasChapterWordCount||checks[k].hasBodyWordCount) + " resultLen=" + checks[k].resultLen);
  }
  if (chRender) log("chRender: " + JSON.stringify(chRender));

  // Restore
  await page.evaluate(() => { if (window.app._originalApiGenerate) { window.app.apiGenerate = window.app._originalApiGenerate; delete window.app._originalApiGenerate; } });
  log("[OK] apiGenerate restored");

  process.exit(allPass ? 0 : 1);
}
run().catch(function(e) { log("[ERR] " + e.message + "\n" + e.stack); process.exit(1); });
