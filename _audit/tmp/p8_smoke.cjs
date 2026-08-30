const http = require('http');

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
  const page = pages.find((item) => item.type === 'page');
  if (!page) throw new Error('CDP page target missing');
  const WebSocket = global.WebSocket || require('ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let nextId = 0;
  const pending = new Map();
  const runtimeErrors = [];

  function send(method, params = {}, timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('CDP_TIMEOUT:' + method));
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      runtimeErrors.push(message.params.args.map((arg) => arg.value || arg.description || '').join(' '));
    }
    if (message.method === 'Runtime.exceptionThrown') {
      runtimeErrors.push('EXCEPTION: ' + (message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text));
    }
    if (message.method === 'Page.javascriptDialogOpening') {
      ws.send(JSON.stringify({ id: ++nextId, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    }
  });

  await new Promise((resolve) => ws.addEventListener('open', resolve));
  await send('Runtime.enable');
  await send('Page.enable');

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const steps = [];
  const step = async (name, fn) => {
    try {
      const value = await fn();
      steps.push({ name, ok: true, value });
    } catch (error) {
      steps.push({ name, ok: false, error: error.message });
      throw error;
    }
  };

  async function click(selector, text = '') {
    const result = await evaluate(`(() => {
      const wanted = ${JSON.stringify(text)};
      const selector = ${JSON.stringify(selector)};
      let el = null;
      if (wanted) {
        el = Array.from(document.querySelectorAll(selector)).find((item) => (item.textContent || '').trim() === wanted);
      } else {
        el = document.querySelector(selector);
      }
      if (!el) return 'MISSING:' + selector + (wanted ? ':' + wanted : '');
      el.click();
      return 'CLICKED';
    })()`);
    if (String(result).startsWith('MISSING:')) throw new Error(result);
    return result;
  }

  async function setValue(selector, value) {
    const result = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'MISSING:' + ${JSON.stringify(selector)};
      const prototype = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      descriptor.set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'SET';
    })()`);
    if (String(result).startsWith('MISSING:')) throw new Error(result);
    return result;
  }

  async function panelState(panel) {
    return evaluate(`(() => {
      const panel = document.querySelector(${JSON.stringify(panel)});
      if (!panel) return { exists: false, visible: false };
      const style = getComputedStyle(panel);
      const rect = panel.getBoundingClientRect();
      return {
        exists: true,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        bodyOverflowX: document.body.scrollWidth > document.body.clientWidth + 1
      };
    })()`);
  }

  const original = await evaluate(`(async () => ({
    lastProjectId: await window.electronAPI.storageRead('wa_lastProjectId'),
    projectName: (document.querySelector('#current-project-name .project-name') || {}).textContent || '',
    projectCount: (await window.electronAPI.storageList() || []).filter((key) => key.startsWith('wa_project_') || key.startsWith('wa_project-')).length
  }))()`);

  await step('baseline', async () => ({
    mounted: await evaluate('!!document.querySelector("#app-header")'),
    original,
    bodyOverflowX: await evaluate('document.body.scrollWidth > document.body.clientWidth + 1')
  }));

  await step('create-fixture-project', async () => {
    await click('#btn-open-project');
    await sleep(300);
    await click('.new-project-btn');
    await sleep(150);
    await setValue('.new-project-form .form-input', '深度扫描冒烟项目');
    await setValue('.new-project-form .form-textarea', '# 第一卷 试炼之路\\n## 第1章 启程\\n## 第2章 试炼\\n# 第二卷 北境之影\\n## 第3章 追踪\\n');
    await click('.new-project-form .btn-primary');
    await sleep(300);
    const transition = await evaluate('!!document.querySelector(".project-transition-confirm")');
    if (transition) {
      await click('.project-transition-confirm .btn-primary');
      await sleep(500);
    }
    await evaluate('document.querySelector(".project-modal-content .btn-close")?.click()');
    await sleep(250);
    return {
      projectName: await evaluate('(document.querySelector("#current-project-name .project-name") || {}).textContent'),
      volumeCount: await evaluate('document.querySelectorAll(".volume-item").length'),
      chapterCount: await evaluate('document.querySelectorAll(".chapter-item").length')
    };
  });

  await step('outline-workspace', async () => {
    await click('#btn-outline-workspace');
    await sleep(400);
    const state = await panelState('#outline-workspace');
    const controls = await evaluate(`(() => ({
      editorValueLength: (document.querySelector('#outline-editor') || {}).value?.length || 0,
      agentSelect: !!document.querySelector('#ow-agent-select'),
      skillSelect: !!document.querySelector('#ow-skill-select'),
      modeSelect: !!document.querySelector('#ow-skill-mode'),
      selectedSkills: document.querySelectorAll('#ow-selected-skills .ow-skill-chip').length,
      footerImport: !!document.querySelector('#btn-import-outline'),
      footerSave: !!document.querySelector('#btn-save-outline'),
      footerLock: !!document.querySelector('#btn-lock-outline')
    }))()`);
    await click('#btn-ai-co-create');
    await sleep(200);
    const chatVisible = await evaluate('!!document.querySelector("#ow-chat-input")');
    await click('#btn-ai-co-create');
    await click('#btn-lock-outline');
    await sleep(500);
    const lockState = await evaluate(`(() => ({
      lockedText: (document.querySelector('#btn-lock-outline') || {}).textContent || '',
      editorReadonly: !!document.querySelector('#outline-editor')?.readOnly,
      outlineInfo: (document.querySelector('#pl-outline-info-title, .pl-outline-info-title') || {}).textContent || null
    }))()`);
    await sleep(500);
    const afterLockPipeline = await evaluate(`(() => ({
      pipelineVisible: !!document.querySelector('#pipeline-panel'),
      pipelineOutlineReadonly: !!document.querySelector('#pl-outline')?.readOnly,
      pipelineOutlineLength: document.querySelector('#pl-outline')?.value?.length || 0,
      infoTitle: (document.querySelector('.pl-outline-info-title') || {}).textContent || null,
      outlineStatus: Array.from(document.querySelectorAll('.pl-outline-info-meta span')).map((item) => item.textContent.trim())
    }))()`);
    return { panel: state, controls, chatVisible, lockState, afterLockPipeline, autoNavigatedToPipeline: await evaluate('!!document.querySelector("#pipeline-panel")') };
  });

  await step('pipeline-five-steps', async () => {
    if (!(await evaluate('!!document.querySelector("#pipeline-panel")'))) {
      await click('#btn-pipeline');
    }
    await sleep(500);
    const labels = await evaluate('Array.from(document.querySelectorAll(".pl-step-label")).map((item) => item.textContent.trim())');
    const perStep = [];
    const stepCount = await evaluate('document.querySelectorAll(".pl-step").length');
    for (let i = 0; i < stepCount; i++) {
      await evaluate(`document.querySelectorAll(".pl-step")[${i}].click()`);
      await sleep(250);
      const visiblePanel = await evaluate(`(() => {
        const panels = Array.from(document.querySelectorAll('.pl-step-panel'));
        return panels.filter((panel) => panel.style.display !== 'none' && getComputedStyle(panel).display !== 'none').map((panel) => panel.id);
      })()`);
      const emptyOrState = await evaluate(`(() => ({
        step: ${i},
        overflowX: document.body.scrollWidth > document.body.clientWidth + 1,
        visibleCount: document.querySelectorAll('.pl-step-panel').length
      }))()`);
      perStep.push({ index: i, labels: labels[i], visiblePanel, ...emptyOrState });
    }
    const naming = await (async () => {
      await evaluate('document.querySelectorAll(".pl-step")[0]?.click()');
      await sleep(200);
      await click('#btn-ai-names');
      await sleep(400);
      const state = await panelState('.naming-overlay');
      const tabs = await evaluate('Array.from(document.querySelectorAll(".naming-tab")).map((item) => item.textContent.trim())');
      const subTabs = await evaluate('Array.from(document.querySelectorAll(".naming-sub-tab")).map((item) => item.textContent.trim())');
      await click('.naming-sub-tab', '收藏');
      await sleep(100);
      await click('.naming-sub-tab', '历史');
      await sleep(100);
      await click('.naming-close');
      await sleep(200);
      return { panel: state, tabs, subTabs };
    })();
    await click('#btn-close-pl');
    await sleep(250);
    return { labels, perStep, naming };
  });

  await step('memory-views', async () => {
    await click('#btn-memory');
    await sleep(500);
    const panel = await panelState('#memory-panel');
    const tabResults = [];
    const tabTexts = await evaluate('Array.from(document.querySelectorAll(".mem-tab-btn")).map((item) => item.textContent.trim())');
    for (const text of tabTexts) {
      await click('.mem-tab-btn', text);
      await sleep(250);
      tabResults.push({
        tab: text,
        active: await evaluate(`Array.from(document.querySelectorAll('.mem-tab-btn')).find((item) => item.textContent.trim() === ${JSON.stringify(text)})?.classList.contains('active')`),
        overflowX: await evaluate('document.body.scrollWidth > document.body.clientWidth + 1')
      });
    }
    await click('#memory-panel .modal-close, #memory-panel .btn-close');
    await sleep(250);
    return { panel, tabTexts, tabResults };
  });

  await step('settings-tabs', async () => {
    await click('#btn-settings');
    await sleep(500);
    const panel = await panelState('#settings-modal-body');
    const tabs = await evaluate('Array.from(document.querySelectorAll(".settings-tab")).map((item) => ({ id: item.id, text: item.textContent.trim() }))');
    const tabResults = [];
    for (const tab of tabs) {
      await click('#' + tab.id);
      await sleep(350);
      tabResults.push({
        id: tab.id,
        text: tab.text,
        active: await evaluate(`document.querySelector('#${tab.id}')?.classList.contains('active')`),
        contentHeight: await evaluate('document.querySelector(".settings-panel")?.scrollHeight || 0'),
        overflowX: await evaluate('document.body.scrollWidth > document.body.clientWidth + 1')
      });
    }
    await click('#btn-close-settings');
    await sleep(250);
    return { panel, tabs, tabResults };
  });

  await step('restore-original-project', async () => {
    if (!original.lastProjectId) return { restored: false, reason: 'no original lastProjectId' };
    await click('#btn-open-project');
    await sleep(400);
    const clicked = await evaluate(`(() => {
      const items = Array.from(document.querySelectorAll('.project-item'));
      const target = items.find((item) => (item.querySelector('.project-item-name') || {}).textContent);
      if (!target) return 'NO_PROJECT_ITEMS';
      const button = Array.from(target.querySelectorAll('button')).find((item) => item.textContent.trim() === '加载');
      if (!button) return 'NO_LOAD_BUTTON';
      button.click();
      return 'CLICKED';
    })()`);
    await sleep(300);
    if (await evaluate('!!document.querySelector(".project-transition-confirm")')) {
      await click('.project-transition-confirm .btn-primary');
    }
    await sleep(500);
    await click('#btn-open-project');
    await sleep(400);
    const deleted = await evaluate(`(() => {
      const items = Array.from(document.querySelectorAll('.project-item'));
      const target = items.find((item) => (item.querySelector('.project-item-name') || {}).textContent === '深度扫描冒烟项目');
      if (!target) return 'FIXTURE_NOT_FOUND';
      const button = Array.from(target.querySelectorAll('button')).find((item) => item.textContent.trim() === '删除');
      if (!button) return 'NO_DELETE_BUTTON';
      button.click();
      return 'DELETE_CLICKED';
    })()`);
    await sleep(600);
    if (await evaluate('!!document.querySelector(".modal-overlay:not(.modal-hidden) .project-modal-content")')) {
      await click('.project-modal-content .btn-close');
    }
    await sleep(300);
    return {
      clicked,
      deleted,
      currentProjectName: await evaluate('(document.querySelector("#current-project-name .project-name") || {}).textContent'),
      projectNameRestored: await evaluate('(document.querySelector("#current-project-name .project-name") || {}).textContent') === original.projectName
    };
  });

  const persistedCleanup = await evaluate(`(async () => {
    const keys = await window.electronAPI.storageList() || [];
    const fixtureKeys = keys.filter((key) => key.includes('深度扫描冒烟项目'));
    for (const key of fixtureKeys) await window.electronAPI.storageRemove(key);
    return { fixtureKeys, remaining: fixtureKeys.length };
  })()`);

  await step('final-state', async () => ({
    activePanels: await evaluate(`({
      settings: !!document.querySelector('#settings-modal-body'),
      pipeline: !!document.querySelector('#pipeline-panel'),
      outline: !!document.querySelector('#outline-workspace'),
      memory: !!document.querySelector('#memory-panel'),
      naming: !!document.querySelector('.naming-overlay')
    })`),
    bodyOverflowX: await evaluate('document.body.scrollWidth > document.body.clientWidth + 1'),
    projectCount: await evaluate('(window.electronAPI.storageList().then((keys) => keys.filter((key) => key.startsWith("wa_project_") || key.startsWith("wa_project-")).length))'),
    persistedCleanup
  }));

  const summary = {
    original,
    steps,
    runtimeErrors,
    allStepsOk: steps.every((item) => item.ok)
  };
  console.log(JSON.stringify(summary, null, 2));
  require('fs').writeFileSync(__dirname + '/p8_smoke.json', JSON.stringify(summary, null, 2), 'utf8');
  ws.close();
  process.exit(summary.allStepsOk && runtimeErrors.length === 0 ? 0 : 2);
})().catch((error) => {
  console.error('P8_SMOKE_FAIL', error.stack || error.message);
  process.exit(1);
});
