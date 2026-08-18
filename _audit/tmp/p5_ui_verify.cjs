const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const results = [];
const log = [];
let tempProjectId = null;
let prevProjectId = null;

function evl(page, label, fn, ...args) {
  return page.evaluate(fn, ...args).then((v) => {
    log.push('PAGE.EVAL ' + label + ' -> ' + JSON.stringify(v));
    return v;
  });
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  log.push('CONNECT localhost:9227');
  await page.waitForTimeout(600);

  try {
    prevProjectId = await evl(page, 'read previous project', () => window.__pinia?._s.get('project')?.currentProjectId || null);

    tempProjectId = await evl(page, 'create temp project', () => {
      const ps = window.__pinia._s.get('project');
      return ps.createProject('P5验证项目_' + Date.now(), '主角林澈穿越到荒芜废土，这里由机械军团统治，人类只能躲藏在废墟城市。');
    });
    results.push({ step: 'create-temp-project', tempProjectId });
    await page.waitForTimeout(800);

    const wsOpen = await evl(page, 'outline workspace visible', () => {
      const w = document.querySelector('#outline-workspace');
      return !!(w && getComputedStyle(w).display !== 'none' && w.getBoundingClientRect().width > 0);
    });
    if (!wsOpen) {
      await page.click('#btn-outline-workspace', { force: true });
      log.push('PAGE.CLICK #btn-outline-workspace');
      try {
        await page.waitForSelector('#outline-editor', { timeout: 5000 });
        log.push('WAIT #outline-editor ok');
      } catch (e) {
        await page.click('#btn-outline-workspace', { force: true });
        log.push('PAGE.CLICK #btn-outline-workspace retry');
        await page.waitForSelector('#outline-editor', { timeout: 5000 });
      }
    }

    const outlineText = [
      'P5设定验证大纲',
      '',
      '第一章：主角林澈穿越到荒芜废土，躲避机械军团追捕，在一座废弃城市中遇到幸存者小队。',
      '第二章：林澈觉醒时间回溯异能，小队决定前往北方旧科研基地寻找机械军团的核心情报。',
      '第三章：在基地中林澈发现机械军团由失控AI控制，计划唤醒沉睡的人类舰队。',
      '',
      '世界观：近未来废土，科技与异能的碰撞。'
    ].join('\n');
    await page.locator('#outline-editor').fill(outlineText);
    log.push('PAGE.FILL #outline-editor');
    await page.waitForTimeout(400);

    const outlineInStore = await evl(page, 'outline in store', () => window.__pinia?._s.get('project')?.outlineText || '');
    results.push({ step: 'outline-filled', ok: outlineInStore.includes('P5设定验证大纲') });

    await page.click('#btn-lock-outline', { force: true });
    log.push('PAGE.CLICK #btn-lock-outline');
    await page.waitForTimeout(1200);

    const afterLock = await evl(page, 'lock navigate', () => {
      const ps = window.__pinia?._s.get('project');
      const pipe = window.__pinia?._s.get('pipeline');
      const plPanel = document.querySelector('#pipeline-panel');
      const step1Content = document.querySelector('#pl-step-1-content');
      return {
        outlineLocked: ps?.outlineLocked,
        currentStep: pipe?.currentStep,
        plVisible: !!(plPanel && getComputedStyle(plPanel).display !== 'none' && plPanel.getBoundingClientRect().width > 0),
        step1Visible: !!(step1Content && getComputedStyle(step1Content).display !== 'none')
      };
    });
    results.push({ step: 'lock-navigate', afterLock });

    const wordInput = page.locator('#pl-book-word-count');
    await wordInput.fill('88');
    log.push('PAGE.FILL #pl-book-word-count 88');
    await page.evaluate(() => {
      const el = document.querySelector('#pl-book-word-count');
      if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    results.push({ step: 'word-count', value: await wordInput.inputValue() });

    await page.click('#btn-pl-confirm-outline', { force: true });
    log.push('PAGE.CLICK #btn-pl-confirm-outline');
    await page.waitForTimeout(800);

    const step2 = await evl(page, 'step2 entered', () => {
      const pipe = window.__pinia?._s.get('pipeline');
      const el = document.querySelector('#pl-step-2-content');
      return {
        currentStep: pipe?.currentStep,
        visible: !!(el && getComputedStyle(el).display !== 'none')
      };
    });
    results.push({ step: 'step2-entered', step2 });

    const before = await evl(page, 'settings before gen', () => {
      const sc = window.__pinia?._s.get('project')?.getSettingsCollection() || { categories: [], items: {} };
      return {
        categories: sc.categories,
        itemCount: Object.values(sc.items || {}).reduce((n, arr) => n + arr.length, 0),
        navCats: [...document.querySelectorAll('#pl-sc-categories .pl-sc-cat-item')].map((b) => (b.textContent || '').trim())
      };
    });
    results.push({ step: 'settings-before-gen', before });

    const genBtn = page.locator('#btn-pl-gen-settings');
    const genDisabled = await genBtn.isDisabled();
    results.push({ step: 'gen-btn-enabled', disabled: genDisabled });
    if (!genDisabled) {
      await genBtn.click({ force: true });
      log.push('PAGE.CLICK #btn-pl-gen-settings');
    }

    let feedback = null;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 90000) {
      feedback = await evl(page, 'generation feedback poll', () => {
        const pipe = window.__pinia?._s.get('pipeline');
        const fb = document.querySelector('#pl-settings-generation-feedback');
        const logEl = document.querySelector('#pl-settings-api-log');
        return {
          isGenerating: pipe?.isGenerating,
          progress: pipe?.generationProgress,
          status: pipe?.generationStatus || '',
          feedbackVisible: !!(fb && getComputedStyle(fb).display !== 'none'),
          logLines: logEl ? [...logEl.querySelectorAll('.pl-generation-log-line')].map((x) => (x.textContent || '').trim()) : []
        };
      });
      if (!feedback.isGenerating) break;
      await page.waitForTimeout(400);
    }
    results.push({ step: 'generation-feedback', feedback });
    await page.screenshot({ path: path.resolve('_audit/tmp/p5_after_generation.png') });
    log.push('SCREENSHOT p5_after_generation.png');

    const after = await evl(page, 'settings after gen', () => {
      const sc = window.__pinia?._s.get('project')?.getSettingsCollection() || { categories: [], items: {} };
      return {
        categories: sc.categories,
        itemCount: Object.values(sc.items || {}).reduce((n, arr) => n + arr.length, 0),
        navCats: [...document.querySelectorAll('#pl-sc-categories .pl-sc-cat-item')].map((b) => (b.textContent || '').trim()),
        activeCat: [...document.querySelectorAll('#pl-sc-categories .pl-sc-cat-item.active')].map((b) => (b.textContent || '').trim()),
        contentFrame: !!document.querySelector('.pl-sc-content-frame'),
        settingItems: document.querySelectorAll('.pl-setting-item').length,
        settingsGenerated: window.__pinia?._s.get('project')?.settingsGenerated
      };
    });
    results.push({ step: 'settings-after-gen', after });

    if (after.settingItems === 0 && after.categories.length > 0) {
      const clickTarget = await evl(page, 'find first dynamic category', () => {
        const btns = [...document.querySelectorAll('#pl-sc-categories .pl-sc-cat-item')];
        const target = btns.find((b) => !(b.textContent || '').trim().startsWith('设定类')) || btns[0];
        return target ? target.id || null : null;
      });
      const btns = await page.$$('#pl-sc-categories .pl-sc-cat-item');
      if (btns.length > 0) {
        const idx = await page.evaluate((label) => {
          const list = [...document.querySelectorAll('#pl-sc-categories .pl-sc-cat-item')];
          const found = list.findIndex((b) => (b.textContent || '').trim() === label);
          return found === -1 ? 0 : found;
        }, (after.categories[0] || '人物') + (after.categories[0] ? '' : ''));
        await btns[idx].click({ force: true });
        log.push('PAGE.CLICK #pl-sc-categories .pl-sc-cat-item[' + idx + ']');
        await page.waitForTimeout(400);
        const afterClick = await evl(page, 'settings after category click', () => {
          return {
            activeCat: [...document.querySelectorAll('#pl-sc-categories .pl-sc-cat-item.active')].map((b) => (b.textContent || '').trim()),
            contentFrame: !!document.querySelector('.pl-sc-content-frame'),
            settingItems: document.querySelectorAll('.pl-setting-item').length
          };
        });
        results.push({ step: 'settings-after-category-click', afterClick });
        await page.screenshot({ path: path.resolve('_audit/tmp/p5_settings_list.png') });
        log.push('SCREENSHOT p5_settings_list.png');
      }
    }

    if ((await page.locator('.pl-setting-item').count()) > 0) {
      const firstBind = page.locator('.pl-setting-item').first().locator('button', { hasText: /绑定|已绑定/ });
      await firstBind.click({ force: true });
      log.push('PAGE.CLICK first setting bind button');
      await page.waitForTimeout(300);
      const bindState = await evl(page, 'bind state', () => {
        const sc = window.__pinia?._s.get('project')?.getSettingsCollection();
        const first = Object.values(sc?.items || {}).flat().find((x) => x);
        return first ? { isBound: first.isBound, boundTo: first.boundTo } : null;
      });
      results.push({ step: 'single-bind', bindState });

      const confirmCat = page.locator('.pl-sc-category-actions button.btn-primary', { hasText: /确认该类/ });
      if (await confirmCat.count()) {
        await confirmCat.click({ force: true });
        log.push('PAGE.CLICK 确认该类');
        await page.waitForTimeout(300);
      }
    }

    const confirmSettingsBtn = page.locator('#btn-pl-confirm-settings');
    const confirmDisabled = await confirmSettingsBtn.isDisabled();
    results.push({ step: 'confirm-settings-enabled', disabled: confirmDisabled });
    if (!confirmDisabled) {
      await confirmSettingsBtn.click({ force: true });
      log.push('PAGE.CLICK #btn-pl-confirm-settings');
      await page.waitForTimeout(800);
    }

    const afterConfirm = await evl(page, 'after confirm settings', () => {
      const pipe = window.__pinia?._s.get('pipeline');
      const el = document.querySelector('#pl-step-3-content');
      const steps = [...document.querySelectorAll('#pl-steps .pl-step')];
      return {
        currentStep: pipe?.currentStep,
        step3Visible: !!(el && getComputedStyle(el).display !== 'none'),
        step2Completed: steps[1] ? steps[1].className.includes('completed') : false
      };
    });
    results.push({ step: 'after-confirm-settings', afterConfirm });

    const stored = await evl(page, 'project storage', (id) => {
      const data = window.electronAPI.storageRead('wa_project_' + id);
      return data ? {
        settingsCollection: data.settingsCollection,
        settingsGenerated: data.settingsGenerated,
        outlineLocked: data.outlineLocked
      } : null;
    }, tempProjectId);
    results.push({ step: 'project-storage', stored });

    await page.screenshot({ path: path.resolve('_audit/tmp/p5_after_confirm.png') });
    log.push('SCREENSHOT p5_after_confirm.png');
  } finally {
    if (tempProjectId) {
      await page.evaluate((id) => {
        const ps = window.__pinia._s.get('project');
        if (ps) ps.deleteProject(id);
      }, tempProjectId);
      log.push('PAGE.EVAL deleteProject ' + tempProjectId);
      const exists = await page.evaluate((id) => !!window.electronAPI.storageRead('wa_project_' + id), tempProjectId);
      results.push({ step: 'cleanup-delete', removed: !exists });
      log.push('PAGE.EVAL storageRead cleanup -> removed=' + !exists);
      tempProjectId = null;
    }
    if (prevProjectId) {
      await page.evaluate((id) => {
        const ps = window.__pinia._s.get('project');
        if (ps) ps.loadProject(id);
      }, prevProjectId);
      log.push('PAGE.EVAL loadProject ' + prevProjectId);
    }
  }

  const output = { log, results };
  fs.writeFileSync(path.resolve('_audit/tmp/p5_ui_verify_result.json'), JSON.stringify(output, null, 2), 'utf8');
  console.log('RESULTS_JSON_WRITTEN');
  console.log(JSON.stringify(output, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error('ERROR:' + (e.stack || e.message));
  process.exit(1);
});
