const http = require('http');

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9227, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

(async () => {
  const pages = await getJson('/json');
  const page = pages.find((p) => p.type === 'page');
  const WebSocket = global.WebSocket || require('ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pending = new Map();
  const events = [];
  function send(method, params) {
    return new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      events.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      events.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Runtime.enable');
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') };
    return r.result && r.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // install console guard first
  await evalJs('window.__p1errors=[]; console.error=(...a)=>{window.__p1errors.push(String(a[0])); console.warn.apply(console,a);}; 1');

  const treeState = await evalJs(`(() => {
    const volBtns = Array.from(document.querySelectorAll('[id^="btn-tree-vol-outline-"]'));
    const chItems = Array.from(document.querySelectorAll('.chapter-item'));
    const plotBtns = Array.from(document.querySelectorAll('[id^="btn-tree-ch-plot-"]'));
    return {
      volBtnCount: volBtns.length,
      volBtnIds: volBtns.slice(0, 3).map((b) => b.id),
      chItemCount: chItems.length,
      chItemTexts: chItems.slice(0, 3).map((c) => c.querySelector('span')?.textContent || c.textContent.trim().slice(0, 20)),
      plotBtnCount: plotBtns.length,
      plotBtnIds: plotBtns.slice(0, 3).map((b) => b.id),
      editorTitleBefore: (document.querySelector('#editor-title') || {}).textContent || null,
      modeBadgeBefore: (document.querySelector('#editor-mode-badge') || {}).textContent || null
    };
  })()`);

  const result = { treeState, steps: [] };
  const clickEl = async (sel) => await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'MISSING:' + ${JSON.stringify(sel)}; el.click(); return 'CLICKED'; })()`);

  // Step 1: volume outline button
  if (treeState.volBtnCount > 0) {
    const vid = treeState.volBtnIds[0];
    result.steps.push({ step: 'click-vol-outline', click: await clickEl('[id="' + vid + '"]') });
    await sleep(300);
    result.steps.push({
      step: 'after-vol-outline',
      title: (await evalJs('(document.querySelector("#editor-title")||{}).textContent')) || null,
      badge: (await evalJs('(document.querySelector("#editor-mode-badge")||{}).textContent')) || null,
      chatPanelVisible: await evalJs(`(() => { const c = document.querySelector("#chat-panel"); return !!c && getComputedStyle(c).display !== 'none'; })()`),
      overflowX: await evalJs('document.body.scrollWidth > window.innerWidth')
    });
  } else {
    result.steps.push({ step: 'click-vol-outline', note: 'no volume outline buttons in tree' });
  }

  // Step 2: chapter item select
  if (treeState.chItemCount > 0) {
    result.steps.push({ step: 'click-chapter-item', click: await clickEl('.chapter-item') });
    await sleep(300);
    result.steps.push({
      step: 'after-chapter-item',
      title: (await evalJs('(document.querySelector("#editor-title")||{}).textContent')) || null,
      badge: (await evalJs('(document.querySelector("#editor-mode-badge")||{}).textContent')) || null,
      chatPanelVisible: await evalJs(`(() => { const c = document.querySelector("#chat-panel"); return !!c && getComputedStyle(c).display !== 'none'; })()`),
      overflowX: await evalJs('document.body.scrollWidth > window.innerWidth')
    });
  } else {
    result.steps.push({ step: 'click-chapter-item', note: 'no chapter items in tree' });
  }

  // Step 3: chapter plot button
  if (treeState.plotBtnCount > 0) {
    const pid = treeState.plotBtnIds[0];
    result.steps.push({ step: 'click-ch-plot', click: await clickEl('[id="' + pid + '"]') });
    await sleep(300);
    result.steps.push({
      step: 'after-ch-plot',
      title: (await evalJs('(document.querySelector("#editor-title")||{}).textContent')) || null,
      badge: (await evalJs('(document.querySelector("#editor-mode-badge")||{}).textContent')) || null,
      chatPanelVisible: await evalJs(`(() => { const c = document.querySelector("#chat-panel"); return !!c && getComputedStyle(c).display !== 'none'; })()`),
      overflowX: await evalJs('document.body.scrollWidth > window.innerWidth')
    });
  } else {
    result.steps.push({ step: 'click-ch-plot', note: 'no plot buttons in tree' });
  }

  // Step 4: navigate-back via tree generate button and restore editor tab
  result.steps.push({ step: 'p1-console-errors', errors: await evalJs('window.__p1errors') || [] });
  result.steps.push({ step: 'cdp-runtime-errors', errors: events });
  console.log(JSON.stringify(result, null, 2));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('PROBE_FAIL', e.message); process.exit(1); });
