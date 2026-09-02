(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = { runtimeErrors: [], steps: [] };
  const runStartedAt = Date.now();
  let provider = null, chat = null, editor = null;
  let originalProviders = null, originalGenerate = null, originalSession = null;
  let originalTabs = null, originalActiveTabId = null;

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

  function matchingLogs(entries, cat, batchId) {
    return entries.filter(entry => entry.cat === cat && (!batchId || entry.batchId === batchId));
  }

  function chatStoreIdle(chatStore) {
    return chatStore.generationStatus === 'idle' || chatStore.generationStatus === 'error';
  }

  try {
    const app = document.querySelector('#app');
    if (!app?.__vue_app__) throw new Error('Vue app unavailable');
    const stores = app.__vue_app__.config.globalProperties.$pinia?._s;
    provider = stores.get('provider');
    chat = stores.get('chat');
    editor = stores.get('editor');
    if (!provider || !chat || !editor) throw new Error('stores unavailable');

    originalProviders = JSON.parse(JSON.stringify(provider.providers || []));
    originalGenerate = provider.generateProvider;
    originalSession = JSON.parse(JSON.stringify(chat.activeSession || { messages: [] }));
    originalTabs = JSON.parse(JSON.stringify(editor.tabs || []));
    originalActiveTabId = editor.activeTabId;

    editor.tabs = [{
      id: 'l3-p7-diagnostics',
      title: 'P7 诊断实测',
      content: '主编辑底稿\n第二行',
      chapterId: '',
      isDirty: false,
      mode: 'normal'
    }];
    editor.activeTabId = 'l3-p7-diagnostics';
    await sleep(150);

    const diagnosticProviderId = 'l3-p7-diagnostics-' + Date.now();
    const mockProvider = {
      id: diagnosticProviderId,
      name: 'P7 诊断供应商',
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
    input.value = 'L3_P7_DIAGNOSTICS_' + Date.now();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-send').click();
    await waitFor(() => chatStoreIdle(chat), 30000);

    const ready = await waitFor(() => {
      const previewItems = [...document.querySelectorAll('#diff-batch-items .batch-item')]
        .filter(item => !item.classList.contains('batch-item-locate')).length;
      return previewItems === 2 ? previewItems : null;
    }, 30000);
    if (!ready) throw new Error('batch preview timeout');

    const before = editor.activeTab?.content || '';
    document.getElementById('btn-diff-apply').click();
    const applied = await waitFor(() => (editor.activeTab?.content || '') !== before, 8000);
    const afterApply = editor.activeTab?.content || '';
    const appliedMessage = [...(chat.activeMessages || [])].reverse()
      .find(message => message.role === 'assistant' && message.editorBatchRecord?.status === 'applied');
    const batchId = appliedMessage?.editorBatchRecord?.batchId;

    const logSnapshotAt = Date.now();
    const entries = await waitFor(async () => {
      const all = await window.electronAPI.diagRead('');
      const batchEntries = matchingLogs(all || [], 'ai-service/editor-batch', batchId);
      const toolEntries = matchingLogs(all || [], 'ai-service/tool-call')
        .filter(entry => (entry.tsMs || 0) >= runStartedAt - 1000);
      return batchEntries.length > 0 && toolEntries.length > 0 ? { all, batchEntries, toolEntries } : null;
    }, 8000);
    if (!entries) throw new Error('diagnostic entries timeout');

    const appliedBatchEntries = entries.batchEntries.filter(entry => entry.detail?.includes('"result":"applied"'));
    result.steps.push({
      name: 'tool-call-restorable',
      ok: entries.toolEntries.length > 0
        && entries.toolEntries.every(entry => entry.toolCapability === 'native_tools')
        && entries.toolEntries.some(entry => entry.toolName === 'editor.propose_edits')
        && entries.toolEntries.every(entry => (entry.tsMs || 0) >= logSnapshotAt - 1000),
      count: entries.toolEntries.length,
      sample: entries.toolEntries.slice(-1).map(entry => ({
        cat: entry.cat,
        toolName: entry.toolName,
        toolCapability: entry.toolCapability,
        purpose: entry.purpose,
        providerId: entry.providerId,
        model: entry.model
      }))
    });

    result.steps.push({
      name: 'editor-batch-category',
      ok: entries.batchEntries.length > 0
        && entries.batchEntries.every(entry => entry.cat === 'ai-service/editor-batch')
        && appliedBatchEntries.length > 0,
      count: entries.batchEntries.length,
      sample: appliedBatchEntries.slice(-1).map(entry => ({
        cat: entry.cat,
        batchId: entry.batchId,
        level: entry.level,
        purpose: entry.purpose,
        detail: entry.detail
      }))
    });

    result.steps.push({
      name: 'batch-id-links-preview-apply',
      ok: Boolean(applied)
        && afterApply.includes('[测试] 第二条插入内容。')
        && entries.batchEntries.some(entry => entry.batchId === batchId),
      batchId,
      afterApply
    });

    // V3：走真实 ChatPanel 请求，用 mock 的 400 tools rejection 触发服务层自动降级。
    input.value = 'L3_P7_REJECT_TOOLS_' + Date.now();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-send').click();
    await waitFor(() => chatStoreIdle(chat), 30000);

    const compatibilityNotice = await waitFor(() => {
      const notice = document.getElementById('chat-compatibility-notice');
      return notice && notice.offsetParent !== null && notice.textContent.includes('JSON 兼容模式')
        ? notice.textContent
        : null;
    }, 30000);
    void compatibilityNotice;
    const compatiblePreviewItems = await waitFor(() => {
      const items = [...document.querySelectorAll('#diff-batch-items .batch-item')]
        .filter(item => !item.classList.contains('batch-item-locate')).length;
      return items === 2 ? items : null;
    }, 12000);
    const compatibleMessages = [...(chat.activeMessages || [])];
    const compatibleMessage = [...compatibleMessages].reverse()
      .find(message => message.role === 'assistant' && message.editorBatchRecord);
    const compatibleBatchId = compatibleMessage?.editorBatchRecord?.batchId;
    const compatibleEntries = await waitFor(async () => {
      const all = await window.electronAPI.diagRead('');
      const entries = (all || []).filter(entry => entry.cat === 'ai-service/tool-capability'
        && entry.toolCapability === 'json_protocol'
        && entry.downgradeReason === 'http_400'
        && entry.providerId === diagnosticProviderId);
      return entries.length > 0 ? entries : null;
    }, 8000);

    result.steps.push({
      name: 'downgrade-reason-visible',
      ok: (compatibleEntries || []).length > 0
        && compatibleEntries.every(entry => Boolean(entry.downgradeReason))
        && compatibleEntries.some(entry => entry.downgradeReason === 'provider_not_supported'
          || entry.downgradeReason === 'http_400'),
      count: (compatibleEntries || []).length,
      sample: (compatibleEntries || []).slice(-2).map(entry => ({
        cat: entry.cat,
        toolCapability: entry.toolCapability,
        providerId: entry.providerId,
        downgradeReason: entry.downgradeReason
      }))
    });

    result.steps.push({
      name: 'compatible-mode-json-protocol',
      ok: Boolean(compatibilityNotice)
        && compatiblePreviewItems === 2
        && Boolean(compatibleMessage?.editorBatchRecord)
        && Boolean(compatibleBatchId)
        && (compatibleEntries || []).length > 0,
      notice: compatibilityNotice || null,
      previewItems: compatiblePreviewItems,
      batchId: compatibleBatchId || null,
      downgradeEntries: (compatibleEntries || []).slice(-1).map(entry => ({
        cat: entry.cat,
        toolCapability: entry.toolCapability,
        downgradeReason: entry.downgradeReason,
        providerId: entry.providerId,
        model: entry.model
      }))
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
