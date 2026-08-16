const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'PIPELINE_REAL_E2E_20260816.json');
const APP_DATA = 'C:/Users/凯瑞/AppData/Roaming/shenyi-assistant/data';
const PROJECT_KEY = 'wa_project_prj_msbtqnpe_q24wr3';

const report = { startedAt: new Date().toISOString(), steps: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function logStep(page, name) {
  const state = await page.evaluate(() => {
    const panel = document.querySelector('#pipeline-panel');
    const active = document.querySelector('.pl-step.active')?.innerText.trim() || '';
    const body = document.body.innerText;
    return {
      active,
      bodySample: body.slice(0, 400),
      hasAddModal: !!document.querySelector('.pl-add-setting-modal'),
      volCards: document.querySelectorAll('.pl-vol-card').length,
      chCards: document.querySelectorAll('.pl-ch-card').length,
      bodyResult: (document.querySelector('#pl-body-result')?.innerText || '').slice(0, 300),
      generating: /生成中/.test(body)
    };
  });
  const row = { time: new Date().toISOString(), name, state };
  report.steps.push(row);
  console.log(`[VERIFY] ${name}:`, JSON.stringify(state));
}

async function waitNoGenerating(page, timeoutMs = 150000) {
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    const gen = [...document.querySelectorAll('#pipeline-panel button')].find((b) => /生成中/.test(b.textContent || ''));
    return !gen;
  }, { timeout: timeoutMs });
}

