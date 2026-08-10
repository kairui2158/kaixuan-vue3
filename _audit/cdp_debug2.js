var http = require("http");
http.get("http://localhost:9224/json", function(res) {
  var d = ""; res.on("data", function(c) { d += c; });
  res.on("end", function() {
    var pages = JSON.parse(d);
    var page = pages.find(function(p) { return p.type === "page"; });
    if (!page) { console.log("No page"); process.exit(1); }
    var sock = new WebSocket(page.webSocketDebuggerUrl);
  var msgId = 0;
  function send(method, params) { msgId++; var id = msgId; sock.send(JSON.stringify({id:id, method:method, params:params||{}})); return id; }
  sock.addEventListener("open", function() {
    send("Runtime.enable");
    send("Log.enable");
    var id1 = send("Runtime.evaluate", {expression:"document.documentElement.outerHTML.substring(0,3000)", returnByValue:true});
    var pending = id1;
    sock.addEventListener("message", function(ev) {
      var r = JSON.parse(ev.data);
      if (r.id === pending) {
        console.log("HTML:");
        console.log(r.result ? r.result.result.value : "null");
        sock.close(); process.exit(0);
      }
      if (r.method === "Runtime.consoleAPICalled") {
        console.log("CONSOLE:", r.params.type, JSON.stringify(r.params.args).substring(0,500));
      }
      if (r.method === "Log.entryAdded") {
        console.log("LOG:", r.params.entry.level, r.params.entry.text.substring(0,500));
      }
    });
  });
  sock.addEventListener("error", function(e) { console.log("WS error"); process.exit(1); });
  });
});
