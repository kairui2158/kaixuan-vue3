(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = { runtimeErrors: [], steps: [] };
  let provider = null;
  let chat = null;
  let editor = null;
  let conversation = null;
  let originalProviders = null;
  let originalGenerate = null;
  let originalSession = null;
  let originalTabs = null;
  let originalActiveTabId = null;

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

  async function dismissAlerts() {
    for (let i = 0; i < 5; i++) {
      const button = [...document.querySelectorAll('.app-confirm-overlay button')]
        .find(item => item.textContent.trim() === '确定');
      if (!button) break;
      button.click();
      await sleep(80);
    }
  }

  function captureDiagnostics() {
    const lastAssistant = [...(chat?.activeMessages || [])].reverse().find(item => item.role === 'assistant');
    return {
      activeTabId: editor?.activeTabId,
      activeTabContent: editor?.activeTab?.content,
      messageCount: chat?.activeMessages?.length || 0,
      lastAssistant: lastAssistant ? {
        content: lastAssistant.content,
        hasEditorBatch: Boolean(lastAssistant.editorBatch),
        commandCount: lastAssistant.editorBatch?.commands?.length || 0,
        hasEditorBatchTarget: Boolean(lastAssistant.editorBatchTarget),
        hasEditorBatchRecord: Boolean(lastAssistant.editorBatchRecord),
        hasEditorToolPlan: Boolean(lastAssistant.editorToolPlan)
      } : null,
      diffApplyVisible: (() => {
        const button = document.getElementById('btn-diff-apply');
        return Boolean(button && button.offsetParent !== null);
      })(),
      diffBatchItems: document.querySelectorAll('#diff-batch-items .batch-item').length,
      editCommandCount: document.querySelectorAll('.chat-edit-command').length,
      bodyTail: document.body.innerText.slice(-600)
    };
  }

  try {
    const app = document.querySelector('#app');
    if (!app?.__vue_app__) throw new Error('Vue app unavailable');
    const stores = app.__vue_app__.config.globalProperties.$pinia?._s;
    provider = stores.get('provider');
    chat = stores.get('chat');
    editor = stores.get('editor');
    const project = stores.get('project');
    if (!provider || !chat || !editor || !project) throw new Error('stores unavailable');

    originalProviders = JSON.parse(JSON.stringify(provider.providers || []));
    originalGenerate = provider.generateProvider;
    originalSession = JSON.parse(JSON.stringify(chat.activeSession || { messages: [] }));
    originalTabs = JSON.parse(JSON.stringify(editor.tabs || []));
    originalActiveTabId = editor.activeTabId;
    const projectId = project.currentProjectId || 'default';

    editor.tabs = [{
      id: 'l3-main-rollback-v1',
      title: '等级三回滚实测',
      content: '主编辑底稿\n第二行',
      chapterId: '',
      isDirty: false,
      mode: 'normal'
    }];
    editor.activeTabId = 'l3-main-rollback-v1';
    await sleep(150);

    const mockProvider = {
      id: 'l3-main-rollback-v1-' + Date.now(),
      name: '等级三回滚供应商',
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

    const input = document.getElementById('user-input');
    if (!input || input.offsetParent === null) throw new Error('main chat input unavailable');
    input.value = 'L3_MAIN_ROLLBACK_CONTEXT_' + Date.now();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-send').click();

    const ready = await waitFor(() => {
      const previewItems = [...document.querySelectorAll('#diff-batch-items .batch-item')]
        .filter(item => !item.classList.contains('batch-item-locate')).length;
      return previewItems === 2 ? previewItems : null;
    }, 30000);
    if (!ready) {
      result.diagnostics = captureDiagnostics();
      throw new Error('batch preview timeout');
    }

    const before = editor.activeTab?.content || '';
    document.getElementById('btn-diff-apply').click();
    const applied = await waitFor(() => (editor.activeTab?.content || '') !== before, 8000);
    const afterApply = editor.activeTab?.content || '';
    result.steps.push({
      name: 'batch-applied',
      ok: Boolean(applied) && afterApply.includes('[测试] 第二条插入内容。'),
      before,
      afterApply
    });

    const contextService = globalThis.__conversationContextService;
    if (!contextService?.buildContextBundle) throw new Error('conversation context service unavailable');
    const bundle = await contextService.buildContextBundle({
      projectId,
      workspace: 'main',
      purpose: 'generate'
    });
    const appliedEvent = bundle.session.recentMessages
      .find(message => message.content === '[AI 编辑] 已应用 AI 编辑批次');
    result.steps.push({
      name: 'applied-context-event',
      ok: Boolean(appliedEvent?.meta?.batchId),
      meta: appliedEvent?.meta
    });

    const rollback = await waitFor(() => {
      const button = [...document.querySelectorAll('.chat-edit-command .msg-btn')]
        .find(item => item.textContent.includes('回滚此批次'));
      return button && button.offsetParent !== null ? button : null;
    }, 8000);
    if (!rollback) throw new Error('rollback button unavailable');
    rollback.click();
    const restored = await waitFor(() => (editor.activeTab?.content || '') === before, 8000);
    result.steps.push({
      name: 'batch-rolled-back',
      ok: Boolean(restored) && (editor.activeTab?.content || '') === before,
      afterRollback: editor.activeTab?.content || ''
    });

    const rolledBundle = await contextService.buildContextBundle({
      projectId,
      workspace: 'main',
      purpose: 'generate'
    });
    const rolledEvent = rolledBundle.session.recentMessages
      .find(message => message.content?.startsWith('[AI 编辑] 已回滚 AI 编辑批次'));
    result.steps.push({
      name: 'rollback-context-event',
      ok: rolledEvent?.meta?.batchId === appliedEvent?.meta?.batchId,
      appliedBatchId: appliedEvent?.meta?.batchId,
      rollbackBatchId: rolledEvent?.meta?.batchId
    });

    result.allStepsOk = result.steps.every(step => step.ok);
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
      await dismissAlerts();
      await sleep(200);
      result.restored = true;
    } catch (error) {
      result.runtimeErrors.push('finally: ' + String(error));
      result.restored = false;
    }
  }
})()
