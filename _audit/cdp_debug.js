var http = require("http");
http.get("http://localhost:9224/json", function(res) {
  var d = ""; res.on("data", function(c) { d += c; });
  res.on("end", function() {
    try {
      var pages = JSON.parse(d);
      var page = pages.find(function(p) { return p.type === "page"; });
      if (!page) { console.log("No page"); process.exit(1); }
      var sock = new WebSocket(page.webSocketDebuggerUrl);
      sock.addEventListener("open", function() {
        sock.send(JSON.stringify({id:1, method:"Runtime.evaluate", params:{expression:"document.body.innerHTML.substring(0,2000)", returnByValue:true}}));
      });
      sock.addEventListener("message", function(ev) {
        var r = JSON.parse(ev.data);
        if (r.id === 1) { console.log(r.result ? r.result.result.value : "null"); sock.close(); process.exit(0); }
      });
      sock.addEventListener("error", function(e) { console.log("err"); process.exit(1); });
    } catch(e) { console.log(e.message); process.exit(1); }
  });
});
