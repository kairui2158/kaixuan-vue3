import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const OUTLINE_PATH = path.resolve(
  process.env.SHENYI_REAL_OUTLINE_PATH
    || 'C:/Users/凯瑞/Desktop/测试/《绿潮》大纲总纲.md',
)
const ELECTRON_EXE = process.env.SHENYI_DIRECT_WRITE_ELECTRON
  ? path.resolve(process.env.SHENYI_DIRECT_WRITE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9283
const MOCK_PORT = 59941
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'real-outline-10r-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'real-outline-10r-exports')
const SCREENSHOT_DIR = path.join(ROOT, '_audit', 'verification-real-outline-10r')
const PROJECT_ID = 'real-outline-10r-project'
const LONG_DOCUMENT_CHAR_THRESHOLD = 10_000
const EDIT_TASK_CHAR_THRESHOLD = 80_000


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(400)
  }
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundleNames = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references at least one JS bundle')
  const sourceRoot = path.join(ROOT, 'src')
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collectSources(sourceRoot)
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
}

function textCompletion(content) {
  return {
    choices: [{
      finish_reason: 'stop',
      message: { role: 'assistant', content },
    }],
  }
}

function toolCall(name, input, id) {
  return {
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id,
          type: 'function',
          function: { name, arguments: JSON.stringify(input) },
        }],
      },
    }],
  }
}

const writePayload = (commands, reason) => ({
  commands,
  reveal: { mode: 'instant', firstChange: true },
  reason,
})

let roundCommands = []
let roundFinalText = ''
let roundIndex = 0
let scenarioCount = 0
const requests = []

function respond(response, body, payload) {
  if (body?.stream) {
    const delta = payload.choices?.[0]?.message || {}
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.write(`data: ${JSON.stringify({
      id: `real-outline-10r-${roundIndex}-${scenarioCount}`,
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        finish_reason: payload.choices?.[0]?.finish_reason,
        delta: {
          role: 'assistant',
          content: delta.content || '',
          tool_calls: delta.tool_calls,
        },
      }],
    })}\n\n`)
    response.write('data: [DONE]\n\n')
    response.end()
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const isIntentClassifier = (body?.messages || []).some(message =>
      message?.role === 'system' && String(message.content || '').includes('意图分类器'))
    const record = {
      roundIndex,
      requestCount: isIntentClassifier ? 0 : scenarioCount + 1,
      isIntentClassifier,
      tools: (body?.tools || []).map(tool => tool?.function?.name || tool?.name || '').filter(Boolean),
      body,
    }
    requests.push(record)
    if (isIntentClassifier) {
      assert.equal(record.tools.length, 0, 'intent classifier request must not carry editor tools')
      respond(response, body, textCompletion('{"intent":"edit","confidence":0.94,"reason":"用户明确要求修改大纲"}'))
      return
    }
    scenarioCount += 1
    record.requestCount = scenarioCount
    console.log(`[MOCK] round ${roundIndex} #${scenarioCount}: ${record.tools.join(', ') || '(no tools)'}`)
    const payload = scenarioCount === 1
      ? toolCall('editor.write', writePayload(roundCommands, `真实大纲第 ${roundIndex} 轮直写`), `real-outline-write-${roundIndex}`)
      : textCompletion(roundFinalText)
    respond(response, body, payload)
  })
})

function startElectron() {
  return spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
    },
    windowsHide: true,
  })
}

async function waitForCdp() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(500)
  }
  return false
}

async function closeProjectModal(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(400)
}

