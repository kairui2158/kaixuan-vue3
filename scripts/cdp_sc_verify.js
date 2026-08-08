const http = require("http");
const fs = require("fs");

function getTargets() {
  return new Promise(function(resolve, reject) {
    http.get("http://127.0.0.1:9223/json", function(res) {
      var d = "";
      res.on("data", function(c) { d += c; });
      res.on("end", function() { resolve(JSON.parse(d)); });
    }).on("error", reject);
  });
}

async function run() {
  var targets = await getTargets();
  var target = targets.find(function(t) { return t.type === "page"; });
  if (!target) { console.error("No page target"); process.exit(1); }

  var ws = new WebSocket(target.webSocketDebuggerUrl);
  var msgId = 1;
  var pending = new Map();

  ws.addEventListener("message", function(event) {
    var data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  });

  function send(method, params) {
    return new Promise(function(resolve) {
      var id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }

  ws.addEventListener("open", async function() {
    console.log("CDP connected");

    // Open SC panel
    var r1 = await send("Runtime.evaluate", {
      expression: 'if(typeof app!=="undefined"&&app.showSettingsCollection){app.showSettingsCollection();"SC_OPENED"}else{"NO_APP"}',
      returnByValue: true
    });
    console.log("SC panel:", r1.result && r1.result.result && r1.result.result.value);
    await new Promise(function(r){setTimeout(r,2000);});

    // Check layout
    var r2 = await send("Runtime.evaluate", {
      expression: '(function(){var h=document.querySelector(".sc-item-header");var cs=h?getComputedStyle(h):null;var n=document.querySelector(".sc-item-name");var ns=n?getComputedStyle(n):null;var a=document.querySelector(".sc-item-attr");var as=a?getComputedStyle(a):null;var k=document.querySelector(".sc-item-attr-key");var ks=k?getComputedStyle(k):null;return JSON.stringify({card_count:document.querySelectorAll(".sc-item").length,header_justify:cs?cs.justifyContent:null,name_weight:ns?ns.fontWeight:null,name_flex:ns?ns.flexGrow:null,attr_display:as?as.display:null,attr_bg:as?as.backgroundColor:null,key_color:ks?ks.color:null});})()',
      returnByValue: true
    });
    var layout = JSON.parse(r2.result.result.value);
    console.log("Layout:", JSON.stringify(layout));

    // Screenshot (JPEG for smaller payload)
    var ss = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
    if (ss.result && ss.result.data) {
      var fname = "test_evidence/sc_after_fix.jpg";
      fs.writeFileSync(fname, Buffer.from(ss.result.data, "base64"));
      console.log("[OK] Screenshot saved:", fname, "(" + Buffer.from(ss.result.data, "base64").length + " bytes)");
    } else {
      console.log("[FAIL] Screenshot failed");
    }

    ws.close();
    process.exit(0);
  });
}
run().catch(function(e) { console.error(e); process.exit(1); });
setTimeout(function() { console.log("timeout"); process.exit(1); }, 30000);
