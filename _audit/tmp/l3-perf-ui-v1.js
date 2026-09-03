(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = { runtimeErrors: [], runs: [], findings: [] };
  const marker = Date.now();
  const lineCount = 10000;
  const charsPerLine = 51;
  const tabId = 'l3-perf-ui-' + marker;
  let provider = null, project = null, chat = null, editor = null;
  let originalProviders = null, originalGenerate = null, originalVerify = null, originalDetect = null;
  let originalSession = null, originalTabs = null, originalActiveTabId = null;
  const toolTimings = [];
  const unsubscribeDiag = window.DiagLogger?.subscribe?.(entry => {
    if (entry?.cat === 'ai-service/tool-call' && entry?.toolName === 'editor.get_state') {
      toolTimings.push(Number(entry?.durationMs || 0));
    }
  });

  function buildContent() {
    const lines = [];
    const filler = '性能验证测试内容';
    for (let index = 0; index < lineCount; index++) {
      const text = `${index + 1}：${filler.repeat(7)}`;
      lines.push(text.slice(0, charsPerLine));
    }
    for (let index = 0; index < 10; index++) {
      lines.push(`性能标记第${index + 1}段`);
    }
    return lines.join('\n');
  }

  async function waitFor(predicate, timeout = 30000, interval = 80) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const value = await predicate();
        if (value) return value;
      } catch (error) {
        result.runtimeErrors.push(String(error));
      }
      await sleep(interval);
    }
    return null;
  }

  async function waitForIdle(timeout = 30000) {
    return await waitFor(() => {
      const status = chat?.generationStatus;
      return ['preparing', 'streaming', 'retrying'].includes(status) ? null : (status || 'idle');
    }, timeout);
  }

  async function dismissAlerts() {
    for (let i = 0; i < 6; i++) {
      const button = [...document.querySelectorAll('.app-confirm-overlay button')]
        .find(item => item.textContent.trim() === '确定');
      if (!button) break;
      button.click();
      await sleep(80);
    }
  }

  function requestFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve(performance.now())));
  }

  async function measureRun(runIndex) {
    const content = buildContent();
    editor.tabs = [{
      id: tabId,
      title: '等级三性能实测',
      content,
      chapterId: '',
      isDirty: false,
      mode: 'normal'
    }];
    editor.activeTabId = tabId;
    await sleep(180);

    const longTasks = [];
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        longTasks.push({ duration: Math.round(entry.duration), startTime: Math.round(entry.startTime) });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });

    const input = document.getElementById('user-input');
    if (!input || input.offsetParent === null) throw new Error('main chat input unavailable');
    const beforeAssistants = chat.activeMessages.filter(item => item.role === 'assistant').length;
    input.value = 'L3_PERF_ui_run_' + runIndex + '_' + marker;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-send').click();

    const message = await waitFor(() => {
      const list = chat.activeMessages.filter(item => item.role === 'assistant');
      return list.length > beforeAssistants ? list[list.length - 1] : null;
    }, 30000);
    if (!message) throw new Error('assistant response timeout');
    await waitForIdle();
    await sleep(120);
    const current = chat.activeMessages.find(item => item.id === message.id);
    if (!current?.editorBatch) throw new Error('assistant performance batch missing');
    const expectedCommandCount = current.editorBatch.commands.length;
    if (expectedCommandCount !== 4) {
      result.findings.push('unexpected-performance-command-count: ' + expectedCommandCount);
    }
    if (current.editorBatch.commands.length !== expectedCommandCount) throw new Error('expected ' + expectedCommandCount + ' commands, got ' + current.editorBatch.commands.length);

    const messageNodes = [...document.querySelectorAll('#messages-list .chat-message')];
    const messageIndex = chat.activeMessages.findIndex(item => item.id === current.id);
    const messageNode = messageNodes[messageIndex];
    if (!messageNode) throw new Error('performance message node unavailable');
    const targetButton = [...messageNode.querySelectorAll('.chat-edit-command .msg-btn')]
      .find(item => item.textContent.includes('预览修改'));
    if (!targetButton) throw new Error('performance preview button missing');

    const beforeOpen = await requestFrame();
    targetButton.click();
    const apply = await waitFor(() => {
      const button = document.getElementById('btn-diff-apply');
      return button && button.offsetParent !== null ? button : null;
    }, 20000);
    if (!apply) throw new Error('performance diff modal did not open');
    const firstPaint = await requestFrame();
    const previewFirstRenderMs = firstPaint - beforeOpen;

    const switchButtons = [...document.querySelectorAll('#diff-batch-items .batch-item')]
      .filter(item => !item.classList.contains('batch-item-locate'));
    if (switchButtons.length !== expectedCommandCount) throw new Error('expected ' + expectedCommandCount + ' batch UI items, got ' + switchButtons.length);
    const commandSwitchSamples = [];
    for (let index = 0; index < 3; index++) {
      const started = await requestFrame();
      switchButtons[index].click();
      commandSwitchSamples.push((await requestFrame()) - started);
      await sleep(60);
      switchButtons[index].click();
      await sleep(30);
    }

    const beforeApply = await requestFrame();
    apply.click();
    const applied = await waitFor(() => (editor.tabs.find(item => item.id === tabId)?.content || '') !== content, 30000);
    const afterApply = await requestFrame();
    if (!applied) throw new Error('performance batch was not applied');
    const batchApplyMs = afterApply - beforeApply;
    const appliedContent = editor.tabs.find(item => item.id === tabId).content || '';
    const sourceExpectations = [];
    for (let index = 1; index <= 9; index++) sourceExpectations.push(`性能标记第${index}段`);

    const readToolCountBefore = toolTimings.length;
    const readToolTiming = toolTimings[readToolCountBefore - 1];
    if (readToolTiming === undefined) throw new Error('read tool timing missing');

    const beforeUndo = await requestFrame();
    document.getElementById('btn-undo').click();
    const undone = await waitFor(() => (editor.tabs.find(item => item.id === tabId)?.content || '') === content, 30000);
    const afterUndo = await requestFrame();
    const batchUndoMs = afterUndo - beforeUndo;
    if (!undone) throw new Error('editor toolbar undo did not restore the batch original');

    observer.disconnect();
    const uiLongTasks = longTasks.filter(task => task.startTime >= beforeOpen);
    const run = {
      runIndex,
      documentChars: content.length,
      commandCount: expectedCommandCount,
      readToolCount: readToolCountBefore,
      readToolTimingsMs: [readToolTiming],
      previewFirstRenderMs: Math.round(previewFirstRenderMs),
      commandSwitchMs: commandSwitchSamples.map(value => Math.round(value)),
      batchApplyMs: Math.round(batchApplyMs),
      batchUndoMs: Math.round(batchUndoMs),
      longTasksOver200Ms: uiLongTasks.filter(task => task.duration > 200).length,
      longTasksOver1000Ms: uiLongTasks.filter(task => task.duration > 1000).length,
      longestLongTaskMs: uiLongTasks.length ? Math.max(...uiLongTasks.map(task => task.duration)) : 0,
      appliedMarkerCount: sourceExpectations.filter(text => appliedContent.includes(text + '（已更新）')).length,
      appendMarkerPresent: appliedContent.includes('[性能] 第十条追加内容。'),
      appliedContainsAllChanges: sourceExpectations.every(text => appliedContent.includes(text + '（已更新）'))
        && appliedContent.endsWith('\n[性能] 第十条追加内容。'),
      undoRestoredOriginal: undone
    };
    result.runs.push(run);

    const cancel = document.getElementById('btn-diff-cancel');
    if (cancel && cancel.offsetParent !== null) cancel.click();
    await sleep(120);
    return run;
  }

  try {
    const app = document.querySelector('#app');
    if (!app?.__vue_app__) throw new Error('Vue app unavailable');
    const stores = app.__vue_app__.config.globalProperties.$pinia?._s;
    provider = stores.get('provider');
    project = stores.get('project');
    chat = stores.get('chat');
    editor = stores.get('editor');
    if (!provider || !project || !chat || !editor) throw new Error('stores unavailable');

    originalProviders = JSON.parse(JSON.stringify(provider.providers || []));
    originalGenerate = provider.generateProvider;
    originalVerify = provider.verifyProvider;
    originalDetect = provider.detectProvider;
    originalSession = JSON.parse(JSON.stringify(chat.activeSession || { messages: [] }));
    originalTabs = JSON.parse(JSON.stringify(editor.tabs || []));
    originalActiveTabId = editor.activeTabId;

    const mockProvider = {
      id: 'l3-perf-provider-' + marker,
      name: '等级三性能实测供应商',
      baseUrl: 'http://127.0.0.1:19098/v1',
      apiKey: 'test-key-perf',
      models: ['mock-model'], selectedModel: 'mock-model',
      temperature: 0.2, maxTokens: 2000, purpose: ['generate'],
      streamMode: false, providerType: 'openai-compatible', endpointMode: 'base'
    };
    provider.providers = [...originalProviders, mockProvider];
    provider.generateProvider = mockProvider.id;
    provider.verifyProvider = null;
    provider.detectProvider = null;

    for (let index = 0; index < 3; index++) {
      await measureRun(index);
    }

    const median = key => result.runs.map(run => run[key]).sort((a, b) => a - b)[1];
    const medianCommandSwitch = result.runs.map(run => Math.max(...run.commandSwitchMs)).sort((a, b) => a - b)[1];
    const sortedToolTimings = [...toolTimings].sort((a, b) => a - b);
    const readToolMedianMs = sortedToolTimings[Math.floor(sortedToolTimings.length / 2)] || 0;
    result.summary = {
      documentChars: result.runs[0].documentChars,
      commandCount: result.runs.every(run => run.commandCount === result.runs[0].commandCount)
        ? result.runs[0].commandCount
        : result.runs.map(run => run.commandCount),
      readToolCount: toolTimings.length,
      readToolMedianMs,
      previewFirstRenderMedianMs: median('previewFirstRenderMs'),
      commandSwitchMedianMs: medianCommandSwitch,
      batchApplyMedianMs: median('batchApplyMs'),
      batchUndoMedianMs: median('batchUndoMs'),
      longestLongTaskMedianMs: median('longestLongTaskMs'),
      thresholds: {
        previewFirstRenderMs: 1000,
        commandSwitchMs: 200,
        batchApplyMs: 300,
        batchUndoMs: 300,
        mainThreadLongTaskMs: 200
      }
    };
    result.findings = [];
    if (readToolMedianMs > 100) result.findings.push('read-tool-round-over-100ms');
    if (result.summary.previewFirstRenderMedianMs > 1000) result.findings.push('preview-first-render-over-1000ms');
    if (result.summary.commandSwitchMedianMs > 200) result.findings.push('command-switch-over-200ms');
    if (result.summary.batchApplyMedianMs > 300) result.findings.push('batch-apply-over-300ms');
    if (result.summary.batchUndoMedianMs > 300) result.findings.push('batch-undo-over-300ms');
    if (result.summary.longestLongTaskMedianMs > 200) result.findings.push('main-thread-long-task-over-200ms');
    result.allStepsOk = result.runs.every(run => run.appliedContainsAllChanges === true && run.undoRestoredOriginal === true);
    return result;
  } catch (error) {
    result.runtimeErrors.push(String(error?.stack || error));
    result.allStepsOk = false;
    return result;
  } finally {
    try {
      if (provider) {
        if (originalProviders) provider.providers = JSON.parse(JSON.stringify(originalProviders));
        if (originalGenerate !== null && originalGenerate !== undefined) provider.generateProvider = originalGenerate;
        if (originalVerify !== null && originalVerify !== undefined) provider.verifyProvider = originalVerify;
        if (originalDetect !== null && originalDetect !== undefined) provider.detectProvider = originalDetect;
      }
      if (chat && originalSession) {
        chat.activeSession.messages = JSON.parse(JSON.stringify(originalSession.messages || []));
        chat.activeSession.updatedAt = Date.now();
      }
      if (editor) {
        editor.tabs = JSON.parse(JSON.stringify(originalTabs || []));
        editor.activeTabId = originalActiveTabId;
      }
      const cancel = document.getElementById('btn-diff-cancel');
      if (cancel && cancel.offsetParent !== null) cancel.click();
      if (unsubscribeDiag) unsubscribeDiag();
      await dismissAlerts();
      await sleep(200);
      result.restored = true;
    } catch (error) {
      result.runtimeErrors.push('finally: ' + String(error));
      result.restored = false;
    }
  }
})()
