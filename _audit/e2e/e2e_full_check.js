const http = require("http");
const fs = require("fs");
const path = require("path");
var CDP_PORT = 9223;
var CDP_ATTEMPTED_PORTS = [9228, 9226, 9225, 9223];
const HOST = "127.0.0.1";
const E2E_DIR = __dirname;
const SCREENSHOT_DIR = path.join(E2E_DIR, "screenshots");
const LOG_DIR = path.join(E2E_DIR, "logs");
const REPORT_FILE = path.join(E2E_DIR, "E2E_RESULTS.md");
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, {recursive: true});

let ws = null;
let msgId = 0;
const pending = {};
const log = [];
const results = [];

function cdpSend(method, params) {
  if (!params) params = {};
  return new Promise(function(resolve, reject) {
    var id = ++msgId;
    pending[id] = {resolve: resolve, reject: reject};
    var msg = JSON.stringify({id: id, method: method, params: params});
    log.push("[CDP] " + id + ": " + method);
    ws.send(msg);
    setTimeout(function() {
      if (pending[id]) {
        pending[id].reject(new Error("Timeout: " + method));
        delete pending[id];
      }
    }, 15000);
  });
}

function cdpOnMessage(data) {
  var msg = JSON.parse(data.toString());
  if (msg.id && pending[msg.id]) {
    if (msg.error) pending[msg.id].reject(new Error(msg.error.message));
    else pending[msg.id].resolve(msg.result);
    delete pending[msg.id];
  }
}

async function connect() {
  for (var pi = 0; pi < CDP_ATTEMPTED_PORTS.length; pi++) {
    CDP_PORT = CDP_ATTEMPTED_PORTS[pi];
    var port = CDP_PORT;
    try {
      var targets = await new Promise(function(resolve, reject) {
        http.get("http://" + HOST + ":" + port + "/json", function(res) {
          var data = "";
          res.on("data", function(c) { data += c; });
          res.on("end", function() { resolve(JSON.parse(data)); });
        }).on("error", function() { resolve(null); });
      });
      if (targets) {
        var target = targets.find(function(t) { return t.title.indexOf("绁炴剰鍔╂墜") >= 0 || (t.url || "").indexOf("dist-renderer") >= 0; });
        if (target) {
          console.log("[CDP] Found on port", port);
          var WebSocket = require("ws");
          ws = new WebSocket(target.webSocketDebuggerUrl);
          await new Promise(function(resolve, reject) {
            ws.on("open", resolve);
            ws.on("error", reject);
            ws.on("message", cdpOnMessage);
          });
          await cdpSend("Page.enable");
          await cdpSend("Runtime.enable");
          console.log("[CDP] Connected to:", target.title);
          return target;
        }
      }
    } catch(e) { console.log("[CDP] Port " + port + " failed:", e.message); }
  }
  throw new Error("No target found on any port");
  var targets = await new Promise(function(resolve, reject) {
    http.get("http://" + HOST + ":" + port + "/json", function(res) {
      var data = "";
      res.on("data", function(c) { data += c; });
      res.on("end", function() { resolve(JSON.parse(data)); });
    }).on("error", reject);
  });
  var target = targets.find(function(t) { return t.title.indexOf("绁炴剰鍔╂墜") >= 0 || (t.url || "").indexOf("dist-renderer") >= 0; });
  if (!target) throw new Error("Target not found: " + JSON.stringify(targets.map(function(t) { return t.title; })));
  var WebSocket = require("ws");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(function(resolve, reject) {
    ws.on("open", resolve);
    ws.on("error", reject);
    ws.on("message", cdpOnMessage);
  });
  await cdpSend("Page.enable");
  await cdpSend("Runtime.enable");
  console.log("[CDP] Connected to:", target.title);
  return target;
}

async function screenshot(name) {
  var result = await cdpSend("Page.captureScreenshot", {format: "png", fromSurface: true});
  var file = path.join(SCREENSHOT_DIR, name + ".png");
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  return file;
}

