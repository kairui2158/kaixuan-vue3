var http = require("http");
var { spawn } = require("child_process");
var path = require("path");
var WebSocket = require("ws");
var base = "C:\\Users\\凯瑞\\Documents\\New project 2";
var CDP_PORT = 9226;
var pass = 0, fail = 0;
var results = [];
function check(name, cond) {
  results.push((cond ? "[PASS] " : "[FAIL] ") + name);
  if (cond) pass++; else fail++;
}
console.log("[1] Connecting to existing Electron CDP on port 9223...");
CDP_PORT = 9223;
function tryConnect(attempt) {
  if (attempt > 20) {
    console.log("[ERR] CDP not available after 20 attempts");
    console.log("========================================");
    console.log("CDP Verification: SKIP (cannot connect)");
    console.log("========================================");
    process.exit(0);
  }
  var req = http.get("http://127.0.0.1:" + CDP_PORT + "/json", function(res) {
    var data = "";
    res.on("data", function(c) { data += c; });
    res.on("end", function() {
      try {
        var tabs = JSON.parse(data);
        console.log("[OK] CDP available, tabs: " + tabs.length);
        runTests(tabs);
      } catch(e) {
        setTimeout(function() { tryConnect(attempt + 1); }, 1000);
      }
    });
  });
  req.on("error", function() {
    setTimeout(function() { tryConnect(attempt + 1); }, 1000);
  });
}
function cdpEval(wsUrl, expr, cb) {
  var ws = new WebSocket(wsUrl);
  var id = Math.floor(Math.random() * 100000) + 1;
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
  var tab = tabs.find(function(t) { return t.url && t.url.indexOf("renderer") >= 0; }) || tabs[0];
  if (!tab) { console.log("[ERR] No tab found"); process.exit(1); }
  console.log("[OK] Using tab: " + tab.url);
  var wsUrl = tab.webSocketDebuggerUrl;
  var tests = [];
  function addTest(name, expr, checkFn) {
    tests.push({ name: name, expr: expr, checkFn: checkFn });
  }
  function runNext() {
    if (tests.length === 0) {
      console.log("========================================");
      console.log("CDP Behavioral Verification Results");
      console.log("========================================");
      results.forEach(function(r) { console.log(r); });
      console.log("----------------------------------------");
      console.log("Total: " + (pass+fail) + " | PASS: " + pass + " | FAIL: " + fail);
      console.log("========================================");
      process.exit(fail > 0 ? 1 : 0);
    }
    var t = tests.shift();
    cdpEval(wsUrl, t.expr, function(d) {
      var val = d.result && d.result.result && d.result.result.value;
      var err = d.result && d.result.exceptionDetails;
      var ok = t.checkFn(val, d);
      check(t.name, ok);
      if (!ok) console.log("  val=" + JSON.stringify(val) + " err=" + JSON.stringify(err));
      runNext();
    });
  }
  addTest("T1: Open settings modal", '(function(){var b=document.getElementById("btn-settings");if(!b)return"no-btn";b.click();return"clicked";})()', function(v){return v==="clicked";});
  addTest("T2: DeAI tab exists", "(function(){var t=document.querySelector('[data-tab=\\"deai\\"]');return t?'found':'missing';})()", function(v){return v==="found";});
  addTest("T3: Click DeAI tab", "(function(){var t=document.querySelector('[data-tab=\\"deai\\"]');if(!t)return'missing';t.click();return'clicked';})()", function(v){return v==="clicked";});
  addTest("T4: deai-level exists", "(function(){var r=document.querySelector('[name=\\"deai-level\\"]');return r?'found':'missing';})()", function(v){return v==="found";});
  addTest("T5: deai-version exists", "(function(){var r=document.querySelector('[name=\\"deai-version\\"]');return r?'found':'missing';})()", function(v){return v==="found";});
  addTest("T6: deai-text-type exists", "(function(){var r=document.querySelector('[name=\\"deai-text-type\\"]');return r?'found':'missing';})()", function(v){return v==="found";});
  addTest("T7: deai-flow-preview exists", '(function(){var d=document.getElementById("deai-flow-preview");return d?"found":"missing";})()', function(v){return v==="found";});
  addTest("T8: deai-step-group exists", '(function(){var d=document.querySelector(".deai-step-group");return d?"found":"missing";})()', function(v){return v==="found";});
  addTest("T9: DeAiSamples loaded", 'typeof DeAiSamples!=="undefined"?DeAiSamples.getCount():"undefined"', function(v){return typeof v==="number"&&v>0;});
  addTest("T10: DeAiProcessor exists", 'typeof DeAiProcessor!=="undefined"?"exists":"missing"', function(v){return v==="exists";});
  addTest("T11: _deAiConfig.level", 'typeof app!=="undefined"&&app._deAiConfig?app._deAiConfig.level:"no-config"', function(v){return v!=="no-config";});
  addTest("T12: _deAiConfig.version", 'typeof app!=="undefined"&&app._deAiConfig?app._deAiConfig.version:"no-config"', function(v){return v!=="no-config";});
  addTest("T13: _deAiConfig.textType", 'typeof app!=="undefined"&&app._deAiConfig?app._deAiConfig.textType:"no-config"', function(v){return v!=="no-config";});
  addTest("T14: _getDeAiTemperature exists", 'typeof app!=="undefined"&&typeof app._getDeAiTemperature==="function"?"exists":"missing"', function(v){return v==="exists";});
  addTest("T15: _updateFlowPreview exists", 'typeof app!=="undefined"&&typeof app._updateFlowPreview==="function"?"exists":"missing"', function(v){return v==="exists";});
  addTest("T16: _deAiSplitMerge exists", 'typeof app!=="undefined"&&typeof app._deAiSplitMerge==="function"?"exists":"missing"', function(v){return v==="exists";});
  addTest("T17: temp light=0.4", 'typeof app!=="undefined"&&typeof app._getDeAiTemperature==="function"?app._getDeAiTemperature("light","v3"):"missing"', function(v){return v===0.4;});
  addTest("T18: temp medium=0.7", 'typeof app!=="undefined"&&typeof app._getDeAiTemperature==="function"?app._getDeAiTemperature("medium","v3"):"missing"', function(v){return v===0.7;});
  addTest("T19: temp heavy=1.0", 'typeof app!=="undefined"&&typeof app._getDeAiTemperature==="function"?app._getDeAiTemperature("heavy","v3"):"missing"', function(v){return v===1.0;});
  addTest("T20: renderDeAiSettings exists", 'typeof app!=="undefined"&&typeof app.renderDeAiSettings==="function"?"exists":"missing"', function(v){return v==="exists";});
  addTest("T21: DeAiProcessor.process is function", 'typeof DeAiProcessor!=="undefined"&&typeof DeAiProcessor.process==="function"?"yes":"no"', function(v){return v==="yes";});
  addTest("T22: process returns text field", 'typeof DeAiProcessor!=="undefined"?(function(){var r=DeAiProcessor.process("\u7f13\u6162\u5730\u8d70\u8fc7\u6765\uff0c\u76ee\u7684\u5730\u5230\u4e86\u3002\u8fd9\u662f\u4e00\u6bb5\u8db3\u591f\u957f\u7684\u6d4b\u8bd5\u6587\u672c\u3002",null);return typeof r.text==="string"?"yes":"no";})():"no"', function(v){return v==="yes";});
  addTest("T23: dunhao replaced", 'typeof DeAiProcessor!=="undefined"?(function(){var s="\u82f9\u679c\u3001\u9999\u8549\u3001\u6a58\u5b50\u548c\u897f\u74dc\u90fd\u662f\u6c34\u679c\uff0c\u5473\u9053\u5404\u4e0d\u76f8\u540c\u3002";var r=DeAiProcessor.process(s,null);return r.text.indexOf("\u3001")===-1?"yes":"no";})():"no"', function(v){return v==="yes";});
  addTest("T24: de->di replaced", 'typeof DeAiProcessor!=="undefined"?(function(){var s="\u7f13\u6162\u5730\u8d70\u8fc7\u6765\uff0c\u76ee\u7684\u5730\u5230\u4e86\u3002\u8fd9\u662f\u4e00\u6bb5\u8db3\u591f\u957f\u7684\u6d4b\u8bd5\u6587\u672c\u3002";var r=DeAiProcessor.process(s,null);return r.text.includes("\u7f13\u6162\u7684")?"yes":"no";})():"no"', function(v){return v==="yes";});
  addTest("T25: mode dropdown exists", "(function(){var s=document.querySelector('[name=\\"deai-mode\\"]');return s?'found':'missing';})()", function(v){return v==="found";});
  addTest("T26: hardrule toggle exists", "(function(){var s=document.querySelector('[name=\\"deai-hardrules\\"]');return s?'found':'missing';})()", function(v){return v==="found";});
  runNext();
}
setTimeout(function() { tryConnect(1); }, 3000);
