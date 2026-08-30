const CDP_PORT = 9227;
const fs = require('fs');
const phase = process.argv[2];
const logFile = `_audit/tmp/e1_phase_${phase}.log`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(obj) {
  const line = typeof obj === 'string' ? obj : JSON.stringify(obj);
  fs.appendFileSync(logFile, line + '\n');
  console.error(line);
}

async function getPageWs() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
  if (!page) throw new Error('page target not found');
  return page.webSocketDebuggerUrl;
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res2, rej2) => {
          const mid = ++id;
          pending.set(mid, { res2, rej2 });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      close: () => ws.close(),
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res2, rej2 } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej2(new Error(JSON.stringify(msg.error)));
        else res2(msg.result);
      }
    };
    ws.onclose = () => {
      for (const { rej2 } of pending.values()) rej2(new Error('ws closed'));
      pending.clear();
    };
    ws.onerror = () => reject(new Error('ws connect error'));
  });
}

async function evaluate(cdp, expr, timeoutMs = 10000) {
  const r = await Promise.race([
    cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate timeout')), timeoutMs)),
  ]);
  if (r.exceptionDetails) throw new Error('eval fail: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}

async function waitFor(cdp, expr, tries = 20, gap = 250) {
  for (let i = 0; i < tries; i++) {
    const ok = await evaluate(cdp, expr);
    if (ok) return true;
    await sleep(gap);
  }
  return false;
}

function psExpr(body) {
  return `(async () => {
    const app = document.querySelector('#app').__vue_app__;
    const ps = app.config.globalProperties.$pinia._s.get('project');
    ${body}
  })()`;
}

async function shot(cdp, file) {
  const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
}

async function deleteAllProbeProjects(cdp) {
  return evaluate(cdp, psExpr(`
    let removed = 0;
    for (;;) {
      const probe = (ps.projectList || []).find((p) => p.name === 'E1探针项目');
      if (!probe || removed > 10) break;
      await ps.deleteProject(probe.id);
      removed++;
    }
    return ({ removed, current: ps.currentProjectId || '' });
  `));
}

(async () => {
  const cdp = await connect(await getPageWs());
  await cdp.send('Page.enable');
  await evaluate(cdp, `document.querySelector('#app') ? true : false`);
  await sleep(800);

  if (phase === 'A') {
    for (let i = 0; i < 5 && await evaluate(cdp, `!!document.querySelector('.app-confirm-overlay')`); i++) {
      await evaluate(cdp, `(() => {
        const btns = Array.from(document.querySelectorAll('.app-confirm-content button'));
        (btns.find((b) => b.textContent === '取消') || btns[0]).click();
      })()`);
      await sleep(250);
    }
    log({ step: 'clearStaleDialog', overlay: await evaluate(cdp, `!!document.querySelector('.app-confirm-overlay')`) });
    const cleaned = await deleteAllProbeProjects(cdp);
    log({ step: 'cleanupOld', cleaned });
    const created = await evaluate(cdp, psExpr(`
      const id = await ps.createProject('E1探针项目', '第一卷 探针卷\\n第一章 探针章节');
      return ({ id, volumes: (ps.volumes || []).length, current: ps.currentProjectId });
    `));
    log({ step: 'create', created });
    const treeReady = await waitFor(cdp, `!!Array.from(document.querySelectorAll('.vol-name')).find((e) => e.textContent.includes('探针卷'))`);
    log({ step: 'treeReady', treeReady });
    log({ done: true, treeReady, projectId: created.id });
  }

  if (phase === 'B') {
    const pre = await evaluate(cdp, psExpr(`
      return ({ name: ps.projectName, volumes: (ps.volumes || []).map((v) => v.name) });
    `));
    log({ step: 'precondition', pre });
    if (pre.name !== 'E1探针项目' || !pre.volumes.includes('探针卷')) {
      throw new Error('phase B precondition failed: run phase A first');
    }

    async function openDeleteConfirm() {
      const found = await waitFor(cdp, `!!Array.from(document.querySelectorAll('.vol-name')).find((e) => e.textContent.includes('探针卷'))`);
      if (!found) throw new Error('volume item not in tree');
      await evaluate(cdp, `(() => {
        const item = Array.from(document.querySelectorAll('.volume-item')).find((e) => e.textContent.includes('探针卷'));
        item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 200 }));
      })()`);
      const menu = await waitFor(cdp, `!!document.querySelector('.ctx-menu')`);
      if (!menu) throw new Error('ctx menu never appeared');
      await evaluate(cdp, `(() => {
        const btn = Array.from(document.querySelectorAll('.ctx-item.danger')).find((e) => e.textContent.includes('删除卷'));
        btn.click();
      })()`);
      const overlay = await waitFor(cdp, `!!document.querySelector('.app-confirm-overlay')`);
      if (!overlay) throw new Error('app confirm never appeared');
    }

    await openDeleteConfirm();
    log({ step: 'confirm1Visible', text: await evaluate(cdp, `(document.querySelector('.app-confirm-message') || {}).textContent || ''`), danger: await evaluate(cdp, `(document.querySelector('.app-confirm-content .btn-danger') || {}).textContent || ''`) });
    await evaluate(cdp, `document.querySelector('.app-confirm-overlay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    const escClosed = await waitFor(cdp, `!document.querySelector('.app-confirm-overlay')`);
    log({ step: 'esc', closed: escClosed, kept: await evaluate(cdp, `!!Array.from(document.querySelectorAll('.vol-name')).find((e) => e.textContent.includes('探针卷'))`) });

    await openDeleteConfirm();
    await evaluate(cdp, `(() => {
      const btns = Array.from(document.querySelectorAll('.app-confirm-content button'));
      btns.find((b) => b.textContent === '取消').click();
    })()`);
    const cancelClosed = await waitFor(cdp, `!document.querySelector('.app-confirm-overlay')`);
    log({ step: 'cancel', closed: cancelClosed, kept: await evaluate(cdp, `!!Array.from(document.querySelectorAll('.vol-name')).find((e) => e.textContent.includes('探针卷'))`) });

    await openDeleteConfirm();
    await shot(cdp, '_audit/tmp/e1_confirm_visible.png');
    await evaluate(cdp, `(() => {
      const btns = Array.from(document.querySelectorAll('.app-confirm-content button'));
      btns.find((b) => b.textContent === '删除').click();
    })()`);
    const confirmGone = await waitFor(cdp, `!document.querySelector('.app-confirm-overlay')`);
    const volumeGoneDom = await waitFor(cdp, `!Array.from(document.querySelectorAll('.vol-name')).find((e) => e.textContent.includes('探针卷'))`);
    const volumeGoneStore = await evaluate(cdp, psExpr(`return !ps.volumes.some((v) => v.name === '探针卷');`));
    log({ step: 'confirmDelete', confirmGone, volumeGoneDom, volumeGoneStore });
    log({ done: confirmGone && volumeGoneDom && volumeGoneStore });
  }

  if (phase === 'C') {
    const originalProjectId = await evaluate(cdp, psExpr(`return ps.currentProjectId || '';`));
    log({ step: 'originalProject', originalProjectId });
    const cleaned = await deleteAllProbeProjects(cdp);
    await evaluate(cdp, psExpr(`ps.clearCurrent(); ps.currentProjectId;`));
    const noCurrent = await evaluate(cdp, psExpr(`return ps.currentProjectId === null && (ps.projectList || []).every((p) => p.name !== 'E1探针项目');`));
    log({ step: 'cleanupProbe', cleaned, noCurrent });
    if (!noCurrent) throw new Error('failed to reach no-current-project state');

    await evaluate(cdp, `document.querySelector('#btn-open-project').click()`);
    const modalOpen = await waitFor(cdp, `!!document.querySelector('.project-modal-content')`);
    if (!modalOpen) throw new Error('project modal never opened');
    let formOpen = false;
    for (let i = 0; i < 10 && !formOpen; i++) {
      await evaluate(cdp, `(() => {
        const btn = Array.from(document.querySelectorAll('.project-modal-content button')).find((b) => b.textContent.trim() === '+ 新建项目');
        if (btn) btn.click();
      })()`);
      formOpen = await evaluate(cdp, `!!document.querySelector('.new-project-form')`);
      if (!formOpen) await sleep(250);
    }
    if (!formOpen) throw new Error('new project form never appeared');
    await evaluate(cdp, `(() => {
      const btns = Array.from(document.querySelectorAll('.project-modal-content .form-actions button'));
      btns.find((b) => b.textContent.trim() === '创建').click();
    })()`);
    const alertShown = await waitFor(cdp, `!!document.querySelector('.app-confirm-overlay')`);
    log({ step: 'emptyCreateAlert', alertShown, text: alertShown ? await evaluate(cdp, `(document.querySelector('.app-confirm-message') || {}).textContent || ''`) : '' });
    if (!alertShown) {
      await shot(cdp, '_audit/tmp/e1_alert_missing.png');
      throw new Error('empty-create alert did not appear');
    }
    await shot(cdp, '_audit/tmp/e1_alert_visible.png');
    await evaluate(cdp, `document.querySelector('.app-confirm-overlay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
    const alertClosed = await waitFor(cdp, `!document.querySelector('.app-confirm-overlay')`);
    await evaluate(cdp, `(() => {
      const btn = document.querySelector('.project-modal-content .btn-close');
      if (btn) btn.click();
    })()`);
    await sleep(300);
    const restored = await evaluate(cdp, psExpr(`
      const id = ${JSON.stringify('p1788090303036')};
      const orig = ${JSON.stringify(originalProjectId || '')};
      const target = (orig && (ps.projectList || []).some((p) => p.id === orig)) ? orig
        : ((ps.projectList || []).some((p) => p.id === id) ? id : '');
      if (target) ps.selectProject(target);
      return target;
    `));
    await sleep(500);
    const finalCurrent = await evaluate(cdp, psExpr(`return ps.currentProjectId || '';`));
    log({ step: 'restore', restored, finalCurrent });
    log({ done: alertClosed && !!finalCurrent });
  }

  cdp.close();
  process.exit(0);
})().catch((e) => {
  log({ PROBE_FAIL: e.message });
  process.exit(1);
});
