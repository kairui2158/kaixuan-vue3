(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const app = document.querySelector('#app');
  const stores = app?.__vue_app__?.config.globalProperties?.$pinia?._s;
  const chat = stores?.get('chat');
  const editor = stores?.get('editor');
  const project = stores?.get('project');
  await sleep(200);
  const messages = chat?.activeMessages || [];
  const last = messages.at(-1) || null;
  return {
    storeAvailable: Boolean(chat && editor && project),
    messageCount: messages.length,
    lastMessage: last ? {
      id: last.id,
      role: last.role,
      content: last.content,
      hasEditorBatch: Boolean(last.editorBatch),
      editorBatchCommands: last.editorBatch?.commands?.length || 0,
      hasEditorBatchTarget: Boolean(last.editorBatchTarget),
      hasEditorBatchRecord: Boolean(last.editorBatchRecord)
    } : null,
    assistantMessages: messages.filter(item => item.role === 'assistant').slice(-5).map(item => ({
      content: item.content,
      hasEditorBatch: Boolean(item.editorBatch),
      hasRecord: Boolean(item.editorBatchRecord)
    })),
    activeTabId: editor?.activeTabId,
    activeTabContent: editor?.activeTab?.content,
    outlineText: project?.outlineText,
    diffModal: {
      exists: Boolean(document.getElementById('btn-diff-apply')),
      visible: (() => {
        const button = document.getElementById('btn-diff-apply');
        return Boolean(button && button.offsetParent !== null);
      })(),
      batchItems: document.querySelectorAll('#diff-batch-items .batch-item').length
    },
    editCommands: document.querySelectorAll('.chat-edit-command, .ow-edit-command').length,
    bodyTextTail: document.body.innerText.slice(-1000)
  };
})()
