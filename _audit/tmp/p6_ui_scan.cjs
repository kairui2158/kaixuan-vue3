const http = require('http');
const fs = require('fs');
const path = require('path');

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9227, path: pathname }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  const pages = await getJson('/json');
  const page = pages.find((item) => item.type === 'page');
  if (!page) throw new Error('CDP page target missing');
  const WebSocket = global.WebSocket || require('ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let nextId = 0;
  const pending = new Map();
  const runtimeEvents = [];

  function send(method, params = {}, timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('CDP_TIMEOUT:' + method));
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      runtimeEvents.push(message.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (message.method === 'Runtime.exceptionThrown') {
      runtimeEvents.push('EXCEPTION: ' + (message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text));
    }
  });

  await new Promise((resolve) => ws.addEventListener('open', resolve));
  await send('Runtime.enable');
  await send('Page.enable');

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const outDir = __dirname;

  function makeSelector(element) {
    if (element.id) return '#' + element.id;
    let el = element;
    let depth = 0;
    while (el && depth < 5) {
      if (el.id) return '#' + el.id;
      const parent = el.parentElement;
      if (!parent) break;
      const sameTag = Array.from(parent.children).filter((child) => child.tagName === el.tagName);
      if (sameTag.length > 1) {
        const index = sameTag.indexOf(el) + 1;
        return (depth ? '' : '') + el.tagName.toLowerCase() + ':nth-of-type(' + index + ')';
      }
      el = parent;
      depth++;
    }
    return element.tagName.toLowerCase();
  }

  const auditFunction = `(() => {
    const visual = (el) => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };
    const hasClippingAncestor = (el) => {
      let parent = el.parentElement;
      const rect = el.getBoundingClientRect();
      while (parent && parent !== document.documentElement) {
        const style = getComputedStyle(parent);
        const box = parent.getBoundingClientRect();
        const clips = ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX) || ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY);
        if (clips && (rect.bottom > box.bottom + 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.left < box.left - 1)) return true;
        parent = parent.parentElement;
      }
      return false;
    };
    const roots = ['#memory-panel', '#settings-modal-body', '#pipeline-panel', '.ow-overlay', '#dashboard-modal', '#plugin-market-modal', '.naming-overlay']
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .filter(visual);
    if (roots.length === 0) roots.push(document.body);
    const out = [];
    for (const root of roots) {
      const all = [root, ...root.querySelectorAll('*')];
      for (const el of all) {
        if (!visual(el)) continue;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const horizontalGap = el.scrollWidth - el.clientWidth;
        const verticalGap = el.scrollHeight - el.clientHeight;
        const beyondViewport = rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1 || rect.left < -1 || rect.top < -1;
        const scrollableX = ['auto', 'scroll'].includes(style.overflowX);
        const scrollableY = ['auto', 'scroll'].includes(style.overflowY);
        let kind = null;
        if (beyondViewport && hasClippingAncestor(el)) kind = 'ancestor-scroll-clip';
        else if (beyondViewport) kind = 'outside-viewport';
        else if (horizontalGap > 1 && !scrollableX) kind = 'visible-horizontal-overflow';
        else if (horizontalGap > 1 && scrollableX) kind = 'scrollable-horizontal';
        else if (verticalGap > 1 && !scrollableY && !['hidden', 'clip'].includes(style.overflowY)) kind = 'visible-vertical-overflow';
        else if (verticalGap > 1 && scrollableY) kind = 'scrollable-vertical';
        else if (el.scrollWidth > el.clientWidth + 1 && style.overflowX === 'hidden' && style.textOverflow !== 'ellipsis') kind = 'hidden-clipped-text';
        if (!kind) continue;
        const text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 90);
        const rootSelector = root === document.body ? 'body' : (root.id ? '#' + root.id : root.className.toString().split(' ')[0]);
        out.push({
          root: rootSelector,
          selector: el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : el.tagName.toLowerCase()),
          kind,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          client: { w: el.clientWidth, h: el.clientHeight },
          scroll: { w: el.scrollWidth, h: el.scrollHeight },
          overflow: { x: style.overflowX, y: style.overflowY, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace },
          text
        });
      }
    }
    const priority = { 'outside-viewport': 0, 'visible-horizontal-overflow': 1, 'hidden-clipped-text': 2, 'visible-vertical-overflow': 3, 'scrollable-horizontal': 4, 'scrollable-vertical': 5, 'ancestor-scroll-clip': 6 };
    out.sort((a, b) => priority[a.kind] - priority[b.kind]);
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      body: { scrollWidth: document.body.scrollWidth, clientWidth: document.body.clientWidth, scrollHeight: document.body.scrollHeight, clientHeight: document.body.clientHeight },
      horizontalBodyOverflow: document.body.scrollWidth > document.body.clientWidth + 1,
      candidates: out.slice(0, 80),
      totalCandidates: out.length
    };
  })()`;

  async function click(selector) {
    return evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'MISSING';
      el.click();
      return 'CLICKED';
    })()`);
  }

  async function clickByText(selector, text) {
    return evaluate(`(() => {
      const wanted = ${JSON.stringify(text)};
      const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((item) => item.textContent.trim() === wanted);
      if (!el) return 'MISSING';
      el.click();
      return 'CLICKED';
    })()`);
  }

  async function closeAll() {
    const closers = [
      '.naming-close',
      '#btn-close-market',
      '#btn-close-settings',
      '#btn-close-mem',
      '#btn-close-outline-workspace',
      '#btn-close-pl'
    ];
    for (const selector of closers) {
      const state = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return !!el && el.offsetParent !== null; })()`);
      if (state) await click(selector);
      await sleep(100);
    }
    await evaluate('(() => { const b = document.querySelector("#panel-backdrop"); if (b) b.click(); return "OK"; })()');
    await sleep(100);
  }

  async function capture(label, viewport) {
    if (process.env.P6_NO_SCREENSHOTS === '1') return { ok: true, file: 'skipped' };
    try {
      await send('Page.bringToFront', {}, 2500);
    } catch (error) {
      // Screenshot is evidence only; scan audit must not depend on foreground state.
    }
    try {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(outDir, 'p6_' + viewport.name + '_' + label.replace(/[^a-z0-9_-]+/gi, '-') + '.png');
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      return { ok: true, file };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async function scanTarget(target, viewport) {
    process.stdout.write('[P6] ' + viewport.name + ':' + target.label + '\n');
    await closeAll();
    await target.open();
    await sleep(target.wait ?? 220);
    const state = await evaluate(`(() => {
      const selectors = ${JSON.stringify(target.overlaySelectors)};
      return selectors.map((selector) => {
        const el = document.querySelector(selector);
        if (!el) return { selector, present: false };
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return { selector, present: true, visible: style.display !== 'none' && rect.width > 1 && rect.height > 1, rect: { w: Math.round(rect.width), h: Math.round(rect.height) } };
      });
    })()`);
    const audit = await evaluate(auditFunction);
    const screenshot = await capture(target.label, viewport);
    await closeAll();
    return { label: target.label, state, audit, screenshot };
  }

  const viewports = [
    { name: '1366x768', width: 1366, height: 768 },
    { name: '1920x1080', width: 1920, height: 1080 }
  ];

  const useEmulation = process.env.P6_NO_EMULATION !== '1';
  const output = { generatedAt: new Date().toISOString(), useEmulation, viewports: [] };
  try {
    const activeViewports = useEmulation ? viewports : [{ name: 'native', width: 0, height: 0 }];
    for (const viewport of activeViewports) {
      if (useEmulation) {
        await send('Emulation.setDeviceMetricsOverride', {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          mobile: false
        });
        await sleep(350);
      } else {
        await send('Emulation.clearDeviceMetricsOverride').catch(() => {});
      }

      const targets = [
        { label: 'base', open: async () => {}, overlaySelectors: ['#app'] },
        { label: 'settings-api', open: async () => { await click('#btn-settings'); await click('#tab-api'); }, overlaySelectors: ['#settings-modal'] },
        { label: 'settings-skill', open: async () => { await click('#btn-settings'); await click('#tab-skill'); }, overlaySelectors: ['#settings-modal'] },
        { label: 'settings-agent', open: async () => { await click('#btn-settings'); await click('#tab-agent'); }, overlaySelectors: ['#settings-modal'] },
        { label: 'settings-appearance', open: async () => { await click('#btn-settings'); await click('#tab-appearance'); }, overlaySelectors: ['#settings-modal'] },
        { label: 'settings-deai', open: async () => { await click('#btn-settings'); await click('#tab-deai'); }, overlaySelectors: ['#settings-modal'] },
        { label: 'settings-diag', open: async () => { await click('#btn-settings'); await click('#tab-diag'); }, overlaySelectors: ['#settings-modal'] },
        { label: 'settings-mcp', open: async () => { await click('#btn-settings'); await click('#tab-mcp'); }, overlaySelectors: ['#settings-modal'] },
        { label: 'outline-workspace', open: async () => { await click('#btn-outline-workspace'); }, overlaySelectors: ['.ow-overlay'] },
        { label: 'pipeline-outline', open: async () => { await click('#btn-pipeline'); await evaluate('(() => { document.querySelectorAll(".pl-step")[0].click(); return "OK"; })()'); }, overlaySelectors: ['#pipeline-panel'] },
        { label: 'pipeline-settings', open: async () => { await click('#btn-pipeline'); await evaluate('(() => { document.querySelectorAll(".pl-step")[1].click(); return "OK"; })()'); }, overlaySelectors: ['#pipeline-panel'] },
        { label: 'pipeline-volumes', open: async () => { await click('#btn-pipeline'); await evaluate('(() => { document.querySelectorAll(".pl-step")[2].click(); return "OK"; })()'); }, overlaySelectors: ['#pipeline-panel'] },
        { label: 'pipeline-chapters', open: async () => { await click('#btn-pipeline'); await evaluate('(() => { document.querySelectorAll(".pl-step")[3].click(); return "OK"; })()'); }, overlaySelectors: ['#pipeline-panel'] },
        { label: 'pipeline-body', open: async () => { await click('#btn-pipeline'); await evaluate('(() => { document.querySelectorAll(".pl-step")[4].click(); return "OK"; })()'); }, overlaySelectors: ['#pipeline-panel'] },
        { label: 'memory-list', open: async () => { await click('#btn-memory'); await clickByText('.mem-tab-btn', '记忆列表'); }, overlaySelectors: ['#memory-panel'] },
        { label: 'memory-relation', open: async () => { await click('#btn-memory'); await clickByText('.mem-tab-btn', '关系图'); }, overlaySelectors: ['#memory-panel'] },
        { label: 'memory-analysis', open: async () => { await click('#btn-memory'); await clickByText('.mem-tab-btn', '图谱分析'); }, overlaySelectors: ['#memory-panel'] },
        { label: 'memory-mind', open: async () => { await click('#btn-memory'); await clickByText('.mem-tab-btn', '思维导图'); }, overlaySelectors: ['#memory-panel'] },
        { label: 'memory-timeline', open: async () => { await click('#btn-memory'); await clickByText('.mem-tab-btn', '时间线'); }, overlaySelectors: ['#memory-panel'] },
        { label: 'plugin-market', open: async () => { await click('#btn-plugin-market'); }, overlaySelectors: ['#plugin-market-modal'] },
        { label: 'dashboard', open: async () => { await click('#btn-dashboard'); }, overlaySelectors: ['#dashboard-modal'] },
        {
          label: 'ai-naming-generate',
          open: async () => {
            await evaluate('(() => { window.dispatchEvent(new CustomEvent("open-ai-naming", { detail: { source: "P6-scan" } })); return "OK"; })()');
            await clickByText('.naming-sub-tab', '生成');
          },
          overlaySelectors: ['.naming-overlay']
        },
        {
          label: 'ai-naming-favorites',
          open: async () => {
            await evaluate('(() => { window.dispatchEvent(new CustomEvent("open-ai-naming", { detail: { source: "P6-scan" } })); return "OK"; })()');
            await clickByText('.naming-sub-tab', '收藏');
          },
          overlaySelectors: ['.naming-overlay']
        },
        {
          label: 'ai-naming-history',
          open: async () => {
            await evaluate('(() => { window.dispatchEvent(new CustomEvent("open-ai-naming", { detail: { source: "P6-scan" } })); return "OK"; })()');
            await clickByText('.naming-sub-tab', '历史');
          },
          overlaySelectors: ['.naming-overlay']
        }
      ];

      const results = [];
      for (const target of targets) {
        try {
          results.push(await scanTarget(target, viewport));
        } catch (error) {
          results.push({ label: target.label, error: error.message });
          await closeAll().catch(() => {});
        }
      }
      output.viewports.push({ viewport, runtimeEvents: runtimeEvents.splice(0), results });
    }
  } finally {
    if (process.env.P6_NO_EMULATION === '1') await send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    await closeAll().catch(() => {});
    ws.close();
  }

  fs.writeFileSync(path.join(outDir, 'p6_ui_scan.json'), JSON.stringify(output, null, 2));
  const summary = output.viewports.map((item) => ({
    viewport: item.viewport.name,
    scanned: item.results.length,
    failed: item.results.filter((r) => r.error).length,
    issues: item.results.filter((r) => r.audit).map((r) => ({ label: r.label, total: r.audit.totalCandidates, severe: r.audit.candidates.filter((c) => ['visible-horizontal-overflow', 'hidden-clipped-text'].includes(c.kind)).length }))
  }));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
})().catch((error) => {
  console.error('P6_SCAN_FAIL', error.stack || error.message);
  process.exit(1);
});
