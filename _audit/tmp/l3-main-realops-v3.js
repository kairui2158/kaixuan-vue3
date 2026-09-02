(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const result = { runtimeErrors: [], steps: [] };
  let provider = null, project = null, chat = null, editor = null;
  let originalProviders = null, originalGenerate = null, originalSession = null, originalTabs = null, originalActiveTabId = null;

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
    originalSession = JSON.parse(JSON.stringify(chat.activeSession || { messages: [] }));
    originalTabs = JSON.parse(JSON.stringify(editor.tabs || []));
    originalActiveTabId = editor.activeTabId;

    editor.tabs = [{
      id: 'l3-main-mock-v3',
      title: '等级三主编辑实测',
      content: '主编辑底稿\n第二行',
      chapterId: '',
      isDirty: false,
      mode: 'normal'
    }];
    editor.activeTabId = 'l3-main-mock-v3';
    await sleep(150);

    const mockProvider = {
      id: 'l3-main-mock-v3-' + Date.now(),
      name: '主编辑实测供应商',
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
    input.value = 'L3_MAIN_TOOL_APPLY_' + Date.now();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-send').click();

    const ready = await waitFor(() => {
      const filled = (chat.activeMessages || [])
        .filter(message => message.role === 'assistant' && typeof message.content === 'string' && message.content.trim().length > 0);
      const previewItems = document.querySelectorAll('#diff-batch-items .batch-item').length;
      return filled.length > 0 && previewItems === 2 ? { filled, previewItems } : null;
    }, 30000);
    if (!ready) throw new Error('main assistant response or batch preview timeout');

    const before = editor.activeTab?.content || '';
    result.steps.push({
      name: 'before-unchanged',
      ok: before === '主编辑底稿\n第二行',
      before
    });
    result.steps.push({
      name: 'batch-preview-opened',
      ok: ready.previewItems === 2,
      items: ready.previewItems
    });

    const cancel = document.getElementById('btn-diff-cancel');
    if (!cancel || cancel.offsetParent === null) throw new Error('diff cancel button unavailable');
    cancel.click();
    await sleep(250);
    const afterCancel = editor.activeTab?.content || '';
    result.steps.push({
      name: 'cancel-keeps-content',
      ok: afterCancel === before,
      afterCancel
    });

    // Reopen the assistant command and apply only the second batch item.
    const command = [...document.querySelectorAll('.chat-edit-command .msg-btn')]
      .find(item => item.textContent.includes('预览修改'));
    if (!command) throw new Error('main editor preview command not found after cancel');
    command.click();
    await waitFor(() => {
      const button = document.getElementById('btn-diff-apply');
      return button && button.offsetParent !== null ? button : null;
    }, 8000);
    const batchItems = [...document.querySelectorAll('#diff-batch-items .batch-item')];
    if (batchItems.length !== 2) throw new Error('expected 2 main batch items, got ' + batchItems.length);
    batchItems[0].click();
    document.getElementById('btn-diff-apply').click();
    const applied = await waitFor(() => (editor.activeTab?.content || '') !== before, 8000);
    const afterApply = editor.activeTab?.content || '';
    result.steps.push({
      name: 'batch-partial-apply',
      ok: Boolean(applied)
        && !afterApply.includes('主编辑底稿（已更新）')
        && afterApply.includes('[测试] 第二条插入内容。'),
      before,
      afterApply,
      batchItems: batchItems.length,
      rejectedFirstItem: true
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
