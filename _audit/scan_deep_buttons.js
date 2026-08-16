const WebSocket = require('ws');
const fs = require('fs');
const ws = new WebSocket('ws://localhost:9227/devtools/page/73026C8ADC25E28EA9D991E672A166E3');

let msgId = 1;
let pending = 0;
const allButtonScans = {};
const panels = ['settings', 'pipeline', 'settings-collection', 'outline', 'memory', 'dashboard', 'plugin-market'];

function send(cmd) {
  cmd.id = msgId++;
  ws.send(JSON.stringify(cmd));
}

function evaluate(expr, label) {
  pending++;
  send({
    method: 'Runtime.evaluate',
    params: { expression: expr, returnByValue: true },
    label
  });
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

ws.on('message', async (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && msg.result && msg.result.result && msg.result.result.value !== undefined) {
    pending--;
    const val = msg.result.result.value;
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        allButtonScans[msg.label] = parsed;
      }
    } catch (e) { /* not button scan */ }
  }
});

ws.on('open', async () => {
  // 先关掉所有面板，扫描主界面
  evaluate(`(() => {
    if (window.__setActivePanel) window.__setActivePanel("");
    const btns = Array.from(document.querySelectorAll('#app button'));
    return JSON.stringify(btns.map(b => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return { id: b.id || '', text: (b.textContent||'').trim().substring(0,25), display: cs.display, vis: cs.visibility, w: Math.round(r.width), h: Math.round(r.height), hidden: r.width===0||r.height===0||cs.display==='none'||cs.visibility==='hidden' };
    }));
  })()`, '_main');
  await wait(1000);

  // 逐面板扫描
  for (const p of panels) {
    evaluate(`(() => {
      if (window.__setActivePanel) window.__setActivePanel("${p}");
      return "OK_${p}";
    })()`, `nav_${p}`);
    await wait(1500);

    evaluate(`(() => {
      const root = document.querySelector('#app').lastElementChild;
      const btns = Array.from(root.querySelectorAll('button'));
      return JSON.stringify(btns.map(b => {
        const r = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return { id: b.id || '', text: (b.textContent||'').trim().substring(0,25), display: cs.display, vis: cs.visibility, w: Math.round(r.width), h: Math.round(r.height), hidden: r.width===0||r.height===0||cs.display==='none'||cs.visibility==='hidden' };
      }));
    })()`, p);
    await wait(500);
  }

  // 等所有请求完成
  await wait(3000);
  fs.writeFileSync('_audit/button_deep_scan.json', JSON.stringify(allButtonScans, null, 2));

  // 汇总隐藏按钮
  let hiddenCount = 0;
  for (const [panel, btns] of Object.entries(allButtonScans)) {
    if (!Array.isArray(btns)) continue;
    const hidden = btns.filter(b => b.hidden);
    if (hidden.length > 0) {
      console.log(`${panel}: ${hidden.length} hidden buttons`);
      hidden.forEach(b => console.log(`  ${b.id || b.text} | display=${b.display} | w=${b.w}h=${b.h}`));
      hiddenCount += hidden.length;
    }
  }
  if (hiddenCount === 0) console.log('NO_HIDDEN_BUTTONS');
  ws.close();
  process.exit(0);
});