async function setupProject(page) {
  await page.evaluate(async ({ mockUrl, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'real-outline-10r-provider',
        name: 'Real Outline 10R Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['real-outline-10r-model'],
        selectedModel: 'real-outline-10r-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'real-outline-10r-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: '绿潮大纲直写实测',
      outlineText: '',
      outlineLocked: false,
      outlineLockedText: '',
      bookWordCount: 0,
      volumesConfirmed: false,
      pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 2000 },
      chaptersConfirmed: false,
      settingsGenerated: true,
      settings: [],
      volumes: [],
      chapters: {},
      settingBindings: {},
      settingsCollection: { categories: [], items: {} },
      memories: {},
      memoryBlacklist: [],
      aiNaming: null,
      outlineChat: [],
      chat: [],
      editorTabs: [],
    })
    const pipelineConfig = await window.electronAPI.storageRead('wa_pipeline_step_config') || {}
    pipelineConfig.skills = pipelineConfig.skills || {}
    pipelineConfig.modes = pipelineConfig.modes || {}
    pipelineConfig.skills[0] = []
    pipelineConfig.modes[0] = 'chain'
    await window.electronAPI.storageWrite('wa_pipeline_step_config', pipelineConfig)
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { mockUrl: MOCK_BASE_URL, projectId: PROJECT_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await closeProjectModal(page)
}

async function importRealOutline(page, outline) {
  await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
  await sleep(200)
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 15000 })
  await page.locator('#outline-workspace input[type="file"][accept=".txt,.md,.text,.rtf,.docx"]')
    .or(page.locator('input[type="file"][accept=".txt,.md,.text,.rtf,.docx"]'))
    .first()
    .setInputFiles(OUTLINE_PATH)
  await page.waitForFunction(expected => {
    const text = window.__pinia?._s?.get('project')?.outlineText || ''
    return text.length >= expected
  }, Math.min(outline.length, 100000), { timeout: 30000, polling: 250 })
  await sleep(500)
}

async function waitOutlineIdle(page, timeout = 90000) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout, polling: 250 })
  await sleep(250)
}

async function sendOutline(page, text, waitFor) {
  await waitOutlineIdle(page)
  scenarioCount = 0
  const before = requests.length
  await page.locator('#ow-chat-input').fill(text)
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  try {
    await page.waitForFunction(value => (document.body.textContent || '').includes(value), waitFor, { timeout: 90000, polling: 250 })
  } catch (error) {
    const bodyText = await page.evaluate(() => (document.body.textContent || '').slice(-5000))
    console.error(`[OUTLINE TIMEOUT] round ${roundIndex}: ${text}\n[REQUESTS] ${requests.slice(before).map(item => `${item.roundIndex}#${item.requestCount}${item.isIntentClassifier ? 'C' : ''}`).join(', ')}\n${bodyText}`)
    throw error
  }
  await waitOutlineIdle(page)
  return requests.slice(before)
}

function outlineContent(page) {
  return page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
}

async function latestRun(page) {
  return await page.evaluate(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    return {
      id: run.id,
      status: run.status,
      turns: (run.turns || []).map(turn => ({
        id: turn.id,
        status: turn.status,
        userRequest: turn.userRequest,
        intent: turn.intent || null,
        reason: turn.reason || null,
        toolSurface: (turn.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
      })),
      apiCalls: (run.apiCalls || []).map(call => ({
        id: call.id,
        turnId: call.turnId || null,
        status: call.status,
        error: call.error || null,
        errorCode: call.errorCode || null,
        finishReason: call.finishReason || null,
        actualToolSurface: (call.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
        toolCalls: (call.toolCalls || []).map(tool => ({
          toolCallId: tool.toolCallId || null,
          name: tool.name,
          status: tool.status,
          input: tool.input || null,
          error: tool.error || null,
          errorCode: tool.errorCode || null,
        })),
      })),
      events: (run.events || []).map(event => ({
        turnId: event.turnId || null,
        type: event.type,
        level: event.level,
        label: event.label,
        detail: event.detail,
      })),
    }
  })
}

function systemPromptOf(record) {
  return (record?.body?.messages || [])
    .filter(message => message?.role === 'system')
    .map(message => String(message.content || ''))
    .join('\n')
}

function assertWriteRequest(record, label) {
  assert(record?.tools.includes('editor.write'), `${label}: provider request carries editor.write`)
  const prompt = systemPromptOf(record)
  assert(!prompt.includes('本轮未开放写入工具'), `${label}: system prompt must not deny write permission`)
  assert(!prompt.includes('本轮未开放 editor.write'), `${label}: system prompt must not close editor.write`)
}

async function capture(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true })
  console.log(`[PASS] screenshot saved: ${name}.png`)
}

