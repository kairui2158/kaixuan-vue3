const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CDP = 'http://127.0.0.1:9227';
const SS_DIR = path.join(__dirname, '..', 'screenshots');
const REPORT_PATH = path.join(__dirname, '..', 'PHASEB_VERIFY_REPORT.md');
const STORAGE_KEY = 'wa_pipeline_step_config';
const results = [];
const cdpLog = [];
let passed = 0;
let failed = 0;

function log(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log('[' + (ok ? 'PASS' : 'FAIL') + '] ' + step + ': ' + detail);
  if (ok) passed += 1; else failed += 1;
}

function opLog(line) {
  cdpLog.push(line);
  console.log('[CDP] ' + line);
}

async function shot(page, name) {
  const p = path.join(SS_DIR, name);
  await page.screenshot({ path: p, fullPage: false });
  opLog('Page.screenshot -> _audit/screenshots/' + name);
}

async function waitVisible(page, selector, ms) {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout: ms || 5000 });
    return true;
  } catch (e) {
    return false;
  }
}

async function clickStep(page, i) {
  const clicked = await page.evaluate((idx) => {
    const els = document.querySelectorAll('.pl-steps .pl-step');
    if (!els[idx]) return false;
    els[idx].click();
    return true;
  }, i);
  opLog('click .pl-steps .pl-step[' + i + '] (pipelineStore.setStep)');
  await page.waitForTimeout(500);
  return clicked;
}

async function readModeState(page, i) {
  const id = 'pl-s' + (i + 1) + '-mode';
  return page.evaluate((opts) => {
    const sel = opts.sel, key = opts.key;
    const el = document.getElementById(sel);
    const r = el ? el.getBoundingClientRect() : null;
    let storedModes = null;
    if (window.electronAPI && window.electronAPI.storageRead) {
      try {
        const stored = window.electronAPI.storageRead(key);
        storedModes = stored && stored.modes ? JSON.parse(JSON.stringify(stored.modes)) : null;
      } catch (e) {}
    }
    return {
      found: !!el,
      visible: !!(el && (r.width || r.height)),
      value: el ? el.value : null,
      options: el ? Array.from(el.options).map((o) => o.value) : [],
      persistedModes: storedModes,
      currentStep: (() => {
        const app = document.querySelector('#app');
        const pinia = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$pinia;
        const ps = pinia && pinia._s && pinia._s.get('pipeline');
        return ps ? ps.currentStep : null;
      })()
    };
  }, { sel: id, key: STORAGE_KEY });
}

async function setMode(page, i, mode) {
  const id = 'pl-s' + (i + 1) + '-mode';
  await page.selectOption('#' + id, mode);
  await page.waitForTimeout(450);
  opLog('selectOption #' + id + ' -> ' + mode);
}

