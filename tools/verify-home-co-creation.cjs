const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 9227;
const OUT = 'tools/verify-result.json';
const SHOT = 'tools/verify-screenshot.png';
const allSteps = [];
const runtimeErrors = [];
let msgId = 0;

function log(step, ok, detail) {
  const entry = { step, ok, detail, t: Date.now() };
  allSteps.push(entry);
  console.log('[' + (ok ? 'PASS' : 'FAIL') + '] ' + step + ': ' + JSON.stringify(detail).slice(0, 300));
}

function httpGet(url) {
  return new Promise(function(resolve, reject) {
    http.get(url, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { resolve(d); });
    }).on('error', reject);
  });
}

function wsSend(ws, method, params, sessionId, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var id = ++msgId;
    var msg = { id: id, method: method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    var t = timeoutMs || 30000;
    var timeout = setTimeout(function() {
      reject(new Error(method + ' timeout ' + t + 'ms'));
    }, t);
    var handler = function(data) {
      try {
        var parsed = JSON.parse(data);
        if (parsed.id === id) {
          clearTimeout(timeout);
          ws.off('message', handler);
          resolve(parsed);
        }
      } catch(e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify(msg));
  });
}

async function main() {
  var electronPath = path.resolve('node_modules/electron/dist/electron.exe');
  var child = spawn(electronPath, ['.', '--remote-debugging-port=' + PORT], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { NODE_ENV: 'development' })
  });

  var stderr = '';
  child.stderr.on('data', function(d) { stderr += d.toString(); });

  console.log('Waiting for CDP...');
  var cdpReady = false;
  for (var i = 0; i < 30; i++) {
    await new Promise(function(r) { setTimeout(r, 500); });
    try {
      var ver = await httpGet('http://127.0.0.1:' + PORT + '/json/version');
      if (ver) { console.log('CDP ready'); cdpReady = true; break; }
    } catch(e) {}
  }
  if (!cdpReady) { console.log('CDP never came up. stderr:', stderr.slice(0, 500)); process.exit(1); }

  await new Promise(function(r) { setTimeout(r, 8000); });

  var pagesJson = await httpGet('http://127.0.0.1:' + PORT + '/json/list');
  var pages = JSON.parse(pagesJson);
  var page = pages.find(function(p) { return p.type === 'page'; });
  if (!page) { console.log('No page target!'); child.kill(); process.exit(1); }
  console.log('page wsUrl:', page.webSocketDebuggerUrl);

  var ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function(r, s) { ws.on('open', r); ws.on('error', s); });
  console.log('WS connected to page');

  // Step 1: Page.captureScreenshot
  try {
    var shotResult = await wsSend(ws, 'Page.captureScreenshot', { format: 'png' }, null, 30000);
    if (shotResult.result && shotResult.result.data) {
      var buf = Buffer.from(shotResult.result.data, 'base64');
      fs.writeFileSync(SHOT, buf);
      log('screenshot', buf.length > 1000, { size: buf.length });
    } else { log('screenshot', false, shotResult); }
  } catch(e) { log('screenshot', false, { error: e.message }); }

  // Step 2: DOM.getDocument
  try {
    var domResult = await wsSend(ws, 'DOM.getDocument', { depth: 2 }, null, 15000);
    if (domResult.result && domResult.result.root) {
      log('dom-get-document', true, { rootChildren: domResult.result.root.childElementCount });
    } else { log('dom-get-document', false, domResult); }
  } catch(e) { log('dom-get-document', false, { error: e.message }); }

  // Step 3: Runtime.enable + evaluate
  try {
    await wsSend(ws, 'Runtime.enable', {}, null, 15000);
    var evalResult = await wsSend(ws, 'Runtime.evaluate', {
      expression: 'JSON.stringify({ ready: document.readyState, hasChat: !!document.getElementById("chat-panel"), hasSkillArea: !!document.getElementById("skill-area"), hasConfigRow: !!document.getElementById("co-creation-config-row"), hasSkillSelect: !!document.getElementById("co-skill-select"), hasAgentSelect: !!document.getElementById("co-agent-select"), hasModeSelect: !!document.getElementById("co-mode-select"), hasCoCreateBtn: !!document.getElementById("btn-home-co-create"), hasSkillList: !!document.getElementById("co-skill-list"), hasInput: !!document.getElementById("user-input"), hasSendBtn: !!document.getElementById("btn-send") })',
      returnByValue: true,
      awaitPromise: true
    }, null, 60000);
    if (evalResult.result && evalResult.result.result) {
      var parsed = JSON.parse(evalResult.result.result.value);
      log('runtime-eval-dom', true, parsed);
    } else { log('runtime-eval-dom', false, evalResult); }
  } catch(e) { log('runtime-eval-dom', false, { error: e.message }); }

  // Step 4: Check storage
  try {
    var storageEval = await wsSend(ws, 'Runtime.evaluate', {
      expression: '(async function() { var cfg = await window.electronAPI.storageRead("wa_co_creation_config"); return JSON.stringify({ hasConfig: !!cfg, config: cfg }); })()',
      returnByValue: true,
      awaitPromise: true
    }, null, 30000);
    if (storageEval.result && storageEval.result.result) {
      var sVal = JSON.parse(storageEval.result.result.value);
      log('storage-co-creation-config', true, sVal);
    } else { log('storage-co-creation-config', false, storageEval); }
  } catch(e) { log('storage-co-creation-config', false, { error: e.message }); }

  // Step 5: No pipeline sync elements
  try {
    var syncEval = await wsSend(ws, 'Runtime.evaluate', {
      expression: 'JSON.stringify({ synced: !!document.querySelector("[id*=synced],[class*=synced-pipeline]"), pipelineText: document.body.innerText.indexOf("\u540c\u6b65\u6d41\u6c34\u7ebf") >= 0 })',
      returnByValue: true
    }, null, 15000);
    if (syncEval.result && syncEval.result.result) {
      var syncVal = JSON.parse(syncEval.result.result.value);
      log('no-pipeline-sync', !syncVal.synced && !syncVal.pipelineText, syncVal);
    } else { log('no-pipeline-sync', false, syncEval); }
  } catch(e) { log('no-pipeline-sync', false, { error: e.message }); }

  ws.close();
  child.kill();

  var allOk = allSteps.every(function(s) { return s.ok; });
  var result = {
    allStepsOk: allOk,
    runtimeErrors: runtimeErrors,
    steps: allSteps,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('\n=== RESULT ===');
  console.log('allStepsOk:', allOk);
  console.log(JSON.stringify(result, null, 2));
}

main().then(function() { process.exit(0); }).catch(function(e) {
  console.error(e.stack || e);
  runtimeErrors.push(e.message);
  var result = { allStepsOk: false, runtimeErrors: runtimeErrors, steps: allSteps };
  try { fs.writeFileSync(OUT, JSON.stringify(result, null, 2)); } catch(_) {}
  process.exit(1);
});