function uniqueParagraphs(text) {
  const paragraphs = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length >= 40 && !line.startsWith('#') && !line.startsWith('【'))
  return paragraphs.filter(paragraph => text.indexOf(paragraph) === text.lastIndexOf(paragraph))
}

function markdownSections(text) {
  const matches = [...text.matchAll(/^##\s+(.+)$/gm)]
  return matches.map((match, index) => {
    const start = match.index ?? 0
    const end = index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length
    const sectionText = text.slice(start, end).trimEnd()
    return {
      title: match[0],
      titleText: match[1].trim(),
      start,
      end,
      text: sectionText,
    }
  })
}

function moveEditorFragment({ content, target, destination, position }) {
  const targetIndex = content.indexOf(target)
  assert(targetIndex >= 0, 'move plan finds the target heading')
  assert(content.indexOf(target, targetIndex + 1) < 0, 'move target heading is unique')
  const targetAtLineStart = targetIndex === 0 || content[targetIndex - 1] === '\n'
  const targetEnd = targetIndex + target.length
  const targetAtLineEnd = targetEnd === content.length || content[targetEnd] === '\n'
  let cutStart = targetIndex
  let cutEnd = targetEnd
  if (targetAtLineStart && targetAtLineEnd) {
    if (content[targetEnd] === '\n') cutEnd += 1
    else if (cutStart > 0 && content[cutStart - 1] === '\n') cutStart -= 1
  }
  const contentWithoutTarget = content.slice(0, cutStart) + content.slice(cutEnd)
  const destinationIndex = contentWithoutTarget.indexOf(destination)
  assert(destinationIndex >= 0, 'move plan finds the destination heading')
  assert(contentWithoutTarget.indexOf(destination, destinationIndex + 1) < 0, 'move destination heading is unique')
  const destinationEnd = destinationIndex + destination.length
  const destinationAtLineStart = destinationIndex === 0 || contentWithoutTarget[destinationIndex - 1] === '\n'
  const destinationAtLineEnd = destinationEnd < contentWithoutTarget.length
    && contentWithoutTarget[destinationEnd] === '\n'
  let insertionIndex = destinationIndex
  let insertionText = target
  if (position === 'before') {
    if (destinationAtLineStart && !insertionText.endsWith('\n')) insertionText += '\n'
  } else {
    insertionIndex = destinationAtLineEnd ? destinationEnd + 1 : destinationEnd
    if (!insertionText.endsWith('\n')) insertionText += '\n'
  }
  return contentWithoutTarget.slice(0, insertionIndex)
    + insertionText
    + contentWithoutTarget.slice(insertionIndex)
}

function replaceUniqueFragment(content, target, replacement) {
  const index = content.indexOf(target)
  assert(index >= 0, 'punctuation plan finds the target paragraph')
  assert(content.indexOf(target, index + 1) < 0, 'punctuation target paragraph is unique')
  return content.slice(0, index) + replacement + content.slice(index + target.length)
}

function convertHalfWidthPunctuation(value) {
  const fullWidth = { ',': '，', '.': '。', ';': '；', ':': '：', '!': '！', '?': '？' }
  return value.replace(/[,.;:!?]/g, (match, offset, full) => {
    const isDecimal = (match === '.' || match === ',')
      && /\d/.test(full[offset - 1] || '')
      && /\d/.test(full[offset + 1] || '')
    return isDecimal ? match : fullWidth[match]
  })
}

function halfWidthPunctuationCount(value) {
  let count = 0
  for (let index = 0; index < value.length; index += 1) {
    if (!/[,.;:!?]/.test(value[index])) continue
    const isDecimal = (value[index] === '.' || value[index] === ',')
      && /\d/.test(value[index - 1] || '')
      && /\d/.test(value[index + 1] || '')
    if (!isDecimal) count += 1
  }
  return count
}

function buildRounds(outline) {
  const paragraphs = uniqueParagraphs(outline)
  assert(paragraphs.length >= 10, `real outline provides enough unique paragraphs: ${paragraphs.length}`)

  const sections = markdownSections(outline)
    .filter(section => section.text.length >= 300 && section.text.length <= 30000)
    .filter(section => outline.indexOf(section.text) === outline.lastIndexOf(section.text))
  assert(sections.length >= 8, `real outline provides enough movable sections: ${sections.length}`)

  const punctuationParagraphs = paragraphs
    .map(paragraph => ({ paragraph, count: halfWidthPunctuationCount(paragraph) }))
    .filter(item => item.count >= 1)
  assert(punctuationParagraphs.length >= 9, `real outline provides punctuation paragraphs: ${punctuationParagraphs.length}`)

  let roundState = outline
  return Array.from({ length: 10 }, (_, index) => {
    const round = index + 1
    const paragraph = paragraphs[index]
    const punctuationParagraph = punctuationParagraphs[index % punctuationParagraphs.length].paragraph
    const punctuationTarget = roundState.includes(punctuationParagraph)
      ? punctuationParagraph
      : convertHalfWidthPunctuation(punctuationParagraph)
    const punctuationContent = convertHalfWidthPunctuation(punctuationTarget)
    roundState = replaceUniqueFragment(roundState, punctuationTarget, punctuationContent)
    const moved = sections[index % sections.length]
    const destination = sections[(index + 1) % sections.length]
    const markerWrite = `【直写实测补写${round}】`
    const markerModified = `【直写实测修改${round}】`
    return {
      index: round,
      type: 'combined',
      userText: `第 ${round} 轮混合处理：先在这段后面补一句${markerWrite}，再把它改成${markerModified}；删掉一句我指定的旧标记；把《${moved.titleText}》整节移动到《${destination.titleText}》${index % 2 === 0 ? '前面' : '后面'}；最后把选中的一段半角标点统一成全角。`,
      finalText: `第 ${round} 轮四项混合操作完成：已补写并修改、删除、整节重排、统一标点。`,
      commands: [
        {
          operation: 'replace_match',
          target: paragraph,
          content: `${paragraph}${markerWrite}`,
          reason: `第 ${round} 轮混合补写`,
        },
        {
          operation: 'replace_match',
          target: markerWrite,
          content: markerModified,
          reason: `第 ${round} 轮混合修改`,
        },
        {
          operation: 'delete',
          target: markerModified,
          reason: `第 ${round} 轮混合删除本轮临时标记`,
        },
        {
          operation: 'move',
          target: moved.title,
          destination: destination.title,
          destinationPosition: index % 2 === 0 ? 'before' : 'after',
          reason: `第 ${round} 轮混合整节重排`,
        },
        {
          operation: 'replace_match',
          target: punctuationTarget,
          content: punctuationContent,
          reason: `第 ${round} 轮混合标点统一`,
        },
      ],
      verify: (before, after) => {
        const movedContent = moveEditorFragment({
          content: before,
          target: moved.title,
          destination: destination.title,
          position: index % 2 === 0 ? 'before' : 'after',
        })
        const expected = replaceUniqueFragment(
          movedContent,
          punctuationTarget,
          punctuationContent,
        )
        if (after !== expected) {
          const debugDir = path.join(ROOT, '_audit', 'verification-real-outline-10r', 'debug')
          fs.mkdirSync(debugDir, { recursive: true })
          fs.writeFileSync(path.join(debugDir, `round-${round}-initial-outline.txt`), outline, 'utf8')
          fs.writeFileSync(path.join(debugDir, `round-${round}-moved-source.txt`), movedContent, 'utf8')
          fs.writeFileSync(path.join(debugDir, `round-${round}-punctuation-target.txt`), punctuationTarget, 'utf8')
          fs.writeFileSync(path.join(debugDir, `round-${round}-before.txt`), before, 'utf8')
          fs.writeFileSync(path.join(debugDir, `round-${round}-after.txt`), after, 'utf8')
          fs.writeFileSync(path.join(debugDir, `round-${round}-expected.txt`), expected, 'utf8')
          const firstDifference = (() => {
            const length = Math.min(after.length, expected.length)
            let cursor = 0
            while (cursor < length && after[cursor] === expected[cursor]) cursor += 1
            return cursor
          })()
          console.error(`[DEBUG] round ${round} first difference at ${firstDifference}: after=${JSON.stringify(after.slice(Math.max(0, firstDifference - 80), firstDifference + 120))} expected=${JSON.stringify(expected.slice(Math.max(0, firstDifference - 80), firstDifference + 120))}`)
        }
        assert(after.includes(paragraph), `round ${round}: appended paragraph survives`)
        assert(!after.includes(markerWrite), `round ${round}: intermediate marker is replaced`)
        assert(!after.includes(markerModified), `round ${round}: temporary marker is deleted`)
        assert(after.includes(moved.title), `round ${round}: moved section survives`)
        assert.equal(after, expected, `round ${round}: editor content matches the combined operations exactly`)
        assert(after.includes(punctuationContent), `round ${round}: punctuation paragraph is normalized`)
        assert(!after.includes(punctuationParagraph), `round ${round}: half-width punctuation paragraph is replaced`)
        assert(Math.abs(after.length - before.length) <= 2, `round ${round}: structural edits preserve document length within newline tolerance`)
      },
    }
  })
}


async function exportAllRuns(page) {
  return await page.evaluate(async exportRoot => {
    const store = window.__pinia?._s?.get('runTrace')
    const runs = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => a.startedAt - b.startedAt)
    const results = []
    for (const [index, run] of runs.entries()) {
      const exported = await window.electronAPI.runTraceExport({
        schema: 'shenyi.run-trace',
        version: 2,
        run: store.exportRunToJson(run),
        mode: 'deep',
        payloadDirectoryHint: exportRoot,
      })
      results.push({ index, runId: run.id, success: Boolean(exported?.success), path: exported?.path || null })
    }
    return results
  }, EXPORT_ROOT)
}

async function main() {
  assertFreshRendererBuild()
  assert(fs.existsSync(OUTLINE_PATH), `real outline exists: ${OUTLINE_PATH}`)
  const outline = fs.readFileSync(OUTLINE_PATH, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
  assert(outline.length >= LONG_DOCUMENT_CHAR_THRESHOLD, `real outline reaches the long-document threshold: ${outline.length}`)
  assert(outline.length < EDIT_TASK_CHAR_THRESHOLD, `this verifier covers the direct long-document path; use the EditTask verifier above ${EDIT_TASK_CHAR_THRESHOLD} chars: ${outline.length}`)
  const rounds = buildRounds(outline)
  assert.equal(rounds.length, 10, 'exactly ten user rounds are executed')

  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  removeDir(SCREENSHOT_DIR)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const electronProcess = startElectron()
  let browser = null
  const roundEvidence = []
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
      if (!page) await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') console.log(`[PAGE CONSOLE ERROR] ${message.text()}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await setupProject(page)
    await importRealOutline(page, outline)

    const imported = await outlineContent(page)
    assert.equal(imported.length, outline.length, 'file import loads the full real outline without truncation')
    assert(imported.includes('《绿潮》大纲总纲'), 'file import keeps the real outline title')
    await capture(page, '00-real-outline-imported')

    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 15000 })

    for (const round of rounds) {
      roundIndex = round.index
      roundCommands = round.commands
      roundFinalText = round.finalText
      const before = await outlineContent(page)
      assert(before.length >= LONG_DOCUMENT_CHAR_THRESHOLD, `round ${round.index}: document stays in long-document mode`)
      const roundRequests = await sendOutline(page, round.userText, round.finalText)
      const after = await outlineContent(page)

      round.verify(before, after)
      assert.notEqual(after, before, `round ${round.index}: editor content changes`)

      const nonIntentRequests = roundRequests.filter(record => !record.isIntentClassifier)
      assert(nonIntentRequests.length >= 2, `round ${round.index}: performs a tool request and a final answer request`)
      assertWriteRequest(nonIntentRequests[0], `round ${round.index} write request`)
      assert(nonIntentRequests[0].tools.includes('editor.document_map'), `round ${round.index}: long-document surface carries document map`)
      assert(nonIntentRequests[0].tools.includes('editor.read_range'), `round ${round.index}: long-document surface carries segmented reads`)

      const run = await latestRun(page)
      const turn = (run?.turns || []).find(item => item.userRequest === round.userText)
      assert(turn, `round ${round.index}: run trace records the user turn`)
      assert.equal(turn?.intent, 'edit', `round ${round.index}: turn intent is edit`)
      assert((turn?.toolSurface || []).some(tool => tool.name === 'editor.write' && tool.policy === 'write'), `round ${round.index}: turn records write tool surface`)
      const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
      assert(calls.length > 0, `round ${round.index}: turn records API calls`)
      for (const call of calls) {
        assert((call.actualToolSurface || []).some(tool => tool.name === 'editor.write' && tool.policy === 'write'), `round ${round.index}: API call records write surface`)
        assert.notEqual(call.status, 'running', `round ${round.index}: API call is closed`)
      }
      const writes = calls.flatMap(call => call.toolCalls || []).filter(call => call.name === 'editor.write')
      assert.equal(writes.length, 1, `round ${round.index}: records exactly one combined editor.write call`)
      assert.equal(writes[0]?.status, 'success', `round ${round.index}: editor.write succeeds`)
      assert.equal(writes[0]?.errorCode, null, `round ${round.index}: editor.write has no error code`)
      const events = (run?.events || []).filter(event => event.turnId === turn?.id)
      assert(events.some(event => event.type === 'long-document-policy'), `round ${round.index}: trace records long-document policy`)
      assert.equal(events.filter(event => event.type === 'edit-task-task-finished').length, 1, `round ${round.index}: direct write finishes its single-batch EditTask audit trail`)
      assert.equal(await page.locator('.edit-task-banner').count(), 0, `round ${round.index}: direct path leaves no task banner`)

      await capture(page, `round-${String(round.index).padStart(2, '0')}-combined`)
      roundEvidence.push({
        index: round.index,
        type: round.type,
        userText: round.userText,
        operations: round.commands.map(command => command.operation),
        beforeChars: before.length,
        afterChars: after.length,
        deltaChars: after.length - before.length,
        nonIntentRequests: nonIntentRequests.length,
        toolNames: nonIntentRequests[0]?.tools || [],
        runId: run?.id || null,
        turnId: turn?.id || null,
        screenshot: `round-${String(round.index).padStart(2, '0')}-combined.png`,
      })
      console.log(`[PASS] round ${round.index}/10 combined modify+delete+reorder+punctuation verified`)
    }

    const exports = await exportAllRuns(page)
    assert(exports.length >= 1, 'the chat-session outline run is exported')
    let exportedTurnCount = 0
    let exportedApiCallCount = 0
    let exportedPhysicalCallCount = 0
    let exportedEditTaskFinishedCount = 0
    for (const item of exports) {
      assert(item.success, `run export succeeds: ${item.runId}`)
      assert(fs.existsSync(item.path), `run export path exists: ${item.path}`)
      const exportedRun = JSON.parse(fs.readFileSync(path.join(item.path, 'run-trace.json'), 'utf8'))
      assert.equal(exportedRun.id, item.runId, 'exported run id matches')
      exportedTurnCount += (exportedRun.turns || []).length
      exportedApiCallCount += (exportedRun.apiCalls || []).length
      exportedPhysicalCallCount += (exportedRun.apiCalls || [])
        .reduce((count, call) => count + (call.physicalCalls || []).length, 0)
      exportedEditTaskFinishedCount += (exportedRun.events || [])
        .filter(event => event.type === 'edit-task-task-finished').length
      assert(exportedRun.apiCalls.every(call => call.status !== 'running'), `exported run has no running API call: ${item.runId}`)
      fs.copyFileSync(
        path.join(item.path, 'run-trace.json'),
        path.join(SCREENSHOT_DIR, `run-trace-session-${String(item.index + 1).padStart(2, '0')}.json`),
      )
    }
    assert.equal(exportedTurnCount, 10, 'exported chat session contains all ten user turns')
    assert.equal(exportedApiCallCount, 10, `exported chat session contains one logical API call per turn: ${exportedApiCallCount}`)
    assert.equal(exportedPhysicalCallCount, 20, `exported chat session contains both physical requests for every turn: ${exportedPhysicalCallCount}`)
    assert.equal(exportedEditTaskFinishedCount, 10, 'exported chat session contains ten finished EditTask audit events')

    const finalContent = await outlineContent(page)
    const screenshotFiles = fs.readdirSync(SCREENSHOT_DIR).filter(name => name.endsWith('.png'))
    assert.equal(screenshotFiles.length, 11, 'import plus ten round screenshots are present')
    const report = {
      schema: 'shenyi.api-direct-write-real-outline-10r',
      version: 1,
      generatedAt: new Date().toISOString(),
      outline: {
        path: OUTLINE_PATH,
        chars: outline.length,
        bytes: fs.statSync(OUTLINE_PATH).size,
        sha256: crypto.createHash('sha256').update(outline, 'utf8').digest('hex'),
        finalChars: finalContent.length,
      },
      rounds: roundEvidence,
      hardAssertions: {
        realFileImport: true,
        tenRounds: roundEvidence.length === 10,
        fourOperationsPerRound: {
          modifyWrite: roundEvidence.every(item => item.operations?.includes('replace_match')),
          delete: roundEvidence.every(item => item.operations?.includes('delete')),
          reorder: roundEvidence.every(item => item.operations?.includes('move')),
          punctuation: roundEvidence.every(item => item.operations?.filter(operation => operation === 'replace_match').length >= 2),
        },
        longDocumentPolicyEveryRound: true,
        executionModeEveryRound: 'direct',
        editTaskBatchFinishedEveryRound: true,
        writeSurfaceEveryRound: true,
        noPermissionDenialPrompt: true,
        chatSessionExportComplete: {
          exported: exports.length >= 1,
          turns: exportedTurnCount === 10,
          logicalApiCalls: exportedApiCallCount === 10,
          physicalCalls: exportedPhysicalCallCount === 20,
          editTaskFinished: exportedEditTaskFinishedCount === 10,
        },
      },
    }
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'real-outline-10r-report.json'), JSON.stringify(report, null, 2), 'utf8')
    const debugDir = path.join(ROOT, '_audit', 'verification-real-outline-10r', 'debug')
    if (fs.existsSync(debugDir)) fs.rmSync(debugDir, { recursive: true, force: true })
    await capture(page, '11-final-real-outline-state')

    await browser.close()
    browser = null
    console.log('===== REAL OUTLINE API DIRECT WRITE 10R E2E PASSED =====')
  } finally {
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    server.close()
    await sleep(800)
    removeDir(PROFILE)
    removeDir(EXPORT_ROOT)
    console.log('[CLEANUP] temporary profile and exports removed; evidence retained in _audit/verification-real-outline-10r')
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