async function main() {
  if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });
  const browser = await chromium.connectOverCDP(CDP);
  opLog('connectOverCDP http://127.0.0.1:9227');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().startsWith('file:'));
  if (!page) throw new Error('file page not found');
  await page.waitForSelector('#app', { timeout: 15000 });
  await page.waitForTimeout(2000);
  opLog('Page ready: ' + page.url());

  const base = await page.evaluate(() => ({
    title: document.title,
    hasEngine: !!window.SkillExecutionEngine,
    engineMethods: window.SkillExecutionEngine ? Object.keys(window.SkillExecutionEngine) : []
  }));
  log('B1.0 页面+引擎挂载', base.hasEngine && base.engineMethods.includes('splitMerge') && base.engineMethods.includes('multiStep'),
    JSON.stringify(base));
  await shot(page, 'phaseB_r01_initial.png');

  const panelVisible = await page.evaluate(() => {
    const p = document.querySelector('#pipeline-panel, .pipeline-panel');
    if (!p) return false;
    const r = p.getBoundingClientRect();
    return !!(r.width || r.height);
  });
  if (!panelVisible) {
    const btn = await page.$('#btn-pipeline');
    if (btn) {
      await btn.click();
      opLog('click #btn-pipeline');
      await page.waitForTimeout(1200);
    }
  }
  opLog('evaluate panel visible=' + panelVisible);
  await shot(page, 'phaseB_r02_panel_open.png');

  const modes = ['split-merge', 'multi-step'];
  let restoreFailures = 0;
  const layerRecords = [];
  for (let i = 0; i < 5; i += 1) {
    await clickStep(page, i);
    const sel = '#pl-s' + (i + 1) + '-mode';
    const visible = await waitVisible(page, sel, 5000);
    log('B2.' + (i + 1) + '.0 层级' + (i + 1) + ' 模式下拉可见', visible, sel);
    const before = await readModeState(page, i);
    log('B2.' + (i + 1) + '.1 选项包含 split-merge/multi-step',
      before.options.includes('split-merge') && before.options.includes('multi-step'),
      'options=' + before.options.join(' / ') + ' step=' + before.currentStep);
    const rec = { step: i + 1, before: before.value, checks: [] };
    for (const target of modes) {
      await setMode(page, i, target);
      const after = await readModeState(page, i);
      const domOk = after.value === target;
      const persistedOk = !!(after.persistedModes && after.persistedModes[i] === target);
      rec.checks.push({ target, domOk, persistedOk });
      log('B2.' + (i + 1) + '.2 ' + target + ' DOM+持久化', domOk && persistedOk,
        'dom=' + after.value + ' stored=' + JSON.stringify(after.persistedModes));
      await shot(page, 'phaseB_r' + String(i + 1).padStart(2, '0') + '_' + target + '.png');
    }
    await setMode(page, i, before.value);
    const restored = await readModeState(page, i);
    const restoreOk = restored.value === before.value && restored.persistedModes &&
      restored.persistedModes[i] === before.value;
    if (!restoreOk) restoreFailures += 1;
    log('B2.' + (i + 1) + '.3 恢复原模式', restoreOk,
      'dom=' + restored.value + ' stored=' + JSON.stringify(restored.persistedModes));
    layerRecords.push(rec);
  }

  const pinia = await page.evaluate(() => {
    const app = document.querySelector('#app');
    const pinia = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$pinia;
    const pipelineStore = pinia && pinia._s && pinia._s.get('pipeline');
    const providerStore = pinia && pinia._s && pinia._s.get('provider');
    const skillStore = pinia && pinia._s && pinia._s.get('skill');
    return {
      currentStep: pipelineStore ? pipelineStore.currentStep : null,
      providerCount: providerStore && providerStore.providers ? providerStore.providers.length : 0,
      preferredProvider: providerStore ? providerStore.preferredGenerateProvider : null,
      skillCount: skillStore && skillStore.skills ? skillStore.skills.length : 0
    };
  });
  opLog('evaluate Pinia pipeline/provider/skill stores');
  log('B3.1 Pinia 状态读取', !!(pinia.currentStep !== null && pinia.providerCount > 0 && pinia.skillCount > 0),
    JSON.stringify(pinia));

  const liveReady = await page.evaluate(() => {
    const app = document.querySelector('#app');
    const pinia = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$pinia;
    const providerStore = pinia && pinia._s && pinia._s.get('provider');
    const p = providerStore && providerStore.preferredGenerateProvider;
    return !!(providerStore && providerStore.callApi && p && p.selectedModel);
  });
  log('B3.2 真实 API 可用配置', liveReady, 'providerStore.callApi + selectedModel');

  if (liveReady) {
    const live = await page.evaluate(async () => {
      const app = document.querySelector('#app');
      const pinia = app.__vue_app__.config.globalProperties.$pinia;
      const providerStore = pinia._s.get('provider');
      const p = providerStore.preferredGenerateProvider;
      const aiRequest = async (opts) => {
        const sys = opts.messages.find((m) => m.role === 'system').content;
        const usr = opts.messages.find((m) => m.role === 'user').content;
        const text = await providerStore.callApi(p.id, p.selectedModel, [
          { role: 'system', content: sys },
          { role: 'user', content: usr }
        ]);
        return { text };
      };
      const engine = window.SkillExecutionEngine;
      const sample = '夜色漫过旧城的巷口，路灯把影子拉得很长。她停下脚步，听见远处有琴声，像一条湿漉漉的河。她犹豫了一下，还是转身朝琴声走去。';
      const skills = [
        { name: '风格化', template: '你是资深文学编辑，请用细腻的文学语言改写下面的文本，只输出改写结果。' },
        { name: '合并润色', template: '你是文字润色师，请在上一步基础上润色并保持情节不变，只输出最终结果。' }
      ];
      const result = await engine.splitMerge(sample, skills, {
        aiRequest,
        splitSize: 1000,
        stream: false,
        onProgress: () => {}
      });
      const out = String(result && result.text || '');
      return {
        providerId: p.id,
        model: p.selectedModel,
        outputLength: out.length,
        outputHead: out.slice(0, 120),
        reports: result && result.reports ? result.reports.length : 0
      };
    });
    opLog('evaluate engine.splitMerge(live aiRequest provider=' + live.providerId + ' model=' + live.model + ')');
    log('B3.3 真实 API split-merge 执行', live.outputLength > 0,
      'outputLen=' + live.outputLength + ' head=' + live.outputHead.replace(/\n/g, ' ') + ' reports=' + live.reports);
    await shot(page, 'phaseB_r_live_splitmerge_result.png');

    const liveMulti = await page.evaluate(async () => {
      const app = document.querySelector('#app');
      const pinia = app.__vue_app__.config.globalProperties.$pinia;
      const providerStore = pinia._s.get('provider');
      const p = providerStore.preferredGenerateProvider;
      let calls = 0;
      const aiRequest = async (opts) => {
        calls += 1;
        const sys = opts.messages.find((m) => m.role === 'system').content;
        const usr = opts.messages.find((m) => m.role === 'user').content;
        const text = await providerStore.callApi(p.id, p.selectedModel, [
          { role: 'system', content: sys },
          { role: 'user', content: usr }
        ]);
        return { text };
      };
      const engine = window.SkillExecutionEngine;
      const sample = '清晨的码头没有人，只有海风把渔网吹得啪啪响。老人蹲在船舷边补网，忽然听见水下有声音，像有人在敲船底。他放下梭子，趴到船沿上看，水面下一道黑影正缓缓游过。';
      const skills = [
        { name: 'S1事件核心', template: '你是情节分析师，提取事件核心并整理成要点，只输出结果。' },
        { name: 'S2视角', template: '你是叙事顾问，为上一步结果选定视角并补足情绪层次，只输出结果。' },
        { name: 'S3成文', template: '你是小说家，基于前两步输出一段完整正文，只输出结果。' }
      ];
      const result = await engine.multiStep(sample, skills, {
        aiRequest,
        splitSize: 1500,
        stream: false,
        onProgress: () => {}
      });
      const out = String(result && result.text || '');
      return {
        calls,
        outputLength: out.length,
        outputHead: out.slice(0, 120),
        reports: result && result.reports ? result.reports.length : 0
      };
    });
    opLog('evaluate engine.multiStep(live aiRequest, calls=' + liveMulti.calls + ')');
    log('B3.4 真实 API multi-step 执行', liveMulti.outputLength > 0 && liveMulti.calls >= 3,
      'calls=' + liveMulti.calls + ' outputLen=' + liveMulti.outputLength + ' head=' + liveMulti.outputHead.replace(/\n/g, ' ') + ' reports=' + liveMulti.reports);
    await shot(page, 'phaseB_r_live_multistep_result.png');
  }

  const mock = await page.evaluate(async () => {
    const engine = window.SkillExecutionEngine;
    let splitCalls = 0;
    const longInput = '这是用于分块测试的段落内容。'.repeat(220);
    const splitRes = await engine.splitMerge(longInput, [
      { name: '处理', template: '处理约束' },
      { name: '合并', template: '合并约束' }
    ], {
      splitSize: 1000,
      stream: false,
      aiRequest: async () => { splitCalls += 1; return { text: '[OUT:' + splitCalls + ']' }; }
    });
    let multiCalls = 0;
    const multiRes = await engine.multiStep(longInput, [
      { name: 'S1', template: 'x' },
      { name: 'S2', template: 'x' },
      { name: 'S3', template: 'x' }
    ], {
      splitSize: 1500,
      stream: false,
      aiRequest: async () => { multiCalls += 1; return { text: '[M:' + multiCalls + ']' }; }
    });
    return {
      splitCalls,
      splitOutLen: (splitRes.text || '').length,
      multiCalls,
      multiOutLen: (multiRes.text || '').length,
      multiReports: (multiRes.reports || []).length
    };
  });
  opLog('evaluate engine.splitMerge/multiStep with mock aiRequest');
  log('B3.5 引擎 mock 分块编排', mock.splitCalls >= 3 && mock.multiCalls >= 3,
    'splitCalls=' + mock.splitCalls + ' multiCalls=' + mock.multiCalls + ' multiReports=' + mock.multiReports);

  await shot(page, 'phaseB_r_final_restored.png');
  log('B4.0 验证后状态恢复', restoreFailures === 0, 'restoreFailures=' + restoreFailures);

  await browser.close();
  opLog('Browser.close');

  const lines = [];
  lines.push('# Phase B 验证报告（真实行为 / CDP）');
  lines.push('');
  lines.push('## 结论');
  lines.push('');
  lines.push(failed > 0
    ? '**验证未通过：' + failed + ' 项失败，需修复后重验**'
    : '**全部 ' + passed + ' 项通过，Phase B 分层执行模式接入与引擎统一消费验证完成**');
  lines.push('');
  lines.push('## 验证摘要');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('|------|-----|');
  lines.push('| 通过 | ' + passed + ' |');
  lines.push('| 失败 | ' + failed + ' |');
  lines.push('| 运行应用 | file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html |');
  lines.push('| 验证方式 | CDP 连接源 Electron，真实点击 5 层、逐层切换模式、读写持久化与 Pinia |');
  lines.push('');
  lines.push('## 逐项结果');
  lines.push('');
  lines.push('| 步骤 | 结果 | 详情 |');
  lines.push('|------|------|------|');
  for (const r of results) {
    lines.push('| ' + r.step + ' | ' + (r.ok ? 'PASS' : 'FAIL') + ' | ' + String(r.detail).replace(/\|/g, '\\|') + ' |');
  }
  lines.push('');
  lines.push('## 层记录');
  lines.push('');
  lines.push('| 层 | 原模式 | 测试点 | 结果 |');
  lines.push('|----|--------|--------|------|');
  for (const rec of layerRecords) {
    for (const c of rec.checks) {
      lines.push('| ' + rec.step + ' | ' + rec.before + ' | ' + c.target + ' | ' + (c.domOk && c.persistedOk ? 'PASS' : 'FAIL') + ' |');
    }
  }
  lines.push('');
  lines.push('## CDP 操作日志');
  lines.push('');
  for (let i = 0; i < cdpLog.length; i += 1) {
    lines.push(String(i + 1) + '. `' + cdpLog[i] + '`');
  }
  lines.push('');
  lines.push('## 截图');
  lines.push('');
  const shots = fs.readdirSync(SS_DIR).filter((n) => n.startsWith('phaseB_') && n.endsWith('.png')).sort();
  for (const n of shots) {
    lines.push('- _audit/screenshots/' + n);
  }
  lines.push('');
  lines.push('## 代码证据');
  lines.push('');
  lines.push('- `src/components/pipeline/PipelinePanel.vue` 5 层模式下拉：`#pl-s1-mode` ~ `#pl-s5-mode`，含 `compose/chain/split-merge/multi-step`');
  lines.push('- `runStepSkills` 对 split-merge/multi-step 调用 `window.SkillExecutionEngine`（同文件约 773-802 行）');
  lines.push('- `getStepSkillTemplates` 返回该层全部 Skill 模板并 join；compose 模式一次性注入全部模板');
  lines.push('- `src/components/chat/ChatPanel.vue` 按 `skill.executionMode` 消费 `engine.splitMerge / multiStep / chain`（约 338-375 行）');
  lines.push('- `dist-renderer/skill-engine.js` 导出 `chain/splitMerge/multiStep` 并暴露 `window.SkillExecutionEngine`');
  lines.push('- 模式持久化键：`wa_pipeline_step_config.modes`，由 `saveStepConfig()` 写入');
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf-8');
  console.log('\n[REPORT] ' + REPORT_PATH);
  console.log('[RESULT] passed=' + passed + ' failed=' + failed);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
