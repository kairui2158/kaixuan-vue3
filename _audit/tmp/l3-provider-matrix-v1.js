(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const result = { runtimeErrors: [], steps: [] };
  let provider = null, project = null, chat = null, editor = null;
  let originalProviders = null, originalGenerate = null, originalSession = null, originalTabs = null, originalActiveTabId = null;
  let originalVerify = null, originalDetect = null;
  const marker = Date.now();

  async function waitFor(predicate, timeout = 20000, interval = 100) {
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

  async function waitForIdle(timeout = 30000, interval = 100) {
    const idle = await waitFor(() => {
      const status = chat?.generationStatus;
      const streaming = status === 'preparing' || status === 'streaming' || status === 'retrying';
      return streaming ? null : { status: status || 'idle' };
    }, timeout, interval);
    if (!idle) throw new Error('generation did not return to idle');
    return idle;
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

  const cases = [
    {
      name: 'openai-native-tools',
      provider: {
        id: 'l3-openai-' + marker,
        name: '矩阵 OpenAI',
        baseUrl: 'http://127.0.0.1:19098/v1',
        apiKey: 'test-key-openai',
        models: ['mock-model'], selectedModel: 'mock-model',
        temperature: 0.2, maxTokens: 2000, purpose: ['generate'],
        streamMode: false, providerType: 'openai-compatible', endpointMode: 'base'
      },
      assert(logs) {
        const log = Array.isArray(logs) ? logs[0] : null;
        return log?.url?.endsWith('/v1/chat/completions') === true
          && log.hasTools === true
          && log.stream === false;
      }
    },
    {
      name: 'anthropic-native-tools',
      provider: {
        id: 'l3-anthropic-' + marker,
        name: '矩阵 Anthropic',
        baseUrl: 'http://127.0.0.1:19098',
        apiKey: 'test-key-anthropic',
        models: ['mock-model'], selectedModel: 'mock-model',
        temperature: 0.2, maxTokens: 2000, purpose: ['generate'],
        streamMode: false, providerType: 'anthropic', endpointMode: 'base'
      },
      assert(logs) {
        const log = Array.isArray(logs) ? logs[0] : null;
        return log?.url?.endsWith('/v1/messages') === true
          && log.hasTools === true
          && log.stream === false;
      }
    },
    {
      name: 'gemini-native-tools',
      provider: {
        id: 'l3-gemini-' + marker,
        name: '矩阵 Gemini',
        baseUrl: 'http://127.0.0.1:19098',
        apiKey: 'test-key-gemini',
        models: ['mock-model'], selectedModel: 'mock-model',
        temperature: 0.2, maxTokens: 2000, purpose: ['generate'],
        streamMode: false, providerType: 'gemini', endpointMode: 'base'
      },
      assert(logs) {
        const log = Array.isArray(logs) ? logs[0] : null;
        return log?.url?.includes('/models/mock-model:generateContent') === true
          && log.hasTools === true
          && log.stream === false;
      }
    },
    {
      name: 'azure-native-tools',
      provider: {
        id: 'l3-azure-' + marker,
        name: '矩阵 Azure',
        baseUrl: 'http://127.0.0.1:19098',
        apiKey: 'test-key-azure',
        models: ['mock-model'], selectedModel: 'mock-model',
        temperature: 0.2, maxTokens: 2000, purpose: ['generate'],
        streamMode: false, providerType: 'azure-openai', endpointMode: 'base',
        deployment: 'l3-deployment', apiVersion: '2026-02-01'
      },
      assert(logs) {
        const log = Array.isArray(logs) ? logs[0] : null;
        return log?.url?.includes('/openai/deployments/l3-deployment/chat/completions') === true
          && log.url.includes('api-version=2026-02-01')
          && log.hasTools === true
          && log.stream === false;
      }
    },
    {
      name: 'mock-json-degradation',
      provider: {
        id: 'l3-degrade-' + marker,
        name: '矩阵降级',
        baseUrl: 'http://127.0.0.1:19098/v1',
        apiKey: 'test-key-downgrade',
        models: ['mock-model'], selectedModel: 'mock-model',
        temperature: 0.2, maxTokens: 2000, purpose: ['generate'],
        streamMode: false, providerType: 'openai-compatible', endpointMode: 'base'
      },
      userText: 'L3_P7_REJECT_TOOLS 矩阵降级_' + marker,
      assert(logs) {
        return Array.isArray(logs)
          && logs.length === 2
          && logs[0].hasTools === true
          && logs[0].stream === false
          && logs[1].hasTools === false
          && logs[1].stream === true;
      }
    }
  ];

  async function fetchLogs() {
    return await fetch('http://127.0.0.1:19098/__events').then(r => r.json());
  }
  async function clearLogs() {
    await fetch('http://127.0.0.1:19098/__reset', { method: 'POST' });
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

    editor.tabs = [{
      id: 'l3-provider-matrix-' + marker,
      title: '供应商矩阵验证',
      content: '主编辑底稿\n第二行',
      chapterId: '', isDirty: false, mode: 'normal'
    }];
    editor.activeTabId = 'l3-provider-matrix-' + marker;
    await sleep(120);

    const input = document.getElementById('user-input');
    if (!input || input.offsetParent === null) throw new Error('main chat input unavailable');

    for (const item of cases) {
      await clearLogs();
      provider.providers = [...originalProviders, item.provider];
      provider.generateProvider = item.provider.id;
      provider.verifyProvider = null;
      provider.detectProvider = null;
      const staleCancel = document.getElementById('btn-diff-cancel');
      if (staleCancel && staleCancel.offsetParent !== null) staleCancel.click();
      await sleep(60);

      input.value = (item.userText || ('L3_MAIN_TOOL_APPLY_' + item.name + '_' + marker));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('btn-send').click();

      const ready = await waitFor(() => {
        const filled = (chat.activeMessages || [])
          .filter(message => message.role === 'assistant' && typeof message.content === 'string' && message.content.trim().length > 0);
        return filled.length > 0 ? filled : null;
      }, 30000);
      if (!ready) throw new Error(item.name + ': assistant response timeout');
      const idle = await waitForIdle();
      const logs = await fetchLogs();
      result.steps.push({
        name: item.name,
        ok: item.assert(logs),
        requestCount: logs.length,
        generationStatus: idle.status,
        messageCountAfter: (chat.activeMessages || []).length,
        lastMessagePreview: String((chat.activeMessages || []).slice(-1)[0]?.content || '').slice(0, 120),
        logs: logs.map(log => ({
          url: log.url,
          providerType: log.providerType,
          hasTools: log.hasTools,
          stream: log.stream,
          wireTail: log.wireTail
        }))
      });
      await sleep(80);
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
      const cancel = document.getElementById('btn-diff-cancel');
      if (cancel && cancel.offsetParent !== null) cancel.click();
      await dismissAlerts();
      await sleep(150);
      result.restored = true;
    } catch (error) {
      result.runtimeErrors.push('finally: ' + String(error));
      result.restored = false;
    }
  }
})()
