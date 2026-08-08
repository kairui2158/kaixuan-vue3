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
        reject(new Error("timeout: " + method + " " + (timeoutMs || 30000) + "ms"));
      }, timeoutMs || 30000);
      pending.set(id, function(data) {
        clearTimeout(timer);
        resolve(data);
      });
      ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }

  ws.addEventListener("open", async function() {
    console.log("CDP connected", new Date().toISOString());
    try {
      // open SC and scroll to top
      await send("Runtime.evaluate", {
        expression: 'if(typeof app!=="undefined"&&app.showSettingsCollection){app.showSettingsCollection();}"ok"',
        returnByValue: true
      }, 15000);
      await new Promise(function(r){setTimeout(r,1500);});
      await send("Runtime.evaluate", {
        expression: '(function(){var c=document.querySelector(".sc-items-area");if(c)c.scrollTop=0;var r=c?c.getBoundingClientRect():null;return JSON.stringify(r?{x:r.x,y:r.y,w:r.width,h:r.height}:null);})()',
        returnByValue: true
      }, 10000);
      await new Promise(function(r){setTimeout(r,500);});

      // single tiny clip test: 400x300 at panel origin
      console.log("attempt tiny clip 400x300...");
      var t0 = Date.now();
      try {
        var ss = await send("Page.captureScreenshot", {
          format: "png",
          clip: { x: 180, y: 48, width: 400, height: 300, scale: 1 }
        }, 120000);
        var dt = Date.now() - t0;
        if (ss.result && ss.result.data) {
          var buf = Buffer.from(ss.result.data, "base64");
          var f = "test_evidence/sc_mini_" + Date.now() + ".png";
          fs.writeFileSync(f, buf);
          console.log("[OK] tiny", dt + "ms", f, buf.length + "B");
        } else {
          console.log("[FAIL] tiny no data", dt + "ms");
        }
      } catch(e) {
        console.log("[FAIL] tiny", (Date.now()-t0)+"ms", e.message);
      }
    } catch(e) {
      console.error("Error:", e.message);
    }
    ws.close();
    process.exit(0);
  });
}
run().catch(function(e) { console.error(e); process.exit(1); });
