const { createRequire } = require('module');
const requireFromProject = createRequire(process.cwd() + '/package.json');
const { chromium } = requireFromProject('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227');
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  if (!page) throw new Error('没有发现 Electron 页面');
  await page.waitForLoadState('domcontentloaded');
  const result = { url: page.url(), title: await page.title(), steps: [] };

  result.steps.push({ name: 'visible-navigation', value: await page.locator('button, [role="button"], a').evaluateAll((els) => els.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }).slice(0, 80).map((el) => ({ tag: el.tagName, id: el.id, text: (el.textContent || '').trim().slice(0, 80), aria: el.getAttribute('aria-label'), title: el.getAttribute('title') }))) });

  const pipelineButton = page.locator('#btn-pipeline');
  const pipelinePanel = page.locator('#pipeline-panel');
  const pipelineOpen = await pipelinePanel.isVisible().catch(() => false);
  if (!pipelineOpen && await pipelineButton.count()) {
    await pipelineButton.click();
    await page.waitForTimeout(300);
  }
  const settingsTab = page.locator('button, [role="tab"]').filter({ hasText: /^设定$/ }).first();
  if (await settingsTab.count()) {
    await settingsTab.click();
    await page.waitForTimeout(300);
  }

  const stateBefore = await page.evaluate(() => {
    const list = document.querySelector('#pl-bound-settings-list');
    const layout = document.querySelector('.pl-sc-layout');
    const categories = document.querySelector('.pl-sc-categories');
    const item = document.querySelector('.pl-setting-item');
    const rect = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() : null;
    return { layout: rect(layout), categories: rect(categories), list: rect(list), item: rect(item), itemCount: document.querySelectorAll('.pl-setting-item').length };
  });
  result.steps.push({ name: 'settings-layout-before', state: stateBefore });
  await page.screenshot({ path: '_audit/screenshots/settings_ui_after_fix.png', fullPage: true });

  const addButton = page.locator('#btn-pl-add-setting, button').filter({ hasText: '新增设定' }).first();
  result.steps.push({ name: 'add-setting-button-visible', value: await addButton.isVisible().catch(() => false) });
  const existingModal = page.locator('.pl-add-setting-modal');
  const modalAlreadyOpen = await existingModal.isVisible().catch(() => false);
  if (!modalAlreadyOpen && await addButton.count()) {
    await addButton.click();
    await page.waitForTimeout(200);
  }
  const modal = page.locator('.pl-add-setting-modal');
  result.steps.push({ name: 'add-setting-modal-visible', value: await modal.isVisible().catch(() => false) });
  if (await modal.isVisible().catch(() => false)) {
    result.steps.push({ name: 'add-setting-modal-controls', value: await modal.locator('input, textarea, select, button').evaluateAll((els) => els.map((el) => ({ tag: el.tagName, type: el.getAttribute('type'), text: (el.textContent || '').trim(), placeholder: el.getAttribute('placeholder'), value: el.value }))) });
    const modalInputs = modal.locator('input');
    const modalTextareas = modal.locator('textarea');
    if (await modalInputs.count() && await modalTextareas.count()) {
      await modalInputs.first().fill('临时UI测量设定');
      await modalTextareas.first().fill('仅用于验证设定卡片布局');
      const confirm = modal.locator('button').filter({ hasText: '保存' }).first();
      if (await confirm.count()) await confirm.click();
      await page.waitForTimeout(300);
      result.steps.push({ name: 'add-setting-modal-closed-after-save', value: !(await modal.isVisible().catch(() => false)) });
      const otherCategory = page.locator('.pl-sc-cat-item').filter({ hasText: '其他' }).first();
      if (await otherCategory.count()) {
        await otherCategory.click();
        await page.waitForTimeout(200);
      }
    }
  }

  const stateAfter = await page.evaluate(() => {
    const item = document.querySelector('.pl-setting-item');
    const rect = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; })() : null;
    return {
      item: rect(item),
      itemCount: document.querySelectorAll('.pl-setting-item').length,
      controls: Array.from(document.querySelectorAll('.pl-setting-item')).slice(0, 3).map((el) => ({
        input: rect(el.querySelector('input.pl-input')),
        select: rect(el.querySelector('select.pl-input-sm')),
        textarea: rect(el.querySelector('textarea.pl-attrs-input')),
        bind: rect(el.querySelector('button:nth-of-type(1)')),
        delete: rect(el.querySelector('button:nth-of-type(2)')),
      }))
    };
  });
  result.steps.push({ name: 'settings-layout-after', state: stateAfter });
  const temporaryItem = page.locator('.pl-setting-item').filter({ hasText: '临时UI测量设定' }).first();
  const temporaryState = await page.evaluate(() => {
    const matches = [];
    for (const key of Object.keys(localStorage)) {
      const value = localStorage.getItem(key) || '';
      if (value.includes('临时UI测量设定')) matches.push({ key, value: value.slice(0, 500) });
    }
    return { visibleItemCount: document.querySelectorAll('.pl-setting-item').length, storageMatches: matches };
  });
  result.steps.push({ name: 'temporary-setting-created', value: await temporaryItem.count() > 0 || temporaryState.storageMatches.length > 0, state: temporaryState });
  if (await temporaryItem.count()) {
    result.steps.push({ name: 'temporary-setting-control-layout', state: await temporaryItem.evaluate((el) => {
      const rect = (selector) => { const node = el.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { card: rect(':scope'), input: rect('input.pl-input'), select: rect('select.pl-input-sm'), textarea: rect('textarea.pl-attrs-input'), bind: rect('button:nth-of-type(1)'), delete: rect('button:nth-of-type(2)') };
    }) });
    const deleteButton = temporaryItem.locator('.btn-danger').first();
    if (await deleteButton.count()) await deleteButton.click();
    await page.waitForTimeout(250);
  }
  result.steps.push({ name: 'temporary-setting-removed', value: await page.locator('.pl-setting-item').filter({ hasText: '临时UI测量设定' }).count() === 0 });
  fs.writeFileSync('_audit/screenshots/settings_ui_verify.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
