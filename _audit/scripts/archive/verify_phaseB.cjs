const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CDP = 'http://127.0.0.1:9227';
const SS_DIR = path.join(__dirname, '..', 'screenshots');
const REPORT_PATH = path.join(__dirname, '..', 'PHASEB_VERIFY_REPORT.md');
const results = [];
let passed = 0;
let failed = 0;

function log(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log((ok ? '[PASS] ' : '[FAIL] ') + step + ': ' + detail);
  if (ok) passed += 1; else failed += 1;
}

async function shot(page, name) {
  const p = path.join(SS_DIR, name);
  await page.screenshot({ path: p, fullPage: true });
  console.log('[SS] ' + name);
  return name;
}

async function main() {
  if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const pages = ctx.pages().filter((p) => p.url().startsWith('file:'));
  const page = pages[0] || ctx.pages()[0];
  await page.waitForSelector('#app', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);

  await shot(page, 'phaseB_01_initial.png');

  // Open pipeline panel through sidebar button
  const openBtn = await page.$('#btn-pipeline, #nav-pipeline, button[title="生成流水线"], button:has-text("生成流水线")');
  log('B1.1 pipeline open button exists', !!openBtn, openBtn ? 'found' : 'NOT FOUND');
  if (openBtn) {
    await openBtn.click();
    await page.waitForTimeout(1200);
    await shot(page, 'phaseB_02_pipeline_open.png');
  }

  const modeIds = ['#pl-s1-mode', '#pl-s2-mode', '#pl-s3-mode', '#pl-s4-mode', '#pl-s5-mode'];
  const modes = [];
  for (let i = 0; i < modeIds.length; i += 1) {
    const sel = modeIds[i];
    const select = await page.$(sel);
    if (!select) {
      log('B1.2 ' + sel + ' exists', false, 'NOT FOUND');
      continue;
    }
    const opts = await select.$$eval('option', (els) => els.map((e) => e.value));
    const hasSplit = opts.includes('split-merge');
    const hasMulti = opts.includes('multi-step');
    log('B1.2 ' + sel + ' options', hasSplit && hasMulti, opts.join(' / '));
    modes.push({ sel, opts, value: await select.inputValue() });
  }

  // Switch each select to split-merge and multi-step, then read Pinia pipeline state
  const switchResults = [];
  for (const m of modes) {
    for (const target of ['split-merge', 'multi-step']) {
      await page.selectOption(m.sel, target);
      await page.waitForTimeout(350);
      const val = await page.$eval(m.sel, (el) => el.value);
      switchResults.push({ sel: m.sel, target, val });
    }
  }
  const modeLoss = switchResults.filter((r) => r.val !== r.target).length;
  log('B1.3 mode switching 10/10', modeLoss === 0,
    modeLoss === 0 ? switchResults.map((r) => r.sel + '=' + r.val).join(' ') : 'failure count=' + modeLoss);
  await shot(page, 'phaseB_03_modes_switched.png');

  const pinia = await page.evaluate(() => {
    const app = document.querySelector('#app');
    const pinia = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$pinia;
    const pipelineStore = pinia && pinia._s && pinia._s.get('pipeline');
    const skillStore = pinia && pinia._s && pinia._s.get('skill');
    const stepKeys = pipelineStore ? Object.keys(pipelineStore).filter((k) => /mode|skill/i.test(k)).slice(0, 12) : [];
    return {
      hasPinia: !!pinia,
      hasPipelineStore: !!pipelineStore,
      hasSkillStore: !!skillStore,
      stepKeys,
      stepSkillModes: pipelineStore && pipelineStore.stepSkillModes ? JSON.parse(JSON.stringify(pipelineStore.stepSkillModes)) : null,
      modeSample: pipelineStore && pipelineStore.modes ? JSON.parse(JSON.stringify(pipelineStore.modes)) : null
    };
  });
  log('B1.4 Pinia pipeline store + modes', !!(pinia.hasPipelineStore && (pinia.stepSkillModes || pinia.modeSample)),
    JSON.stringify({ stepKeys: pinia.stepKeys, stepSkillModes: pinia.stepSkillModes, modeSample: pinia.modeSample }));

  const engine = await page.evaluate(() => {
    const w = window;
    const e = w.SkillExecutionEngine;
    return {
      hasEngine: !!e,
      methods: e ? Object.keys(e) : []
    };
  });
  log('B1.5 window.SkillExecutionEngine', engine.hasEngine && engine.methods.includes('splitMerge') && engine.methods.includes('multiStep'),
    engine.hasEngine ? 'methods: ' + engine.methods.join(', ') : 'NOT FOUND');

  const api = await page.evaluate(() => {
    const app = document.querySelector('#app');
    const pinia = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$pinia;
    const provider = pinia && pinia._s && pinia._s.get('provider');
    return {
      hasProvider: !!provider,
      callApiFn: !!(provider && provider.callApi),
      preferred: provider && provider.preferredGenerateProvider ? provider.preferredGenerateProvider : null
    };
  });
  log('B1.6 provider callApi available', !!(api.hasProvider && api.callApiFn),
    JSON.stringify({ hasProvider: api.hasProvider, callApiFn: api.callApiFn, preferred: api.preferred }));

  // Deep UI check: all mode selects are inside the step panels, not hidden
  const visibility = await page.evaluate((ids) => {
    const out = {};
    for (const id of ids) {
      const el = document.querySelector(id);
      out[id] = el ? { visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) } : { visible: false, missing: true };
    }
    return out;
  }, modeIds);
  const allVisible = Object.values(visibility).every((v) => v.visible && !v.missing);
  log('B1.7 all 5 mode selects visible', allVisible, JSON.stringify(visibility));

  await browser.close();

  const lines = [
    '# Phase B 验证报告',
    '',
    '## 结论',
    '',
    failed > 0 ? '**验证未通过：' + failed + ' 项失败，需修复后重验**' : '**全部 ' + passed + ' 项通过，Phase B 执行模式接入验证完成**',
    '',
    '## 验证摘要',
    '',
    '| 指标 | 值 |',
    '|------|-----|',
    '| 通过 | ' + passed + ' |',
    '| 失败 | ' + failed + ' |',
    '',
    '## 逐项结果',
    '',
    '| 步骤 | 结果 | 详情 |',
    '|------|------|------|'
  ];
  for (const r of results) {
    lines.push('| ' + r.step + ' | ' + (r.ok ? 'PASS' : 'FAIL') + ' | ' + String(r.detail).replace(/\|/g, '\\|') + ' |');
  }
  lines.push('', '## CDP 操作日志', '', '- connectOverCDP http://127.0.0.1:9227');
  lines.push('- 打开生成流水线面板（点击侧栏生成流水线按钮）');
  for (const m of modes) {
    lines.push('- 读取 ' + m.sel + ' option 列表：' + m.opts.join(' / '));
  }
  for (const r of switchResults) {
    lines.push('- selectOption ' + r.sel + ' -> ' + r.target + '，实测值=' + r.val);
  }
  lines.push('- evaluate Pinia pipeline store / window.SkillExecutionEngine / provider store');
  lines.push('', '## 截图', '');
  for (const n of ['phaseB_01_initial.png', 'phaseB_02_pipeline_open.png', 'phaseB_03_modes_switched.png']) {
    lines.push('- _audit/screenshots/' + n);
  }
  lines.push('');
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf-8');
  console.log('\nReport: ' + REPORT_PATH);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
