(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(predicate, timeout = 12000, interval = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = await predicate();
      if (value) return value;
      await sleep(interval);
    }
    return null;
  }

  const app = document.querySelector('#app');
  const stores = app?.__vue_app__?.config.globalProperties?.$pinia?._s;
  const project = stores.get('project');
  const provider = stores.get('provider');
  const originalProviders = JSON.parse(JSON.stringify(provider.providers || []));
  const originalGenerate = provider.generateProvider;
  const originalOutline = project.outlineText || '';
  const originalLocked = project.outlineLocked;
  const originalMessages = JSON.parse(JSON.stringify(project.outlineChat || []));
  const result = { runtimeErrors: [], snapshots: [] };

  function snapshot(label) {
    const buttons = [...document.querySelectorAll('#outline-workspace .ow-edit-command .msg-btn')]
      .map((button, index) => ({
        index,
        text: button.textContent.trim(),
        visible: button.offsetParent !== null,
        disabled: button.disabled,
        parentClass: button.parentElement?.className
      }));
    result.snapshots.push({
      label,
      outlineText: project.outlineText,
      lastMessages: [...project.outlineChat].slice(-4).map(message => ({
        role: message.role,
        content: String(message.content || '').slice(0, 80),
        hasOutlineBatch: Boolean(message.outlineBatch),
        hasOutlineBatchTarget: Boolean(message.outlineBatchTarget),
        record: message.outlineBatchRecord ? {
          status: message.outlineBatchRecord.status,
          batchId: message.outlineBatchRecord.batchId,
          undoAvailable: message.outlineBatchRecord.undoAvailable
        } : null
      })),
      diffApplyVisible: Boolean(document.getElementById('btn-diff-apply')?.offsetParent),
      batchItemCount: document.querySelectorAll('#diff-batch-items .batch-item').length,
      buttons,
      bodyTail: document.body.innerText.slice(-320)
    });
  }

  try {
    project.outlineLocked = false;
    project.outlineText = '测试底稿\n第二行';
    provider.providers = [...originalProviders, {
      id: 'l3-outline-click-diagnose-' + Date.now(),
      name: '大纲点击诊断供应商',
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
    }];
    provider.generateProvider = provider.providers[provider.providers.length - 1].id;

    const outlineButton = document.querySelector('#app-sidebar #btn-outline-workspace');
    if (!outlineButton) throw new Error('outline workspace button not found');
    outlineButton.click();
    await sleep(300);
    const chatToggle = document.getElementById('btn-ai-co-create');
    if (!chatToggle) throw new Error('outline AI toggle not found');
    chatToggle.click();
    await sleep(200);
    const input = await waitFor(() => {
      const element = document.getElementById('ow-chat-input');
      return element && element.offsetParent !== null ? element : null;
    }, 8000);
    if (!input) throw new Error('outline input timeout');
    snapshot('opened');

    input.value = 'L3_OUTLINE_CLICK_DIAGNOSE_' + Date.now();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-ow-send').click();
    snapshot('sent');

    const preview = await waitFor(() => {
      const button = [...document.querySelectorAll('#outline-workspace .ow-edit-command .msg-btn')]
        .find(item => item.textContent.includes('预览修改') && item.offsetParent !== null);
      return button || null;
    }, 30000);
    if (!preview) throw new Error('preview timeout');
    await sleep(300);
    snapshot('before-preview-click');
    preview.click();
    await sleep(500);
    snapshot('after-preview-click');

    const apply = document.getElementById('btn-diff-apply');
    result.applyButton = {
      exists: Boolean(apply),
      visible: Boolean(apply && apply.offsetParent !== null),
      disabled: Boolean(apply?.disabled)
    };
    if (apply) {
      apply.click();
      await sleep(700);
    }
    snapshot('after-apply-click');
    result.allStepsOk = project.outlineText !== originalOutline;
    return result;
  } catch (error) {
    result.runtimeErrors.push(String(error?.stack || error));
    result.allStepsOk = false;
    return result;
  } finally {
    provider.providers = JSON.parse(JSON.stringify(originalProviders));
    provider.generateProvider = originalGenerate;
    project.outlineText = originalOutline;
    project.outlineLocked = originalLocked;
    project.outlineChat = JSON.parse(JSON.stringify(originalMessages || []));
    const cancel = document.getElementById('btn-diff-cancel');
    if (cancel && cancel.offsetParent !== null) cancel.click();
    const close = document.getElementById('btn-close-outline-workspace');
    if (close) close.click();
    result.restored = true;
  }
})()
