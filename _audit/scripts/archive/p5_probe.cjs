const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  const result = await page.evaluate(() => {
    const state = window.__pinia?.state?.value || {}
    const editor = state.editor || {}
    const chat = state.chat || {}
    return {
      url: location.href,
      title: document.title,
      visible: {
        editorPanel: !!document.querySelector('#editor-panel'),
        editorContent: !!document.querySelector('#editor-content'),
        chatPanel: !!document.querySelector('#chat-panel'),
        chatMessages: !!document.querySelector('#chat-messages'),
        chatInput: !!document.querySelector('.chat-input')
      },
      editor: {
        activeTabId: editor.activeTabId || null,
        tabs: (editor.tabs || []).map(t => ({ id: t.id, title: t.title, length: (t.content || '').length, chapterId: t.chapterId }))
      },
      chat: {
        activeSessionId: chat.activeSessionId || null,
        sessionCount: (chat.sessions || []).length,
        activeMessages: (chat.activeMessages || []).map(m => ({ role: m.role, length: (m.content || '').length, tabId: m.tabId }))
      },
      project: {
        id: state.project?.currentProjectId || null,
        name: state.project?.projectName || '',
        volumes: (state.project?.volumes || []).map(v => ({ id: v.id, name: v.name, outlineLength: (v.outline || '').length })),
        chapterGroups: Object.fromEntries(Object.entries(state.project?.chapters || {}).map(([k, v]) => [k, (v || []).map(ch => ({ id: ch.id, title: ch.title, bodyLength: (ch.body || '').length }))]))
      },
      bodyText: document.body.innerText.slice(0, 500)
    }
  })
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

main().catch(error => { console.error(error.stack); process.exit(1) })
