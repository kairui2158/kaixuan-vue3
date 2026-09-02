(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = { runtimeErrors: [], steps: [] };
  let stores = null;
  let originalProviders = null;
  let originalGenerate = null;
  let originalOutline = '';
  let originalLocked = false;
  let originalMessages = null;

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
    return await waitFor(() => {
      const input = document.getElementById('ow-chat-input');
      return input && input.offsetParent !== null ? input : null;
    }, 8000);
  }

  async function closeWorkspace() {
    const cancel = document.getElementById('btn-diff-cancel');
    if (cancel && cancel.offsetParent !== null) cancel.click();
    const close = document.getElementById('btn-close-outline-workspace');
    if (close) close.click();
    await sleep(150);
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
    stores = app.__vue_app__.config.globalProperties.$pinia?._s;
    const provider = stores.get('provider');
    const project = stores.get('project');
    if (!provider || !project) throw new Error('provider/project stores unavailable');

    originalProviders = JSON.parse(JSON.stringify(provider.providers || []));
    originalGenerate = provider.generateProvider;
    originalOutline = project.outlineText || '';
    originalLocked = project.outlineLocked;
    originalMessages = JSON.parse(JSON.stringify(project.outlineChat || []));
    const projectId = project.currentProjectId || 'default';

    if (project.outlineLocked) project.outlineLocked = false;
    project.outlineText = '测试底稿\n第二行';

    const mockProvider = {
      id: 'l3-outline-context-v1-' + Date.now(),
      name: '等级三大纲上下文供应商',
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

    const input = await openWorkspace();
    const send = document.getElementById('btn-ow-send');
    if (!send) throw new Error('outline send button unavailable');
    input.value = 'L3_OUTLINE_CONTEXT_' + Date.now();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    send.click();

    const requestMarker = input.value;
    const latestBatchIndex = await waitFor(() => {
      const index = [...project.outlineChat]
        .map((message, messageIndex) => ({ message, messageIndex }))
        .filter(item => item.message.role === 'assistant' && item.message.outlineBatch)
        .findLast(item => {
          const previousUser = [...project.outlineChat.slice(0, item.messageIndex)]
            .reverse().find(message => message.role === 'user');
          return previousUser?.content === requestMarker;
        })?.messageIndex;
      return Number.isInteger(index) ? index : null;
    }, 30000);
    if (!Number.isInteger(latestBatchIndex)) throw new Error('outline latest batch message timeout');
    const preview = await waitFor(() => {
      const buttons = [...document.querySelectorAll('#outline-workspace .ow-edit-command .msg-btn')]
        .filter(item => item.textContent.includes('预览修改') && item.offsetParent !== null);
      return buttons[buttons.length - 1] || null;
    }, 8000);
    if (!preview) throw new Error('outline preview timeout');

    const before = project.outlineText || '';
    preview.click();
    const apply = await waitFor(() => {
      const button = document.getElementById('btn-diff-apply');
      return button && button.offsetParent !== null ? button : null;
    }, 8000);
    if (!apply) throw new Error('outline diff apply button timeout');
    apply.click();
    const applied = await waitFor(() => project.outlineChat[latestBatchIndex]?.outlineBatchRecord?.status === 'applied', 8000);
    const after = project.outlineText || '';
    const appliedMessage = project.outlineChat[latestBatchIndex];
    result.steps.push({
      name: 'outline-batch-applied',
      ok: Boolean(applied)
        && after.includes('[测试] 第二条插入内容。')
        && Boolean(appliedMessage?.outlineBatchRecord?.batchId)
        && appliedMessage.outlineBatchRecord.status === 'applied'
        && Boolean(appliedMessage.outlineBatchTarget?.contentHash),
      before,
      after,
      record: appliedMessage ? {
        status: appliedMessage.outlineBatchRecord?.status,
        batchId: appliedMessage.outlineBatchRecord?.batchId,
        undoAvailable: appliedMessage.outlineBatchRecord?.undoAvailable
      } : null,
      target: appliedMessage ? {
        workspace: appliedMessage.outlineBatchTarget?.workspace,
        targetId: appliedMessage.outlineBatchTarget?.targetId,
        hasContentHash: Boolean(appliedMessage.outlineBatchTarget?.contentHash)
      } : null
    });

    const contextService = globalThis.__conversationContextService;
    if (!contextService?.buildContextBundle) throw new Error('conversation context service unavailable');
    const event = await waitFor(async () => {
      const bundle = await contextService.buildContextBundle({
        projectId,
        workspace: 'outline',
        purpose: 'generate'
      });
      const events = bundle.session.recentMessages
        .filter(message => message.content === '[AI 编辑] 已应用大纲 AI 编辑批次'
          && message.meta?.batchId === appliedMessage.outlineBatchRecord?.batchId
          && message.meta?.status === 'applied');
      return events[events.length - 1] || null;
    }, 8000);
    result.steps.push({
      name: 'outline-applied-context-event',
      ok: Boolean(event?.meta?.batchId),
      meta: event?.meta
    });

    const rollbackButton = await waitFor(() => {
      const buttons = [...document.querySelectorAll('#outline-workspace .ow-edit-command .msg-btn')]
        .filter(item => item.textContent.includes('回滚') && item.offsetParent !== null);
      return buttons[buttons.length - 1] || null;
    }, 8000);
    if (!rollbackButton) throw new Error('outline rollback button timeout');
    const beforeRollback = project.outlineText || '';
    rollbackButton.click();
    const rolledBack = await waitFor(() => project.outlineChat[latestBatchIndex]?.outlineBatchRecord?.status === 'rolled_back', 8000);
    const rolledBackMessage = project.outlineChat[latestBatchIndex];
    result.steps.push({
      name: 'outline-batch-rolled-back',
      ok: Boolean(rolledBack)
        && (project.outlineText || '') === before
        && rolledBackMessage?.outlineBatchRecord?.status === 'rolled_back'
        && rolledBackMessage.outlineBatchRecord.undoAvailable === false,
      after: project.outlineText || '',
      record: rolledBackMessage ? {
        status: rolledBackMessage.outlineBatchRecord?.status,
        batchId: rolledBackMessage.outlineBatchRecord?.batchId,
        undoAvailable: rolledBackMessage.outlineBatchRecord?.undoAvailable
      } : null
    });

    const rollbackContentPrefix = `[AI 编辑] 已回滚大纲 AI 编辑批次，恢复 ${before.length} 字符`;
    const rollbackEvent = await waitFor(async () => {
      const rolledBundle = await contextService.buildContextBundle({
        projectId,
        workspace: 'outline',
        purpose: 'generate'
      });
      const rollbackEvents = rolledBundle.session.recentMessages
        .filter(message => message.content === rollbackContentPrefix
          && message.meta?.batchId === appliedMessage.outlineBatchRecord?.batchId
          && message.meta?.status === 'rolled_back');
      return rollbackEvents[rollbackEvents.length - 1] || null;
    }, 8000);
    result.steps.push({
      name: 'outline-rollback-context-event',
      ok: rollbackEvent?.meta?.batchId === appliedMessage?.outlineBatchRecord?.batchId
        && rollbackEvent.meta.status === 'rolled_back',
      meta: rollbackEvent?.meta
    });

    result.allStepsOk = result.steps.every(step => step.ok);
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
        if (provider && originalProviders) {
          provider.providers = JSON.parse(JSON.stringify(originalProviders));
          provider.generateProvider = originalGenerate;
        }
        if (project) {
          project.outlineText = originalOutline;
          project.outlineLocked = originalLocked;
          project.outlineChat = JSON.parse(JSON.stringify(originalMessages || []));
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
