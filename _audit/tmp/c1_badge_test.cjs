// C1 real UI verification: create a project with a chapter via UI, click the tree
// plot button, assert the mode badge reads 剧情/概要, then clean up (delete test
// project via UI, reload the previous project via UI).
// Usage: node c1_badge_test.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.env.USERPROFILE, 'Documents', '神意助手数据');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')) } catch (e) { return null } };

(async () => {
  const prevId = readJson('wa_lastProjectId.json');
  const prevProj = prevId ? readJson('wa_project_' + prevId + '.json') : null;
  const prevName = prevProj ? (prevProj.projectName || prevProj.name || '(unnamed)') : null;

  const pages = await new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9227, path: '/json' }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const ev = (ex) => new Promise((res) => {
    const mid = ++id; pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression: ex, returnByValue: true, awaitPromise: true } }));
  });
  await new Promise((res) => { const mid = ++id; pend.set(mid, res); ws.send(JSON.stringify({ id: mid, method: 'Page.enable', params: {} })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Page.javascriptDialogOpening') {
      ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    }
  });

  // 1. Create the test project through the real project modal.
  const create = await ev(`(async()=>{
    const openModal = () => document.getElementById('btn-open-project')?.click();
    if (!document.querySelector('.project-modal-content')) { openModal(); await new Promise(r=>setTimeout(r,400)); }
    if (document.querySelector('.project-transition-confirm')) {
      [...document.querySelectorAll('.project-transition-confirm button')]
        .find(b => b.textContent.trim() === '取消')?.click();
      await new Promise(r=>setTimeout(r,200));
    }
    const form = document.querySelector('.project-modal-content .new-project-form');
    if (!form) {
      const newBtn = document.querySelector('.project-modal-content .new-project-btn');
      if (!newBtn) return { error: 'new-project-btn not found' };
      newBtn.click();
      await new Promise(r=>setTimeout(r,300));
    }
    const nameInput = document.querySelector('.project-modal-content input.form-input');
    const outlineTa = document.querySelector('.project-modal-content textarea.form-textarea');
    if (!nameInput || !outlineTa) return { error: 'form fields not found' };
    nameInput.value = 'C1探针项目';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    outlineTa.value = '# 第一卷 探针卷\\n## 第一章 探针章\\n主角在夜里发现一扇陌生的门。';
    outlineTa.dispatchEvent(new Event('input', { bubbles: true }));
    const createBtn = [...document.querySelectorAll('.project-modal-content button')].find(b => b.textContent.trim() === '创建');
    if (!createBtn) return { error: 'create button not found' };
    createBtn.click();
    await new Promise(r=>setTimeout(r,300));
    const confirmBox = document.querySelector('.project-transition-confirm');
    let transition = 'none';
    if (confirmBox) {
      transition = 'save-and-continue';
      [...confirmBox.querySelectorAll('button')].find(b => b.textContent.trim() === '保存并继续')?.click();
    }
    await new Promise(r=>setTimeout(r,1200));
    return { created: true, transition, modalHidden: !!document.querySelector('.modal-overlay.modal-hidden') };
  })()`);

  // 2. Click the first chapter plot button and read the badge.
  const badge = await ev(`(async()=>{
    let btn = null;
    for (let i=0; i<12; i++) {
      btn = document.querySelector('button[id^="btn-tree-ch-plot-"]');
      if (btn) break;
      await new Promise(r=>setTimeout(r,250));
    }
    if (!btn) return { error: 'no plot button after create', treeText: document.querySelector('.chapter-tree')?.textContent?.slice(0, 300) || null };
    btn.click();
    await new Promise(r=>setTimeout(r,600));
    const b = document.getElementById('editor-mode-badge');
    return { badgeText: b ? b.textContent.trim() : null };
  })()`);

  // 3. Delete the test project through the modal (confirm() auto-accepted).
  const cleanup = await ev(`(async()=>{
    if (!document.querySelector('.project-modal-content')) { document.getElementById('btn-open-project')?.click(); await new Promise(r=>setTimeout(r,400)); }
    if (document.querySelector('.project-transition-confirm')) {
      [...document.querySelectorAll('.project-transition-confirm button')]
        .find(b => b.textContent.trim() === '取消')?.click();
      await new Promise(r=>setTimeout(r,200));
    }
    const rows = [...document.querySelectorAll('.project-modal-content .project-item')];
    const target = rows.find(el => el.textContent.includes('C1探针项目'));
    if (!target) return { error: 'test project row not found', rowCount: rows.length };
    const delBtn = [...target.querySelectorAll('button')].find(b => b.textContent.trim() === '删除');
    if (!delBtn) return { error: 'delete button not found' };
    delBtn.click();
    await new Promise(r=>setTimeout(r,1000));
    return { deleted: true };
  })()`);

  // 4. Restore: reload the previous current project via the modal.
  let restored = null;
  if (prevName && prevName !== '(unnamed)') {
    restored = await ev(`(async()=>{
      if (!document.querySelector('.project-modal-content')) { document.getElementById('btn-open-project')?.click(); await new Promise(r=>setTimeout(r,400)); }
      const rows = [...document.querySelectorAll('.project-modal-content .project-item')];
      const target = rows.find(el => el.textContent.includes(${JSON.stringify(prevName)}));
      if (!target) return { error: 'previous project row not found', prevName: ${JSON.stringify(prevName)} };
      const loadBtn = [...target.querySelectorAll('button')].find(b => b.textContent.trim() === '加载');
      if (!loadBtn) return { error: 'load button not found' };
      loadBtn.click();
      await new Promise(r=>setTimeout(r,800));
      return { restored: true };
    })()`);
  }

  const result = {
    prevProject: prevName,
    create: create.result.value,
    badge: badge.result.value,
    cleanup: cleanup.result.value,
    restore: restored ? restored.result.value : { skipped: 'no previous project' },
    c1_pass: badge.result.value.badgeText === '剧情/概要',
  };
  console.log(JSON.stringify(result, null, 2));
  ws.close(); process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