async function readProjectData(page) {
  return await page.evaluate(() => {
    return window.electronAPI.storageRead('wa_project_prj_msbtqnpe_q24wr3');
  });
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];
  report.url = page.url();
  if (!(await page.locator('#pipeline-panel').count())) {
    await page.locator('#btn-pipeline').click();
    await page.waitForSelector('#pipeline-panel', { timeout: 5000 });
  }
  await logStep(page, 'open_pipeline');

  await page.locator('.pl-step').filter({ hasText: '大纲' }).click();
  await page.waitForSelector('#pl-step-1-content:not([style*="display: none"])', { timeout: 5000 });

  // 1. Outline step: book word count linkage.
  await page.fill('#pl-book-word-count', '20');
  await page.locator('#pl-book-word-count').blur();
  await sleep(300);
  const outlineLink = await page.evaluate(() => ({
    book: document.querySelector('#pl-book-word-count')?.value,
    volumeWords: [...document.querySelectorAll('#pl-volume-config input')][0]?.value,
    volCount: document.querySelector('#pl-volume-count')?.value,
    hint: document.querySelector('#pl-volume-config .pl-gen-hint')?.textContent || ''
  }));
  report.steps.push({ name: 'outline_word_count_link', outlineLink });
  console.log('[VERIFY] outline word link:', JSON.stringify(outlineLink));

  // 2. Settings step.
  await page.locator('.pl-step').filter({ hasText: '设定' }).click();
  await page.waitForSelector('#pl-step-2-content:not([style*="display: none"])', { timeout: 5000 });
  await logStep(page, 'open_settings');

  await page.locator('button').filter({ hasText: '+ 新增设定' }).click();
  await page.waitForSelector('.pl-add-setting-modal', { timeout: 3000 });
  await page.fill('.pl-add-setting-modal input', '魔法王国');
  await page.locator('.pl-add-setting-modal select').first().selectOption('势力阵营');
  await page.fill('.pl-add-setting-modal textarea', '大陆南方魔法王国');
  const addBtnDisabled = await page.locator('.pl-add-setting-modal button').filter({ hasText: '保存' }).isDisabled();
  await page.locator('.pl-add-setting-modal button').filter({ hasText: '保存' }).click();
  await sleep(500);
  const settingsAfterAdd = await page.locator('#pl-bound-settings-list .pl-setting-item').count();
  report.steps.push({ name: 'add_setting', addBtnDisabled, count: settingsAfterAdd });
  console.log('[VERIFY] add setting count:', settingsAfterAdd);

  await page.locator('#btn-pl-gen-settings').click();
  await waitNoGenerating(page);
  await sleep(300);
  const settingsGenerated = await page.locator('#pl-bound-settings-list .pl-setting-item').count();
  report.steps.push({ name: 'ai_generate_settings', count: settingsGenerated });
  console.log('[VERIFY] settings after AI:', settingsGenerated);

  await page.locator('#btn-pl-save-settings').click();
  await page.locator('#btn-pl-confirm-settings').click();
  await sleep(300);
  await logStep(page, 'confirm_settings');

  // 3. Volume step.
  const volInputs = page.locator('#pl-volume-config input');
  await volInputs.nth(0).fill('50000');
  await volInputs.nth(0).blur();
  await sleep(300);
  const volLink = await page.evaluate(() => ({
    volumeWords: document.querySelector('#pl-volume-config input')?.value,
    volCount: document.querySelector('#pl-volume-count')?.value,
    hint: document.querySelector('#pl-volume-config .pl-gen-hint')?.textContent || ''
  }));
  report.steps.push({ name: 'volume_word_count_link', volLink });
  console.log('[VERIFY] volume word link:', JSON.stringify(volLink));

  await page.locator('#btn-pl-gen-volumes').click();
  await waitNoGenerating(page);
  await sleep(300);
  const volCount = await page.locator('.pl-vol-card').count();
  report.steps.push({ name: 'ai_generate_volumes', count: volCount });
  console.log('[VERIFY] volumes after AI:', volCount);

  await page.locator('#btn-pl-confirm-volumes').click();
  await sleep(300);
  await logStep(page, 'confirm_volumes');

  // 4. Chapter step.
  await page.fill('#pl-chapter-wordcount', '3500');
  await page.locator('#pl-chapter-wordcount').blur();
  await sleep(300);
  const chapterLink = await page.evaluate(() => ({
    perChapter: document.querySelector('#pl-chapter-wordcount')?.value,
    est: document.querySelector('#pl-ch-est-count')?.textContent?.trim(),
    selectedVol: document.querySelector('#pl-step-4-content .pl-ch-config select')?.options?.[document.querySelector('#pl-step-4-content .pl-ch-config select')?.selectedIndex]?.textContent?.trim()
  }));
  report.steps.push({ name: 'chapter_link', chapterLink });
  console.log('[VERIFY] chapter link:', JSON.stringify(chapterLink));

  await page.locator('#btn-pl-gen-chapters').click();
  await waitNoGenerating(page);
  await sleep(300);
  const chapterCount = await page.locator('.pl-ch-card').count();
  const plotCount = await page.locator('.pl-ch-plot').count();
  report.steps.push({ name: 'ai_generate_chapters', chapterCount, plotCount });
  console.log('[VERIFY] chapters after AI:', chapterCount, 'plots:', plotCount);

  await page.locator('#btn-pl-confirm-chapters').click();
  await sleep(300);
  await logStep(page, 'confirm_chapters');

  // 5. Body step.
  const bodyBefore = await page.locator('#btn-pl-gen-body').isDisabled();
  await page.locator('#btn-pl-gen-body').click();
  await waitNoGenerating(page);
  await sleep(300);
  const bodyText = await page.locator('#pl-body-result .pl-body-text').innerText();
  const insertDisabled = await page.locator('#btn-pl-insert-body').isDisabled();
  report.steps.push({ name: 'ai_generate_body', textLen: bodyText.length, insertDisabled });
  console.log('[VERIFY] body generated len:', bodyText.length, 'insertDisabled:', insertDisabled);

  await page.locator('#btn-pl-insert-body').click();
  await sleep(500);
  const editorState = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.editor-tab, [data-editor-tab]')].map((t) => t.textContent.trim());
    return { tabs };
  });
  report.steps.push({ name: 'insert_to_editor', editorState });
  console.log('[VERIFY] editor state:', JSON.stringify(editorState));

  await page.locator('#btn-pl-confirm-body').click();
  await sleep(300);
  await logStep(page, 'confirm_body');

  const projectData = await readProjectData(page);
  report.projectData = projectData;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log('REPORT_WRITTEN', OUT);
  await browser.close();
}

main().catch((e) => {
  report.error = e.stack || String(e);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.error('[E2E-ERR]', e);
  process.exit(1);
});