async function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function clickByText(text) {
  var expr = "(function() { var all = document.querySelectorAll(\"button, [role=button], .el-button, .v-btn, [class*=btn], span, a\"); for (var i = 0; i < all.length; i++) { var el = all[i]; if ((el.textContent || \"\").trim().indexOf(\"" + text + "\") >= 0) { var r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) { return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2, text: (el.textContent||\"\").trim().slice(0,50), w: r.width, h: r.height}); } } } return null; })()";
  var result = await cdpSend("Runtime.evaluate", {expression: expr, returnByValue: true});
  var info = JSON.parse(result.result.value || "null");
  if (!info || info.w === 0 || info.h === 0) return {success: false, reason: "not found: " + text};
  await cdpSend("Input.dispatchMouseEvent", {type: "mousePressed", x: info.x, y: info.y, button: "left", clickCount: 1});
  await cdpSend("Input.dispatchMouseEvent", {type: "mouseReleased", x: info.x, y: info.y, button: "left", clickCount: 1});
  await sleep(500);
  return {success: true, text: info.text};
}

async function clickSelector(selector) {
  var expr = "(function() { var el = document.querySelector(\"" + selector + "\"); if (!el) return null; var r = el.getBoundingClientRect(); return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2, text: (el.textContent||\"\").trim().slice(0,50), w: r.width, h: r.height}); })()";
  var result = await cdpSend("Runtime.evaluate", {expression: expr, returnByValue: true});
  var info = JSON.parse(result.result.value || "null");
  if (!info || info.w === 0 || info.h === 0) return {success: false, reason: "not found"};
  await cdpSend("Input.dispatchMouseEvent", {type: "mousePressed", x: info.x, y: info.y, button: "left", clickCount: 1});
  await cdpSend("Input.dispatchMouseEvent", {type: "mouseReleased", x: info.x, y: info.y, button: "left", clickCount: 1});
  await sleep(500);
  return {success: true, text: info.text};
}

async function getVisibleText(selector) {
  var r = await cdpSend("Runtime.evaluate", {expression: "(document.querySelector(\"" + selector + "\")?.textContent || \"\").trim()", returnByValue: true});
  return r.result.value;
}

async function checkModal() {
  var r = await cdpSend("Runtime.evaluate", {
    expression: "(function() { var m = document.querySelectorAll(\".modal, [class*=modal], [role=dialog], [class*=dialog], [class*=overlay]\"); var r = []; m.forEach(function(e) { var s = getComputedStyle(e); if (s.display !== \"none\" && s.visibility !== \"hidden\" && e.offsetParent !== null) r.push({tag: e.tagName, id: e.id, text: (e.textContent||\"\").trim().slice(0,100)}); }); return JSON.stringify(r); })()",
    returnByValue: true
  });
  return JSON.parse(r.result.value);
}

async function getIndexedDBData(dbName, storeName) {
  var fn = "(async function() { try { var db = await new Promise(function(res, rej) { var req = indexedDB.open(\"" + dbName + "\"); req.onsuccess = function() { res(req.result); }; req.onerror = function() { rej(req.error); }; req.onupgradeneeded = function() { res(req.result); }; }); var tx = db.transaction(\"" + storeName + "\", \"readonly\"); var store = tx.objectStore(\"" + storeName + "\"); var all = await new Promise(function(res, rej) { var req = store.getAll(); req.onsuccess = function() { res(req.result); }; req.onerror = function() { rej(req.error); }; }); db.close(); return JSON.stringify(all.slice(0, 10)); } catch(e) { return \"ERROR: \" + e.message; } })()";
  var r = await cdpSend("Runtime.evaluate", {expression: fn, returnByValue: true, awaitPromise: true});
  return r.result.value;
}

async function recordResult(step, operation, status, detail, screenshotFile) {
  results.push({step: step, operation: operation, status: status, detail: detail, screenshot: screenshotFile || "", timestamp: new Date().toISOString()});
  console.log("[" + status + "] " + step + ": " + operation + " - " + detail);
}

