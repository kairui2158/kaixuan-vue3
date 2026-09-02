(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const result = { runtimeErrors: [], steps: [] };
  let provider = null, project = null, chat = null, editor = null;
  let originalProviders = null, originalGenerate = null, originalSession = null, originalTabs = null, originalActiveTabId = null;
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
    editor.tabs = [{ id: 'l3-main-mock', title: '等级三主编辑实测', content: '主编辑底稿\n第二行', chapterId: '', isDirty: false, mode: 'normal' }];
    editor.activeTabId = 'l3-main-mock';
    const mockProvider = {
      id: 'l3-main-mock-' + Date.now(), name: '主编辑实测供应商',
      baseUrl: 'http://127.0.0.1:19098/v1', apiKey: 'test-key',
      models: ['mock-model'], selectedModel: 'mock-model',
      temperature: 0.2, maxTokens: 2000, purpose: ['generate'], streamMode: false,
      providerType: 'openai-compatible', endpointMode: 'base'
    };
    provider.providers = [...originalProviders, mockProvider];
    provider.generateProvider = mockProvider.id;
    const input = document.getElementById('user-input');
    if (!input || input.offsetParent === null) throw new Error('main chat input unavailable');
    input.value = 'L3_MAIN_TOOL_ID_' + Date.now();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-send').click();
    await (async () => {
      // chatStore inserts an empty assistant placeholder before streaming updates it,
      // so wait for filled content and the visible diff preview, not message count.
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const assistants = (chat.activeMessages || []).filter(m => m.role === 'assistant');
        const filled = assistants.filter(m => typeof m.content === 'string' && m.content.trim().length > 0);
        const previewItems = document.querySelectorAll('#diff-batch-items .batch-item').length;
        if (filled.length > 0 && previewItems === 2) {
          return { assistant: filled.at(-1), previewItems };
        }
        await sleep(100);
      }
      throw new Error('main assistant response timeout');
    })();
    await sleep(300);
    const before = editor.activeTab?.content || '';
    result.steps.push({ name: 'before-unchanged', ok: before === '主编辑底稿\n第二行', before });
    const batchCommand = [...document.querySelectorAll('#diff-batch-items .batch-item')];
    result.steps.push({ name: 'batch-preview-opened', ok: batchCommand.length === 2, items: batchCommand.length });
    const cancel = document.getElementById('btn-diff-cancel');
    if (cancel && cancel.offsetParent !== null) cancel.click();
    const afterCancel = editor.activeTab?.content || '';
    result.steps.push({ name: 'cancel-keeps-content', ok: afterCancel === before, afterCancel });
    return result;
  } catch (error) {
    result.runtimeErrors.push(String(error?.stack || error));
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
      await sleep(200);
      result.restored = true;
    } catch (error) {
      result.runtimeErrors.push('finally: ' + String(error));
      result.restored = false;
    }
  }
})()
