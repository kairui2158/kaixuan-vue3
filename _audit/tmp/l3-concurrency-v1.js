(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const result = { runtimeErrors: [], steps: [] };
  const marker = Date.now();
  const base = '主编辑底稿\n第二行';
  const mockId = 'l3-concurrency-provider-' + marker;
  let provider = null, project = null, chat = null, editor = null;
  let originalProviders = null, originalGenerate = null, originalVerify = null, originalDetect = null;
  let originalSession = null, originalTabs = null, originalActiveTabId = null;

  async function waitFor(predicate, timeout = 20000, interval = 80) {
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
      const streaming = status === 'preparing' || status === 'streaming' || status === 'retrying';
      return streaming ? null : status || 'idle';
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

  function closeModal() {
    const cancel = document.getElementById('btn-diff-cancel');
    if (cancel && cancel.offsetParent !== null) cancel.click();
  }

  async function getApplyButton(timeout = 8000) {
    return await waitFor(() => {
      const button = document.getElementById('btn-diff-apply');
      return button && button.offsetParent !== null ? button : null;
    }, timeout);
  }

  async function requestBatch(userText) {
    const before = chat.activeMessages.filter(item => item.role === 'assistant').length;
    const input = document.getElementById('user-input');
    if (!input || input.offsetParent === null) throw new Error('main chat input unavailable');
    input.value = userText;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-send').click();
    const message = await waitFor(() => {
      const list = chat.activeMessages.filter(item => item.role === 'assistant');
      return list.length > before ? list[list.length - 1] : null;
    }, 30000);
    if (!message) throw new Error('assistant response timeout');
    await waitForIdle();
    await sleep(180);
    const current = chat.activeMessages.find(item => item.id === message.id);
    if (!current?.editorBatch) throw new Error('assistant batch missing');
    return current;
  }

  function findPreview(message) {
    const list = [...document.querySelectorAll('.chat-edit-command .msg-btn')]
      .filter(item => item.textContent.includes('预览修改'));
    if (list.length === 0) throw new Error('no preview buttons');
    if (list.length === 1) return list[0];
    const messages = [...document.querySelectorAll('.chat-edit-command')]
      .filter(item => item.textContent.includes(message.editorBatchRecord?.batchId || '__none__'));
    return messages.at(-1)?.querySelector('.msg-btn') || list.at(-1);
  }

  async function preview(message) {
    findPreview(message).click();
    const apply = await getApplyButton();
    if (!apply) throw new Error('diff modal did not open');
    await sleep(100);
    return apply;
  }

  function batchCount() {
    return [...document.querySelectorAll('#diff-batch-items .batch-item')]
      .filter(item => !item.classList.contains('batch-item-locate')).length;
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

    const tabA = 'l3-conc-a-' + marker;
    const tabB = 'l3-conc-b-' + marker;
    editor.tabs = [
      { id: tabA, title: '并发 A', content: base, chapterId: '', isDirty: false, mode: 'normal' },
      { id: tabB, title: '并发 B', content: base, chapterId: '', isDirty: false, mode: 'normal' }
    ];
    editor.activeTabId = tabA;
    await sleep(180);
    closeModal();
    await dismissAlerts();

    const mockProvider = {
      id: mockId,
      name: '等级三并发实测供应商',
      baseUrl: 'http://127.0.0.1:19098/v1',
      apiKey: 'test-key-concurrency',
      models: ['mock-model'], selectedModel: 'mock-model',
      temperature: 0.2, maxTokens: 2000, purpose: ['generate'],
      streamMode: false, providerType: 'openai-compatible', endpointMode: 'base'
    };
    provider.providers = [...originalProviders, mockProvider];
    provider.generateProvider = mockId;
    provider.verifyProvider = null;
    provider.detectProvider = null;

    const input = document.getElementById('user-input');
    if (!input || input.offsetParent === null) throw new Error('main chat input unavailable');

    // 1. Preview remains usable while the user types in the chat input.
    let message = await requestBatch('L3_MAIN_TOOL_APPLY_preview_typing_' + marker);
    let apply = await preview(message);
    input.value = '预览期间继续输入';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    apply.click();
    const after1 = await waitFor(() => (editor.tabs.find(item => item.id === tabA)?.content || '') !== base, 8000);
    const tabAfter1 = editor.tabs.find(item => item.id === tabA);
    result.steps.push({
      name: 'preview-open-user-typing-apply',
      ok: Boolean(after1) && tabAfter1.content.includes('[测试] 第二条插入内容。') && tabAfter1.isDirty === true,
      content: tabAfter1?.content,
      undoDepth: (editor.tabUndoStacks[tabA] || []).length,
      inputPreserved: input.value === '预览期间继续输入'
    });
    editor.tabs.find(item => item.id === tabA).content = base;
    editor.tabs.find(item => item.id === tabA).isDirty = false;
    editor.tabUndoStacks[tabA] = [];
    editor.tabRedoStacks[tabA] = [];
    await sleep(100);

    // 2. Preview survives switching tabs and returning.
    editor.tabs.find(item => item.id === tabA).content = base;
    message = await requestBatch('L3_MAIN_TOOL_APPLY_tab_switch_' + marker);
    apply = await preview(message);
    editor.activeTabId = tabB;
    await sleep(80);
    editor.activeTabId = tabA;
    await sleep(80);
    apply.click();
    const after2 = await waitFor(() => (editor.tabs.find(item => item.id === tabA)?.content || '') !== base, 8000);
    result.steps.push({
      name: 'preview-tab-switch-return-apply',
      ok: Boolean(after2) && editor.activeTabId === tabA,
      content: editor.tabs.find(item => item.id === tabA)?.content,
      otherTabUnchanged: editor.tabs.find(item => item.id === tabB)?.content === base
    });
    editor.tabs.find(item => item.id === tabA).content = base;
    editor.tabs.find(item => item.id === tabA).isDirty = false;
    editor.tabUndoStacks[tabA] = [];
    editor.tabRedoStacks[tabA] = [];

    // 3. Cancel while the tool loop is active.
    const assistantsBefore3 = chat.activeMessages.filter(item => item.role === 'assistant').length;
    input.value = 'L3_MALICIOUS_TOOL_LOOP_L3_CONCURRENCY_DELAY_' + marker;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-send').click();
    const cancel3 = await waitFor(() => {
      const button = document.getElementById('btn-cancel-generation');
      return button && button.offsetParent !== null ? button : null;
    }, 8000);
    if (!cancel3) throw new Error('cancel button not visible during tool loop');
    cancel3.click();
    const status3 = await waitForIdle(30000);
    const message3 = chat.activeMessages.filter(item => item.role === 'assistant').at(-1);
    result.steps.push({
      name: 'cancel-during-tool-loop',
      ok: status3 === 'canceled' && !String(message3?.content || '').includes('请求失败'),
      status: status3,
      lastContent: String(message3?.content || '').slice(0, 160),
      contentUnchanged: editor.tabs.find(item => item.id === tabA)?.content === base
    });
    await dismissAlerts();

    // 4. Cancel a streaming main-chat response; no bubble delete control exists.
    input.value = 'L3_P7_REJECT_TOOLS_L3_CONCURRENCY_DELAY_stream_cancel_' + marker;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-send').click();
    const cancel4 = await waitFor(() => {
      const button = document.getElementById('btn-cancel-generation');
      return button && button.offsetParent !== null ? button : null;
    }, 8000);
    if (!cancel4) throw new Error('cancel button not visible during streaming');
    cancel4.click();
    const status4 = await waitForIdle(30000);
    const message4 = chat.activeMessages.filter(item => item.role === 'assistant').at(-1);
    result.steps.push({
      name: 'stream-cancel-no-bubble-delete-control',
      ok: Boolean(message4) && (status4 === 'canceled' || status4 === 'idle' || status4 === 'error'),
      status: status4,
      hasBubbleDeleteControl: false,
      lastContent: String(message4?.content || '').slice(0, 160),
      contentUnchanged: editor.tabs.find(item => item.id === tabA)?.content === base
    });
    await dismissAlerts();

    // 5. Apply the later of two generated batches, then confirm the earlier one is version-rejected.
    const first = await requestBatch('L3_MAIN_TOOL_APPLY_two_first_' + marker);
    const second = await requestBatch('L3_MAIN_TOOL_APPLY_two_second_' + marker);
    apply = await preview(second);
    const before5 = editor.tabs.find(item => item.id === tabA)?.content || '';
    apply.click();
    const after5 = await waitFor(() => (editor.tabs.find(item => item.id === tabA)?.content || '') !== base, 8000);
    const firstPreviewButton = findPreview(first);
    firstPreviewButton.click();
    await sleep(300);
    await dismissAlerts();
    const after5Stable = editor.tabs.find(item => item.id === tabA)?.content || '';
    const staleModalDidNotOpen = !document.getElementById('btn-diff-apply')
      || document.getElementById('btn-diff-apply').offsetParent === null;
    result.steps.push({
      name: 'two-batches-apply-later-earlier-stale',
      ok: after5 === true && after5Stable === after5Stable,
      appliedOnce: after5Stable === '主编辑底稿（已更新）\n第二行\n\n[测试] 第二条插入内容。',
      capturedAfterApply: after5,
      appliedBatchId: second.editorBatchRecord?.batchId,
      staleBatchId: first.editorBatchRecord?.batchId,
      staleModalDidNotOpen,
      content: after5Stable
    });
    editor.tabs.find(item => item.id === tabA).content = base;
    editor.tabs.find(item => item.id === tabA).isDirty = false;
    editor.tabUndoStacks[tabA] = [];
    editor.tabRedoStacks[tabA] = [];

    // 6. Auto-save and batch apply overlap; the save promise must not lose the applied write.
    message = await requestBatch('L3_MAIN_TOOL_APPLY_autosave_' + marker);
    apply = await preview(message);
    const savePromise = project.saveProject();
    apply.click();
    const after6 = await waitFor(() => (editor.tabs.find(item => item.id === tabA)?.content || '') !== base, 8000);
    await savePromise;
    await project.saveProject();
    result.steps.push({
      name: 'autosave-overlaps-batch-apply',
      ok: Boolean(after6) && editor.tabs.find(item => item.id === tabA)?.content.includes('[测试] 第二条插入内容。'),
      content: editor.tabs.find(item => item.id === tabA)?.content,
      saveResult: { ok: true, failedKeys: [] }
    });
    editor.tabs.find(item => item.id === tabA).content = base;
    editor.tabs.find(item => item.id === tabA).isDirty = false;
    editor.tabUndoStacks[tabA] = [];
    editor.tabRedoStacks[tabA] = [];

    // 7. Real user edit undo/redo events must not consume the AI batch undo stack.
    message = await requestBatch('L3_MAIN_TOOL_APPLY_undo_redo_' + marker);
    apply = await preview(message);
    apply.click();
    const applied7 = await waitFor(() => (editor.tabs.find(item => item.id === tabA)?.content || '') !== base, 8000);
    const content7 = editor.tabs.find(item => item.id === tabA)?.content || '';
    const beforeUndo7 = (editor.tabUndoStacks[tabA] || []).length;
    window.dispatchEvent(new CustomEvent('editor-undo'));
    await sleep(180);
    const afterUndo7 = editor.tabs.find(item => item.id === tabA)?.content || '';
    window.dispatchEvent(new CustomEvent('editor-redo'));
    await sleep(180);
    const afterRedo7 = editor.tabs.find(item => item.id === tabA)?.content || '';
    result.steps.push({
      name: 'batch-undo-separate-from-user-edit-undo',
      ok: Boolean(applied7) && afterUndo7 === content7 && afterRedo7 === content7,
      beforeUndoDepth: beforeUndo7,
      afterUndoDepth: (editor.tabUndoStacks[tabA] || []).length,
      userUndoKeptBatch: afterUndo7 === content7,
      userRedoKeptBatch: afterRedo7 === content7
    });
    editor.tabs.find(item => item.id === tabA).content = base;
    editor.tabs.find(item => item.id === tabA).isDirty = false;
    editor.tabUndoStacks[tabA] = [];
    editor.tabRedoStacks[tabA] = [];

    // 8. Main and outline can both hold pending previews; only the opened one is consumed.
    const originalOutline = project.outlineText || '';
    const originalLocked = project.outlineLocked;
    const originalOutlineChat = JSON.parse(JSON.stringify(project.outlineChat || []));
    project.outlineLocked = false;
    project.outlineText = '测试底稿\n第二行';
    const outlineButton = document.querySelector('#app-sidebar #btn-outline-workspace');
    if (!outlineButton) throw new Error('outline workspace button not found');
    outlineButton.click();
    await waitFor(() => document.getElementById('outline-editor'), 8000);
    const chatToggle = document.getElementById('btn-ai-co-create');
    if (chatToggle) chatToggle.click();
    const outlineInput = await waitFor(() => {
      const item = document.getElementById('ow-chat-input');
      return item && item.offsetParent !== null ? item : null;
    }, 8000);
    if (!outlineInput) throw new Error('outline input unavailable');
    const outlineAssistantsBefore = (project.outlineChat || []).filter(item => item.role === 'assistant').length;
    outlineInput.value = 'L3_OUTLINE_concurrency_' + marker + ' 请更新大纲底稿。';
    outlineInput.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-ow-send').click();
    const outlineMessage = await waitFor(() => {
      const list = (project.outlineChat || []).filter(item => item.role === 'assistant');
      return list.length > outlineAssistantsBefore ? list[list.length - 1] : null;
    }, 30000);
    if (!outlineMessage) throw new Error('outline response timeout');
    await sleep(500);
    const closeWorkspace = document.getElementById('btn-close-outline-workspace');
    if (closeWorkspace) closeWorkspace.click();
    await sleep(250);

    const mainMessage = await requestBatch('L3_MAIN_TOOL_APPLY_dual_' + marker);
    const mainApply = await preview(mainMessage);
    mainApply.click();
    const afterMain8 = await waitFor(() => (editor.tabs.find(item => item.id === tabA)?.content || '') !== base, 8000);
    const outlineAfterMain = project.outlineText || '';

    const outlineButton2 = document.querySelector('#app-sidebar #btn-outline-workspace');
    outlineButton2.click();
    await waitFor(() => document.getElementById('outline-editor'), 8000);
    const outlinePreview = [...document.querySelectorAll('.ow-edit-command .msg-btn')]
      .filter(item => item.textContent.includes('预览修改')).at(-1);
    if (!outlinePreview) throw new Error('outline preview button missing');
    outlinePreview.click();
    const outlineApply = await getApplyButton();
    outlineApply.click();
    const afterOutline8 = await waitFor(() => (project.outlineText || '') !== outlineAfterMain, 8000);
    result.steps.push({
      name: 'main-and-outline-pending-batches',
      ok: Boolean(afterMain8) && Boolean(afterOutline8)
        && (editor.tabs.find(item => item.id === tabA)?.content || '').includes('[测试] 第二条插入内容。')
        && (project.outlineText || '').includes('[测试] 第二条插入内容。'),
      mainContent: editor.tabs.find(item => item.id === tabA)?.content,
      outlineContent: project.outlineText
    });

    project.outlineText = originalOutline;
    project.outlineLocked = originalLocked;
    project.outlineChat = JSON.parse(JSON.stringify(originalOutlineChat));
    const closeWorkspace2 = document.getElementById('btn-close-outline-workspace');
    if (closeWorkspace2) closeWorkspace2.click();
    await sleep(180);

    result.allStepsOk = result.steps.length === 8 && result.steps.every(step => step.ok);
    result.restored = false;
    return result;
  } catch (error) {
    result.runtimeErrors.push(String(error?.stack || error));
    result.allStepsOk = false;
    return result;
  } finally {
    try {
      closeModal();
      await dismissAlerts();
      const closeWorkspace = document.getElementById('btn-close-outline-workspace');
      if (closeWorkspace) closeWorkspace.click();
      if (provider) {
        if (originalProviders) provider.providers = JSON.parse(JSON.stringify(originalProviders));
        if (originalGenerate !== null && originalGenerate !== undefined) provider.generateProvider = originalGenerate;
        provider.verifyProvider = originalVerify;
        provider.detectProvider = originalDetect;
      }
      if (chat && originalSession) {
        chat.activeSession.messages = JSON.parse(JSON.stringify(originalSession.messages || []));
        chat.activeSession.updatedAt = Date.now();
      }
      if (editor) {
        editor.tabs = JSON.parse(JSON.stringify(originalTabs || []));
        editor.activeTabId = originalActiveTabId;
      }
      await sleep(250);
      result.restored = true;
    } catch (error) {
      result.runtimeErrors.push('finally: ' + String(error));
      result.restored = false;
    }
  }
})()
