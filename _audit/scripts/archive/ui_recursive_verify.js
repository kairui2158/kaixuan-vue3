const http = require("http");

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const msg = JSON.stringify({ id, method, params });
    ws.send(msg);
    const timeout = setTimeout(() => reject(new Error("Timeout: " + method)), 15000);
    ws.on("message", function handler(data) {
      try {
        const resp = JSON.parse(data.toString());
        if (resp.id === id) {
          clearTimeout(timeout);
          ws.off("message", handler);
          if (resp.error) reject(new Error(JSON.stringify(resp.error)));
          else resolve(resp.result);
        }
      } catch(e) {}
    });
  });
}

async function main() {
  const WebSocket = (await import("ws")).default;
  const targets = await new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9227/json", (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    }).on("error", reject);
  });
  const page = targets.find(t => t.type === "page");
  if (!page) throw new Error("No page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });

  const results = [];
  const shot = async (name) => {
    try {
      const { data } = await cdpSend(ws, "Page.captureScreenshot", { format: "png" });
      require("fs").writeFileSync(`_audit/screenshots/${name}.png`, Buffer.from(data, "base64"));
      results.push({ step: name, screenshot: true });
    } catch(e) { results.push({ step: name, screenshot: false, error: e.message }); }
  };
  const evalJS = async (expr) => {
    const { result } = await cdpSend(ws, "Runtime.evaluate", { expression: expr, returnByValue: true });
    return result.value;
  };

  // L1: Main page
  const l1 = await evalJS(`(() => {
    const nav = document.querySelector('.sidebar-nav');
    const navBtns = nav ? nav.querySelectorAll('button').length : 0;
    const chat = document.querySelector('#chat-input, .chat-input');
    const chatFont = chat ? getComputedStyle(chat).fontSize : 'N/A';
    const editor = document.querySelector('.editor-panel, #editor-panel');
    const editorFont = editor ? getComputedStyle(editor).fontSize : 'N/A';
    const sampleBtn = document.querySelector('.btn-primary, .btn-secondary');
    const btnFont = sampleBtn ? getComputedStyle(sampleBtn).fontSize : 'N/A';
    const btnRadius = sampleBtn ? getComputedStyle(sampleBtn).borderRadius : 'N/A';
    return JSON.stringify({ navBtns, chatFont, editorFont, btnFont, btnRadius });
  })()`);
  results.push({ layer: 1, name: "Main page", data: JSON.parse(l1) });
  await shot("ui_l1_main");

  // L2: Open settings modal
  await evalJS(`(() => {
    const btn = document.querySelector('#btn-settings');
    if (btn) btn.click();
    return 'clicked';
  })()`);
  await new Promise(r => setTimeout(r, 1000));
  const l2 = await evalJS(`(() => {
    const modal = document.querySelector('#settings-modal .modal-content, .settings-modal .modal-content');
    const width = modal ? getComputedStyle(modal).width : 'N/A';
    const header = document.querySelector('.modal-header h3');
    const headerFont = header ? getComputedStyle(header).fontSize : 'N/A';
    const body = document.querySelector('.modal-body');
    const bodyFont = body ? getComputedStyle(body).fontSize : 'N/A';
    const tabBtn = document.querySelector('.modal-tab');
    const tabFont = tabBtn ? getComputedStyle(tabBtn).fontSize : 'N/A';
    return JSON.stringify({ width, headerFont, bodyFont, tabFont });
  })()`);
  results.push({ layer: 2, name: "Settings modal", data: JSON.parse(l2) });
  await shot("ui_l2_settings");

  // L2->L3: Open skill edit (inside settings)
  await evalJS(`(() => {
    const skillTab = document.querySelector('[data-tab="skill"]');
    if (skillTab) skillTab.click();
    return 'skill tab';
  })()`);
  await new Promise(r => setTimeout(r, 500));
  await evalJS(`(() => {
    const editBtn = document.querySelector('#skill-settings .btn-primary, .skill-card .btn-primary, .skill-edit-btn');
    if (editBtn) editBtn.click();
    return 'edit clicked';
  })()`);
  await new Promise(r => setTimeout(r, 1000));
  const l3 = await evalJS(`(() => {
    const modals = document.querySelectorAll('.modal-content');
    const deep = modals[modals.length - 1];
    if (!deep) return JSON.stringify({ found: false });
    const width = getComputedStyle(deep).width;
    const header = deep.querySelector('h3, .modal-header h3');
    const headerFont = header ? getComputedStyle(header).fontSize : 'N/A';
    const input = deep.querySelector('input, textarea');
    const inputFont = input ? getComputedStyle(input).fontSize : 'N/A';
    const btn = deep.querySelector('.btn-primary, .btn-secondary');
    const btnFont = btn ? getComputedStyle(btn).fontSize : 'N/A';
    return JSON.stringify({ found: true, modalCount: modals.length, width, headerFont, inputFont, btnFont });
  })()`);
  results.push({ layer: 3, name: "Skill edit (modal in modal)", data: JSON.parse(l3) });
  await shot("ui_l3_skill_edit");

  // Close everything
  await evalJS(`(() => {
    document.querySelectorAll('.modal-overlay, .modal-close, [data-action="close"]').forEach(el => {
      if (el.click) el.click();
    });
    const esc = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(esc);
    document.dispatchEvent(esc);
    return 'closed';
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // Pipeline check
  await evalJS(`(() => {
    const btn = document.querySelector('#btn-pipeline');
    if (btn) btn.click();
    return 'pipeline clicked';
  })()`);
  await new Promise(r => setTimeout(r, 1000));
  const l2p = await evalJS(`(() => {
    const modal = document.querySelector('#pipeline-modal .modal-content, .pipeline-panel .modal-content');
    const width = modal ? getComputedStyle(modal).width : 'N/A';
    const stepBtn = document.querySelector('.pl-step-btn, .pipeline-step-btn');
    const stepFont = stepBtn ? getComputedStyle(stepBtn).fontSize : 'N/A';
    return JSON.stringify({ width, stepFont });
  })()`);
  results.push({ layer: 2, name: "Pipeline modal", data: JSON.parse(l2p) });
  await shot("ui_l2_pipeline");

  // Close pipeline
  await evalJS(`(() => { const esc = new KeyboardEvent('keydown', { key: 'Escape' }); document.dispatchEvent(esc); return 'closed'; })()`);
  await new Promise(r => setTimeout(r, 500));

  ws.close();
  console.log(JSON.stringify(results, null, 2));
  console.log("\n--- VERIFICATION SUMMARY ---");
  let pass = 0, fail = 0;
  for (const r of results) {
    if (r.screenshot === true) pass++;
    else if (r.data) pass++;
    else fail++;
  }
  console.log("PASS: " + pass + " / FAIL: " + fail);
}

main().catch(e => { console.error(e.message); process.exit(1); });
