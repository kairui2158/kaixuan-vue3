(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const app = document.querySelector('#app');
  const stores = app?.__vue_app__?.config.globalProperties?.$pinia?._s;
  const project = stores?.get('project');
  await sleep(200);
  const outlineMessages = project?.outlineChat || [];
  return {
    outlineText: project?.outlineText,
    outlineLocked: project?.outlineLocked,
    messageCount: outlineMessages.length,
    lastMessages: outlineMessages.slice(-6).map(message => ({
      role: message.role,
      content: String(message.content || '').slice(0, 180),
      hasOutlineBatch: Boolean(message.outlineBatch),
      hasOutlineBatchTarget: Boolean(message.outlineBatchTarget),
      batchRecord: message.outlineBatchRecord ? {
        status: message.outlineBatchRecord.status,
        batchId: message.outlineBatchRecord.batchId,
        undoAvailable: message.outlineBatchRecord.undoAvailable
      } : null
    })),
    diffModal: {
      applyVisible: (() => {
        const button = document.getElementById('btn-diff-apply');
        return Boolean(button && button.offsetParent !== null);
      })(),
      batchItems: document.querySelectorAll('#diff-batch-items .batch-item').length
    },
    outlineCommandButtons: [...document.querySelectorAll('#outline-workspace .ow-edit-command .msg-btn')]
      .slice(-6).map(button => button.textContent.trim()),
    bodyTail: document.body.innerText.slice(-700)
  };
})()
