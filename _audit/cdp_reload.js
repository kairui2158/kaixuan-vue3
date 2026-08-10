var http = require("http");
http.get("http://localhost:9224/json", function(res) {
  var d = ""; res.on("data", function(c) { d += c; });
  res.on("end", function() {
    try {
      var pages = JSON.parse(d);
      var page = pages.find(function(p) { return p.type === "page"; });
      if (!page) { console.log("No page found. Pages: " + JSON.stringify(pages.map(function(p){return {t:p.title,u:p.url}}))); process.exit(1); }
      console.log("Found page: " + page.url);
      var sock = new WebSocket(page.webSocketDebuggerUrl);
      sock.addEventListener("open", function() {
        console.log("Reloading page...");
        sock.send(JSON.stringify({id:1, method:"Page.reload", params:{ignoreCache:true}}));
        setTimeout(function() { console.log("Reload sent"); process.exit(0); }, 2000);
      });
      sock.addEventListener("error", function(e) { console.log("Error"); process.exit(1); });
    } catch(e) { console.log("Parse error: " + e.message); process.exit(1); }
  });
});
