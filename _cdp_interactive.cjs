var fs = require('fs');
var WebSocket = require('C:/Users/凯瑞/Documents/New project 2/node_modules/ws');
var OUT = 'D:/codex/novel-workshop-vue3/_audit';
var ws = new WebSocket('ws://localhost:9224/devtools/page/CB7B5B4DE2C26FCFBDE62096307CE3C0');
var results = [];
var step = 0;
ws.on('open', function() {
  console.log('[OK] WS open, starting interactive tests');
  testStep1();
});
ws.on('message', function(data, isBinary) {
  var msg = JSON.parse(data.toString());
  if (msg.id === 10) { testStep2(); }
  if (msg.id === 11) { handlePanelTest(msg, 'settings'); }
  if (msg.id === 12) { handlePanelTest(msg, 'pipeline'); }
  if (msg.id === 13) { handlePanelTest(msg, 'settings-collection'); }
  if (msg.id === 14) { handlePanelTest(msg, 'outline'); }
  if (msg.id === 15) { handleChatTest(msg); }
  if (msg.id === 16) { handleDeAiTest(msg); }
  if (msg.id === 17) { handleUndoRedoTest(msg); }
  if (msg.id === 18) { handleSaveExportTest(msg); }
});
ws.on('error', function(e) { console.log('[ERR] ' + e.message); process.exit(1); });
function sendCmd(id, method, params) {
  ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
}
function evalJS(id, expr) {
  sendCmd(id, 'Runtime.evaluate', { expression: expr, returnByValue: true });
}
function takeScreenshot(id, name) {
  sendCmd(id, 'Page.captureScreenshot', { format: 'png' });
  results.push({ id: id, name: name });
}
function testStep1() {
  evalJS(10, '(function(){return JSON.stringify({hasVue:!!window.__VUE_APP__||!!document.querySelector("#app").__vue_app__,electronAPI:typeof window.electronAPI,selects:document.querySelectorAll("select").length,buttons:document.querySelectorAll("button").length,textareas:document.querySelectorAll("textarea").length,chapterTree:!!document.querySelector(".chapter-tree"),editorPanel:!!document.querySelector(".editor-panel"),chatPanel:!!document.querySelector(".chat-panel"),sidebarNav:!!document.querySelector(".sidebar-nav"),settingsModal:!!document.querySelector(".settings-modal"),pipelinePanel:!!document.querySelector(".pipeline-panel")});})()');
}
function testStep2() {
  console.log('[1] Checking sidebar nav buttons...');
  evalJS(11, '(function(){var navBtns=document.querySelectorAll(".sidebar-nav button, .sidebar-nav [class*=nav-item], .sidebar-nav [class*=nav-btn]"); var info=[]; navBtns.forEach(function(b,i){var r=b.getBoundingClientRect(); info.push({i:i,cls:b.className,text:b.textContent.trim().substring(0,30),vis:r.width>0,x:Math.round(r.x),y:Math.round(r.y)});}); if(info.length===0){var allBtns=document.querySelectorAll(".sidebar-nav *"); var btnLike=[]; allBtns.forEach(function(el){if(el.tagName==="BUTTON"||el.onclick||el.getAttribute("role")==="button")btnLike.push({tag:el.tagName,cls:el.className,text:el.textContent.trim().substring(0,30)});}); return JSON.stringify({navBtns:info,fallback:btnLike,sidebarHTML:document.querySelector(".sidebar-nav")?document.querySelector(".sidebar-nav").innerHTML.substring(0,500):"no sidebar"});} return JSON.stringify({navBtns:info});})()');
}
function handlePanelTest(msg, panelName) {
  var data = msg.result && msg.result.result ? msg.result.result.value : 'null';
  console.log('[2] Panel test result for ' + panelName + ': ' + data.substring(0, 200));
  results.push({ test: panelName, result: data });
  if (panelName === 'settings') testStep3();
  if (panelName === 'pipeline') testStep4();
  if (panelName === 'settings-collection') testStep5();
  if (panelName === 'outline') testStep6();
}
function testStep3() {
  console.log('[3] Clicking settings nav button...');
  evalJS(12, '(function(){var navBtns=document.querySelectorAll(".sidebar-nav button"); if(navBtns.length>0)navBtns[0].click(); return JSON.stringify({clicked:true,count:navBtns.length});})()');
}
function testStep4() {
  console.log('[4] Testing pipeline panel...');
  evalJS(13, '(function(){var navBtns=document.querySelectorAll(".sidebar-nav button"); if(navBtns.length>1)navBtns[1].click(); return JSON.stringify({clicked:true});})()');
}
function testStep5() {
  console.log('[5] Testing settings collection...');
  evalJS(14, '(function(){var navBtns=document.querySelectorAll(".sidebar-nav button"); if(navBtns.length>2)navBtns[2].click(); return JSON.stringify({clicked:true});})()');
}
function testStep6() {
  console.log('[6] Testing outline workspace...');
  evalJS(15, '(function(){var navBtns=document.querySelectorAll(".sidebar-nav button"); if(navBtns.length>3)navBtns[3].click(); return JSON.stringify({clicked:true});})()');
}
function handleChatTest(msg) {
  console.log('[7] Testing chat panel...');
  var data = msg.result && msg.result.result ? msg.result.result.value : 'null';
  results.push({ test: 'chat', result: data });
  evalJS(16, '(function(){var chatInput=document.querySelector(".chat-input textarea, .chat-input input, textarea"); if(chatInput){chatInput.value="test message"; chatInput.dispatchEvent(new Event("input"));} var sendBtn=document.querySelector(".chat-panel button[class*=send], .chat-input-row button"); if(sendBtn){sendBtn.click();return JSON.stringify({sent:true,btnText:sendBtn.textContent.trim()});} return JSON.stringify({sent:false,noInput:!chatInput});})()');
}
function handleDeAiTest(msg) {
  console.log('[8] Testing deAI button...');
  var data = msg.result && msg.result.result ? msg.result.result.value : 'null';
  results.push({ test: 'deAI', result: data });
  evalJS(17, '(function(){var deAiBtn=null; document.querySelectorAll("button").forEach(function(b){if(b.textContent.trim()==="去AI味")deAiBtn=b;}); if(deAiBtn){deAiBtn.click(); return JSON.stringify({clicked:true});} return JSON.stringify({clicked:false});})()');
}
function handleUndoRedoTest(msg) {
  console.log('[9] Testing undo/redo...');
  var data = msg.result && msg.result.result ? msg.result.result.value : 'null';
  results.push({ test: 'deAI-result', result: data });
  evalJS(18, '(function(){var undoBtn=null,redoBtn=null; document.querySelectorAll("button").forEach(function(b){if(b.textContent.trim()==="undo")undoBtn=b;if(b.textContent.trim()==="redo")redoBtn=b;}); var result={undo:!!undoBtn,redo:!!redoBtn}; if(undoBtn){undoBtn.click();result.undoClicked=true;} if(redoBtn){redoBtn.click();result.redoClicked=true;} return JSON.stringify(result);})()');
}
function handleSaveExportTest(msg) {
  console.log('[10] Testing save/export...');
  var data = msg.result && msg.result.result ? msg.result.result.value : 'null';
  results.push({ test: 'undo-redo', result: data });
  sendCmd(20, 'Page.captureScreenshot', { format: 'png' });
}
ws.on('message', function(data) {
  var msg = JSON.parse(data.toString());
  if (msg.id === 20 && msg.result && msg.result.data) {
    fs.writeFileSync(OUT + '/shot_02_after_tests.png', Buffer.from(msg.result.data, 'base64'));
    console.log('[OK] Screenshot 2 saved');
    evalJS(21, '(function(){var r={body:document.body.textContent.substring(0,500),panels:document.querySelectorAll("[class*=panel]").length,modals:document.querySelectorAll("[class*=modal]").length,errors:[]};document.querySelectorAll("[class*=error]").forEach(function(e){if(e.textContent.trim())r.errors.push(e.textContent.trim().substring(0,100));});return JSON.stringify(r);})()');
  }
  if (msg.id === 21 && msg.result && msg.result.result) {
    console.log('[FINAL] State after all tests: ' + msg.result.result.value.substring(0, 300));
    fs.writeFileSync(OUT + '/interactive_results.json', JSON.stringify(results, null, 2));
    console.log('[DONE] All interactive tests complete');
    ws.close();
    process.exit(0);
  }
});
setTimeout(function() {
  console.log('[ERR] Timeout. Results so far:');
  results.forEach(function(r) { console.log('  ' + r.test + ': ' + JSON.stringify(r.result).substring(0, 100)); });
  fs.writeFileSync(OUT + '/interactive_results.json', JSON.stringify(results, null, 2));
  process.exit(1);
}, 25000);
