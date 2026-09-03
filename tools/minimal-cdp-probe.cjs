const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 9228;

function httpGet(url) {
  return new Promise(function(resolve, reject) {
    http.get(url, function(res) {
      var d = "";
      res.on("data", function(c) { d += c; });
      res.on("end", function() { resolve(d); });
    }).on("error", reject);
  });
}

async function main() {
  var electronPath = path.resolve("node_modules/electron/dist/electron.exe");
  var child = spawn(electronPath, [".", "--remote-debugging-port=" + PORT, "--no-first-run", "--no-default-browser-check"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env: Object.assign({}, process.env, { NODE_ENV: "development" })
  });

  var stderr = "";
  child.stderr.on("data", function(d) { stderr += d.toString(); if (stderr.length < 2000) process.stderr.write(d); });
  child.stdout.on("data", function(d) { process.stdout.write(d); });

  console.log("Waiting for CDP on port " + PORT + "...");
  var cdpReady = false;
  for (var i = 0; i < 30; i++) {
    await new Promise(function(r) { setTimeout(r, 500); });
    try {
      var ver = await httpGet("http://127.0.0.1:" + PORT + "/json/version");
      if (ver) { console.log("CDP ready:", ver.slice(0, 120)); cdpReady = true; break; }
    } catch(e) {}
  }
  if (!cdpReady) { console.log("CDP never came up. stderr:", stderr.slice(0, 500)); child.kill(); process.exit(1); }

  await new Promise(function(r) { setTimeout(r, 5000); });

  var pagesJson = await httpGet("http://127.0.0.1:" + PORT + "/json/list");
  var pages = JSON.parse(pagesJson);
  console.log("pages:", pages.length, pages.map(function(p) { return p.type + ":" + p.title; }));
  var page = pages.find(function(p) { return p.type === "page"; });
  if (!page) { console.log("No page target!"); child.kill(); process.exit(1); }

  var ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function(r, s) { ws.on("open", r); ws.on("error", s); });
  console.log("WS connected");

  var msgId = 0;
  function wsSend(method, params, timeoutMs) {
    return new Promise(function(resolve, reject) {
      var id = ++msgId;
      var msg = { id: id, method: method, params: params || {} };
      var t = timeoutMs || 20000;
      var timeout = setTimeout(function() {
        reject(new Error(method + " timeout " + t + "ms"));
      }, t);
      var handler = function(data) {
        try {
          var parsed = JSON.parse(data);
          if (parsed.id === id) {
            clearTimeout(timeout);
            ws.off("message", handler);
            resolve(parsed);
          }
        } catch(e) {}
      };
      ws.on("message", handler);
      ws.send(JSON.stringify(msg));
    });
  }

  // Try Page.navigate first (compositor, no JS)
  try {
    var navResult = await wsSend("Page.getNavigationHistory", {}, 10000);
    console.log("[PASS] Page.getNavigationHistory:", JSON.stringify(navResult.result).slice(0, 200));
  } catch(e) {
    console.log("[FAIL] Page.getNavigationHistory:", e.message);
  }

  // Try Page.captureScreenshot
  try {
    var shotResult = await wsSend("Page.captureScreenshot", { format: "png" }, 15000);
    if (shotResult.result && shotResult.result.data) {
      var buf = Buffer.from(shotResult.result.data, "base64");
      console.log("[PASS] screenshot size:", buf.length);
    } else {
      console.log("[FAIL] screenshot:", JSON.stringify(shotResult).slice(0, 200));
    }
  } catch(e) {
    console.log("[FAIL] screenshot:", e.message);
  }

  // Try Runtime.enable with 120s timeout
  try {
    var enableResult = await wsSend("Runtime.enable", {}, 120000);
    console.log("[PASS] Runtime.enable:", JSON.stringify(enableResult).slice(0, 200));
  } catch(e) {
    console.log("[FAIL] Runtime.enable:", e.message);
  }

  // Try Runtime.evaluate with 120s timeout
  try {
    var evalResult = await wsSend("Runtime.evaluate", {
      expression: "1+1",
      returnByValue: true
    }, 120000);
    console.log("[PASS] Runtime.evaluate 1+1:", JSON.stringify(evalResult).slice(0, 200));
  } catch(e) {
    console.log("[FAIL] Runtime.evaluate:", e.message);
  }

  ws.close();
  child.kill();
  console.log("done");
}

main().then(function() { process.exit(0); }).catch(function(e) {
  console.error(e.stack || e);
  process.exit(1);
});
