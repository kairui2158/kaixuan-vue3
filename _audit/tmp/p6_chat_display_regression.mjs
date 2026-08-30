import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
const page = await context.newPage()
page.on('pageerror', error => { throw new Error(`Browser page error: ${error.message}`) })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })

const transformed = await (await page.request.get('http://localhost:5173/src/components/chat/ChatMessage.vue')).text()
const vuePath = transformed.match(/from "(\/node_modules\/\.vite\/deps\/vue\.js[^"]+)"/)?.[1]
if (!vuePath) throw new Error('Could not resolve Vite Vue module')

const ui = await page.evaluate(async ({ vuePath }) => {
  const vue = await import(vuePath)
  const { renderMarkdown } = await import('/src/utils/markdownService.ts')
  const ChatMessage = (await import('/src/components/chat/ChatMessage.vue')).default

  const source = [
    '## 巡航报告',
    '',
    '| 项目 | 状态 |',
    '| --- | --- |',
    '| 存储 | 正常 |',
    '| 校验 | 警告 |',
    '| 来源 | 缺失 |',
    '',
    '<script>alert("xss")</script>',
    '<img src=x onerror="alert(1)">',
    '[bad](javascript:alert(1))',
    '',
    '```json',
    '{"ok":true}',
    '```'
  ].join('\n')

  const host = document.createElement('div')
  document.body.appendChild(host)
  const message = vue.reactive({ role: 'assistant', content: source, busy: false })
  const app = vue.createApp({ render: () => vue.h(ChatMessage, { message, busy: false }) })
  app.mount(host)
  await vue.nextTick()
  await new Promise(resolve => window.setTimeout(resolve, 350))

  const content = host.querySelector('.message-content')
  if (!content) throw new Error('ChatMessage content missing')
  const rows = content.querySelectorAll('table tbody tr').length
  const badges = {
    success: content.querySelectorAll('.md-status.is-success').length,
    warning: content.querySelectorAll('.md-status.is-warning').length,
    danger: content.querySelectorAll('.md-status.is-danger').length
  }
  const safeHtml = content.innerHTML
  const xssSafe = !content.querySelector('script,img[onerror],a[href^="javascript:" i]')
  const codeCopy = content.querySelector('.code-copy')
  if (!codeCopy) throw new Error('Code copy button missing')

  const selectable = getComputedStyle(content).userSelect
  const range = document.createRange()
  range.selectNodeContents(content.querySelector('table'))
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  const selectedText = selection.toString()
  const selectionCopyOk = document.execCommand('copy')
  await new Promise(resolve => window.setTimeout(resolve, 100))
  const selectionClipboard = await navigator.clipboard.readText()

  function luminance(value) {
    const rgb = value.match(/rgba?\(([^)]+)\)/)?.[1].split(',').map(Number)
    if (!rgb) return null
    const [r, g, b] = rgb
    return [r, g, b].map(channel => {
      const normalized = channel / 255
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    }).reduce((acc, channel, index) => acc + channel * [0.2126, 0.7152, 0.0722][index], 0)
  }

  function badgeContrast() {
    return ['success', 'warning', 'danger'].map(kind => {
      const element = content.querySelector(`.md-status.is-${kind}`)
      const style = getComputedStyle(element)
      const l1 = luminance(style.backgroundColor)
      const l2 = luminance(style.color)
      if (l1 === null || l2 === null) throw new Error(`Cannot resolve ${kind} colors`)
      return { kind, ratio: Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)) }
    })
  }

  const contrast = { dark: badgeContrast() }
  document.body.classList.add('light-theme')
  contrast.light = badgeContrast()
  document.body.classList.remove('light-theme')

  message.busy = true
  message.content += Array.from({ length: 100 }, (_, index) => `| 流式${index} | 通过 |`).join('\n')
  await vue.nextTick()
  const duringLength = (content.textContent || '').length
  const startedAt = performance.now()
  await new Promise(resolve => window.setTimeout(resolve, 320))
  message.busy = false
  await new Promise(resolve => window.setTimeout(resolve, 80))
  const streaming = {
    duringLength,
    finalLength: (content.textContent || '').length,
    finalHasLastRow: (content.textContent || '').includes('流式99'),
    durationMs: Math.round(performance.now() - startedAt)
  }

  return {
    renderedDirect: renderMarkdown('| 名称 | 状态 |\n|---|---|\n| 测试 | 通过 |').includes('<table'),
    tableRows: rows,
    badges,
    safeHtml,
    xssSafe,
    selectable,
    selectedText,
    selectionCopyOk,
    selectionClipboard,
    contrast,
    streaming
  }
}, { vuePath })

