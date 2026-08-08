const { chromium } = require("playwright");
const fs = require("fs");

const CDP_PORT = 9223;
const EVIDENCE_DIR = "test_evidence";
const TS = Date.now();
const ISO = new Date().toISOString();
const PROGRESS_LOG = EVIDENCE_DIR + "/cdp_progress.log";

var gReport = {
  timestamp: ISO,
  electronPid: "n/a",
  cdpPort: CDP_PORT,
  nodeVersion: process.version,
  apiConfigured: false,
  items: [],
  passCount: 0,
  failCount: 0,
  conclusion: "needs_fix"
};

function log(msg) {
  var line = "[" + new Date().toISOString() + "] " + msg;
  try { fs.appendFileSync(PROGRESS_LOG, line + "\n"); } catch(e) {}
  process.stdout.write(line + "\n");
}

function flushReport() {
  try { fs.writeFileSync(EVIDENCE_DIR + "/cdp_behavior_report.json", JSON.stringify(gReport, null, 2)); } catch(e) {}
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function saveShot(name, path) {
  if (!path) { log("SHOT_SKIP " + name + " (no path)"); return null; }
  log("SHOT_SAVED " + name + " -> " + path);
  return path;
}

function addResult(name, pass, expected, actual, screenshot, extra) {
  var item = { name: name, status: pass ? "PASS" : "FAIL", expected: expected, actual: actual, screenshot: screenshot, timestamp: new Date().toISOString() };
  if (extra) item.extra = extra;
  gReport.items.push(item);
  if (pass) gReport.passCount++; else gReport.failCount++;
  log("[" + (pass ? "PASS" : "FAIL") + "] " + name + " -> " + (typeof actual === "string" ? actual.slice(0, 240) : JSON.stringify(actual).slice(0, 240)));
  flushReport();
}

async function run() {
  log("Playwright connecting over CDP to port " + CDP_PORT);
  var browser = await chromium.connectOverCDP("http://127.0.0.1:" + CDP_PORT);
  var ctx = browser.contexts()[0];
  var pages = ctx.pages();
  var page = pages[0];
  if (!page) { log("[ERR] No page"); process.exit(1); }
  log("[OK] connected, pages=" + pages.length);

  try {
    var pid = await page.evaluate(function() {
      try { return (typeof process !== "undefined" && process.pid) ? process.pid : (typeof require === "function" ? require("process").pid : "n/a"); }
      catch(e) { return "n/a"; }
    }).catch(function(){ return "n/a"; });
    gReport.electronPid = String(pid);
    log("[INFO] electronPid=" + gReport.electronPid);

    var configured = await page.evaluate(function() { return (window.app && window.app.isConfigured) ? true : false; });
    gReport.apiConfigured = !!configured;
    log("[INFO] isConfigured=" + configured);

    // ===== V1: settings categories dynamic =====
    log("=== V1 START ===");
    try {
      await page.evaluate(function() { var b = document.getElementById("btn-open-project"); if (b) b.click(); });
      await sleep(450);
      await page.evaluate(function() { var b = document.getElementById("btn-new-project"); if (b) b.click(); });
      await sleep(450);
      var projName = "CDPyanzheng_" + TS;
      await page.evaluate(function(n) {
        var elN = document.getElementById("npm-name");
        var elO = document.getElementById("npm-outline");
        if (elN) { elN.value = n; elN.dispatchEvent(new Event("input")); }
        if (elO) { elO.value = "测试大纲主角穿越异世界开启修炼之路"; elO.dispatchEvent(new Event("input")); }
      }, projName);
      await sleep(200);
      await page.evaluate(function() { var b = document.getElementById("btn-create-project"); if (b) b.click(); });
      await sleep(900);

      var pid1 = await page.evaluate(function() { return (window.app && window.app.currentProjectId) ? window.app.currentProjectId : null; });
      log("[INFO] new project id=" + pid1);

      await page.evaluate(function() { var b = document.getElementById("btn-settings-collection"); if (b) b.click(); });
      await sleep(800);

      var catInfo = await page.evaluate(function() {
        var c = document.getElementById("sc-categories");
        if (!c) return { error: "no_container" };
        var btns = c.querySelectorAll(".sc-cat-btn");
        var hard = [];
        btns.forEach(function(b) { if (!b.classList.contains("sc-cat-add")) hard.push(b.textContent.trim()); });
        return { totalBtns: btns.length, hardcodedCount: hard.length, hardcodedCats: hard, innerHtmlLen: c.innerHTML.length, innerHtmlHead: c.innerHTML.substring(0, 200) };
      });

      var persistInfo = await page.evaluate(function() {
        try {
          var pid = window.app.currentProjectId;
          if (!pid) return { error: "no_pid" };
          var p = StorageManager.get("project-" + pid);
          if (!p) return { error: "no_project_in_storage" };
          var sc = p.settingsCollection;
          return { hasSC: !!sc, scCategories: sc ? (sc.categories || null) : null, scItemsKeys: sc ? Object.keys(sc.items || {}) : [], projectName: p.name };
        } catch(e) { return { error: e.message }; }
      });

      var shot1Path = EVIDENCE_DIR + "/v1_settings_cats_" + TS + ".png";
      await page.screenshot({ path: shot1Path });
      var shot1 = saveShot("v1_settings_cats", shot1Path);

      var v1Pass = (catInfo.hardcodedCount === 0) && persistInfo.hasSC && Array.isArray(persistInfo.scCategories) && persistInfo.scCategories.length === 0 && persistInfo.scItemsKeys.length === 0;
      addResult(
        "1.设定分类动态化",
        v1Pass,
        "新项目 sc-categories 无硬编码分类(角色/世界观/物种/物资)，且持久化 settingsCollection.categories=[]",
        "UI硬编码分类数=" + catInfo.hardcodedCount + (catInfo.hardcodedCats && catInfo.hardcodedCats.length ? " (" + catInfo.hardcodedCats.join(",") + ")" : "") + "; 持久化 categories=" + JSON.stringify(persistInfo.scCategories) + " itemsKeys=" + JSON.stringify(persistInfo.scItemsKeys) + (persistInfo.error ? " [err:" + persistInfo.error + "]" : ""),
        shot1,
        { catInfo: catInfo, persistInfo: persistInfo, projectId: pid1, storageNote: "持久化层 StorageManager(electronAPI文件存储 key=project-<id>) 非浏览器IndexedDB" }
      );
    } catch(e) {
      var shotE1 = EVIDENCE_DIR + "/v1_err_" + TS + ".png";
      try { await page.screenshot({ path: shotE1 }); } catch(e2) {}
      addResult("1.设定分类动态化", false, "新项目分类为空", "EXCEPTION: " + e.message, saveShot("v1_err", shotE1), { stack: e.stack });
    }
    log("=== V1 END ===");

    // ===== V2: outline word count binding =====
    log("=== V2 START ===");
    try {
      await page.evaluate(function() { var b = document.getElementById("btn-pipeline"); if (b) b.click(); });
      await sleep(800);
      await page.evaluate(function() { var s = document.querySelector('.pl-step[data-step="1"]'); if (s) s.click(); });
      await sleep(400);

      var setInputState = await page.evaluate(function() {
        var ta = document.getElementById("pl-outline");
        if (ta) { ta.value = "测试大纲主角穿越异世界开启修炼之路逐步成长直至登顶"; ta.dispatchEvent(new Event("input")); }
        var wc = document.getElementById("pl-book-word-count");
        if (wc) { wc.value = "50"; wc.dispatchEvent(new Event("input")); }
        return { outlineLen: ta ? ta.value.length : 0, wcVal: wc ? wc.value : null };
      });
      log("[INFO] setInput: " + JSON.stringify(setInputState));
      await sleep(250);

      var shotPrePath = EVIDENCE_DIR + "/v2_outline_input_pre_" + TS + ".png";
      await page.screenshot({ path: shotPrePath });
      var shotPre = saveShot("v2_outline_input_pre", shotPrePath);

      await page.evaluate(function() { var b = document.getElementById("btn-pl-confirm-outline"); if (b) b.click(); });
      await sleep(900);

      var memInfo = await page.evaluate(function() {
        try { var pl = window.app._plData(); return { bookWordCount: pl.bookWordCount, outlineConfirmed: pl.outlineConfirmed, step: pl.step, outlineTextLen: pl.outlineText ? pl.outlineText.length : 0 }; }
        catch(e) { return { error: e.message }; }
      });

      var persist2 = await page.evaluate(function() {
        try {
          var pid = window.app.currentProjectId;
          var p = StorageManager.get("project-" + pid);
          if (!p) return { error: "no_project" };
          var pl = p._pipeline;
          return { persistedBookWordCount: pl ? pl.bookWordCount : "no_pipeline", persistedOutlineConfirmed: pl ? pl.outlineConfirmed : null };
        } catch(e) { return { error: e.message }; }
      });

      var shot2Path = EVIDENCE_DIR + "/v2_wordcount_" + TS + ".png";
      await page.screenshot({ path: shot2Path });
      var shot2 = saveShot("v2_wordcount", shot2Path);

      var v2Pass = (memInfo.bookWordCount === 500000) && (persist2.persistedBookWordCount === 500000);
      addResult(
        "2.大纲字数绑定",
        v2Pass,
        "输入50万字 -> _plData().bookWordCount===500000 且持久化 project._pipeline.bookWordCount===500000",
        "内存 bookWordCount=" + memInfo.bookWordCount + " outlineConfirmed=" + memInfo.outlineConfirmed + " step=" + memInfo.step + "; 持久化 bookWordCount=" + persist2.persistedBookWordCount + (persist2.error ? " [err:" + persist2.error + "]" : ""),
        shot2,
        { memInfo: memInfo, persistInfo: persist2, preConfirmScreenshot: shotPre }
      );
    } catch(e) {
      var shotE2 = EVIDENCE_DIR + "/v2_err_" + TS + ".png";
      try { await page.screenshot({ path: shotE2 }); } catch(e2) {}
      addResult("2.大纲字数绑定", false, "bookWordCount===500000", "EXCEPTION: " + e.message, saveShot("v2_err", shotE2), { stack: e.stack });
    }
    log("=== V2 END ===");

    // ===== V3a: btn-pl-autogen-volumes =====
    log("=== V3a START ===");
    try {
      await page.evaluate(function() { var s = document.querySelector('.pl-step[data-step="3"]'); if (s) s.click(); });
      await sleep(600);

      var btnInfo = await page.evaluate(function() {
        var b = document.getElementById("btn-pl-autogen-volumes");
        if (!b) return { exists: false };
        var r = b.getBoundingClientRect();
        var cs = getComputedStyle(b);
        var content = document.getElementById("pl-step-3-content");
        var contentCs = content ? getComputedStyle(content) : null;
        return { exists: true, text: b.textContent.trim(), disabled: b.disabled, btnDisplay: cs.display, btnVisibility: cs.visibility, btnOffsetParent: b.offsetParent !== null, btnRectW: Math.round(r.width), btnRectH: Math.round(r.height), btnRectTop: Math.round(r.top), contentDisplay: contentCs ? contentCs.display : null, contentHasHidden: content ? content.classList.contains("pl-hidden") : null };
      });

      var before = await page.evaluate(function() {
        var msgs = [];
        document.querySelectorAll(".notyf__message").forEach(function(m) { msgs.push(m.textContent.trim()); });
        var li = document.getElementById("loading-indicator");
        return { toasts: msgs, loadingDisplay: li ? getComputedStyle(li).display : "n/a" };
      });

      await page.evaluate(function() { var b = document.getElementById("btn-pl-autogen-volumes"); if (b) b.click(); });
      await sleep(1000);

      var after = await page.evaluate(function() {
        var msgs = [];
        document.querySelectorAll(".notyf__message").forEach(function(m) { msgs.push(m.textContent.trim()); });
        var li = document.getElementById("loading-indicator");
        return { toasts: msgs, loadingDisplay: li ? getComputedStyle(li).display : "n/a" };
      });

      var newToasts = (after.toasts || []).filter(function(t) { return (before.toasts || []).indexOf(t) === -1; });
      var loadingShown = (after.loadingDisplay && after.loadingDisplay !== "none");

      var shot3Path = EVIDENCE_DIR + "/v3a_autogen_volumes_" + TS + ".png";
      await page.screenshot({ path: shot3Path });
      var shot3 = saveShot("v3a_autogen_volumes", shot3Path);

      var visible = btnInfo.exists && btnInfo.btnDisplay !== "none" && btnInfo.btnVisibility !== "hidden" && btnInfo.btnOffsetParent && btnInfo.btnRectW > 0 && btnInfo.contentDisplay !== "none" && !btnInfo.contentHasHidden;
      var reacted = newToasts.length > 0 || loadingShown;
      var v3aPass = visible && reacted;
      addResult(
        "3a.自动生成卷纲按钮",
        v3aPass,
        "btn-pl-autogen-volumes 可见可点击，点击后非静默失败(出现toast或loading)",
        "可见=" + visible + " (display=" + btnInfo.btnDisplay + " offset=" + btnInfo.btnOffsetParent + " rectW=" + btnInfo.btnRectW + " contentDisplay=" + btnInfo.contentDisplay + " contentHidden=" + btnInfo.contentHasHidden + "); 反应=" + reacted + " newToasts=" + JSON.stringify(newToasts) + " loading=" + after.loadingDisplay,
        shot3,
        { btnInfo: btnInfo, before: before, after: after, newToasts: newToasts, loadingShown: loadingShown, apiConfigured: !!configured }
      );

      try { await page.evaluate(function() { if (window.app && window.app._hideLoading) window.app._hideLoading(); }); } catch(e) {}
      await sleep(300);
    } catch(e) {
      var shotE3 = EVIDENCE_DIR + "/v3a_err_" + TS + ".png";
      try { await page.screenshot({ path: shotE3 }); } catch(e2) {}
      addResult("3a.自动生成卷纲按钮", false, "可见可点击非静默", "EXCEPTION: " + e.message, saveShot("v3a_err", shotE3), { stack: e.stack });
    }
    log("=== V3a END ===");

    // ===== V3b: btn-pl-autogen-chapters =====
    log("=== V3b START ===");
    try {
      await page.evaluate(function() { var s = document.querySelector('.pl-step[data-step="4"]'); if (s) s.click(); });
      await sleep(600);

      var btnInfo = await page.evaluate(function() {
        var b = document.getElementById("btn-pl-autogen-chapters");
        if (!b) return { exists: false };
        var r = b.getBoundingClientRect();
        var cs = getComputedStyle(b);
        var content = document.getElementById("pl-step-4-content");
        var contentCs = content ? getComputedStyle(content) : null;
        return { exists: true, text: b.textContent.trim(), disabled: b.disabled, btnDisplay: cs.display, btnVisibility: cs.visibility, btnOffsetParent: b.offsetParent !== null, btnRectW: Math.round(r.width), btnRectH: Math.round(r.height), btnRectTop: Math.round(r.top), contentDisplay: contentCs ? contentCs.display : null, contentHasHidden: content ? content.classList.contains("pl-hidden") : null };
      });

      var before = await page.evaluate(function() {
        var msgs = [];
        document.querySelectorAll(".notyf__message").forEach(function(m) { msgs.push(m.textContent.trim()); });
        var li = document.getElementById("loading-indicator");
        return { toasts: msgs, loadingDisplay: li ? getComputedStyle(li).display : "n/a" };
      });

      await page.evaluate(function() { var b = document.getElementById("btn-pl-autogen-chapters"); if (b) b.click(); });
      await sleep(1000);

      var after = await page.evaluate(function() {
        var msgs = [];
        document.querySelectorAll(".notyf__message").forEach(function(m) { msgs.push(m.textContent.trim()); });
        var li = document.getElementById("loading-indicator");
        return { toasts: msgs, loadingDisplay: li ? getComputedStyle(li).display : "n/a" };
      });

      var newToasts = (after.toasts || []).filter(function(t) { return (before.toasts || []).indexOf(t) === -1; });
      var loadingShown = (after.loadingDisplay && after.loadingDisplay !== "none");

      var shot4Path = EVIDENCE_DIR + "/v3b_autogen_chapters_" + TS + ".png";
      await page.screenshot({ path: shot4Path });
      var shot4 = saveShot("v3b_autogen_chapters", shot4Path);

      var visible = btnInfo.exists && btnInfo.btnDisplay !== "none" && btnInfo.btnVisibility !== "hidden" && btnInfo.btnOffsetParent && btnInfo.btnRectW > 0 && btnInfo.contentDisplay !== "none" && !btnInfo.contentHasHidden;
      var reacted = newToasts.length > 0 || loadingShown;
      var v3bPass = visible && reacted;
      addResult(
        "3b.自动生成章节按钮",
        v3bPass,
        "btn-pl-autogen-chapters 可见可点击，点击后非静默失败(出现toast或loading)",
        "可见=" + visible + " (display=" + btnInfo.btnDisplay + " offset=" + btnInfo.btnOffsetParent + " rectW=" + btnInfo.btnRectW + " contentDisplay=" + btnInfo.contentDisplay + " contentHidden=" + btnInfo.contentHasHidden + "); 反应=" + reacted + " newToasts=" + JSON.stringify(newToasts) + " loading=" + after.loadingDisplay,
        shot4,
        { btnInfo: btnInfo, before: before, after: after, newToasts: newToasts, loadingShown: loadingShown, apiConfigured: !!configured }
      );

      try { await page.evaluate(function() { if (window.app && window.app._hideLoading) window.app._hideLoading(); }); } catch(e) {}
    } catch(e) {
      var shotE4 = EVIDENCE_DIR + "/v3b_err_" + TS + ".png";
      try { await page.screenshot({ path: shotE4 }); } catch(e2) {}
      addResult("3b.自动生成章节按钮", false, "可见可点击非静默", "EXCEPTION: " + e.message, saveShot("v3b_err", shotE4), { stack: e.stack });
    }
    log("=== V3b END ===");

    gReport.conclusion = (gReport.failCount === 0) ? "ready_to_commit" : "needs_fix";
  } catch(e) {
    log("[ERR] fatal: " + e.message);
    gReport.fatalError = e.message;
    gReport.conclusion = "needs_fix";
  } finally {
    try { await browser.close(); } catch(e) {}
  }

  flushReport();
  log("report written: " + EVIDENCE_DIR + "/cdp_behavior_report.json");
  log("PASS=" + gReport.passCount + " FAIL=" + gReport.failCount + " conclusion=" + gReport.conclusion);
  process.exit(gReport.failCount === 0 ? 0 : 1);
}

run().catch(function(e) { log("[ERR] " + e.message); flushReport(); process.exit(1); });
setTimeout(function() { log("[WARN] GLOBAL TIMEOUT 180s"); gReport.conclusion = "needs_fix"; gReport.fatalError = "global timeout 180s"; flushReport(); process.exit(2); }, 180000);
