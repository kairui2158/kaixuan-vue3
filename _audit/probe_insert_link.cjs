const { chromium } = require('playwright');

const CDP = 'http://127.0.0.1:9227';

async function inspectUi(page) {
  return page.evaluate(() => {
    const btnCandidates = [...document.querySelectorAll('button, a, [role=button]')]
      .map(e => ({
        text: (e.textContent || '').trim().slice(0, 40),
        id: e.id || '',
        cls: e.className || '',
        visible: !!(e.offsetParent || e.getClientRects().length)
      }))
      .filter(x => /流水线|大纲|工作台|管道|生成/i.test(x.text) || /pl-|pipeline/i.test(x.id + x.cls));

    const navItems = [...document.querySelectorAll('nav a, .nav-item, [data-nav]')]
      .map(e => ({ text: (e.textContent || '').trim().slice(0, 50), cls: e.className || '', visible: !!(e.offsetParent) }));

    return {
      navItems,
      pipelineButtons: btnCandidates.slice(0, 40),
      bodyTextSample: (document.body.innerText || '').slice(0, 200)
    };
  });
}

async function getState(page) {
  return page.evaluate(() => {
    const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia;
    const editorStore = pinia?._s.get('editor');
    const projectStore = pinia?._s.get('project');
    const tabsEI = [...document.querySelectorAll('.chapter-tabs .tab')].map(t => ({
      text: t.textContent.trim(),
      active: t.classList.contains('active')
    }));
    return {
      hasEditorStore: !!editorStore,
      editorKeys: editorStore ? Object.keys(editorStore).filter(k => !['_p','$id','$type'].includes(k)) : [],
      tabsCount: Array.isArray(editorStore?.tabs) ? editorStore.tabs.length : -1,
      tabs: Array.isArray(editorStore?.tabs) ? editorStore.tabs.map(t => ({ id: t.id, title: t.title, chapterId: t.chapterId, isDirty: t.isDirty, len: (t.content || '').length })) : [],
      activeTabId: editorStore?.activeTabId,
      activeTabTitle: editorStore?.activeTab?.title || '',
      activeTabLen: editorStore?.activeTab?.content?.length || 0,
      domTabs: tabsEI,
      projectStoreVolumes: projectStore?.volumes?.length,
      currentProjectId: projectStore?.currentProjectId
    };
  });
}

async function clickPipeline(page) {
  const btn = page.locator('#btn-pipeline');
  const cnt = await btn.count();
  console.log('[PIPELINE BTN] count:', cnt);
  if (cnt) await btn.click();
  await page.waitForTimeout(700);
  return page.evaluate(() => ({
    hasPlRoot: !!document.querySelector('.pl-root') || !!document.querySelector('.pipeline-panel'),
    plRootVisible: !!(document.querySelector('.pl-root')?.offsetParent ?? document.querySelector('.pipeline-panel')?.offsetParent),
    hasInsertBtn: !!document.getElementById('btn-pl-insert-body'),
    visibleText: (document.body.innerText || '').slice(0, 300)
  }));
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  console.log('[CONNECT] ok');
  const context = browser.contexts()[0];
  const page = context.pages()[0];

  const info = await page.evaluate(() => ({
    url: location.href,
    hasInsertBtn: !!document.getElementById('btn-pl-insert-body'),
    htmlSnippet: document.body ? document.body.innerText.slice(0, 120) : '',
    activeStep: document.querySelector('.pl-step.active')?.textContent?.trim() || null,
    plRootVisible: !!document.querySelector('.pl-panel')
  }));
  console.log('[PAGE INFO]', JSON.stringify(info, null, 2));
  console.log('[UI]', JSON.stringify(await inspectUi(page), null, 2));

  if (!info.plRootVisible) {
    console.log('[OPENING] pipeline panel');
    const openState = await clickPipeline(page);
    console.log('[PIPELINE OPEN]', JSON.stringify(openState, null, 2));
  }

  console.log('[BEFORE]', JSON.stringify(await getState(page), null, 2));

  // 监听 insert-text 是否触发
  const eventLog = [];
  await page.evaluate(() => {
    window.__insertEvents = [];
    window.addEventListener('insert-text', (e) => {
      const d = e.detail || {};
      window.__insertEvents.push({
        hasText: !!d.text,
        textLen: (d.text || '').length,
        chapterId: d.chapterId,
        title: d.title
      });
    });
  });

  const btn = page.locator('#btn-pl-insert-body');
  const btnCount = await btn.count();
  console.log('[BTN] count:', btnCount);
  const disabled = btnCount ? await btn.isDisabled().catch(() => 'n/a') : 'n/a';
  console.log('[BTN] disabled:', disabled);
  if (btnCount) await btn.click();
  await page.waitForTimeout(800);

  const events = await page.evaluate(() => window.__insertEvents || []);
  console.log('[EVENTS]', JSON.stringify(events, null, 2));
  console.log('[AFTER]', JSON.stringify(await getState(page), null, 2));

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