if (!ui.selectionCopyOk || !ui.selectionClipboard.includes('项目') || !ui.selectedText.includes('项目')) {
  throw new Error(`Selection copy did not reach clipboard: ${JSON.stringify({ selectedText: ui.selectedText, selectionCopyOk: ui.selectionCopyOk, clipboard: ui.selectionClipboard })}`)
}

await page.locator('.message-content .code-copy').first().click()
await page.waitForTimeout(80)
const codeCopied = await page.evaluate(() => navigator.clipboard.readText())
if (!codeCopied.includes('{"ok":true}')) throw new Error('Code copy failed')

if (ui.tableRows !== 3) throw new Error(`Expected 3 table rows, got ${ui.tableRows}`)
if (ui.badges.success !== 1 || ui.badges.warning !== 1 || ui.badges.danger !== 1) throw new Error('Badge assertion failed')
if (!ui.xssSafe) throw new Error('XSS payload survived sanitization')
if (ui.selectable !== 'text') throw new Error(`Expected selectable text, got ${ui.selectable}`)
if (!ui.streaming.finalHasLastRow || ui.streaming.finalLength <= ui.streaming.duringLength || ui.streaming.durationMs > 500) {
  throw new Error(`Streaming assertion failed: ${JSON.stringify(ui.streaming)}`)
}
for (const theme of ['dark', 'light']) {
  for (const item of ui.contrast[theme]) {
    if (item.ratio < 4.5) throw new Error(`${theme} ${item.kind} contrast ${item.ratio} < 4.5`)
  }
}

const sourceChecks = {
  skillBindIsBindingOnly: !readFileSync('src/components/common/SkillBindModal.vue', 'utf8').includes('ChatMessage'),
  outlineUsesService: readFileSync('src/components/common/OutlineWorkspace.vue', 'utf8').includes("from '../../utils/markdownService'"),
  outlineSelectable: /\.ow-msg-bubble\s*\{[^}]*user-select:\s*text/.test(readFileSync('src/components/common/OutlineWorkspace.vue', 'utf8')),
  skillPreviewUsesService: readFileSync('src/components/settings/SkillSettings.vue', 'utf8').includes("from '../../utils/markdownService'"),
  pipelineReportOptIn: readFileSync('src/components/pipeline/PipelinePanel.vue', 'utf8').includes('const toolResultHtml = computed(() => renderMarkdown(toolResult.value))'),
  pipelineSelectable: readFileSync('src/components/pipeline/PipelinePanel.vue', 'utf8').includes('.pl-tool-result { margin-top: 6px; padding: 6px 10px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: var(--font-size-sm); color: var(--text-primary); max-height: 180px; overflow-y: auto; user-select: text; cursor: text; }'),
  noDeadAiMarkdownHook: !readFileSync('src/styles/ai-content.css', 'utf8').includes('.ai-markdown')
}
if (Object.values(sourceChecks).some(value => value === false)) throw new Error(`Static surface assertion failed: ${JSON.stringify(sourceChecks)}`)

const result = { ui, sourceChecks, codeCopied: codeCopied.slice(0, 80) }
writeFileSync('_audit/tmp/p6_chat_display_result.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
await browser.close()
