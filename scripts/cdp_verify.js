var http = require("http");
var { execSync } = require("child_process");
var base = "C:\\Users\\凯瑞\\Documents\\New project 2";

// Step 1: Start Electron with CDP
console.log("[1] Starting Electron with CDP port 9224...");
try {
  execSync('start /B npx electron . --remote-debugging-port=9224', { cwd: base, timeout: 5000, stdio: "ignore" });
} catch(e) { /* non-blocking */ }

// Step 2: Wait for CDP to be ready
var tabs = null;
var attempts = 0;
function tryConnect() {
  attempts++;
  if (attempts > 15) {
    console.log("[ERR] CDP not available after 15 attempts");
    process.exit(1);
  }
  var req = http.get("http://127.0.0.1:9224/json", function(res) {
    var data = "";
    res.on("data", function(c) { data += c; });
    res.on("end", function() {
      try {
        tabs = JSON.parse(data);
        console.log("[OK] CDP available, tabs: " + tabs.length);
        runTests(tabs);
      } catch(e) {
        console.log("[WARN] Parse error, retrying... attempt " + attempts);
        setTimeout(tryConnect, 1000);
      }
    });
  });
  req.on("error", function() {
    console.log("[WAIT] CDP not ready, attempt " + attempts + "/15...");
    setTimeout(tryConnect, 1000);
  });
}

function cdpEval(wsUrl, expr, cb) {
  var WebSocket = require("ws");
  var ws = new WebSocket(wsUrl);
  var id = 1;
  ws.on("open", function() {
    ws.send(JSON.stringify({ id: id, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true } }));
  });
  ws.on("message", function(msg) {
    var d = JSON.parse(msg);
    if (d.id === id) {
      ws.close();
      cb(d);
    }
  });
  ws.on("error", function(e) { cb({ error: e.message }); });
}

