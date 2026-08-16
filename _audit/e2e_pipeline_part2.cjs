const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '_audit/PIPELINE_E2E_PART2_20260816.json';
const report = { startedAt: new Date().toISOString(), steps: [] };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitNoGenerating(page, timeoutMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const generating = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#pipeline-panel button')];
      return btns.some(b => /生成中/.test(b.textContent || ''));
    });
    if (!generating) return true;
    await sleep(2000);
  }
  throw new Error('still generating after ' + timeoutMs + 'ms');
}

async function logStep(page, name) {
  const state = await page.evaluate(() => {
    const active = document.querySelector('.pl-step.active')?.innerText.trim() || '';
    return {
      active,
      volCards: document.querySelectorAll('.pl-vol-card').length,
      chCards: document.querySelectorAll('.pl-ch-card').length,
      bodyText: (document.querySelector('#pl-body-result .pl-body-text')?.innerText || '').slice(0, 200),
      volNames: [...document.querySelectorAll('.pl-vol-card .vol-name, .pl-vol-card h4')].map(e => e.textContent.trim()).slice(0, 5),
      chTitles: [...document.querySelectorAll('.pl-ch-card .ch-title')].map(e => e.textContent.trim()).slice(0, 5),
      plots: document.querySelectorAll('.pl-ch-plot').length,
      genButtonsDisabled: [...document.querySelectorAll('#pipeline-panel button.btn-primary')].map(b => ({ id: b.id, disabled: b.disabled, text: b.textContent.trim() }))
    };
  });
  report.steps.push({ name, state });
  console.log(`[VERIFY] ${name}:`, JSON.stringify(state));
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const page = browser.contexts()[0].pages()[0];

  if (!(await page.locator('#pipeline-panel').count())) {
    await page.locator('#btn-pipeline').click();
    await page.waitForSelector('#pipeline-panel');
  }

  const volConfirmDisabled = await page.locator('#btn-pl-confirm-volumes').isDisabled();
  report.steps.push({ name: 'volume_confirm_available', disabled: volConfirmDisabled });
  console.log('[VERIFY] volume confirm disabled:', volConfirmDisabled);

  await page.locator('#btn-pl-confirm-volumes').click();
  await sleep(400);
  await logStep(page, 'confirm_volumes');

  // Chapter step
  await page.locator('#pl-chapter-wordcount').fill('3500');
  await page.locator('#pl-chapter-wordcount').blur();
  await sleep(400);
  const chapterLink = await page.evaluate(() => {
    const sel = document.querySelector('.pl-ch-config select');
    return {
      perChapter: document.querySelector('#pl-chapter-wordcount')?.value,
      est: document.querySelector('#pl-ch-est-count')?.textContent?.trim(),
      selectedVol: sel?.options?.[sel?.selectedIndex]?.textContent?.trim()
    };
  });
  report.steps.push({ name: 'chapter_link', chapterLink });
  console.log('[VERIFY] chapter link:', JSON.stringify(chapterLink));

  await page.locator('#btn-pl-gen-chapters').click();
  await waitNoGenerating(page);
  await sleep(500);
  const chState = await page.evaluate(() => ({
    chCards: document.querySelectorAll('.pl-ch-card').length,
    plots: document.querySelectorAll('.pl-ch-plot').length,
    chTitles: [...document.querySelectorAll('.pl-ch-card .ch-title')].map(e => e.textContent.trim()).slice(0, 10)
  }));
  report.steps.push({ name: 'ai_generate_chapters', ...chState });
  console.log('[VERIFY] chapters:', JSON.stringify(chState));

  await page.locator('#btn-pl-confirm-chapters').click();
  await sleep(400);
  await logStep(page, 'confirm_chapters');

  // Body step
  const bodyBtn = await page.locator('#btn-pl-gen-body');
  report.steps.push({ name: 'body_btn_before', disabled: await bodyBtn.isDisabled() });
  await bodyBtn.click();
  await waitNoGenerating(page);
  await sleep(500);
  const bodyState = await page.evaluate(() => ({
    bodyTextLen: (document.querySelector('#pl-body-result .pl-body-text')?.innerText || '').length,
    bodyText: (document.querySelector('#pl-body-result .pl-body-text')?.innerText || '').slice(0, 150),
    insertDisabled: document.querySelector('#btn-pl-insert-body')?.disabled,
    confirmDisabled: document.querySelector('#btn-pl-confirm-body')?.disabled
  }));
  report.steps.push({ name: 'ai_generate_body', ...bodyState });
  console.log('[VERIFY] body:', JSON.stringify(bodyState));

  await page.locator('#btn-pl-insert-body').click();
  await sleep(600);
  const editorState = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.editor-tab, [data-editor-tab]')].map(t => t.textContent.trim());
    return { tabs, tabCount: tabs.length };
  });
  report.steps.push({ name: 'insert_to_editor', editorState });
  console.log('[VERIFY] editor:', JSON.stringify(editorState));

  await page.locator('#btn-pl-confirm-body').click();
  await sleep(400);
  await logStep(page, 'confirm_body');

  const projData = await page.evaluate(() => window.electronAPI.storageRead('wa_project_prj_msbtqnpe_q24wr3'));
  report.projectData = {
    volumes: (projData.volumes || []).map(v => ({ name: v.name, outline: (v.outline || '').slice(0, 50) })),
    chapterCounts: Object.fromEntries(Object.entries(projData.chapters || {}).map(([k, v]) => [k, v.length])),
    settingsCount: (projData.settings || []).length,
    volumesConfirmed: projData.volumesConfirmed,
    chaptersConfirmed: projData.chaptersConfirmed
  };
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log('REPORT_WRITTEN', OUT);
  await browser.close();
}

main().catch(e => {
  report.error = e.stack || String(e);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.error('[ERR]', e);
  process.exit(1);
});
