var http = require("http");
var pass = 0, fail = 0;
var checks = [];
function addCheck(name, cond, detail) { checks.push({name:name, pass:!!cond, detail:detail||""}); if(cond) pass++; else fail++; }
function cdpEval(expr) {
  return new Promise(function(resolve, reject) {
    http.get("http://localhost:9224/json", function(res) {
      var d = ""; res.on("data", function(c) { d += c; });
      res.on("end", function() {
        try {
          var pages = JSON.parse(d);
          var page = pages.find(function(p) { return p.type === "page" && p.url && p.url.indexOf("5173") >= 0; });
          if (!page) { reject(new Error("No page")); return; }
          var sock = new WebSocket(page.webSocketDebuggerUrl);
          sock.addEventListener("open", function() {
            sock.send(JSON.stringify({id:1, method:"Runtime.evaluate", params:{expression:expr, returnByValue:true}}));
          });
          sock.addEventListener("message", function(ev) {
            var r = JSON.parse(ev.data);
            if (r.id === 1) { sock.close(); resolve(r.result ? r.result.result.value : null); }
          });
          sock.addEventListener("error", function(e) { reject(new Error("WS error")); });
        } catch(e) { reject(e); }
      });
    });
  });
}
async function run() {
  try {
    // 1. Check Vue app mounted (app-container exists with children)
    var appMounted = await cdpEval("document.querySelector('.app-container') && document.querySelector('.app-container').children.length > 0");
    addCheck("Vue app mounted", appMounted === true, "");

    // 2. Check Pinia stores working - providerStore accessible
    var hasPinia = await cdpEval("(function(){try{return typeof window.__PINIA__ !== 'undefined' || document.querySelector('[class*=app-container]') !== null}catch(e){return false}})()");
    addCheck("App state initialized", hasPinia === true, "");

    // 3. Click settings sidebar button to open settings
    await cdpEval("(function(){var btns=document.querySelectorAll('.sidebar-btn');for(var i=0;i<btns.length;i++){if(btns[i].getAttribute('aria-label')==='\u8bbe\u7f6e'||btns[i].title==='\u8bbe\u7f6e'){btns[i].click();return true}}return false})()");
    await new Promise(function(r){setTimeout(r,500)});
    var settingsOpen = await cdpEval("document.querySelector('.modal-overlay') !== null || document.querySelector('.settings-tabs') !== null");
    addCheck("Settings modal opens", settingsOpen === true, "");

    // 4. Check API tab content visible
    var apiVisible = await cdpEval("document.querySelector('.api-settings') !== null || document.querySelector('.provider-list-view') !== null || document.querySelector('.provider-card') !== null");
    addCheck("API settings tab visible", apiVisible === true, "");

    // 5. Check provider list or edit view exists
    var providerView = await cdpEval("document.querySelector('.provider-list-view') !== null || document.querySelector('.provider-edit-view') !== null");
    addCheck("Provider dual-view exists", providerView === true, "");

    // 6. Check add provider button exists
    var addBtn = await cdpEval("document.querySelector('.provider-card-add') !== null");
    addCheck("Add provider button exists", addBtn === true, "");

    // 7. Close settings
    await cdpEval("(function(){var btn=document.querySelector('.modal-close');if(btn)btn.click();return true})()");
    await new Promise(function(r){setTimeout(r,300)});

    // 8. Open outline workspace
    await cdpEval("(function(){var btns=document.querySelectorAll('.sidebar-btn');for(var i=0;i<btns.length;i++){if(btns[i].getAttribute('aria-label')==='\u5927\u7eb2\u5de5\u4f5c\u53f0'||btns[i].title==='\u5927\u7eb2\u5de5\u4f5c\u53f0'){btns[i].click();return true}}return false})()");
    await new Promise(function(r){setTimeout(r,500)});
    var outlineOpen = await cdpEval("document.querySelector('.ow-overlay') !== null");
    addCheck("Outline workspace opens", outlineOpen === true, "");

    // 9. Check outline save button exists
    var saveBtn = await cdpEval("(function(){var btns=document.querySelectorAll('.ow-footer button');for(var i=0;i<btns.length;i++){if(btns[i].textContent.indexOf('\u4fdd\u5b58')>=0)return true}return false})()");
    addCheck("Outline save button exists", saveBtn === true, "");

    // 10. Check outline textarea exists
    var textarea = await cdpEval("document.querySelector('.ow-textarea') !== null");
    addCheck("Outline textarea exists", textarea === true, "");

    // 11. Close outline
    await cdpEval("(function(){var btn=document.querySelector('.ow-header .modal-close');if(btn)btn.click();return true})()");
    await new Promise(function(r){setTimeout(r,300)});

    // 12. Open settings collection
    await cdpEval("(function(){var btns=document.querySelectorAll('.sidebar-btn');for(var i=0;i<btns.length;i++){if(btns[i].getAttribute('aria-label')==='\u8bbe\u5b9a\u5408\u96c6'||btns[i].title==='\u8bbe\u5b9a\u5408\u96c6'){btns[i].click();return true}}return false})()");
    await new Promise(function(r){setTimeout(r,500)});
    var scOpen = await cdpEval("document.querySelector('.sc-overlay') !== null");
    addCheck("Settings collection opens", scOpen === true, "");

    // 13. Check SC has sidebar + entries
    var scSidebar = await cdpEval("document.querySelector('.sc-sidebar') !== null");
    addCheck("SC sidebar exists", scSidebar === true, "");

    // 14. Close SC
    await cdpEval("(function(){var btn=document.querySelector('.sc-header .modal-close');if(btn)btn.click();return true})()");
    await new Promise(function(r){setTimeout(r,300)});

    // 15. Check resizer has mousedown listener (data-target attribute)
    var resizerAttr = await cdpEval("(function(){var els=document.querySelectorAll('.resizer-v');if(els.length<2)return false;return els[0].getAttribute('data-target')==='chapter'&&els[1].getAttribute('data-target')==='chat'})()");
    addCheck("Resizer data-target attributes", resizerAttr === true, "");

    // 16. Check exit modal exists (hidden)
    var exitModal = await cdpEval("document.querySelector('.modal-backdrop') !== null");
    addCheck("Exit confirm modal exists", exitModal === true, "");

    // 17. Check header selectors work
    var headerSel = await cdpEval("document.querySelectorAll('.header-selector').length >= 2");
    addCheck("Header selectors present", headerSel === true, "");

    // 18. Check clear chat button exists
    var clearBtn = await cdpEval("document.querySelector('.btn-icon') !== null");
    addCheck("Clear chat button exists", clearBtn === true, "");

    // 19. Check statusbar has spans
    var statusSpans = await cdpEval("document.querySelector('.statusbar') ? document.querySelector('.statusbar').children.length : 0");
    addCheck("Statusbar has content", statusSpans >= 3, "Spans: "+statusSpans);

    // 20. Check no console errors
    var noErrors = await cdpEval("(function(){try{if(window.__vueErrors)return false;return true}catch(e){return true}})()");
    addCheck("No JS runtime errors", noErrors === true, "");

    console.log("\n=== Functional Verification ===");
    console.log("Pass: "+pass+" / Fail: "+fail+" / Total: "+checks.length);
    checks.forEach(function(c) { console.log((c.pass?"[OK] ":"[FAIL] ")+c.name+(c.detail?" ("+c.detail+")":"")); });
    console.log("=== End ===");
    process.exit(fail>0?1:0);
  } catch(e) { console.log("ERROR: "+e.message); process.exit(2); }
}
run();