function runTests(tabs) {
  var rendererTab = tabs.find(function(t) { return t.url && t.url.includes("renderer"); });
  if (!rendererTab) rendererTab = tabs[0];
  if (!rendererTab) { console.log("[ERR] No tab found"); process.exit(1); }
  console.log("[OK] Using tab: " + rendererTab.url);
  var wsUrl = rendererTab.webSocketDebuggerUrl;
  var pass = 0, fail = 0;
  var tests = [];
  function addTest(name, expr, check) {
    tests.push({ name: name, expr: expr, check: check });
  }
  function runNext() {
    if (tests.length === 0) {
      console.log("========================================");
      console.log("CDP Behavioral Verification Results");
      console.log("========================================");
      console.log("Total: " + (pass+fail) + " | PASS: " + pass + " | FAIL: " + fail);
      console.log("========================================");
      process.exit(fail > 0 ? 1 : 0);
    }
    var t = tests.shift();
    cdpEval(wsUrl, t.expr, function(d) {
      var val = d.result && d.result.result && d.result.result.value;
      var ok = t.check(val, d);
      if (ok) { pass++; console.log("[PASS] " + t.name); }
      else { fail++; console.log("[FAIL] " + t.name + " | val=" + JSON.stringify(val) + " | err=" + (d.result && d.result.exceptionDetails ? JSON.stringify(d.result.exceptionDetails) : "none")); }
      runNext();
    });
  }

  // T1: Open settings modal
  addTest("T1: Settings modal open", '(function(){ var b=document.getElementById("btn-settings"); if(!b) return "no-btn"; b.click(); return "clicked"; })()', function(v){ return v === "clicked"; });

  // T2: DeAI tab exists
  addTest("T2: DeAI tab exists", '(function(){ var t=document.querySelector("[data-tab=\"deai\"]"); return t ? "found" : "missing"; })()', function(v){ return v === "found"; });

  // T3: DeAI tab clickable
  addTest("T3: DeAI tab clickable", '(function(){ var t=document.querySelector("[data-tab=\"deai\"]"); if(!t) return "missing"; t.click(); return "clicked"; })()', function(v){ return v === "clicked"; });

  // T4: deai-level radio exists
  addTest("T4: deai-level exists", '(function(){ var r=document.querySelector("[name=\"deai-level\"]"); return r ? "found" : "missing"; })()', function(v){ return v === "found"; });

  // T5: deai-version radio exists
  addTest("T5: deai-version exists", '(function(){ var r=document.querySelector("[name=\"deai-version\"]"); return r ? "found" : "missing"; })()', function(v){ return v === "found"; });

  // T6: deai-text-type exists
  addTest("T6: deai-text-type exists", '(function(){ var r=document.querySelector("[name=\"deai-text-type\"]"); return r ? "found" : "missing"; })()', function(v){ return v === "found"; });

  // T7: deai-flow-preview exists
  addTest("T7: deai-flow-preview exists", '(function(){ var d=document.getElementById("deai-flow-preview"); return d ? "found" : "missing"; })()', function(v){ return v === "found"; });

  // T8: deai-step-group exists
  addTest("T8: deai-step-group exists", '(function(){ var d=document.querySelector(".deai-step-group"); return d ? "found" : "missing"; })()', function(v){ return v === "found"; });

  // T9: DeAiSamples loaded
  addTest("T9: DeAiSamples loaded", 'typeof DeAiSamples !== "undefined" ? DeAiSamples.getCount() : "undefined"', function(v){ return typeof v === "number" && v > 0; });

  // T10: DeAiProcessor exists
  addTest("T10: DeAiProcessor exists", 'typeof DeAiProcessor !== "undefined" ? "exists" : "missing"', function(v){ return v === "exists"; });

  // T11: _deAiConfig has new fields
  addTest("T11: _deAiConfig.level", 'typeof app !== "undefined" && app._deAiConfig ? app._deAiConfig.level : "no-config"', function(v){ return v !== "no-config"; });

  // T12: _deAiConfig.version
  addTest("T12: _deAiConfig.version", 'typeof app !== "undefined" && app._deAiConfig ? app._deAiConfig.version : "no-config"', function(v){ return v !== "no-config"; });

  // T13: _deAiConfig.textType
  addTest("T13: _deAiConfig.textType", 'typeof app !== "undefined" && app._deAiConfig ? app._deAiConfig.textType : "no-config"', function(v){ return v !== "no-config"; });

  // T14: _getDeAiTemperature exists
  addTest("T14: _getDeAiTemperature exists", 'typeof app !== "undefined" && typeof app._getDeAiTemperature === "function" ? "exists" : "missing"', function(v){ return v === "exists"; });

  // T15: _updateFlowPreview exists
  addTest("T15: _updateFlowPreview exists", 'typeof app !== "undefined" && typeof app._updateFlowPreview === "function" ? "exists" : "missing"', function(v){ return v === "exists"; });

  // T16: _deAiSplitMerge exists
  addTest("T16: _deAiSplitMerge exists", 'typeof app !== "undefined" && typeof app._deAiSplitMerge === "function" ? "exists" : "missing"', function(v){ return v === "exists"; });

  // T17: temperature mapping light=0.4
  addTest("T17: temp light=0.4", 'typeof app !== "undefined" && typeof app._getDeAiTemperature === "function" ? app._getDeAiTemperature("light","v3") : "missing"', function(v){ return v === 0.4; });

  // T18: temperature mapping medium=0.7
  addTest("T18: temp medium=0.7", 'typeof app !== "undefined" && typeof app._getDeAiTemperature === "function" ? app._getDeAiTemperature("medium","v3") : "missing"', function(v){ return v === 0.7; });

  // T19: temperature mapping heavy=1.0
  addTest("T19: temp heavy=1.0", 'typeof app !== "undefined" && typeof app._getDeAiTemperature === "function" ? app._getDeAiTemperature("heavy","v3") : "missing"', function(v){ return v === 1.0; });

  // T20: renderDeAiSettings exists
  addTest("T20: renderDeAiSettings exists", 'typeof app !== "undefined" && typeof app.renderDeAiSettings === "function" ? "exists" : "missing"', function(v){ return v === "exists"; });

  // T21: HARD_RULES count via DeAiProcessor
  addTest("T21: DeAiProcessor.process is function", 'typeof DeAiProcessor !== "undefined" && typeof DeAiProcessor.process === "function" ? "yes" : "no"', function(v){ return v === "yes"; });

  // T22: Hard rule process returns object with text
  addTest("T22: process returns text", 'typeof DeAiProcessor !== "undefined" ? (function(){ var r=DeAiProcessor.process("缓慢地走过来，目的地到了。这是一段足够长的测试文本。", null); return typeof r.text === "string" ? "yes" : "no"; })() : "no"', function(v){ return v === "yes"; });

  // T23: dunhao replaced
  addTest("T23: dunhao replaced", 'typeof DeAiProcessor !== "undefined" ? (function(){ var s="苹果、香蕉、橘子和西瓜都是水果，味道各不相同。"; var r=DeAiProcessor.process(s, null); return r.text.indexOf("\u3001") === -1 ? "yes" : "no"; })() : "no"', function(v){ return v === "yes"; });

  // T24: de->di replaced
  addTest("T24: de->di replaced", 'typeof DeAiProcessor !== "undefined" ? (function(){ var s="缓慢地走过来，目的地到了。这是一段足够长的测试文本。"; var r=DeAiProcessor.process(s, null); return r.text.includes("缓慢的") ? "yes" : "no"; })() : "no"', function(v){ return v === "yes"; });

  // T25: mode dropdown exists
  addTest("T25: mode dropdown exists", '(function(){ var s=document.querySelector("[name=\"deai-mode\"]"); return s ? "found" : "missing"; })()', function(v){ return v === "found"; });

  // T26: hardrule toggle exists
  addTest("T26: hardrule toggle exists", '(function(){ var s=document.querySelector("[name=\"deai-hardrules\"]"); return s ? "found" : "missing"; })()', function(v){ return v === "found"; });

  runNext();
}

setTimeout(tryConnect, 3000);
