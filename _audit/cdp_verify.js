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
          if (!page) { reject(new Error("No page found. Pages: " + pages.map(function(p){return p.title}).join(","))); return; }
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
    var h = await cdpEval("document.querySelector('.app-header')?document.querySelector('.app-header').offsetHeight:-1");
    addCheck("Header 48px", h===48, "Got "+h);
    var rc = await cdpEval("document.querySelectorAll('.resizer-v').length");
    addCheck("Resizers>=2", rc>=2, "Count "+rc);
    var bc = await cdpEval("document.querySelector('.breadcrumb-bar')?document.querySelector('.breadcrumb-bar').offsetHeight:-1");
    addCheck("Breadcrumb visible", bc>0, "H "+bc);
    var ct = await cdpEval("document.querySelector('.chapter-tree')?document.querySelector('.chapter-tree').offsetWidth:-1");
    addCheck("ChapterTree exists", ct>0, "W "+ct);
    var cp = await cdpEval("document.querySelector('.chat-panel')?document.querySelector('.chat-panel').offsetWidth:-1");
    addCheck("ChatPanel exists", cp>0, "W "+cp);
    var ep = await cdpEval("document.querySelector('.editor-panel')?document.querySelector('.editor-panel').offsetWidth:-1");
    addCheck("EditorPanel exists", ep>0, "W "+ep);
    var sb = await cdpEval("document.querySelector('.statusbar')?document.querySelector('.statusbar').offsetHeight:-1");
    addCheck("Statusbar exists", sb>0, "H "+sb);
    var sn = await cdpEval("document.querySelector('.sidebar-nav')?document.querySelector('.sidebar-nav').offsetWidth:-1");
    addCheck("SidebarNav exists", sn>0, "W "+sn);
    var ea = await cdpEval("typeof window.electronAPI!=='undefined'");
    addCheck("electronAPI exposed", ea===true, "");
    var fm = await cdpEval("typeof window.electronAPI!=='undefined'&&typeof window.electronAPI.fetchModels==='function'");
    addCheck("fetchModels exists", fm===true, "");
    var tc = await cdpEval("typeof window.electronAPI!=='undefined'&&typeof window.electronAPI.providerTestConnection==='function'");
    addCheck("providerTestConnection exists", tc===true, "");
    var cc = await cdpEval("typeof window.electronAPI!=='undefined'&&typeof window.electronAPI.respondCloseChoice==='function'");
    addCheck("respondCloseChoice exists", cc===true, "");
    var fs = await cdpEval("typeof window.electronAPI!=='undefined'&&typeof window.electronAPI.onFinalSave==='function'");
    addCheck("onFinalSave exists", fs===true, "");
    var ov = await cdpEval("(function(){var els=document.querySelectorAll('*');var issues=[];for(var i=0;i<els.length&&issues.length<10;i++){var el=els[i];if(el.scrollWidth>el.clientWidth+2&&el.children.length>0){var st=getComputedStyle(el);if(st.overflow==='visible'&&st.whiteSpace==='nowrap'){issues.push(el.className.toString().substring(0,40)+'='+el.scrollWidth+'/'+el.clientWidth)}}}return issues.join('; ')})()");
    addCheck("No visible text overflow", !ov||ov==="", ov||"");
    var hs = await cdpEval("document.body.scrollWidth>document.body.clientWidth");
    addCheck("No body H-scroll", hs===false, "");
    console.log("\n=== CDP Verification ===");
    console.log("Pass: "+pass+" / Fail: "+fail+" / Total: "+checks.length);
    checks.forEach(function(c) { console.log((c.pass?"[OK] ":"[FAIL] ")+c.name+(c.detail?" ("+c.detail+")":"")); });
    console.log("=== End ===");
    process.exit(fail>0?1:0);
  } catch(e) { console.log("ERROR: "+e.message); process.exit(2); }
}
run();
