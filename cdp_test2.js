const WebSocket = require("ws");
const port = 9227;

async function main() {
  const resp = await fetch("http://localhost:" + port + "/json");
  const targets = await resp.json();
  const target = targets.find(t => t.url.includes("index.html"));
  if (!target) { console.log("No target found"); return; }
  
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 1;
  
  function send(method, params) {
    params = params || {};
    return new Promise((resolve) => {
      const id = msgId++;
      ws.send(JSON.stringify({ id, method, params }));
      ws.on("message", function handler(data) {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.removeListener("message", handler);
          resolve(msg);
        }
      });
    });
  }
  
  ws.on("open", async () => {
    console.log("CDP connected");
    await send("Page.enable");
    await send("Console.enable");
    
    // Get all buttons
    const result = await send("Runtime.evaluate", {
      expression: "document.querySelectorAll(\"button\").length",
      returnByValue: true
    });
    console.log("Total buttons:", result.result.value);
    
    // Get visible buttons info
    const info = await send("Runtime.evaluate", {
      expression: "JSON.stringify(Array.from(document.querySelectorAll(\"button\")).map((b,i)=>({id:b.id||\"\",t:b.textContent.trim().slice(0,20),v:b.offsetParent!==null,d:b.disabled})))",
      returnByValue: true
    });
    console.log("Buttons:", info.result.value);
    
    // Click the first visible non-disabled button in the pipeline panel
    const clickResult = await send("Runtime.evaluate", {
      expression: "(function(){const b=document.querySelector(\"#pl-step-1-content button\");if(!b)return\"no btn\";b.dispatchEvent(new MouseEvent(\"click\",{bubbles:true,cancelable:true}));return\"clicked\"})()",
      returnByValue: true
    });
    console.log("Click result:", clickResult.result.value);
    
    // Check console errors
    const consoleResult = await send("Runtime.evaluate", {
      expression: "window.__consoleErrors ? window.__consoleErrors.join(\"\\n\") : \"no errors\"",
      returnByValue: true
    });
    console.log("Console errors:", consoleResult.result.value);
    
    console.log("DONE");
    ws.close();
  });
  
  ws.on("error", (err) => console.log("WS error:", err.message));
}

main().catch(console.error);