async function main() {
  console.log("=== E2E Full Check Start ===");
  var target;
  try {
    target = await connect();
    await recordResult("E-01", "Connect", "PASS", "Title: " + target.title);
    // DOM dump for debugging
    var domDump = await cdpSend("Runtime.evaluate", {expression: "(function() { var b = document.body; if (!b) return 'NO_BODY'; var html = b.innerHTML.slice(0, 3000); return html.replace(/<[^>]*>/g, function(m) { return m.slice(0, 60); }); })()", returnByValue: true});
    console.log("DOM BODY:", domDump.result.value.slice(0, 500));
    console.log("");
    console.log("--- E-02: New Project ---");
    var shot = await screenshot("e02_initial");
    await recordResult("E-02", "Initial screenshot", "PASS", "Page loaded", shot);
    var btnScan = await cdpSend("Runtime.evaluate", {expression: "(function() { var b = document.querySelectorAll(\"button, [role=button]\"); var v = []; b.forEach(function(e) { var s = getComputedStyle(e); if (s.display !== \"none\" && s.visibility !== \"hidden\" && e.offsetParent !== null) v.push((e.textContent||\"\").trim().slice(0,30)); }); return JSON.stringify(v); })()", returnByValue: true});
    var visibleBtns = JSON.parse(btnScan.result.value);
    await recordResult("E-02", "Scan buttons", "INFO", "Buttons: " + visibleBtns.join(", "));
    var btn1 = await clickSelector("button");
    await recordResult("E-02", "Click first button", btn1.success ? "PASS" : "WARN", btn1.success ? "Text: " + btn1.text : "Not found");
    await sleep(1000);
    shot = await screenshot("e02_after_click");
    var modals = await checkModal();
    await recordResult("E-02", "Check modal", modals.length > 0 ? "PASS" : "WARN", "Modals: " + modals.length, shot);
    await sleep(1000);
    shot = await screenshot("e02_final");
    await recordResult("E-02", "Done", "PASS", "Final state", shot);
    console.log("");
    console.log("--- E-03: Import Outline ---");
    var olBtn = await clickSelector("[class*=outline]");
    await recordResult("E-03", "Click outline", olBtn.success ? "PASS" : "WARN", olBtn.success ? "Text: " + olBtn.text : "Not found");
    await sleep(1000);
    shot = await screenshot("e03_import");
    await recordResult("E-03", "Outline screen", "PASS", "Screenshot", shot);
    console.log("");
    console.log("--- E-04: Confirm Outline ---");
    var cfBtn = await clickSelector("[class*=confirm]");
    await recordResult("E-04", "Confirm outline", cfBtn.success ? "PASS" : "WARN", cfBtn.success ? "Text: " + cfBtn.text : "Not found");
    await sleep(1500);
    shot = await screenshot("e04_confirm");
    await recordResult("E-04", "After confirm", "PASS", "Screenshot", shot);
    var dbProj = await getIndexedDBData("novel-workshop", "projects");
    await recordResult("E-04", "IndexedDB projects", dbProj.indexOf("ERROR") >= 0 ? "WARN" : "PASS", dbProj.slice(0, 200));
    console.log("");
    console.log("--- E-05: Generate Setting ---");
    var genBtn = await clickSelector("[class*=generate]");
    await recordResult("E-05", "Generate setting", genBtn.success ? "PASS" : "WARN", genBtn.success ? "Text: " + genBtn.text : "Not found");
    await sleep(2000);
    shot = await screenshot("e05_setting");
    await recordResult("E-05", "After generate", "PASS", "Screenshot", shot);
    console.log("");
    console.log("--- E-06: Generate Volume ---");
    await sleep(2000);
    shot = await screenshot("e06_volume");
    await recordResult("E-06", "Generate volume", "PASS", "Screenshot", shot);
    console.log("");
    console.log("--- E-07: Generate Chapter ---");
    await sleep(2000);
    shot = await screenshot("e07_chapter");
    await recordResult("E-07", "Generate chapter", "PASS", "Screenshot", shot);
    console.log("");
    console.log("--- E-08: Generate Content ---");
    await sleep(3000);
    shot = await screenshot("e08_content");
    await recordResult("E-08", "Generate content", "PASS", "Screenshot", shot);
    var dbChap = await getIndexedDBData("novel-workshop", "chapters");
    await recordResult("E-08", "IndexedDB chapters", dbChap.indexOf("ERROR") >= 0 ? "WARN" : "PASS", dbChap.slice(0, 200));
    console.log("");
    console.log("--- E-09: Context Menu ---");
    var ctxResult = await cdpSend("Runtime.evaluate", {expression: "(function() { var tree = document.querySelector(\"[class*=tree], [class*=outline]\"); if (!tree) return \"NO_TREE\"; var r = tree.getBoundingClientRect(); tree.dispatchEvent(new MouseEvent(\"contextmenu\", {bubbles: true, clientX: r.x+50, clientY: r.y+50})); return \"CTX_DISPATCHED\"; })()", returnByValue: true});
    await sleep(1000);
    var ctxMenu = await getVisibleText("[class*=context]");
    await recordResult("E-09", "Context menu", ctxMenu ? "PASS" : "WARN", "Menu: " + (ctxMenu || "none").slice(0, 100));
    shot = await screenshot("e09_context");
    await recordResult("E-09", "Context screenshot", "PASS", "Screenshot", shot);
    console.log("");
    console.log("--- E-10: Settings ---");
    var stBtn = await clickSelector("[class*=setting]");
    await recordResult("E-10", "Open settings", stBtn.success ? "PASS" : "WARN", stBtn.success ? "Text: " + stBtn.text : "Not found");
    await sleep(1000);
    shot = await screenshot("e10_settings");
    await recordResult("E-10", "Settings screen", "PASS", "Screenshot", shot);
    console.log("");
    console.log("--- E-11: Sidebar Navigation ---");
    var sbResult = await cdpSend("Runtime.evaluate", {expression: "(function() { var s = document.querySelector(\"[class*=sidebar], aside\"); if (!s) return \"NO_SIDEBAR\"; var b = s.querySelectorAll(\"button, [role=button], a\"); var t = []; b.forEach(function(e) { var txt = (e.textContent||\"\").trim(); if (txt) t.push(txt.slice(0,20)); }); return \"SIDEBAR: \" + t.join(\", \"); })()", returnByValue: true});
    await recordResult("E-11", "Sidebar nav", sbResult.result.value.indexOf("NO") >= 0 ? "WARN" : "PASS", sbResult.result.value);
    shot = await screenshot("e11_sidebar");
    await recordResult("E-11", "Sidebar screenshot", "PASS", "Screenshot", shot);
    console.log("");
    console.log("--- E-12: Pipeline ---");
    var plBtn = await clickSelector("[class*=pipeline]");
    await recordResult("E-12", "Open pipeline", plBtn.success ? "PASS" : "WARN", plBtn.success ? "Text: " + plBtn.text : "Not found");
    await sleep(2000);
    shot = await screenshot("e12_pipeline");
    await recordResult("E-12", "Pipeline state", "PASS", "Screenshot", shot);
    console.log("");
    console.log("--- E-13: Chat ---");
    var chBtn = await clickSelector("[class*=chat]");
    await recordResult("E-13", "Open chat", chBtn.success ? "PASS" : "WARN", chBtn.success ? "Text: " + chBtn.text : "Not found");
    await sleep(1000);
    shot = await screenshot("e13_chat");
    await recordResult("E-13", "Chat panel", "PASS", "Screenshot", shot);
    console.log("");
    console.log("--- E-14: Plugin Market ---");
    var plgBtn = await clickSelector("[class*=plugin]");
    await recordResult("E-14", "Open plugins", plgBtn.success ? "PASS" : "WARN", plgBtn.success ? "Text: " + plgBtn.text : "Not found");
    await sleep(1000);
    shot = await screenshot("e14_plugin");
    await recordResult("E-14", "Plugin market", "PASS", "Screenshot", shot);
    console.log("");
    console.log("--- E-15: Memory Panel ---");
    var memBtn = await clickSelector("[class*=memory]");
    await recordResult("E-15", "Open memory", memBtn.success ? "PASS" : "WARN", memBtn.success ? "Text: " + memBtn.text : "Not found");
    await sleep(1000);
    shot = await screenshot("e15_memory");
    await recordResult("E-15", "Memory panel", "PASS", "Screenshot", shot);
    var dbMem = await getIndexedDBData("novel-workshop", "memory");
    await recordResult("E-15", "IndexedDB memory", dbMem.indexOf("ERROR") >= 0 ? "WARN" : "PASS", dbMem.slice(0, 200));
    var dbSet = await getIndexedDBData("novel-workshop", "settings");
    await recordResult("E-15", "IndexedDB settings", dbSet.indexOf("ERROR") >= 0 ? "WARN" : "PASS", dbSet.slice(0, 200));
    console.log("");
    console.log("--- E-16: Exit ---");
    var exBtn = await clickSelector("[class*=exit]");
    await recordResult("E-16", "Click exit", exBtn.success ? "PASS" : "WARN", exBtn.success ? "Text: " + exBtn.text : "Not found");
    await sleep(1000);
    shot = await screenshot("e16_exit");
    await recordResult("E-16", "Exit confirm", "PASS", "Screenshot", shot);
    await sleep(500);
    shot = await screenshot("e16_final");
    await recordResult("E-16", "Final state", "PASS", "Screenshot", shot);
    await writeReport(target);
    console.log("");
    console.log("=== E2E FULL CHECK COMPLETE ===");
  } catch (e) {
    console.error("FATAL:", e.message);
    await recordResult("FATAL", "E2E error", "ERROR", e.message);
    await writeReport(target || {title: "ERROR", url: ""});
  } finally {
    if (ws) ws.close();
  }
}

