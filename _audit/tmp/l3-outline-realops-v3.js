(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const stepResults = [];
  const result = { allStepsOk: false, runtimeErrors: [], steps: stepResults };
  let stores = null;
  let originalProviders = null;
  let originalGenerate = null;
  let originalOutline = '';
  let originalLocked = false;
  let originalMessages = null;
  let originalStep0 = null;

  function record(name, ok, evidence) {
    stepResults.push({ name, ok, evidence });
  }

  async function nextDomUpdate() {
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 30)));
  }

  async function waitFor(predicate, timeout = 12000, interval = 100) {
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

  async function openWorkspace() {
    const outlineButton = document.querySelector('#app-sidebar #btn-outline-workspace');
    if (!outlineButton) throw new Error('outline workspace button not found');
    outlineButton.click();
    await waitFor(() => document.getElementById('outline-editor'), 8000);
    const chatToggle = document.getElementById('btn-ai-co-create');
    if (!chatToggle) throw new Error('outline AI toggle not found');
    chatToggle.click();
    const input = await waitFor(() => {
      const item = document.getElementById('ow-chat-input');
      return item && item.offsetParent !== null ? item : null;
    }, 8000);
    if (!input) throw new Error('outline chat input not visible');
    return input;
  }

  async function closeWorkspace() {
    const cancel = document.getElementById('btn-diff-cancel');
    if (cancel && cancel.offsetParent !== null) cancel.click();
    const closeWorkspace = document.getElementById('btn-close-outline-workspace');
    if (closeWorkspace) closeWorkspace.click();
    await sleep(150);
  }

  async function dismissAlerts() {
    for (let i = 0; i < 5; i++) {
      const button = [...document.querySelectorAll('.app-confirm-overlay button')].find(item => item.textContent.trim() === '确定');
      if (!button) break;
      button.click();
      await sleep(80);
    }
  }

  async function requestEdit(input, marker) {
    const project = stores.get('project');
    const assistantCountBefore = (project.outlineChat || [])
      .filter(message => message.role === 'assistant').length;
    const commandCountBefore = document.querySelectorAll('.ow-edit-command').length;
    const sendButton = await waitFor(() => {
      const button = document.getElementById('btn-ow-send');
      return button && !button.disabled && button.offsetParent !== null ? button : null;
    }, 10000);
    if (!sendButton) throw new Error('outline send button unavailable: ' + marker);
    input.value = marker + ' 请更新测试底稿并追加一条内容。';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    sendButton.click();
    const message = await waitFor(() => {
      const assistants = (project.outlineChat || [])
        .filter(item => item.role === 'assistant');
      return assistants.length > assistantCountBefore
        ? assistants[assistants.length - 1]
        : null;
    }, 20000);
    if (!message) throw new Error('outline edit response timeout: ' + marker);
    if ((message.content || '').includes('生成失败')) throw new Error('outline edit request failed: ' + (message.content || ''));
    const command = await waitFor(() => {
      const command = [...document.querySelectorAll('.ow-edit-command')].at(-1);
      return command && document.querySelectorAll('.ow-edit-command').length > commandCountBefore
        ? command
        : null;
    }, 5000);
    if (!command) throw new Error('outline edit command missing: ' + marker);
    const preview = [...command.querySelectorAll('.msg-btn')]
      .find(item => item.textContent.includes('预览修改'));
    if (!preview) throw new Error('outline preview button missing: ' + marker);
    return preview;
  }

  try {
    const app = document.querySelector('#app');
    if (!app?.__vue_app__) throw new Error('Vue app unavailable');
    stores = app.__vue_app__.config.globalProperties.$pinia?._s;
    if (!stores) throw new Error('Pinia stores unavailable');
    const provider = stores.get('provider');
    const project = stores.get('project');
    const pipeline = stores.get('pipeline');
    if (!provider || !project || !pipeline) throw new Error('provider/project/pipeline stores unavailable');

    originalProviders = JSON.parse(JSON.stringify(provider.providers || []));
    originalGenerate = provider.generateProvider;
    originalOutline = project.outlineText || '';
    originalLocked = project.outlineLocked;
    originalMessages = JSON.parse(JSON.stringify(project.outlineChat || []));
    originalStep0 = await pipeline.readStepConfig(0);

    if (project.outlineLocked) project.outlineLocked = false;
    project.outlineText = '测试底稿\n第二行';

    const mockProvider = {
      id: 'l3-outline-mock-' + Date.now(),
      name: '等级三大纲实测供应商',
      baseUrl: 'http://127.0.0.1:19098/v1',
      apiKey: 'test-key',
      models: ['mock-model'],
      selectedModel: 'mock-model',
      temperature: 0.2,
      maxTokens: 2000,
      purpose: ['generate'],
      streamMode: false,
      providerType: 'openai-compatible',
      endpointMode: 'base'
    };
    provider.providers = [...originalProviders, mockProvider];
    provider.generateProvider = mockProvider.id;

    let input = await openWorkspace();
    // Close any modal left from a previous case before generating this one.
    const staleCancel = document.getElementById('btn-diff-cancel');
    if (staleCancel && staleCancel.offsetParent !== null) staleCancel.click();
    await sleep(100);

    // Real user path: remove all workspace skills so askAi uses the plain path.
    while (document.querySelector('#ow-selected-skills .ow-chip-close')) {
      document.querySelector('#ow-selected-skills .ow-chip-close').click();
      await sleep(150);
    }
    const skillsCleared = document.querySelectorAll('#ow-selected-skills .ow-chip-close').length === 0;
    record('workspace-skills-cleared', skillsCleared, {
      originalSkillIds: originalStep0.skillIds,
      currentSkillIds: (await pipeline.readStepConfig(0)).skillIds
    });

    // Case 1: normal batch with partial acceptance.
    let preview = await requestEdit(input, 'L3_OUTLINE_REALOPS_' + Date.now());
    if (!preview) throw new Error('outline batch preview button not found');
    preview.click();
    const apply = await waitFor(() => {
      const button = document.getElementById('btn-diff-apply');
      return button && button.offsetParent !== null ? button : null;
    }, 8000);
    if (!apply) throw new Error('outline diff modal not opened');

    const before = project.outlineText || '';
    const batchItems = [...document.querySelectorAll('#diff-batch-items .batch-item')]
      .filter(item => !item.classList.contains('batch-item-locate'));
    if (batchItems.length !== 2) throw new Error('expected 2 outline batch items, got ' + batchItems.length);
    batchItems[0].click();
    apply.click();
    const changed = await waitFor(() => (project.outlineText || '') !== before, 8000);
    const after = project.outlineText || '';
    record('outline-batch-partial-apply', Boolean(changed), {
      before,
      after,
      batchItems: batchItems.length,
      rejectedFirstItem: true
    });
    if (!changed) throw new Error('outline content not changed');
    if (after.includes('测试底稿（已更新）')) throw new Error('rejected first batch item was applied');
    if (!after.includes('[测试] 第二条插入内容。')) throw new Error('accepted second batch item missing');

    // Case 2: locked outline must reject the whole batch.
    project.outlineText = before;
    project.outlineLocked = true;
    const lockedButton = await waitFor(() => {
      const item = document.getElementById('btn-ow-send');
      return item && item.offsetParent !== null ? item : null;
    }, 5000);
    if (!lockedButton) throw new Error('outline send unavailable for locked case');
    preview = await requestEdit(input, 'L3_OUTLINE_LOCK_' + Date.now());
    if (!preview) throw new Error('locked outline preview button not found');
    preview.click();
    await waitFor(() => {
      const button = document.getElementById('btn-diff-apply');
      return button && button.offsetParent !== null ? button : null;
    }, 8000);
    document.getElementById('btn-diff-apply').click();
    await sleep(400);
    await dismissAlerts();
    const lockedRejected = project.outlineText === before;
    record('outline-locked-reject', lockedRejected, {
      outline: project.outlineText,
      locked: project.outlineLocked
    });
    project.outlineLocked = false;

    // Case 3: changed target must reject the whole batch. Reuse the latest
    // assistant batch and simulate a user edit after it was generated.
    project.outlineText = before;
    const sourceBatchMessage = (project.outlineChat || [])
      .filter(message => message.role === 'assistant' && message.outlineBatch)
      .at(-1) || {};
    if (!sourceBatchMessage.outlineBatchTarget) throw new Error('source batch message missing outlineBatchTarget');
    const sourceBatchTarget = sourceBatchMessage.outlineBatchTarget;
    project.appendOutlineChat({
      role: 'assistant',
      content: '目标变更验证：已生成 2 条编辑建议。',
      outlineBatch: JSON.parse(JSON.stringify(sourceBatchMessage.outlineBatch || {
        type: 'editor_edit_batch',
        version: 1,
        commands: [
          { operation: 'replace_match', target: '测试底稿', content: '测试底稿（已更新）' },
          { operation: 'append', content: '\n[测试] 第二条插入内容。' }
        ]
      })),
      outlineBatchTarget: JSON.parse(JSON.stringify(sourceBatchTarget))
    });
    await nextDomUpdate();
    project.outlineText = before + '\n用户手动修改';
    const changedPreview = [...document.querySelectorAll('#outline-workspace .ow-edit-command .msg-btn')]
      .at(-1);
    if (!changedPreview) throw new Error('changed target preview button not found');
    changedPreview.click();
    const applyChanged = await waitFor(() => {
      const button = document.getElementById('btn-diff-apply');
      return button && button.offsetParent !== null ? button : null;
    }, 8000);
    if (!applyChanged) throw new Error('changed target diff modal not opened');
    const changedBefore = project.outlineText;
    applyChanged.click();
    await sleep(300);
    await dismissAlerts();
    const targetRejected = project.outlineText === changedBefore;
    record('outline-target-changed-reject', targetRejected, {
      before: changedBefore,
      after: project.outlineText
    });

    result.allStepsOk = stepResults.every(step => step.ok);
    return result;
  } catch (error) {
    result.runtimeErrors.push(String(error?.stack || error));
    result.allStepsOk = false;
    return result;
  } finally {
    try {
      if (stores) {
        const provider = stores.get('provider');
        const project = stores.get('project');
        const pipeline = stores.get('pipeline');
        if (provider && originalProviders) {
          provider.providers = JSON.parse(JSON.stringify(originalProviders));
          provider.generateProvider = originalGenerate;
        }
        if (project) {
          project.outlineText = originalOutline;
          project.outlineLocked = originalLocked;
          project.outlineChat = JSON.parse(JSON.stringify(originalMessages || []));
        }
        if (pipeline && originalStep0) {
          await pipeline.updateStepConfig(0, {
            agentId: originalStep0.agentId,
            skillIds: originalStep0.skillIds,
            mode: originalStep0.mode
          });
        }
      }
      await dismissAlerts();
      await closeWorkspace();
      await sleep(200);
      result.restored = true;
    } catch (error) {
      result.runtimeErrors.push('finally: ' + String(error));
      result.restored = false;
    }
  }
})()
