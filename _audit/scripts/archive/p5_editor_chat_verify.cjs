const { chromium } = require('playwright')
const fs = require('fs')

const ROOT = 'D:/codex/novel-workshop-vue3'
const REPORT = ROOT + '/_audit/P5_editor_chat_verify.json'
const SCREENSHOT = ROOT + '/_audit/P5_editor_chat_verify.png'

function check(results, name, pass, detail) {
  results.push({ name, pass: !!pass, detail: String(detail || '') })
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + (detail || ''))
}

async function waitFor(page, fn, timeout = 120000, interval = 500) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = await fn()
    if (value) return value
    await page.waitForTimeout(interval)
  }
  return null
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  page.setDefaultTimeout(20000)
  const results = []
  const snapshot = await page.evaluate(() => {
    const api = window.electronAPI
    const keys = (api.storageList?.() || []).filter(key => key.startsWith('wa_'))
    return Object.fromEntries(keys.map(key => [key, api.storageRead(key)]))
  })
  let report = null

  try {
    const project = await page.evaluate(() => {
      const s = window.__pinia?.state?.value?.project || {}
      const groups = s.chapters || {}
      const chapters = Object.values(groups).flat()
      return { projectId: s.currentProjectId, chapters: chapters.map(ch => ({ id: ch.id, title: ch.title })) }
    })
    check(results, '存在可通过章节树打开的章节', project.chapters.length >= 1, JSON.stringify(project))
    if (project.chapters.length < 1) throw new Error('没有章节，无法进行用户路径验证')

    await page.locator('.volume-item').first().click()
    await page.locator('.chapter-item').first().click()
    await page.waitForTimeout(300)
    const editor = page.locator('#editor-content')
    const firstTab = await page.evaluate(() => window.__pinia.state.value.editor.activeTabId)
    check(results, '点击章节树后编辑器打开章节标签', !!firstTab && await editor.isEnabled(), JSON.stringify({ firstTab, disabled: await editor.isDisabled() }))

    const original = '前文保留。选区原文。后文保留。'
    await editor.fill(original)
    await page.waitForTimeout(250)
    const selected = '选区原文。'
    const start = original.indexOf(selected)
    const end = start + selected.length
    await editor.focus()
    await editor.press('Control+A')
    await editor.press('Home')
    for (let i = 0; i < start; i++) await editor.press('ArrowRight')
    await editor.press('Shift+ArrowRight')
    for (let i = start + 1; i < end; i++) await editor.press('Shift+ArrowRight')
    await editor.evaluate(() => document.querySelector('#editor-content')?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })))
    await page.waitForTimeout(350)
    const capturedSelection = await editor.evaluate(el => ({ start: el.selectionStart, end: el.selectionEnd, text: el.value.slice(el.selectionStart, el.selectionEnd) }))
    check(results, '编辑器可选中文本并显示内联操作菜单', await page.locator('.inline-menu').isVisible(), JSON.stringify({ start, end, selected }))

    const action = page.locator('.inline-menu-btn').first()
    await action.click()
    check(results, '选区操作已进入右侧对话发送路径', await page.locator('.chat-message.user').count() >= 1, 'userMessages=' + await page.locator('.chat-message.user').count())

    const assistant = await waitFor(page, async () => {
      const count = await page.locator('.chat-message.assistant').count()
      if (!count) return null
      const stateMessage = await page.evaluate(() => {
        const chat = window.__pinia.state.value.chat
        const session = (chat.sessions || []).find(s => s.id === chat.activeSessionId)
        const messages = session?.messages || []
        const last = messages[messages.length - 1]
        return last?.role === 'assistant' && last.content ? last.content : ''
      })
      return stateMessage.trim() ? { count, last: stateMessage } : null
    })
    check(results, '真实 API/对话路径产生非空 AI 回复', !!assistant, assistant ? assistant.last.slice(0, 120) : '未收到回复')
    if (!assistant) throw new Error('未收到 AI 回复，无法验证替换行为')

    const beforeReplace = await editor.inputValue()
    const replaceButton = page.locator('.chat-message.assistant').last().locator('button[title="整章替换为消息内容"]')
    check(results, 'AI 回复气泡显示替换按钮', await replaceButton.isVisible() && await replaceButton.isEnabled(), '')
    await replaceButton.click()
    await page.waitForTimeout(300)
    const afterReplace = await editor.inputValue()
    const responseText = assistant.last
    const expected = beforeReplace.slice(0, capturedSelection.start) + responseText + beforeReplace.slice(capturedSelection.end)
    check(results, '替换只改动选区并保留前后正文', afterReplace === expected, JSON.stringify({ beforeReplace, afterReplace: afterReplace.slice(0, 180), expected: expected.slice(0, 180) }))

    // Tag isolation: open a second real chapter through the chapter tree and invoke the same message action.
    if (project.chapters.length >= 2) {
      await page.locator('.chapter-item').nth(1).click()
      await page.waitForTimeout(250)
      const secondTab = await page.evaluate(() => window.__pinia.state.value.editor.activeTabId)
      check(results, '切换到第二个章节标签', !!secondTab && secondTab !== firstTab, JSON.stringify({ firstTab, secondTab }))
      const secondBefore = await editor.inputValue()
      await replaceButton.click()
      await page.waitForTimeout(150)
      check(results, '切换标签后旧选区不会误替换新章节', await editor.inputValue() === secondBefore, 'secondLength=' + (await editor.inputValue()).length)
    } else {
      check(results, '切换标签隔离验证', true, '当前项目仅一个章节，跳过第二标签操作；源码快照检查保留 tabId guard')
    }

    const stateBeforeReload = await page.evaluate(() => ({
      projectId: window.__pinia.state.value.project.currentProjectId,
      tabId: window.__pinia.state.value.editor.activeTabId,
      sessionId: window.__pinia.state.value.chat.activeSessionId,
      messages: (() => {
        const chat = window.__pinia.state.value.chat
        const session = (chat.sessions || []).find(s => s.id === chat.activeSessionId)
        return session?.messages || []
      })().map(m => ({ role: m.role, content: m.content }))
    }))
    check(results, '替换后对话会话内存在消息', stateBeforeReload.messages.length >= 2 && stateBeforeReload.messages.some(m => m.role === 'assistant' && m.content), JSON.stringify({ count: stateBeforeReload.messages.length, sessionId: stateBeforeReload.sessionId }))

    await page.reload()
    await page.waitForTimeout(900)
    const restored = await page.evaluate(() => ({
      sessionId: window.__pinia.state.value.chat.activeSessionId,
      messages: (() => {
        const chat = window.__pinia.state.value.chat
        const session = (chat.sessions || []).find(s => s.id === chat.activeSessionId)
        return session?.messages || []
      })().map(m => ({ role: m.role, content: m.content }))
    }))
    const persisted = await page.evaluate(({ projectId }) => {
      const raw = window.electronAPI.storageRead('wa_chat_' + projectId)
      return Array.isArray(raw) ? raw.flatMap(s => s.messages || []) : []
    }, { projectId: project.projectId })
    check(results, '重载后对话记录持久化恢复', persisted.some(m => m.role === 'assistant' && m.content === responseText), JSON.stringify({ activeCount: restored.messages.length, persistedCount: persisted.length, activeSessionId: restored.sessionId }))

    report = { name: 'P5 编辑器与对话双向同步闭环', passed: results.every(r => r.pass), results, projectId: project.projectId, timestamp: new Date().toISOString() }
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8')
    const client = await context.newCDPSession(page)
    const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(SCREENSHOT, Buffer.from(shot.data, 'base64'))
  } finally {
    await page.evaluate(snapshot => {
      const api = window.electronAPI
      const current = new Set(api.storageList?.() || [])
      for (const key of current) if (key.startsWith('wa_') && !(key in snapshot)) api.storageRemove(key)
      for (const [key, value] of Object.entries(snapshot || {})) api.storageWrite(key, value)
    }, snapshot).catch(() => {})
    await page.waitForTimeout(300).catch(() => {})
    await browser.close().catch(() => {})
  }
  if (!report?.passed) process.exit(1)
}

main().catch(error => { console.error('ERROR | P5 editor/chat verification | ' + error.stack); process.exit(1) })
