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

  function send(method, params, timeoutMs) {
    return new Promise(function(resolve, reject) {
      var id = msgId++;
      var timer = setTimeout(function() {
        pending.delete(id);
        reject(new Error("timeout: " + method + " after " + (timeoutMs || 30000) + "ms"));
      }, timeoutMs || 30000);
      pending.set(id, function(data) {
        clearTimeout(timer);
        resolve(data);
      });
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }

  ws.addEventListener("open", async function() {
    console.log("CDP connected");
    try {
      var rOpen = await send("Runtime.evaluate", {
        expression: 'if(typeof app!=="undefined"&&app.showSettingsCollection){app.showSettingsCollection();"SC_OPENED"}else{"NO_APP"}',
        returnByValue: true
      }, 15000);
      console.log("SC:", rOpen.result && rOpen.result.result && rOpen.result.result.value);
      await new Promise(function(r){setTimeout(r,2000);});

      await send("Runtime.evaluate", {
        expression: '(function(){var c=document.querySelector(".sc-items-area")||document.querySelector(".sc-panel");if(c)c.scrollTop=0;return "top";})()',
        returnByValue: true
      }, 10000);
      await new Promise(function(r){setTimeout(r,800);});

      var rMetrics = await send("Runtime.evaluate", {
        expression: '(function(){var items=document.querySelectorAll(".sc-item");if(items.length===0)return JSON.stringify({error:"no_items"});var rect=[];for(var i=0;i<Math.min(items.length,5);i++){var r=items[i].getBoundingClientRect();rect.push({t:Math.round(r.top),b:Math.round(r.bottom),h:Math.round(r.height)});}var h=document.querySelector(".sc-item-header");var cs=h?getComputedStyle(h):null;var n=document.querySelector(".sc-item-name");var ns=n?getComputedStyle(n):null;var k=document.querySelector(".sc-item-attr-key");var ks=k?getComputedStyle(k):null;var a=document.querySelector(".sc-item-attr");var as=a?getComputedStyle(a):null;var panel=document.querySelector(".sc-items-area")||document.querySelector(".sc-panel");var pr=panel?panel.getBoundingClientRect():null;return JSON.stringify({count:items.length,rects:rect,overlap:rect.length>1&&rect[1].t<rect[0].b,header_justify:cs?cs.justifyContent:null,header_gap:cs?cs.gap:null,name_flex:ns?ns.flexGrow:null,name_weight:ns?ns.fontWeight:null,attr_display:as?as.display:null,attr_bg:as?as.backgroundColor:null,key_color:ks?ks.color:null,panel:pr?{x:Math.round(pr.x),y:Math.round(pr.y),w:Math.round(pr.width),h:Math.round(pr.height)}:null,dpr:window.devicePixelRatio||1});})()',
        returnByValue: true
      }, 15000);
      var metrics = JSON.parse(rMetrics.result.result.value);
      console.log("Metrics:", JSON.stringify(metrics));

      if (metrics.panel && metrics.dpr) {
        var clip = {
          x: Math.round(metrics.panel.x * metrics.dpr),
          y: Math.round(metrics.panel.y * metrics.dpr),
          width: Math.round(metrics.panel.w * metrics.dpr),
          height: Math.round((metrics.panel.h || 600) * metrics.dpr),
          scale: 1
        };
        if (clip.height > 1600) clip.height = 1600;
        if (clip.width < 1) clip.width = 800;
        var fname = "test_evidence/sc_verify_" + Date.now() + ".png";
        var ok = false;
        for (var a = 1; a <= 3 && !ok; a++) {
          console.log("Screenshot attempt", a, "clip w/h:", clip.width, clip.height);
          try {
            var ss = await send("Page.captureScreenshot", { format: "png", clip: clip }, 60000);
            if (ss.result && ss.result.data) {
              var buf = Buffer.from(ss.result.data, "base64");
              fs.writeFileSync(fname, buf);
              console.log("[OK] Screenshot:", fname, "(" + buf.length + " bytes)");
              ok = true;
            } else {
              console.log("[FAIL] no data");
            }
          } catch(e) {
            console.log("[FAIL] attempt", a, ":", e.message);
            await new Promise(function(r){setTimeout(r,2000);});
          }
        }
        if (!ok) {
          console.log("Fallback: full viewport jpeg q40");
          try {
            var ss2 = await send("Page.captureScreenshot", { format: "jpeg", quality: 40 }, 90000);
            if (ss2.result && ss2.result.data) {
              var b2 = Buffer.from(ss2.result.data, "base64");
              var f2 = "test_evidence/sc_fallback_" + Date.now() + ".jpg";
              fs.writeFileSync(f2, b2);
              console.log("[OK] Fallback:", f2, "(" + b2.length + " bytes)");
            }
          } catch(e2) {
            console.log("[FAIL] fallback:", e2.message);
          }
        }
      } else {
        console.log("[FAIL] no panel rect, cannot clip");
      }
    } catch(e) {
      console.error("Error:", e.message);
    }
    ws.close();
    process.exit(0);
  });
}
run().catch(function(e) { console.error(e); process.exit(1); });