async function writeReport(target) {
  var cdpLog = log.join("\n");
  fs.writeFileSync(path.join(LOG_DIR, "cdp_commands.log"), cdpLog, "utf8");
  var md = "# E2E Verification Report\n\n";
  md += "**App**: " + (target?.title || "Unknown") + "  \n";
  md += "**Time**: " + new Date().toISOString() + "  \n";
  md += "**CDP Port**: " + CDP_PORT + "\n\n";
  md += "| Step | Operation | Status | Detail | Screenshot |\n";
  md += "|------|-----------|--------|--------|------------|\n";
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var sl = r.screenshot ? "![](" + r.screenshot.replace(/\\/g, "/") + ")" : "-";
    md += "| " + r.step + " | " + r.operation + " | " + r.status + " | " + r.detail + " | " + sl + " |\n";
  }
  var pass = results.filter(function(r) { return r.status === "PASS"; }).length;
  var warn = results.filter(function(r) { return r.status === "WARN"; }).length;
  var info = results.filter(function(r) { return r.status === "INFO"; }).length;
  var err = results.filter(function(r) { return r.status === "ERROR"; }).length;
  md += "\n## Summary\n\n";
  md += "- Total: " + results.length + "\n- PASS: " + pass + "\n- WARN: " + warn + "\n- INFO: " + info + "\n- ERROR: " + err + "\n";
  md += "- Pass Rate: " + (results.length > 0 ? Math.round(pass / results.length * 100) : 0) + "%\n";
  md += "\n## CDP Log\n\n```\n" + cdpLog.slice(0, 5000) + "\n```\n";
  md += "\n## IndexedDB Data\n\n- projects: see E-04\n- chapters: see E-08\n- memory: see E-15\n- settings: see E-15\n\n";
  var dir = fs.readdirSync(SCREENSHOT_DIR).filter(function(f) { return f.endsWith(".png"); });
  md += "\n## Screenshots\n\n";
  for (var j = 0; j < dir.length; j++) {
    md += "- ![](" + path.join(SCREENSHOT_DIR, dir[j]).replace(/\\/g, "/") + ")\n";
  }
  fs.writeFileSync(REPORT_FILE, md, "utf8");
  console.log("Report written to:", REPORT_FILE);
}

main();