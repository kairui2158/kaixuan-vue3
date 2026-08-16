const WebSocket = require("ws");
const http = require("http");

http.get("http://localhost:9227/json", (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    const pages = JSON.parse(data);
    const wsUrl = pages[0]?.webSocketDebuggerUrl;
    console.log("WS URL:", wsUrl);
    if (!wsUrl) { console.log("No page"); return; }
    
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const send = (method, params) => ws.send(JSON.stringify({ id: msgId++, method, params }));
    
    ws.on("open", () => {
      console.log("WebSocket connected");
      // Enable domains
      send("Runtime.enable", {});
      send("Page.enable", {});
      send("Runtime.runIfWaitingForDebugger", {});
      
      setTimeout(() => {
        send("Runtime.evaluate", { expression: "document.title", returnByValue: true });
        send("Runtime.evaluate", { expression: "document.querySelectorAll('button').length", returnByValue: true });
        send("Runtime.evaluate", { expression: "Array.from(document.querySelectorAll('button')).map(b=>({id:b.id||'',visible:!!b.offsetParent,text:(b.textContent||'').trim().substring(0,30)}))", returnByValue: true });
        
        setTimeout(() => {
          // Click outline workspace
          send("Runtime.evaluate", { expression: "document.querySelector('#btn-outline-workspace')?.click()", returnByValue: true });
          
          setTimeout(() => {
            send("Runtime.evaluate", { expression: "document.querySelector('#outline-workspace') !== null", returnByValue: true });
            send("Runtime.evaluate", { expression: "Array.from(document.querySelectorAll('#outline-workspace button')).map(b=>({id:b.id||'',visible:!!b.offsetParent,text:(b.textContent||'').trim().substring(0,30)}))", returnByValue: true });
            
            setTimeout(() => {
              send("Page.captureScreenshot", { format: "png" });
            }, 500);
          }, 500);
        }, 500);
      }, 1000);
    });
    
    let responses = [];
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id) {
        const method = msg.method || "response";
        if (msg.result?.value !== undefined) {
          console.log("["+msg.id+"]", JSON.stringify(msg.result.value));
        }
        if (msg.result?.result) {
          console.log("["+msg.id+"]", JSON.stringify(msg.result.result.substring(0, 100)));
        }
        if (msg.result?.value !== undefined || msg.result?.result) {
          // ignore
        } else {
          responses.push(msg);
        }
      }
    });
    
    setTimeout(() => {
      console.log("Unhandled responses:", responses.length);
      process.exit(0);
    }, 5000);
  });
}).on("error", (e) => { console.error("Error:", e.message); process.exit(1); });
