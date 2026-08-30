// D-phase real verification (idempotent rerun): D2 (chain generation log carries
// agentId+skillId), D4 (help guide 11 sections incl. 3 new ones), D5 (diag app version).
// Reuses the already-locked D2 probe project when present; cleanup loads the smoke
// project via the real modal and deletes the probe project through the transition dialog.
// Usage: node _audit/tmp/d_phase_test.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.env.USERPROFILE, 'Documents', '神意助手数据');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')) } catch (e) { return null } };
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
const EXPECTED_VERSION = pkg.version;
const SKILL_ID = 'L2-S1';
const SECOND_SKILL_ID = 'L2-S2';
const AGENT_ID = 'agent_xuanwu_l3_parse';
const TEST_PROJ = 'D2探针项目';
const RESTORE_PROJ = '深度扫描冒烟项目';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const page = pages.find((p) => p.type === 'page');
  if (!page) throw new Error('CDP page target missing');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let nextId = 0;
  const pending = new Map();
  const nativeDialogs = [];
  function send(method, params = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP_TIMEOUT:' + method)); }, timeoutMs);
      pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) {
      const entry = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) entry.reject(new Error(m.error.message));
      else entry.resolve(m.result);
    }
    if (m.method === 'Page.javascriptDialogOpening') {
      nativeDialogs.push(m.params.type + ':' + (m.params.message || '').slice(0, 80));
      ws.send(JSON.stringify({ id: ++nextId, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Runtime.enable');
  await send('Page.enable');

  async function evaluate(expression, timeoutMs = 15000) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
  }

  const steps = [];
  const step = (name, value) => steps.push({ name, value });
  const fail = (msg) => { console.error('FAIL', msg); try { ws.close(); } catch (e) {} process.exit(1); };

  // 1. Ensure the D2 probe project is the loaded project (reuse when possible).
  const ensure = await evaluate(`(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const cur = document.querySelector('.project-name')?.textContent.trim() || null;
    if (cur === '${TEST_PROJ}') return { mode: 'already-loaded', project: cur };
    let modal = document.querySelector('.project-modal-content');
    if (!modal) { document.getElementById('btn-open-project')?.click(); await sleep(500); }
    if (document.querySelector('.project-transition-confirm')) {
      [...document.querySelectorAll('.project-transition-confirm button')]
        .find(b => b.textContent.trim() === '取消')?.click();
      await sleep(300);
    }
    modal = document.querySelector('.project-modal-content');
    const rows = modal ? [...modal.querySelectorAll('.project-item')] : [];
    const row = rows.find(el => el.querySelector('.project-item-name')?.textContent.trim() === '${TEST_PROJ}');
    if (!row) return { mode: 'not-found', cur, rows: rows.map(r=>r.querySelector('.project-item-name')?.textContent.trim()) };
    const loadBtn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '加载');
    if (!loadBtn) return { error: 'load button missing' };
    loadBtn.click();
    await sleep(600);
    const tc = document.querySelector('.project-transition-confirm');
    if (tc) { [...tc.querySelectorAll('button')].find(b=>b.textContent.trim()==='保存并继续')?.click(); await sleep(1200); }
    document.getElementById('btn-open-project')?.click();
    await sleep(400);
    return { mode: 'loaded-from-list', project: document.querySelector('.project-name')?.textContent.trim() };
  })()`);
  step('ensure_project', ensure);
  if (ensure.error) fail('ensure_project: ' + ensure.error);

  if (ensure.mode === 'not-found') {
    const create = await evaluate(`(async()=>{
      const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
      const openModal = () => document.getElementById('btn-open-project')?.click();
      if (!document.querySelector('.project-modal-content')) { openModal(); await sleep(500); }
      if (document.querySelector('.project-transition-confirm')) {
        [...document.querySelectorAll('.project-transition-confirm button')]
          .find(b => b.textContent.trim() === '取消')?.click();
        await sleep(300);
      }
      const form = document.querySelector('.project-modal-content .new-project-form');
      if (!form) {
        const newBtn = document.querySelector('.project-modal-content .new-project-btn');
        if (!newBtn) return { error: 'new-project-btn not found' };
        newBtn.click();
        await sleep(400);
      }
      const nameInput = document.querySelector('.project-modal-content input.form-input');
      const outlineTa = document.querySelector('.project-modal-content textarea.form-textarea');
      if (!nameInput || !outlineTa) return { error: 'form fields not found' };
      nameInput.value = '${TEST_PROJ}';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      outlineTa.value = '# 第一卷 星火之乱\\n## 第一章 陌生来客\\n暴雨之夜，林澈在废弃观测站遇到一个自称来自未来的女人。\\n## 第二章 追踪\\n两人沿着旧铁轨向北，身后出现了第二伙追踪者。';
      outlineTa.dispatchEvent(new Event('input', { bubbles: true }));
      const createBtn = [...document.querySelectorAll('.project-modal-content button')].find(b => b.textContent.trim() === '创建');
      if (!createBtn) return { error: 'create button not found' };
      createBtn.click();
      await sleep(400);
      const confirmBox = document.querySelector('.project-transition-confirm');
      if (confirmBox) {
        [...confirmBox.querySelectorAll('button')].find(b => b.textContent.trim() === '保存并继续')?.click();
      }
      await sleep(1200);
      return { created: true };
    })()`);
    step('create_project', create);
    if (create.error) fail('create_project: ' + create.error);
  }

  // 2. Lock the outline through the real workspace button (skip when already locked).
  const lock = await evaluate(`(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const nav = document.getElementById('btn-outline-workspace');
    if (!nav) return { error: 'outline nav button missing' };
    nav.click();
    await sleep(800);
    if (document.getElementById('btn-unlock-outline')) {
      document.getElementById('btn-close-outline-workspace')?.click();
      await sleep(400);
      return { alreadyLocked: true };
    }
    const lockBtn = document.getElementById('btn-lock-outline');
    if (!lockBtn) return { error: 'lock button missing' };
    if (lockBtn.disabled) return { error: 'lock button disabled (no outline?)' };
    lockBtn.click();
    await sleep(1000);
    const after = document.getElementById('btn-lock-outline')?.textContent.trim();
    const unlockVisible = !!document.getElementById('btn-unlock-outline');
    document.getElementById('btn-close-outline-workspace')?.click();
    await sleep(500);
    return { lockBtnText: after, unlockVisible, alreadyLocked: false };
  })()`);
  step('lock_outline', lock);
  if (lock.error) fail('lock_outline: ' + lock.error);

  // 3. Open the pipeline panel only when it is not already open.
  const openPl = await evaluate(`(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    if (document.getElementById('pl-steps')) return { alreadyOpen: true };
    const btn = document.getElementById('btn-pipeline');
    if (!btn) return { error: 'btn-pipeline missing' };
    btn.click();
    await sleep(900);
    return { opened: !!document.getElementById('pl-steps') };
  })()`);
  step('open_pipeline', openPl);
  if (openPl.error || !openPl.alreadyOpen && !openPl.opened) fail('open_pipeline: ' + (openPl.error || 'panel still closed'));

  // 4. Configure the settings layer: chain mode + L2-S1 + per-skill agent binding.
  const configure = await evaluate(`(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const stepTabs = [...document.querySelectorAll('#pl-steps .pl-step')];
    if (stepTabs.length < 2) return { error: 'step tabs missing', tabs: stepTabs.length };
    stepTabs[1].click();
    await sleep(400);
    const mode = document.getElementById('pl-s2-mode');
    if (!mode) return { error: 'mode select missing' };
    mode.value = 'chain';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(300);
    const skillSel = document.getElementById('pl-s2-skill');
    if (!skillSel) return { error: 'skill select missing' };
    const skillOption = [...skillSel.options].find(o => o.value === '${SKILL_ID}');
    if (!skillOption) return { error: '${SKILL_ID} option missing', opts: [...skillSel.options].map(o=>o.value).slice(0,20) };
    skillSel.value = '${SKILL_ID}';
    skillSel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(400);
    const chipAgent = document.querySelector('#pl-s2-skills-list .pl-chip-agent');
    if (!chipAgent) return { error: 'chip agent select missing', listText: document.getElementById('pl-s2-skills-list')?.textContent.trim().slice(0,150) };
    const agentOption = [...chipAgent.options].find(o => o.value === '${AGENT_ID}');
    if (!agentOption) return { error: 'agent option missing', opts: [...chipAgent.options].map(o=>o.value).slice(0,20) };
    chipAgent.value = '${AGENT_ID}';
    chipAgent.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(400);
    skillSel.value = '${SECOND_SKILL_ID}';
    skillSel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(400);
    const chipText = document.getElementById('pl-s2-skills-list')?.textContent.trim().slice(0,150);
    const genBtn = document.getElementById('btn-pl-gen-settings');
    return { mode: mode.value, skills: [...document.querySelectorAll('#pl-s2-skills-list .pl-skill-chip')].length, chipText, genDisabled: genBtn ? genBtn.disabled : null };
  })()`);
  step('configure_chain', configure);
  if (configure.error) fail('configure_chain: ' + configure.error);

  // 5. Trigger one real chain generation and wait for completion.
  const genStart = await evaluate(`(()=>{
    const btn = document.getElementById('btn-pl-gen-settings');
    if (!btn) return { error: 'gen button missing' };
    if (btn.disabled) return { error: 'gen button disabled' };
    btn.click();
    return { clicked: true, text: btn.textContent.trim() };
  })()`);
  step('generate_start', genStart);
  if (genStart.error) fail('generate_start: ' + genStart.error);

  let genState = { text: 'unknown', waitedMs: 0 };
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    await sleep(2500);
    const s = await evaluate(`({
      text: document.getElementById('btn-pl-gen-settings')?.textContent.trim() || null,
      status: document.querySelector('.pl-generation-status')?.textContent.trim() || null
    })`);
    genState = { ...s, waitedMs: Date.now() - t0 };
    if (s.text && !s.text.includes('AI生成中')) break;
  }
  step('generate_end', genState);
  if (genState.text && genState.text.includes('AI生成中')) fail('generation timed out after 300s');

  const settingsSurface = await evaluate(`({
    panelText: document.getElementById('pl-step-2-content')?.innerText.replace(/\\n+/g,' | ').slice(0, 300) || null
  })`);
  step('settings_surface', settingsSurface);

  // 6. Read the diagnostic log through the settings modal.
  const logRead = await evaluate(`(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    document.getElementById('btn-settings')?.click();
    await sleep(700);
    const tab = document.getElementById('tab-diag');
    if (!tab) return { error: 'diag tab missing', tabs: [...document.querySelectorAll('.settings-tab')].map(t=>t.id) };
    tab.click();
    await sleep(800);
    const entries = [...document.querySelectorAll('#diag-log-list .diag-log-item')].map(el => ({
      text: el.textContent.trim().replace(/\\s+/g,' ').slice(0, 220),
      skill: el.querySelector('.diag-log-skill')?.textContent.trim() || null,
      agent: el.querySelector('.diag-log-agent')?.textContent.trim() || null,
      purpose: el.querySelector('.diag-log-purpose')?.textContent.trim() || null,
      provider: el.querySelector('.diag-log-provider')?.textContent.trim() || null
    }));
    return {
      version: document.querySelector('.diag-version')?.textContent.trim() || null,
      total: entries.length,
      hit: entries.find(e => e.skill === '${SKILL_ID}' && e.agent === '${AGENT_ID}') || null,
      recent: entries.slice(0, 12).reverse()
    };
  })()`);
  step('diag_log', logRead);
  if (logRead.error) fail('diag_log: ' + logRead.error);

  // Close settings modal.
  await evaluate(`(async()=>{
    document.getElementById('btn-settings')?.click();
    await new Promise(r=>setTimeout(r,400));
  })()`);

  // 7. D4: open the real help guide through the Vue component instance.
  const help = await evaluate(`(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const appEl = document.getElementById('app');
    const rootVnode = (appEl && appEl._vnode) || (appEl && appEl.__vue_app__ && appEl.__vue_app__._instance && appEl.__vue_app__._instance.subTree);
    if (!rootVnode) return { error: 'vue root vnode missing' };
    const seen = new Set();
    let helpComp = null;
    function walk(vnode) {
      if (!vnode || typeof vnode !== 'object' || helpComp) return;
      if (seen.has(vnode)) return;
      seen.add(vnode);
      if (vnode.component) {
        const exposed = vnode.component.exposed;
        if (exposed && typeof exposed.open === 'function' && exposed.activeSection) { helpComp = vnode.component; return; }
        if (vnode.component.subTree) walk(vnode.component.subTree);
      }
      const ch = vnode.children;
      if (Array.isArray(ch)) ch.forEach(walk);
      else if (ch && typeof ch === 'object') {
        if (typeof ch.default === 'function') walk(ch.default());
        else walk(ch);
      }
      if (vnode.suspense && vnode.suspense.activeBranch) walk(vnode.suspense.activeBranch);
    }
    walk(rootVnode);
    if (!helpComp) return { error: 'help component not found' };
    helpComp.exposed.open();
    await sleep(500);
    const navBtns = [...document.querySelectorAll('.help-nav button')];
    const titles = navBtns.map(b => b.textContent.trim());
    const checks = [];
    for (const title of ['AI 命名', '插件市场', '外观设置']) {
      const b = navBtns.find(x => x.textContent.trim() === title);
      if (!b) { checks.push({ title, ok: false, reason: 'button missing' }); continue; }
      b.click();
      await sleep(250);
      const h3 = document.querySelector('.help-content h3')?.textContent.trim() || null;
      const snippet = document.querySelector('.help-content')?.innerText.replace(/\\n+/g,' | ').slice(0, 120) || null;
      checks.push({ title, ok: h3 === title, h3, snippet });
    }
    document.querySelector('.help-close')?.click();
    await sleep(300);
    return { navCount: navBtns.length, titles, checks, closed: !document.querySelector('.help-overlay') };
  })()`);
  step('help_guide', help);

  // 8. Cleanup: load the restore project via the real modal; the transition dialog
  //    removes the D2 probe project from the app itself.
  const cleanup = await evaluate(`(async()=>{
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    let modal = document.querySelector('.project-modal-content');
    const modalHidden = modal && modal.closest('.modal-overlay')?.classList.contains('modal-hidden');
    if (!modal || modalHidden) { document.getElementById('btn-open-project')?.click(); await sleep(500); }
    if (document.querySelector('.project-transition-confirm')) {
      [...document.querySelectorAll('.project-transition-confirm button')]
        .find(b => b.textContent.trim() === '取消')?.click();
      await sleep(300);
    }
    modal = document.querySelector('.project-modal-content');
    if (!modal) return { error: 'project modal missing' };
    const rows = [...modal.querySelectorAll('.project-item')];
    const restoreRow = rows.find(el => el.querySelector('.project-item-name')?.textContent.trim() === '${RESTORE_PROJ}');
    if (!restoreRow) return { error: 'restore row missing', rows: rows.map(r=>r.querySelector('.project-item-name')?.textContent.trim()) };
    const loadBtn = [...restoreRow.querySelectorAll('button')].find(b => b.textContent.trim() === '加载');
    if (!loadBtn) return { error: 'load button missing' };
    loadBtn.click();
    await sleep(600);
    const tc = document.querySelector('.project-transition-confirm');
    let action = 'no-confirm';
    if (tc) {
      const delBtn = [...tc.querySelectorAll('button')].find(b => b.textContent.trim() === '删除并继续');
      if (delBtn) { delBtn.click(); action = 'deleted-and-continued'; }
      else { [...tc.querySelectorAll('button')].find(b=>b.textContent.trim()==='保存并继续')?.click(); action = 'saved-and-continued'; }
      await sleep(1500);
    } else {
      await sleep(900);
    }
    document.getElementById('btn-open-project')?.click();
    await sleep(400);
    return { action, currentProject: document.querySelector('.project-name')?.textContent.trim() || null };
  })()`);
  step('cleanup', cleanup);
  if (cleanup.error) fail('cleanup: ' + cleanup.error);

  // Node-side verification: the probe project must be gone from disk.
  const d2Leftovers = [];
  for (const f of fs.readdirSync(dataDir)) {
    if (!f.startsWith('wa_project_') || !f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
      if ((j.projectName || j.name) === TEST_PROJ) d2Leftovers.push(f);
    } catch (e) { /* unreadable file left alone */ }
  }
  const cleanupVerify = { d2Gone: d2Leftovers.length === 0, d2Leftovers, currentProject: cleanup.currentProject };
  step('cleanup_verify', cleanupVerify);

  // 9. Final assertions.
  const diag = steps.find(s => s.name === 'diag_log')?.value || {};
  const helpRes = steps.find(s => s.name === 'help_guide')?.value || {};
  const hit = diag.hit || null;
  const result = {
    expectedVersion: EXPECTED_VERSION,
    d2_log_hit: hit || null,
    d2_pass: !!hit,
    d4_pass: helpRes.navCount === 11 && (helpRes.checks || []).every(c => c.ok),
    d5_pass: diag.version === '应用版本 ' + EXPECTED_VERSION,
    cleanup_pass: cleanupVerify.d2Gone && cleanupVerify.currentProject === RESTORE_PROJ,
    nativeDialogs,
    steps
  };
  console.log(JSON.stringify(result, null, 2));
  ws.close();
  const allPass = result.d2_pass && result.d4_pass && result.d5_pass && result.cleanup_pass;
  process.exit(allPass ? 0 : 2);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
