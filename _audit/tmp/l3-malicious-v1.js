(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const result = { runtimeErrors: [], steps: [] };
  const marker = Date.now();
  const originalContent = '主编辑底稿\n第二行';
  const cases = [
    'MALICIOUS_DIRECT_APPLY',
    'MALICIOUS_SKIP_CONFIRM',
    'MALICIOUS_FAKE_SUCCESS',
    'MALICIOUS_INJECTED_SYSTEM',
    'MALICIOUS_FAKE_TOOL_RESULT',
    'MALICIOUS_PROTOTYPE',
    'MALICIOUS_EMPTY',
    'MALICIOUS_OVERFLOW',
    'MALICIOUS_BAD_OPERATION',
    'MALICIOUS_DELETE_ALL',
    'MALICIOUS_UNKNOWN_TOOL',
    'MALICIOUS_INVALID_TOOL_INPUT',
    'MALICIOUS_WRITE_LIMIT',
    'MALICIOUS_TOOL_LOOP'
  ];
  let provider = null, chat = null, editor = null;
  let originalProviders = null, originalGenerate = null, originalVerify = null, originalDetect = null;
  let originalSession = null, originalTabs = null, originalActiveTabId = null;

  async function waitFor(predicate, timeout = 30000, interval = 100) {
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

  async function waitIdle(timeout = 30000) {
    return await waitFor(() => {
      const status = chat?.generationStatus;
      const streaming = status === 'preparing' || status === 'streaming' || status === 'retrying';
      return streaming ? null : status || 'idle';
    }, timeout);
  }

  function closeModals() {
    const cancel = document.getElementById('btn-diff-cancel');
    if (cancel && cancel.offsetParent !== null) cancel.click();
  }

  async function dismissAlerts() {
    for (let i = 0; i < 5; i++) {
      const button = [...document.querySelectorAll('.app-confirm-overlay button')]
        .find(item => item.textContent.trim() === '确定');
      if (!button) break;
      button.click();
      await sleep(60);
    }
  }

  async function resetEvents() {
    await fetch('http://127.0.0.1:19098/__reset', { method: 'POST' });
  }

  async function getEvents() {
    return await fetch('http://127.0.0.1:19098/__events').then(r => r.json());
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
    originalVerify = provider.verifyProvider;
    originalDetect = provider.detectProvider;
    originalSession = JSON.parse(JSON.stringify(chat.activeSession || { messages: [] }));
    originalTabs = JSON.parse(JSON.stringify(editor.tabs || []));
    originalActiveTabId = editor.activeTabId;

    const tabId = 'l3-malicious-' + marker;
    editor.tabs = [{ id: tabId, title: '恶意响应实测', content: originalContent, chapterId: '', isDirty: false, mode: 'normal' }];
    editor.activeTabId = tabId;
    await sleep(120);

    const mockProvider = {
      id: 'l3-malicious-provider-' + marker,
      name: '恶意响应实测供应商',
      baseUrl: 'http://127.0.0.1:19098/v1',
      apiKey: 'test-key-malicious',
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
    provider.verifyProvider = null;
    provider.detectProvider = null;

    const input = document.getElementById('user-input');
    if (!input || input.offsetParent === null) throw new Error('main chat input unavailable');

    for (const mode of cases) {
      closeModals();
      await dismissAlerts();
      await resetEvents();
      const before = editor.tabs.find(tab => tab.id === tabId)?.content || '';
      const beforeDirty = Boolean(editor.tabs.find(tab => tab.id === tabId)?.isDirty);
      input.value = 'L3_MALICIOUS_' + mode + '_' + marker;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('btn-send').click();

      const done = await waitFor(() => {
        const filled = (chat.activeMessages || [])
          .filter(message => message.role === 'assistant' && typeof message.content === 'string' && message.content.trim().length > 0);
        return filled.length > 0 ? filled.length : null;
      }, 30000);
      if (!done) throw new Error(mode + ': assistant response timeout');
      const status = await waitIdle();
      await sleep(120);
      const events = await getEvents();
      const tab = editor.tabs.find(item => item.id === tabId);
      const content = tab?.content || '';
      const changed = content !== before;
      const dirtyChanged = Boolean(tab?.isDirty) !== beforeDirty;
      const diffVisible = Boolean(document.getElementById('btn-diff-apply')?.offsetParent);
      const hasMaliciousText = content.includes('恶意') || content.includes('__proto__') || content.includes('eval');
      const command = content === before && !changed && !dirtyChanged && !hasMaliciousText;
      result.steps.push({
        name: mode,
        ok: command,
        requestCount: events.length,
        contentChanged: changed,
        dirtyChanged,
        diffVisible,
        generationStatus: status,
        contentPreview: content.slice(0, 120)
      });
      if (!command) throw new Error(mode + ': malicious response changed editor state');
    }

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
      closeModals();
      await dismissAlerts();
      await sleep(180);
      result.restored = true;
    } catch (error) {
      result.runtimeErrors.push('finally: ' + String(error));
      result.restored = false;
    }
  }
})()
