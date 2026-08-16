
const WebSocket = require("ws");
const http = require("http");
const fs2 = require("fs");

const OUT = "_audit/e2e/pipeline_chain_compose_verify.json";

http.get("http://127.0.0.1:9227/json/list", (res) => {
  let d = "";
  res.on("data", (c) => (d += c));
  res.on("end", () => {
    const targets = JSON.parse(d);
    const page = targets.find((x) => x.type === "page");
    if (!page) { console.error("No page"); process.exit(1); }
    const wsu = new WebSocket(page.webSocketDebuggerUrl);
    wsu.on("open", () => {
      let nid = 1;
      function ev(exp, ap) {
        const id = nid++;
        return new Promise((resolve, reject) => {
          const cb = (raw) => {
            const m = JSON.parse(raw.toString());
            if (m.id !== id) return;
            wsu.off("message", cb);
            if (m.error) reject(m.error);
            else resolve(m.result);
          };
          wsu.on("message", cb);
          wsu.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression: exp, awaitPromise: !!ap, returnByValue: true } }));
        });
      }
      (async () => {
        try {
          await ev("new Promise(r => { if(document.readyState === "complete") r(); else document.addEventListener("readystatechange", function h() { if(document.readyState === "complete") { document.removeEventListener("readystatechange", h); r(); } }); })", true);
          
          await ev("document.getElementById("btn-pipeline")?.click()");
          await ev("new Promise(r => setTimeout(r, 500))", true);
          await ev("(function(){ var s = document.querySelectorAll(".pl-step"); if(s[2]) s[2].click(); })()");
          await ev("new Promise(r => setTimeout(r, 300))", true);
          
          // Bind 2 skills if not already
          const r1 = await ev("JSON.stringify(Array.from(document.querySelectorAll("#pl-s3-skills-list .pl-skill-chip")).map(e=>e.textContent.trim()))");
          const chips = JSON.parse(r1.value || r1.result?.value || "[]");
          console.log("CHIPS=" + JSON.stringify(chips));
          
          if (chips.length < 2) {
            for (const sid of ["sk_ms4v1agw_jm2xl4", "sk_ms4v1r5k_im2adh"]) {
              await ev("(function(){ var s = document.getElementById("pl-s3-skill"); if(s) { s.value = "" + sid + ""; s.dispatchEvent(new Event("change", {bubbles:true})); } })()");
              await ev("new Promise(r => setTimeout(r, 200))", true);
              await ev("document.getElementById("pl-s3-add-skill")?.click()");
              await ev("new Promise(r => setTimeout(r, 300))", true);
            }
            console.log("SKILLS_BOUND");
          }
          
          // Intercept callApi
          await ev("(function(){ var p = window.__pinia._s.get("provider"); window.__callCount = 0; window.__callLog = []; p.callApi = async function(pid, model, messages) { window.__callCount++; window.__callLog.push({pid: pid, model: model, sysLen: (messages[0]?.content||"").length, userLen: (messages[1]?.content||"").length }); return "MOCK_RETURN_" + window.__callCount; }; return "INTERCEPTED"; })()");
          console.log("INTERCEPTED");
          
          // Chain mode
          await ev("document.getElementById("btn-pl-gen-volumes")?.click()");
          await ev("new Promise(r => setTimeout(r, 3000))", true);
          
          const r2 = await ev("window.__callCount");
          const r3 = await ev("JSON.stringify(window.__callLog)");
          const chainCount = r2.value || r2.result?.value || 0;
          const chainLog = JSON.parse(r3.value || r3.result?.value || "[]");
          console.log("CHAIN_COUNT=" + chainCount);
          
          // Compose mode
          await ev("(function(){ var m = document.getElementById("pl-s3-mode"); if(m) { m.value = "compose"; m.dispatchEvent(new Event("change", {bubbles:true})); } })()");
          await ev("new Promise(r => setTimeout(r, 300))", true);
          await ev("window.__callCount = 0; window.__callLog = []");
          await ev("document.getElementById("btn-pl-gen-volumes")?.click()");
          await ev("new Promise(r => setTimeout(r, 3000))", true);
          
          const r4 = await ev("window.__callCount");
          const r5 = await ev("JSON.stringify(window.__callLog)");
          const composeCount = r4.value || r4.result?.value || 0;
          const composeLog = JSON.parse(r5.value || r5.result?.value || "[]");
          console.log("COMPOSE_COUNT=" + composeCount);
          
          const result = {
            chainCallCount: Number(chainCount),
            chainCallLog: chainLog,
            composeCallCount: Number(composeCount),
            composeCallLog: composeLog,
            chainPassed: Number(chainCount) === 2,
            composePassed: Number(composeCount) === 1,
            capturedAt: new Date().toISOString()
          };
          fs2.mkdirSync("_audit/e2e", { recursive: true });
          fs2.writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
          console.log("REPORT_SAVED");
          console.log("CHAIN_PASSED=" + result.chainPassed + " (cnt=" + chainCount + ")");
          console.log("COMPOSE_PASSED=" + result.composePassed + " (cnt=" + composeCount + ")");
          wsu.close();
        } catch(e) {
          console.error("ERROR=" + (e && e.message || String(e)));
          wsu.close();
        }
      })();
    });
    wsu.on("error", (e) => { console.error("WS_ERROR=" + e.message); });
  });
});
