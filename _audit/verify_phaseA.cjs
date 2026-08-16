const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CDP = 'http://127.0.0.1:9227';
const SS_DIR = path.join(__dirname, 'screenshots');
const REPORT_PATH = path.join(__dirname, 'PHASEA_VERIFY_REPORT.md');
const results = [];
let passed = 0, failed = 0, screenshots = [];

function log(step, ok, detail) {
  const s = ok ? '[PASS]' : '[FAIL]';
  results.push({ step, ok, detail });
  console.log(s + ' ' + step + ': ' + detail);
  if (ok) passed++; else failed++;
}

async function screenshot(page, name) {
  const p = path.join(SS_DIR, name);
  await page.screenshot({ path: p, fullPage: true });
  screenshots.push(name);
  console.log('  [SS] ' + name);
}

async function main() {
  if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];

  await page.waitForSelector('#app', { timeout: 10000 }).catch(function(){});
  await page.waitForTimeout(2000);

  // 1. Check settings button
  const sidebarSettings = await page.$('#btn-settings');
  log('1.1 btn-settings exists', !!sidebarSettings, sidebarSettings ? 'found' : 'NOT FOUND');
  await screenshot(page, '01_initial.png');

  // 2. Open settings
  if (sidebarSettings) {
    await sidebarSettings.click();
    await page.waitForTimeout(1500);
    await screenshot(page, '02_settings_open.png');
  }

  // 3. Click skill tab
  const skillTab = await page.$('#tab-skill');
  log('1.2 tab-skill exists', !!skillTab, skillTab ? 'found' : 'NOT FOUND');
  if (skillTab) {
    await skillTab.click();
    await page.waitForTimeout(1000);
    await screenshot(page, '03_skill_tab.png');
  }

  // 4. Toolbar buttons
  const btnImport = await page.$('#btn-import-skills');
  const btnExportAll = await page.$('#btn-export-all-skills');
  log('1.3 btn-import-skills exists', !!btnImport, btnImport ? 'found' : 'NOT FOUND');
  log('1.4 btn-export-all-skills exists', !!btnExportAll, btnExportAll ? 'found' : 'NOT FOUND');

  // 5. Test buttons on skill cards
  const testButtons = await page.$$('button:has-text("\u6d4b\u8bd5")');
  log('1.5 skill card test buttons', testButtons.length > 0, 'found ' + testButtons.length + ' buttons');

  // 6. Click first test button
  if (testButtons.length > 0) {
    await testButtons[0].click();
    await page.waitForTimeout(1000);
    await screenshot(page, '04_test_modal.png');

    const testModal = await page.$('#skill-test-modal');
    const testInput = await page.$('#st-test-input');
    const runBtn = await page.$('#btn-run-skill-test');
    log('1.6 skill-test-modal exists', !!testModal, testModal ? 'found' : 'NOT FOUND');
    log('1.7 st-test-input exists', !!testInput, testInput ? 'found' : 'NOT FOUND');
    log('1.8 btn-run-skill-test exists', !!runBtn, runBtn ? 'found' : 'NOT FOUND');

    // Close modal
    const closeBtn = await page.$('#skill-test-modal button:has-text("\u5173\u95ed")');
    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // 7. Pinia store verification
  const piniaResult = await page.evaluate(function() {
    var app = document.querySelector('#app');
    var pinia = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$pinia;
    if (!pinia) return { available: false, error: 'Pinia not found' };
    var skillStore = pinia._s.get('skill');
    if (!skillStore) return { available: false, error: 'skill store not found' };

    var storeObj = {};
    var keys = Object.keys(skillStore);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = skillStore[k];
      if (typeof v === 'function') {
        storeObj[k] = 'function';
      } else if (typeof v === 'object' && v !== null) {
        try { storeObj[k] = 'array[' + v.length + ']'; } catch(e) { storeObj[k] = 'object'; }
      } else {
        storeObj[k] = v;
      }
    }
    return { available: true, storeKeys: storeObj };
  });
  log('1.9 Pinia skill store accessible', !!piniaResult.available,
    piniaResult.available ? 'keys: ' + Object.keys(piniaResult.storeKeys).join(', ') : piniaResult.error);

  // 8. Verify export methods
  if (piniaResult.available) {
    var exportResult = await page.evaluate(function() {
      var app = document.querySelector('#app');
      var pinia = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$pinia;
      var store = pinia._s.get('skill');
      var skills = store.skills || [];
      if (skills.length === 0) return { hasSkills: false, msg: 'No skills' };

      var firstId = skills[0].id;
      var md = '';
      try { md = store.exportSkillToMD(firstId); } catch(e) { return { hasSkills: true, mdError: e.message }; }
      var json = '';
      try { json = store.exportAllToJSON(); } catch(e) { return { hasSkills: true, mdOk: true, jsonError: e.message }; }
      return {
        hasSkills: true,
        mdLength: md.length,
        mdStartsWith: md.substring(0, 60),
        jsonLength: json.length
      };
    });
    log('1.10 exportSkillToMD works', exportResult.hasSkills && exportResult.mdLength > 0,
      exportResult.hasSkills ? 'MD length=' + exportResult.mdLength : 'no skills');
    log('1.11 exportAllToJSON works', exportResult.hasSkills && exportResult.jsonLength > 0,
      exportResult.hasSkills ? 'JSON length=' + exportResult.jsonLength : 'no skills');
  }

  await browser.close();

  // Generate report
  var reportLines = [
    '# Phase A 验证报告',
    '',
    '## 验证结果摘要',
    '',
    '| 项 | 值 |',
    '|---|-----|',
    '| 通过 | ' + passed + ' |',
    '| 失败 | ' + failed + ' |',
    '| 截图 | ' + screenshots.length + ' 张 |',
    '',
    '## 逐项验证结果',
    '',
    '| 步骤 | 结果 | 详情 |',
    '|------|------|------|'
  ];
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    reportLines.push('| ' + r.step + ' | ' + (r.ok ? 'PASS' : 'FAIL') + ' | ' + r.detail + ' |');
  }
  reportLines.push('');
  reportLines.push('## 截图清单');
  reportLines.push('');
  for (var i = 0; i < screenshots.length; i++) {
    reportLines.push('- _audit/screenshots/' + screenshots[i]);
  }
  reportLines.push('');
  reportLines.push('## 结论');
  reportLines.push('');
  if (failed > 0) {
    reportLines.push('**验证未通过：' + failed + ' 项失败，需修复后重新验证**');
  } else {
    reportLines.push('**全部 ' + passed + ' 项通过，Phase A 验证完成**');
  }
  reportLines.push('');

  fs.writeFileSync(REPORT_PATH, reportLines.join('\n'), 'utf-8');
  console.log('\nReport: ' + REPORT_PATH);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function(e) { console.error(e); process.exit(1); });
