const { chromium } = require("playwright");
const fs = require("fs");

const CDP_PORT = 9223;
const EVIDENCE_DIR = "test_evidence";

function log(msg) { process.stdout.write("[" + new Date().toISOString() + "] " + msg + "\n"); }

async function run() {
  log("Connecting CDP port " + CDP_PORT);
  var browser = await chromium.connectOverCDP("http://127.0.0.1:" + CDP_PORT);
  var ctx = browser.contexts()[0];
  var pages = ctx.pages();
  var page = pages[0];
  if (!page) { log("[ERR] No page found"); process.exit(1); }
  log("[OK] Connected, pages=" + pages.length);

  // Step 1: Setup pipeline data + intercept apiGenerate
  var setup = await page.evaluate(() => {
    var app = window.app;
    if (!app) return { error: "no_app" };
    app.isConfigured = true;
    if (!app.currentProjectId) return { error: "no_project" };
    var p = app._getProjectData();
    if (!p) return { error: "no_project_data" };
    if (!p._pipeline) p._pipeline = {};
    var pl = p._pipeline;
    pl.outlineText = "测试大纲：主角陈暮在末日废土中求生，与菌膜装甲共生，建立岫岩城。";
    pl.styleTags = "冷峻克制,信息密度高";
    pl.pacingParams = "快节奏,高潮间隔约5章";
    pl.outlineAnalyzed = true;
    pl.chapterWordCount = 3000;
    pl.agentId = null;
    pl.s4Skills = [];
    pl.s5Skills = [];
    pl.bookWordCount = 500000;
    pl.volumes = [{
      id: "vol_t1", name: "第一卷 测试", outline: "第一卷卷纲：陈暮苏醒，发现菌膜，建立据点。",
      summary: "第一卷摘要", confirmed: true, suggestedWords: 50000,
      chapters: []
    }];
    pl.settingsText = "";
    pl.settingsConfirmed = true;
    pl.volumesConfirmed = true;
    pl.chaptersConfirmed = false;
    app._plPersist(pl);

    // Intercept apiGenerate
    window._captured = [];
    app.apiGenerate = async function(type, params, onChunk, opts) {
      window._captured.push({
        type: type,
        params: params || "",
        hasChapterWordCount: (params||"").indexOf("每章约") >= 0,
        hasWordCount3000: (params||"").indexOf("3000") >= 0,
        hasStyleContext: (params||"").indexOf("[风格与节奏分析]") >= 0,
        hasStyleTags: (params||"").indexOf("冷峻克制") >= 0,
        hasPacingParams: (params||"").indexOf("快节奏") >= 0,
        hasBodyWordCount: (params||"").indexOf("3500字") >= 0,
        hasBodyWordCount3500: (params||"").indexOf("3500字") >= 0
      });
      if (type === "chapters") return JSON.stringify([{title:"第1章 测试","plot":"测试剧情","summary":"摘要"}]);
      if (type === "body") return "测试正文内容3000字。";
      if (type === "volumes") return JSON.stringify([{name:"第一卷",outline:"卷纲",suggestedWords:50000}]);
      return "测试内容";
    };
    return { ok: true, pid: app.currentProjectId };
  });
  log("[SETUP] " + JSON.stringify(setup));
  if (setup.error) { log("[ERR] " + setup.error); process.exit(1); }

  var results = [];

  // Test A: _plGenChaptersDirect (line 1048)
  await page.evaluate(() => { window._captured = []; try { window.app._plGenChaptersDirect(0); } catch(e) { window._captured.push({error:e.message}); } });
  await new Promise(r => setTimeout(r, 1200));
  var capA = await page.evaluate(() => window._captured);
  log("[A] _plGenChaptersDirect captured=" + capA.length);
  results.push({ test: "_plGenChaptersDirect", calls: capA });

  // Test B: _plGenChaptersForVolume (line 1102)
  await page.evaluate(() => { window._captured = []; try { window.app._plGenChaptersForVolume(0); } catch(e) { window._captured.push({error:e.message}); } });
  await new Promise(r => setTimeout(r, 1200));
  var capB = await page.evaluate(() => window._captured);
  log("[B] _plGenChaptersForVolume captured=" + capB.length);
  results.push({ test: "_plGenChaptersForVolume", calls: capB });

  // Test C: _plAutoGenChapters (line 1149)
  await page.evaluate(() => { window._captured = []; try { window.app._plAutoGenChapters(0); } catch(e) { window._captured.push({error:e.message}); } });
  await new Promise(r => setTimeout(r, 1200));
  var capC = await page.evaluate(() => window._captured);
  log("[C] _plAutoGenChapters captured=" + capC.length);
  results.push({ test: "_plAutoGenChapters", calls: capC });

  // Setup chapter for body gen
  await page.evaluate(() => {
    var p = window.app._getProjectData();
    if (p && p._pipeline && p._pipeline.volumes && p._pipeline.volumes[0]) {
      p._pipeline.volumes[0].chapters = [{ id:"ch_t1", title:"第1章 测试", plot:"测试剧情", summary:"摘要", confirmed:true, wordCount:3500, body:"", bodyGenerated:false }];
      window.app._plPersist(p._pipeline);
    }
  });

  // Test D: _plGenBodyForChapter (line 80)
  await page.evaluate(() => { window._captured = []; try { window.app._plGenBodyForChapter(0, 0); } catch(e) { window._captured.push({error:e.message}); } });
  await new Promise(r => setTimeout(r, 1200));
  var capD = await page.evaluate(() => window._captured);
  log("[D] _plGenBodyForChapter captured=" + capD.length);
  results.push({ test: "_plGenBodyForChapter", calls: capD });

  // Test E: _plGenVolumes (line 615)
  await page.evaluate(() => { window._captured = []; try { window.app._plGenVolumes(); } catch(e) { window._captured.push({error:e.message}); } });
  await new Promise(r => setTimeout(r, 1200));
  var capE = await page.evaluate(() => window._captured);
  log("[E] _plGenVolumes captured=" + capE.length);
  results.push({ test: "_plGenVolumes", calls: capE });

  // Test F: _plAutoGenVolumes (line 670)
  await page.evaluate(() => { window._captured = []; try { window.app._plAutoGenVolumes(); } catch(e) { window._captured.push({error:e.message}); } });
  await new Promise(r => setTimeout(r, 1200));
  var capF = await page.evaluate(() => window._captured);
  log("[F] _plAutoGenVolumes captured=" + capF.length);
  results.push({ test: "_plAutoGenVolumes", calls: capF });

  // Build report
  var report = { timestamp: new Date().toISOString(), tests: [] };
  var allPass = true;

  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var caps = r.calls;
    if (caps.length === 0) {
      report.tests.push({ name: r.test, status: "FAIL", reason: "no_api_call_captured" });
      allPass = false;
      continue;
    }
    var c = caps[0];
    if (c.error) {
      report.tests.push({ name: r.test, status: "FAIL", reason: c.error });
      allPass = false;
      continue;
    }
    var isBody = r.test.indexOf("Body") >= 0;
    var isChapter = !isBody && (r.test.indexOf("Chapter") >= 0 || r.test.indexOf("Chapters") >= 0);
    var isVolume = r.test.indexOf("Vol") >= 0;
    var pass;
    var checks = {};
    if (isChapter) {
      checks.hasChapterWordCount = c.hasChapterWordCount;
      checks.hasWordCount3000 = c.hasWordCount3000;
      checks.hasStyleContext = c.hasStyleContext;
      checks.hasStyleTags = c.hasStyleTags;
      pass = c.hasChapterWordCount && c.hasWordCount3000 && c.hasStyleContext && c.hasStyleTags;
    } else if (isBody) {
      checks.hasStyleContext = c.hasStyleContext;
      checks.hasStyleTags = c.hasStyleTags;
      checks.hasBodyWordCount = c.hasBodyWordCount3500;
      pass = c.hasStyleContext && c.hasStyleTags && c.hasBodyWordCount3500;
    } else if (isVolume) {
      checks.hasStyleContext = c.hasStyleContext;
      checks.hasStyleTags = c.hasStyleTags;
      pass = c.hasStyleContext && c.hasStyleTags;
    } else { pass = false; }
    report.tests.push({ name: r.test, status: pass ? "PASS" : "FAIL", checks: checks, paramSnippet: (c.params||"").substring(0, 200) });
    if (!pass) allPass = false;
  }
  report.allPass = allPass;
  report.summary = report.tests.length + " tests, " + report.tests.filter(function(t){return t.status==="PASS";}).length + " PASS, " + report.tests.filter(function(t){return t.status==="FAIL";}).length + " FAIL";

  fs.writeFileSync(EVIDENCE_DIR + "/cdp_chapter_skill_verify.json", JSON.stringify(report, null, 2));
  log("=== FINAL REPORT ===");
  log(report.summary);
  for (var j = 0; j < report.tests.length; j++) {
    log("  [" + report.tests[j].status + "] " + report.tests[j].name + (report.tests[j].checks ? " " + JSON.stringify(report.tests[j].checks) : "") + (report.tests[j].reason ? " reason=" + report.tests[j].reason : ""));
  }
  log("allPass=" + allPass);
  process.exit(allPass ? 0 : 1);
}
run().catch(function(e) { log("[ERR] " + e.message); process.exit(1); });
