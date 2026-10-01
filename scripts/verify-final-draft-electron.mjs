import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const ROOT = path.resolve(process.cwd())
const ELECTRON_EXE = process.env.SHENYI_DIRECT_WRITE_ELECTRON
  ? path.resolve(process.env.SHENYI_DIRECT_WRITE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_FINAL_DRAFT_CDP_PORT || 9313)
const PROFILE = path.join(ROOT, '_data', 'final-draft-electron-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'final-draft-electron-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-final-draft-electron')
const CREDENTIAL_PROFILE_FALLBACKS = [
  path.join(ROOT, '_data', 'long-document-restructure-phase6-credentials'),
  path.join(ROOT, '_data', 'long-document-restructure-phase6-profile'),
  path.join(ROOT, '_data', 'outline-deletion-live-replay-profile'),
]
const { safeStorage } = require('electron')
const PROJECT_ID = 'final-draft-electron-live'
const MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
// 0 disables a fixed cap. Long final-draft runs are bounded by progress
// stalls instead, so a slow but actively streaming model is never killed.
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_STEP_TIMEOUT_MS ?? 0)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_GLOBAL_TIMEOUT_MS ?? 0)
const STALLED_TIMEOUT_MS = Number(process.env.SHENYI_FINAL_DRAFT_STALLED_TIMEOUT_MS ?? 20 * 60_000)
const PROGRESS_POLL_INTERVAL_MS = Number(process.env.SHENYI_FINAL_DRAFT_PROGRESS_POLL_INTERVAL_MS ?? 1_000)
const BUTTON_TIMEOUT_MS = Number(process.env.SHENYI_FINAL_DRAFT_BUTTON_TIMEOUT_MS ?? 30_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.SHENYI_FINAL_DRAFT_HEARTBEAT_INTERVAL_MS || 15_000)

const ALL_SIZES = [
  { id: 'S100', targetChars: 100_000, tolerance: 2_000 },
  { id: 'S200', targetChars: 200_000, tolerance: 2_000 },
  { id: 'S1M', targetChars: 1_000_000, tolerance: 5_000 },
]
const ALL_SCENARIOS = ['scale', 'stalled-recovery']
const REQUESTED_SCENARIOS = (process.env.SHENYI_FINAL_DRAFT_SCENARIOS || '')
  .split(',')
  .map(item => item.trim().toLowerCase())
  .filter(Boolean)
const SCENARIOS = REQUESTED_SCENARIOS.length
  ? ALL_SCENARIOS.filter(item => REQUESTED_SCENARIOS.includes(item))
  : ALL_SCENARIOS
const REQUESTED_SIZES = (process.env.SHENYI_FINAL_DRAFT_SIZES || '')
  .split(',')
  .map(item => item.trim().toUpperCase())
  .filter(Boolean)
const SIZES = REQUESTED_SIZES.length
  ? ALL_SIZES.filter(item => REQUESTED_SIZES.includes(item.id))
  : ALL_SIZES

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(300)
  }
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundleNames = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references at least one JS bundle')
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collectSources(path.join(ROOT, 'src'))
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function makeSectionBody(index, paragraphIndex) {
  const badPunctuation = paragraphIndex === 1 ? ',,' : paragraphIndex === 2 ? '。。' : '  '
  return `独立终稿节点 ${index}-${paragraphIndex}：潮汐计在第三节偏移了 ${index % 9} 度${badPunctuation}船坞内保留了旧信号灯，维修记录与沈萤的航线笔记互为印证。该段用于终稿生成、分段与完整性验证，包含中文标点与少量英文 token-${index}-${paragraphIndex}。`
}

function buildSyntheticOutline(targetChars) {
  const title = '# 终稿生成压力测试大纲'
  const lines = [title]
  let currentChars = title.length
  let sectionIndex = 0
  const sections = []
  while (currentChars < targetChars) {
    sectionIndex += 1
    const volume = Math.ceil(sectionIndex / 100)
    const chapter = ((sectionIndex - 1) % 100) + 1
    const heading = `## 第${volume}卷 第${chapter}节：终稿节点${sectionIndex}`
    const sectionLines = ['', heading]
    currentChars += 2 + heading.length
    const paragraphs = 3 + (sectionIndex % 3)
    for (let paragraphIndex = 1; paragraphIndex <= paragraphs && currentChars < targetChars; paragraphIndex++) {
      const body = makeSectionBody(sectionIndex, paragraphIndex)
      sectionLines.push('', body)
      currentChars += 2 + body.length
    }
    sections.push(sectionLines.join('\n'))
  }
  // Deterministic non-identity shuffle. A fully ordered source makes "整理排序" a no-op,
  // which previously let the model return the source verbatim and fail contentChanged.
  const shuffled = [...sections]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = index % 2 === 0 ? Math.floor(index / 2) : Math.max(0, index - 3)
    ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
  }
  for (const section of shuffled) {
    lines.push('', section)
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

function headingLines(text) {
  return text.split(/\r?\n/).filter(line => /^#{1,6}\s+/.test(line))
}

function leafBodyMultiset(text) {
  const lines = text.split(/\r?\n/)
  const headings = []
  lines.forEach((line, index) => {
    if (/^#{1,6}\s+/.test(line)) headings.push({ line, index })
  })
  const bodies = []
  headings.forEach((heading, headingIndex) => {
    const next = headings[headingIndex + 1]?.index ?? lines.length
    const body = lines.slice(heading.index + 1, next).join('\n').trim()
    if (body) bodies.push(body)
  })
  if (!headings.length) {
    const body = lines.join('\n').trim()
    if (body) bodies.push(body)
  }
  bodies.sort()
  return bodies
}

function assertSameMultiset(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: item count unchanged`)
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  const missing = [...expectedSet].filter(item => !actualSet.has(item))
  const added = [...actualSet].filter(item => !expectedSet.has(item))
  assert.deepEqual({ missing, added }, { missing: [], added: [] }, label)
}

function normalizeLeafBodyForIntegrity(text) {
  // The requested operation deliberately normalizes punctuation and whitespace.
  // Preserve the check's integrity by comparing lexical substance only.
  return String(text || '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

function leafBodyIntegrityMultiset(text) {
  return leafBodyMultiset(text).map(normalizeLeafBodyForIntegrity)
}

function normalizeFinalDraftText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function normalizeParagraphSeparators(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function findRepeatedWindow(text, blockChars) {
  const normalized = normalizeFinalDraftText(text)
  if (normalized.length < blockChars * 2) return null
  const base = 131n
  const mod = 1_000_000_007n
  const highestWeight = base ** BigInt(blockChars) % mod
  let hash = 0n
  for (let index = 0; index < blockChars; index += 1) {
    hash = (hash * base + BigInt(normalized.charCodeAt(index))) % mod
  }
  const firstByHash = new Map([[hash.toString(), 0]])
  for (let index = blockChars; index < normalized.length; index += 1) {
    const outgoing = BigInt(normalized.charCodeAt(index - blockChars)) * highestWeight % mod
    const incoming = BigInt(normalized.charCodeAt(index))
    hash = (hash * base + incoming + mod - outgoing) % mod
    const key = hash.toString()
    const first = firstByHash.get(key)
    if (
      first !== undefined
      && index - first >= blockChars * 2
      && normalized.slice(first, first + blockChars) === normalized.slice(index, index + blockChars)
    ) {
      return {
        start: first,
        end: first + blockChars,
        repeatStart: index,
        repeatEnd: index + blockChars,
        blockChars,
        preview: normalized.slice(index, index + blockChars),
      }
    }
    if (first === undefined) firstByHash.set(key, index)
  }
  return null
}

function assertFinalDraftClean(label, finalText, source, task) {
  const final = String(finalText || '')
  const normalized = normalizeFinalDraftText(final)
  assert(normalized.length > 0, `${label}: final editor text is not empty`)
  for (const blockChars of [320, 160]) {
    const repeat = findRepeatedWindow(final, blockChars)
    assert.equal(repeat, null, `${label}: final editor text has no duplicated block >= ${blockChars}: ${JSON.stringify(repeat)}`)
  }
  assert(
    task?.completedText === final,
    `${label}: task completedText equals final editor text`,
  )
  assert(
    !/[,,]|。。/.test(final),
    `${label}: dirty punctuation is normalized`,
  )
  assert(
    !/ {2}/.test(final),
    `${label}: double spaces are normalized`,
  )
  assertSameMultiset(leafBodyIntegrityMultiset(final), leafBodyIntegrityMultiset(source), `${label} leaf bodies preserved`)
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      // A stalled stream must still be abortable immediately. The default
      // main-process idle timeout is intentionally longer than this test.
      SHENYI_PROVIDER_NET_STREAM_IDLE_TIMEOUT_MS: '30000',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] pid=${child.pid} model=${MODEL} baseUrl=${process.env.SHENYI_LIVE_BASE_URL}`)
  child.stdout.on('data', chunk => process.stdout.write(`[ELECTRON] ${chunk}`))
  child.stderr.on('data', chunk => process.stderr.write(`[ELECTRON STDERR] ${chunk}`))
  return child
}

async function waitForCdp() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(500)
  }
  return false
}

async function closeElectron(app) {
  if (!app || app.exitCode !== null) return
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
}

function startFinalDraftMockServer() {
  const requests = []
  // The final-draft integrity gate compares heading and leaf structure, so the
  // mock must return protocol-valid segment output rather than bare sentences.
  const segments = [
    '# 停滞恢复测试\n\n## 第一章\n\n第一段源文内容。\n',
    '## 第二章\n\n第二段源文内容。\n',
    '## 第三章\n\n第三段源文内容。\n',
  ]
  const stallResponses = []
  const fastStallMs = Math.max(0, Number(process.env.SHENYI_FINAL_DRAFT_FAST_STALL_MS || 0))
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', chunk => {
      body += chunk
    })
    request.on('end', () => {
      let parsedBody = null
      try { parsedBody = JSON.parse(body || '{}') } catch {}
      const providerB = String(request.headers.authorization || '').includes('sk-test-recovery')
      const sourceText = String(parsedBody?.messages?.map(message => message?.content || '').join('\n') || '')
      const isSegmentOrderPlanning = sourceText.includes('你是终稿分段顺序规划器')
      const segmentBodyMarkers = ['第一段源文内容', '第二段源文内容', '第三段源文内容']
      const segmentSourceBlocks = [
        '# 停滞恢复测试\n\n## 第一章\n\n第一段源文内容。',
        '## 第二章\n\n第二段源文内容。',
        '## 第三章\n\n第三段源文内容。',
      ]
      const activeSegmentIndex = segmentBodyMarkers.findIndex(marker => sourceText.includes(marker))
      const exactSegmentIndex = segmentSourceBlocks.findIndex(block => sourceText.includes(
        `本次需要生成终稿的源文分段：\n${block}`,
      ))
      // Generation requests contain exactly one source-segment body. Prefer
      // that over request order: user-retry restarts segment 1 even when the
      // recovery provider is no longer handling the first generation request.
      // Prefer the exact source-segment block: continuation prompts include the
      // completed segment as tail context, so loose marker matching can return
      // the previous segment and create a false integrity failure.
      const targetIndex = exactSegmentIndex >= 0
        ? exactSegmentIndex
        : isSegmentOrderPlanning
          ? 0
          : activeSegmentIndex >= 0
            ? activeSegmentIndex
            : requests.filter(item => !item.segmentOrderPlanning).length
      requests.push({
        providerB,
        segmentOrderPlanning: isSegmentOrderPlanning,
        segmentIndex: exactSegmentIndex >= 0 ? exactSegmentIndex : targetIndex,
        url: request.url,
        activeSegmentIndex,
      })
      const auth = String(request.headers.authorization || '')
      const providerIndex = providerB ? 1 : 0
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
      })
      const content = isSegmentOrderPlanning
        ? segments.map((_, index) => `segment-${index + 1}`).join('\n')
        : segments[Math.max(0, targetIndex)]
      const firstChunk = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
      if (isSegmentOrderPlanning) {
        response.write(firstChunk)
        response.write('data: [DONE]\n\n')
        response.end()
        return
      }
      if (providerIndex === 0) {
        response.flushHeaders()
        response.write(firstChunk)
        const keepAlive = setInterval(() => {
          if (response.destroyed) {
            clearInterval(keepAlive)
            return
          }
          response.write('')
        }, 60_000)
        const fastStallTimer = fastStallMs > 0
          ? setTimeout(() => {
              try { response.destroy() } catch {}
            }, fastStallMs)
          : null
        response.on('close', () => clearInterval(keepAlive))
        if (fastStallTimer) response.on('close', () => clearTimeout(fastStallTimer))
        response.flush?.()
        console.error(`[MOCK] stall generation request bytes=${Buffer.byteLength(firstChunk)} target=${targetIndex}`)
        // Keep a Node reference so the deliberately unfinished stall response
        // is not treated as an immediately collectable orphan stream.
        stallResponses.push(response)
      } else {
        response.write(firstChunk)
        response.write('data: [DONE]\n\n')
        response.end()
      }
      // Provider A intentionally never closes the stream after its first chunk.
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        requestCount: () => requests.length,
        requests: () => requests.map(item => ({ ...item })),
        close: () => new Promise(done => {
          for (const response of stallResponses) {
            try {
              response.destroy()
            } catch {}
          }
          server.close(() => done())
        }),
      })
    })
  })
}

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function seedStalledRecoveryProject(page, { stallBaseUrl, recoveryBaseUrl, model, documentText }) {
  await page.evaluate(async ({ stallBaseUrl, recoveryBaseUrl, model, projectId, outline }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [
        {
          id: 'stall-recovery-provider-a',
          name: 'Stall Provider A',
          baseUrl: stallBaseUrl,
          apiKey: 'sk-test-stall',
          models: [model],
          selectedModel: model,
          temperature: 0.1,
          maxTokens: 0,
          // At 36420 the effective input budget is 10 tokens: each leaf
          // section costs about 7-8 tokens, so no two sections fit in one
          // segment and the planner emits exactly one segment per section.
          // 36430 leaves a 19-token budget and lets two sections merge.
          contextWindowTokens: 36420,
          purpose: ['generate'],
          providerType: 'openai-compatible',
          streamMode: true,
        },
        {
          id: 'stall-recovery-provider-b',
          name: 'Recovery Provider B',
          baseUrl: recoveryBaseUrl,
          apiKey: 'sk-test-recovery',
          models: [model],
          selectedModel: model,
          temperature: 0.1,
          maxTokens: 0,
          contextWindowTokens: 36420,
          purpose: ['generate'],
          providerType: 'openai-compatible',
          streamMode: true,
        },
      ],
      generateProvider: 'stall-recovery-provider-a',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Final Draft Stall Recovery',
      outlineText: outline,
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
    await window.electronAPI.storageWrite('wa_dAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { stallBaseUrl, recoveryBaseUrl, model, projectId: 'final-draft-stall-recovery', outline: documentText })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await closeProjectModal(page)
}

async function seedProject(page, documentText) {
  await page.evaluate(async ({ baseUrl, model, apiKey, projectId, outline }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'final-draft-live-provider',
        name: 'Final Draft Live',
        baseUrl,
        apiKey,
        models: [model],
        selectedModel: model,
        temperature: 0.1,
        maxTokens: 0,
        contextWindowTokens: 0,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'final-draft-live-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Final Draft Live',
      outlineText: outline,
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
    await window.electronAPI.storageWrite('wa_dAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { baseUrl: process.env.SHENYI_LIVE_BASE_URL, model: MODEL, apiKey: process.env.SHENYI_LIVE_API_KEY, projectId: PROJECT_ID, outline: documentText })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await closeProjectModal(page)
}

async function waitHomeIdle(page, timeout = STEP_TIMEOUT_MS > 0 ? STEP_TIMEOUT_MS : 0) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-send') && !document.querySelector('#btn-send')?.disabled), null, { timeout, polling: 500 })
  await sleep(300)
}

async function waitOutlineIdle(page, timeout = STEP_TIMEOUT_MS > 0 ? STEP_TIMEOUT_MS : 0) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout, polling: 500 })
  await sleep(300)
}

async function collectConversationState(page, source) {
  return page.evaluate(source => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === source)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const turns = run?.turns || []
    const turn = turns[turns.length - 1] || null
    const calls = run?.apiCalls || []
    const editor = window.__pinia?._s?.get('editor')
    const project = window.__pinia?._s?.get('project')
    const chat = source === 'home'
      ? (window.__pinia?._s?.get('chat')?.activeSession?.messages || [])
      : (project?.outlineChat || [])
    return {
      runId: run?.id || null,
      turnId: turn?.id || null,
      turnStatus: turn?.status || null,
      apiStatuses: calls.map(call => call.status),
      physicalCalls: calls.flatMap(call => (call.physicalCalls || []).map(physical => ({
        seq: physical.seq,
        status: physical.status,
        finishReason: physical.finishReason || null,
        error: physical.error || null,
        interruptionCode: physical.interruptionCode || null,
        responseChars: (physical.responseText || '').length,
        requestChars: (physical.requestMessages || []).reduce((sum, message) => sum + String(message.content || '').length, 0),
      }))),
      toolCalls: calls.flatMap(call => call.toolCalls || []),
      toolSurface: calls.flatMap(call => call.actualToolSurface || []),
      eventTypes: (run?.events || []).map(event => event.type),
      finalDraftEvents: (run?.events || [])
        .filter(event => String(event?.type || '').startsWith('final-draft-'))
        .map(event => ({ type: event.type, payload: event.payload || null })),
      lastTask: [...chat].reverse().map(item => item?.finalDraftTask).find(Boolean) || null,
      outlineChars: (project?.outlineText || '').length,
      editorTabCount: (editor?.tabs || []).length,
      editorActiveContent: editor?.activeTab?.content || '',
    }
  }, source)
}

async function readSourceProgress(page, source) {
  return page.evaluate(source => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === source)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const chat = source === 'home'
      ? (window.__pinia?._s?.get('chat')?.activeSession?.messages || [])
      : (window.__pinia?._s?.get('project')?.outlineChat || [])
    const task = [...chat].reverse().map(item => item?.finalDraftTask).find(Boolean) || null
    const summarizeTask = item => item ? {
      taskId: item.taskId || null,
      status: item.status || null,
      activeSegmentIndex: item.activeSegmentIndex ?? null,
      segments: item.sourceSegments?.length ?? null,
      accumulatedChars: item.accumulatedText?.length ?? 0,
      completedChars: item.completedText?.length ?? 0,
    streamingChars: item.lastTelemetry ? Math.max(0, item.accumulatedText.length - item.completedText.length) : 0,
    accumulatedChars: item.accumulatedText?.length ?? 0,
      throughputStatus: item.lastTelemetry?.throughputStatus || null,
      sixtySecondCharsPerSecond: item.lastTelemetry?.sixtySecondCharsPerSecond ?? null,
      continuationCount: item.continuationCount ?? null,
      error: item.error || null,
      updatedAt: item.updatedAt ?? null,
    } : null
    const turns = run?.turns || []
    const turn = turns[turns.length - 1] || null
    const calls = run?.apiCalls || []
    const turnCalls = turn ? calls.filter(call => call.turnId === turn.id) : []
    const activePhysicalCalls = calls
      .filter(call => call.status === 'running')
      .flatMap(call => call.physicalCalls || [])
      .filter(physical => physical.status === 'running')
    const activeStreamChars = activePhysicalCalls.reduce(
      (sum, physical) => sum + (physical.streamText?.length || 0),
      0,
    )
    const logicalStreamChars = Math.max(
      0,
      (task?.accumulatedText?.length || 0) - (task?.completedText?.length || 0),
    )
    const lastStreamActivityAt = activePhysicalCalls.reduce(
      (latest, physical) => Math.max(latest, physical.endedAt || physical.startedAt || 0),
      0,
    )
    const sendButton = document.querySelector(source === 'home' ? '#btn-send' : '#btn-ow-send')
    const physicalCalls = calls.flatMap(call => (call.physicalCalls || []).map(physical => ({
      status: physical.status || null,
      error: physical.error || null,
      interruptionCode: physical.interruptionCode || null,
    })))
    return {
      runId: run?.id || null,
      runStatus: run?.status || null,
      userCount: chat.filter(item => item?.role === 'user').length,
      turnCount: turns.length,
      turnId: turn?.id || null,
      turnStatus: turn?.status || null,
      turnCallCount: turnCalls.length,
      turnCallStatuses: turnCalls.map(call => call.status),
      apiCallCount: calls.length,
      runningApiCallCount: calls.filter(call => call.status === 'running').length,
      physicalCallCount: calls.reduce((sum, call) => sum + (call.physicalCalls?.length || 0), 0),
      physicalCalls,
      activeStreamChars,
      logicalStreamChars,
      lastStreamActivityAt,
      eventCount: run?.events?.length || 0,
      lastEventType: run?.events?.at(-1)?.type || null,
      task: summarizeTask(task),
      sendEnabled: Boolean(sendButton && !sendButton.disabled),
    }
  }, source)
}

function progressSignature(snapshot) {
  return JSON.stringify([
    snapshot.runId,
    snapshot.turnCount,
    snapshot.turnStatus,
    snapshot.turnCallCount,
    snapshot.turnCallStatuses,
    snapshot.apiCallCount,
    snapshot.physicalCallCount,
    snapshot.eventCount,
    snapshot.lastEventType,
    snapshot.task,
    snapshot.sendEnabled,
  ])
}

function describeProgress(snapshot) {
  const task = snapshot.task
  return [
    `turns=${snapshot.turnCount}`,
    `turnStatus=${snapshot.turnStatus || 'none'}`,
    `calls=${snapshot.apiCallCount}`,
    `physical=${snapshot.physicalCallCount}`,
    `events=${snapshot.eventCount}`,
    task ? `task=${task.status}@${task.activeSegmentIndex}/${task.segments || 1},chars=${task.completedChars}+${task.accumulatedChars},cont=${task.continuationCount}` : 'task=none',
  ].join(' ')
}

async function waitForSourceProgress(page, source, isComplete, label) {
  const startedAt = Date.now()
  let lastSignature = null
  let lastProgressAt = Date.now()
  let lastLogAt = 0
  for (;;) {
    const snapshot = await readSourceProgress(page, source)
    if (isComplete(snapshot)) return snapshot
    if (snapshot.task?.status === 'failed' || snapshot.task?.status === 'rolled_back') {
      const failure = await collectFailureEvidence(page, source)
      const failurePath = path.join(EVIDENCE_ROOT, `${source}-task-failure-${Date.now()}.json`)
      fs.writeFileSync(failurePath, JSON.stringify(failure, null, 2), 'utf8')
      throw new Error(
        `${label}: final draft task ${snapshot.task.status}; evidence saved to ${failurePath}; `
        + `task=${describeProgress(snapshot)}; error=${snapshot.task.error || 'unknown'}`,
      )
    }
    const signature = progressSignature(snapshot)
    const now = Date.now()
    if (signature !== lastSignature) {
      lastSignature = signature
      lastProgressAt = now
    }
    if (now - lastLogAt >= 60_000) {
      lastLogAt = now
      console.log(`[${label}:progress] ${describeProgress(snapshot)}`)
    }
    if (STEP_TIMEOUT_MS > 0 && now - startedAt >= STEP_TIMEOUT_MS) {
      throw new Error(`${label}: step timeout after ${STEP_TIMEOUT_MS}ms; last progress: ${describeProgress(snapshot)}`)
    }
    if (now - lastProgressAt >= STALLED_TIMEOUT_MS) {
      throw new Error(`${label}: no progress for ${STALLED_TIMEOUT_MS}ms; last progress: ${describeProgress(snapshot)}`)
    }
    await sleep(PROGRESS_POLL_INTERVAL_MS)
  }
}

async function collectFailureEvidence(page, source) {
  const [state, snapshot] = await Promise.all([
    collectConversationState(page, source),
    readSourceProgress(page, source),
  ])
  return {
    generatedAt: new Date().toISOString(),
    source,
    snapshot,
    conversationState: state,
  }
}

async function waitForSourceTurnComplete(page, source, { expectedUsers = 0, minTurnCount = 0, label = source }) {
  const requiredTurns = Math.max(expectedUsers, minTurnCount)
  return waitForSourceProgress(page, source, snapshot => {
    if (requiredTurns > 0 && snapshot.turnCount < requiredTurns) return false
    if (!snapshot.turnStatus || snapshot.turnStatus === 'running') return false
    if (snapshot.turnCallCount === 0) return false
    if (snapshot.turnCallStatuses.some(status => status === 'running')) return false
    if (snapshot.runningApiCallCount > 0) return false
    return snapshot.sendEnabled
  }, `${label}:turn-complete`)
}

async function clickContinueFinalDraft(page, entry) {
  const selector = entry === 'home'
    ? '#messages-list .chat-final-draft-status.awaiting_continuation .chat-task-actions button'
    : '#ow-chat-messages .ow-final-draft-status.awaiting_continuation .ow-routing-actions button'
  const deadline = Date.now() + BUTTON_TIMEOUT_MS
  while (Date.now() < deadline) {
    const button = page.locator(selector).last()
    if (await button.isVisible() && await button.isEnabled()) {
      await button.click()
      return
    }
    await sleep(500)
  }
  throw new Error(`${entry}: continue final draft button not clickable within ${BUTTON_TIMEOUT_MS}ms (${selector})`)
}

async function runFinalDraftConversation(page, entry, request, evidenceDir) {
  const send = entry === 'home' ? sendHomeFinalDraft : sendOutlineFinalDraft
  const initial = await send(page, request)
  const continuations = []
  let state = initial.state
  while (state.lastTask?.status === 'awaiting_continuation') {
    const round = continuations.length + 1
    const before = await readSourceProgress(page, entry)
    await clickContinueFinalDraft(page, entry)
    const snapshot = await waitForSourceProgress(
      page,
      entry,
      current => current.apiCallCount > before.apiCallCount
        && current.runningApiCallCount === 0
        && current.sendEnabled,
      `${entry}:continuation-${round}`,
    )
    state = await collectConversationState(page, entry)
    continuations.push({
      round,
      requestedAt: new Date().toISOString(),
      startedFromTask: before.task,
      completedTask: snapshot.task,
      turnCount: snapshot.turnCount,
      turnStatus: snapshot.turnStatus,
      apiCallCount: snapshot.apiCallCount,
      eventCount: snapshot.eventCount,
      physicalCalls: state.physicalCalls.slice(before.physicalCallCount),
    })
    fs.writeFileSync(path.join(evidenceDir, `${entry}-continuations.json`), JSON.stringify(continuations, null, 2), 'utf8')
    console.log(`[${entry}:continuation-${round}] ${describeProgress(snapshot)}`)
  }
  return { initial, continuations, state }
}

async function sendHomeFinalDraft(page, request) {
  await waitHomeIdle(page)
  const before = await page.evaluate(() => ({
    users: (window.__pinia?._s?.get('chat')?.activeSession?.messages || []).filter(item => item?.role === 'user').length,
    content: window.__pinia?._s?.get('editor')?.activeTab?.content || '',
  }))
  await page.locator('#user-input').fill(request)
  await page.locator('#user-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-send').click()
  await page.waitForFunction(expected => {
    const chat = window.__pinia?._s?.get('chat')?.activeSession?.messages || []
    return chat.filter(item => item?.role === 'user').length >= expected
  }, before.users + 1, { timeout: STEP_TIMEOUT_MS > 0 ? STEP_TIMEOUT_MS : 0, polling: 250 })
  const snapshot = await waitForSourceTurnComplete(page, 'home', {
    expectedUsers: before.users + 1,
    label: 'home:initial',
  })
  const state = await collectConversationState(page, 'home')
  return { before, userCount: before.users + 1, snapshot, state }
}

async function sendOutlineFinalDraft(page, request) {
  await waitOutlineIdle(page)
  const before = await page.evaluate(() => ({
    users: (window.__pinia?._s?.get('project')?.outlineChat || []).filter(item => item?.role === 'user').length,
    content: window.__pinia?._s?.get('project')?.outlineText || '',
  }))
  await page.locator('#ow-chat-input').fill(request)
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(expected => {
    const chat = window.__pinia?._s?.get('project')?.outlineChat || []
    return chat.filter(item => item?.role === 'user').length >= expected
  }, before.users + 1, { timeout: STEP_TIMEOUT_MS > 0 ? STEP_TIMEOUT_MS : 0, polling: 250 })
  const snapshot = await waitForSourceTurnComplete(page, 'outline', {
    expectedUsers: before.users + 1,
    label: 'outline:initial',
  })
  const state = await collectConversationState(page, 'outline')
  return { before, userCount: before.users + 1, snapshot, state }
}

async function createHeartbeat(page, file, electronPid) {
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const state = await page.evaluate(() => {
        const store = window.__pinia?._s?.get('runTrace')
        const homeRun = [...(store?.runs || [])].filter(item => item.source === 'home').sort((a, b) => b.startedAt - a.startedAt)[0]
        const outlineRun = [...(store?.runs || [])].filter(item => item.source === 'outline').sort((a, b) => b.startedAt - a.startedAt)[0]
        const editor = window.__pinia?._s?.get('editor')
        const project = window.__pinia?._s?.get('project')
        const chatStatus = window.__pinia?._s?.get('chat')?.generationStatus || null
        const homeMessages = window.__pinia?._s?.get('chat')?.activeSession?.messages || []
        const outlineMessages = window.__pinia?._s?.get('project')?.outlineChat || []
        const streamingPhysicals = [...(store?.runs || [])].flatMap(run => run.apiCalls || [])
          .flatMap(call => call.physicalCalls || [])
          .filter(physical => physical.status === 'running')
        const activeStreamChars = streamingPhysicals.reduce(
          (sum, physical) => sum + (physical.streamText?.length || 0),
          0,
        )
        const lastStreamActivityAt = streamingPhysicals.reduce(
          (latest, physical) => Math.max(latest, physical.endedAt || physical.startedAt || 0),
          0,
        )
        const summarizeTask = item => item ? {
          taskId: item.taskId || null,
          status: item.status || null,
          activeSegmentIndex: item.activeSegmentIndex ?? null,
          segments: item.sourceSegments?.length ?? null,
          accumulatedChars: item.accumulatedText?.length ?? 0,
          completedChars: item.completedText?.length ?? 0,
          continuationCount: item.continuationCount ?? null,
          error: item.error || null,
          updatedAt: item.updatedAt ?? null,
        } : null
        const homeFinalDraftTask = summarizeTask([...homeMessages].reverse().map(item => item?.finalDraftTask).find(Boolean) || null)
        const outlineFinalDraftTask = summarizeTask([...outlineMessages].reverse().map(item => item?.finalDraftTask).find(Boolean) || null)
        const finalDraftTask = [homeFinalDraftTask, outlineFinalDraftTask]
          .filter(Boolean)
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null
        return {
          at: new Date().toISOString(),
          home: homeRun ? { id: homeRun.id, status: homeRun.status, turns: homeRun.turns?.length || 0, calls: homeRun.apiCalls?.length || 0, lastEvent: homeRun.events?.at(-1)?.type || null } : null,
          outline: outlineRun ? { id: outlineRun.id, status: outlineRun.status, turns: outlineRun.turns?.length || 0, calls: outlineRun.apiCalls?.length || 0, lastEvent: outlineRun.events?.at(-1)?.type || null } : null,
          editorChars: editor?.activeTab?.content?.length || 0,
          outlineChars: project?.outlineText?.length || 0,
          chatStatus,
          activeStreamChars,
          lastStreamActivityAt,
          homeFinalDraftTask,
          outlineFinalDraftTask,
          finalDraftTask: finalDraftTask ? {
            taskId: finalDraftTask.taskId || null,
            status: finalDraftTask.status || null,
            activeSegmentIndex: finalDraftTask.activeSegmentIndex ?? null,
            segments: finalDraftTask.segments ?? null,
            accumulatedChars: finalDraftTask.accumulatedChars ?? 0,
            completedChars: finalDraftTask.completedChars ?? 0,
            continuationCount: finalDraftTask.continuationCount ?? null,
            updatedAt: finalDraftTask.updatedAt ?? null,
          } : null,
        }
      })
      state.electronPid = electronPid
      fs.appendFileSync(file, `${JSON.stringify(state)}\n`, 'utf8')
    } catch (error) {
      fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), heartbeatError: String(error?.message || error) })}\n`, 'utf8')
    }
  }, HEARTBEAT_INTERVAL_MS)
  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}

function assertFinalDraftRecord(record, label, expectedStatus = 'completed') {
  const task = record.state.lastTask
  assert.equal(record.state.turnStatus, 'success', `${label}: turn succeeds`)
  assert(record.state.apiStatuses.length > 0, `${label}: API calls recorded`)
  assert(record.state.apiStatuses.every(status => status === 'success'), `${label}: all API calls succeed`)
  assert.deepEqual(record.state.toolCalls, [], `${label}: final draft has no tool calls`)
  assert.deepEqual(record.state.toolSurface, [], `${label}: final draft has empty actual tool surface`)
  assert(task, `${label}: final draft task is attached`)
  assert.equal(task.status, expectedStatus, `${label}: task status`)
  assert(record.state.finalDraftEvents.some(event => event.type === 'final-draft-created'), `${label}: task creation event`)
  assert(record.state.finalDraftEvents.some(event => event.type === 'final-draft-mode-selected' || event.type === 'final-draft-created'), `${label}: mode selection event`)
}

async function exportTrace(page, source, runId, evidenceDir) {
  const exportDir = path.join(evidenceDir, `trace-${source}`)
  fs.mkdirSync(exportDir, { recursive: true })
  const result = await page.evaluate(async ({ exportRoot, runId }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = (store?.runs || []).find(item => item.id === runId)
    return await window.electronAPI.runTraceExport({
      schema: 'shenyi.run-trace',
      version: 2,
      run: store.exportRunToJson(run),
      mode: 'deep',
      payloadDirectoryHint: exportRoot,
    })
  }, { exportRoot: EXPORT_ROOT, runId })
  assert(result?.success, `trace export succeeds: ${result?.reason || ''}`)
  const exportPath = path.join(result.path, 'run-trace.json')
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'))
  assert.equal(exported.schemaVersion, 10, 'exported trace uses schema v10')
  return {
    path: path.relative(ROOT, exportPath),
    schemaVersion: exported.schemaVersion,
    turns: (exported.turns || []).length,
    apiCalls: (exported.apiCalls || []).length,
    eventTypes: (exported.events || []).map(event => event.type),
  }
}

async function runScale(page, scale, report) {
  const evidenceDir = path.join(EVIDENCE_ROOT, scale.id)
  if (process.env.SHENYI_FINAL_DRAFT_ARCHIVE_EVIDENCE === '1') {
    await removeDir(evidenceDir)
  }
  fs.mkdirSync(evidenceDir, { recursive: true })
  const source = buildSyntheticOutline(scale.targetChars)
  assert(
    Math.abs(source.length - scale.targetChars) <= scale.tolerance,
    `${scale.id} source length within tolerance: actual=${source.length}`,
  )
  fs.writeFileSync(path.join(evidenceDir, 'source.md'), source, 'utf8')
  await seedProject(page, source)

  const scaleReport = {
    scale: scale.id,
    sourceChars: source.length,
    headings: headingLines(source).length,
    sourceHash: sha256(source),
    model: MODEL,
    operations: [],
  }

  const home = await runHomeOperation(page, source, evidenceDir)
  scaleReport.home = home
  const outline = await runOutlineOperation(page, source, evidenceDir)
  scaleReport.outline = outline
  await exportScaleTrace(page, evidenceDir, scaleReport)
  report.scales.push(scaleReport)
}

async function runHomeOperation(page, source, evidenceDir) {
  await page.evaluate(content => {
    const editor = window.__pinia?._s?.get('editor')
    editor.openTab({ id: `final-draft-home-${Date.now()}`, title: '终稿主页测试', content, mode: 'text' })
  }, source)
  await waitHomeIdle(page)
  const result = await runFinalDraftConversation(page, 'home', '请对当前编辑器全文进行整理排序，并统一格式。不要改写正文含义，输出完整终稿。', evidenceDir)
  const after = await page.evaluate(() => window.__pinia?._s?.get('editor')?.activeTab?.content || '')
  assert(result.initial?.before, `${evidenceDir}:home: editor before-state must be captured`)
  assert(result.initial.before.content !== undefined, `${evidenceDir}:home: editor before-content must be readable`)
  const record = {
    entry: 'home-editor',
    request: '请对当前编辑器全文进行整理排序，并统一格式。不要改写正文含义，输出完整终稿。',
    beforeHash: sha256(result.initial.before.content),
    afterHash: sha256(after),
    beforeChars: result.initial.before.content.length,
    afterChars: after.length,
    contentChanged: result.initial.before.content !== after,
    state: result.state,
    initialSnapshot: result.initial.snapshot,
    continuations: result.continuations,
    continuationCount: result.continuations.length,
  }
  fs.writeFileSync(path.join(evidenceDir, 'home-record.json'), JSON.stringify(record, null, 2), 'utf8')
  fs.writeFileSync(path.join(evidenceDir, 'home-after.md'), after, 'utf8')
  const traceExport = await persistOperationTrace(page, evidenceDir)
  fs.writeFileSync(path.join(evidenceDir, 'home-trace-export.json'), JSON.stringify(traceExport, null, 2), 'utf8')
  try {
    assertFinalDraftRecord(record, `${evidenceDir}:home`)
    assert(record.contentChanged, `${evidenceDir}:home: final draft changes editor content`)
    assertFinalDraftClean(`${evidenceDir}:home`, after, source, result.state.lastTask)
  } catch (error) {
    persistAssertionError(evidenceDir, 'home', error)
    throw error
  }
  await page.screenshot({ path: path.join(evidenceDir, 'home.png'), fullPage: false })
  return {
    status: 'success',
    beforeChars: record.beforeChars,
    afterChars: record.afterChars,
    physicalCalls: result.state.physicalCalls,
    continuationCount: result.continuations.length,
    task: result.state.lastTask,
  }
}

async function runOutlineOperation(page, source, evidenceDir) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.waitForFunction(expected => (window.__pinia?._s?.get('project')?.outlineText || '').length === expected, source.length, { timeout: 30_000, polling: 250 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
  const result = await runFinalDraftConversation(page, 'outline', '请对全文大纲进行整理排序，并统一格式。不要改写正文含义，输出完整终稿。', evidenceDir)
  const after = await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
  const record = {
    entry: 'outline-editor',
    request: '请对全文大纲进行整理排序，并统一格式。不要改写正文含义，输出完整终稿。',
    beforeHash: sha256(result.initial.before.content),
    afterHash: sha256(after),
    beforeChars: result.initial.before.content.length,
    afterChars: after.length,
    contentChanged: result.initial.before.content !== after,
    state: result.state,
    initialSnapshot: result.initial.snapshot,
    continuations: result.continuations,
    continuationCount: result.continuations.length,
  }
  fs.writeFileSync(path.join(evidenceDir, 'outline-record.json'), JSON.stringify(record, null, 2), 'utf8')
  fs.writeFileSync(path.join(evidenceDir, 'outline-after.md'), after, 'utf8')
  const traceExport = await persistOperationTrace(page, evidenceDir)
  fs.writeFileSync(path.join(evidenceDir, 'outline-trace-export.json'), JSON.stringify(traceExport, null, 2), 'utf8')
  try {
    assertFinalDraftRecord(record, `${evidenceDir}:outline`)
    assert(record.contentChanged, `${evidenceDir}:outline: final draft changes outline content`)
    assertFinalDraftClean(`${evidenceDir}:outline`, after, source, result.state.lastTask)
  } catch (error) {
    persistAssertionError(evidenceDir, 'outline', error)
    throw error
  }
  await page.screenshot({ path: path.join(evidenceDir, 'outline.png'), fullPage: false })
  return {
    status: 'success',
    beforeChars: record.beforeChars,
    afterChars: record.afterChars,
    physicalCalls: result.state.physicalCalls,
    continuationCount: result.continuations.length,
    task: result.state.lastTask,
  }
}

async function exportScaleTrace(page, evidenceDir, scaleReport) {
  const homeRun = await page.evaluate(() => {
    const runs = window.__pinia?._s?.get('runTrace')?.runs || []
    return [...runs].filter(item => item.source === 'home').sort((a, b) => b.startedAt - a.startedAt)[0]?.id || null
  })
  const outlineRun = await page.evaluate(() => {
    const runs = window.__pinia?._s?.get('runTrace')?.runs || []
    return [...runs].filter(item => item.source === 'outline').sort((a, b) => b.startedAt - a.startedAt)[0]?.id || null
  })
  if (homeRun) scaleReport.home.trace = await exportTrace(page, 'home', homeRun, evidenceDir)
  if (outlineRun) scaleReport.outline.trace = await exportTrace(page, 'outline', outlineRun, evidenceDir)
}

async function persistOperationTrace(page, evidenceDir) {
  // M75 evidence-first: payload traces must be exported before assertions can
  // throw, otherwise the failing request only exists in renderer memory.
  const traceReport = { home: {}, outline: {} }
  try {
    await exportScaleTrace(page, evidenceDir, traceReport)
    return { status: 'success', traces: traceReport }
  } catch (error) {
    return { status: 'failed', error: String(error?.message || error), traces: traceReport }
  }
}

function persistAssertionError(evidenceDir, entry, error) {
  fs.writeFileSync(
    path.join(evidenceDir, `${entry}-assertion-error.txt`),
    `${new Date().toISOString()}\n${error?.stack || String(error)}\n`,
    'utf8',
  )
}

async function runStalledRecovery(page, report, mockServer) {
  const evidenceDir = path.join(EVIDENCE_ROOT, 'stalled-recovery')
  if (process.env.SHENYI_FINAL_DRAFT_ARCHIVE_EVIDENCE === '1') {
    await removeDir(evidenceDir)
  }
  fs.mkdirSync(evidenceDir, { recursive: true })
  await seedStalledRecoveryProject(page, {
    stallBaseUrl: `http://127.0.0.1:${mockServer.port}/v1`,
    recoveryBaseUrl: `http://127.0.0.1:${mockServer.port}/v1`,
    model: MODEL,
    documentText: '# 停滞恢复测试\n\n## 第一章\n\n第一段源文内容。\n\n## 第二章\n\n第二段源文内容。\n\n## 第三章\n\n第三段源文内容。',
  })

  await page.evaluate(() => {
    const content = '# 停滞恢复测试\n\n## 第一章\n\n第一段源文内容。\n\n## 第二章\n\n第二段源文内容。\n\n## 第三章\n\n第三段源文内容。'
    const editor = window.__pinia?._s?.get('editor')
    editor.openTab({ id: 'final-draft-stall-recovery', title: '停滞恢复测试', content, mode: 'text' })
    // Test-only telemetry acceleration. The production 10-minute threshold remains unchanged.
    window.__SHENYI_FINAL_DRAFT_TEST_OVERRIDES__ = { stalledAfterMs: 1200, heartbeatIntervalMs: 250 }
  })

  const source = await page.evaluate(() => window.__pinia?._s?.get('editor')?.activeTab?.content || '')
  await waitHomeIdle(page)
  await page.locator('#user-input').fill('请对当前编辑器全文进行整理排序，并统一格式。不要改写正文含义，输出完整终稿。')
  await page.locator('#user-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-send').click()

  const stalledSnapshot = await waitForSourceProgress(
    page,
    'home',
    snapshot => snapshot.task?.status === 'generating'
      && snapshot.task?.throughputStatus === 'stalled'
      && snapshot.logicalStreamChars > 0,
    'home:stalled-card',
  )
  assert(
    stalledSnapshot.activeStreamChars > 0 || stalledSnapshot.logicalStreamChars > 0,
    'stalled recovery: partial stream survives interruption',
  )
  assert.equal(stalledSnapshot.task.segments, 3, 'stalled recovery: planner creates three segments')
  assert(
    await page.locator('.chat-final-draft-stalled-actions').last().isVisible(),
    'stalled recovery: stalled actions are visible',
  )

  const initialRequests = mockServer.requestCount()
  await page.locator('.chat-final-draft-provider-select').last().selectOption('stall-recovery-provider-b')
  const retryButton = page.locator('.chat-final-draft-status .msg-btn', { hasText: '重试当前段' }).last()
  assert(await retryButton.isEnabled(), 'stalled recovery: retry button is enabled while stalled')
  const retryTarget = await retryButton.evaluate(element => ({
    text: element.textContent?.trim() || '',
    disabled: element.hasAttribute('disabled'),
  }))
  console.log('[final-draft] retry target', JSON.stringify(retryTarget))
  await page.evaluate(() => {
    console.warn('[final-draft] script retry click target', {
      count: document.querySelectorAll('.chat-final-draft-status .msg-btn').length,
      text: [...document.querySelectorAll('.chat-final-draft-status .msg-btn')].map(item => item.textContent?.trim()),
    })
  })
  await retryButton.click()
  const postClickTask = await page.evaluate(() => {
    const messages = window.__pinia?._s?.get('chat')?.activeSession?.messages || []
    const task = [...messages].reverse().map(item => item?.finalDraftTask).find(Boolean) || null
    return {
      users: messages.filter(item => item?.role === 'user').length,
      task: task ? `${task.status}@${task.activeSegmentIndex ?? 0}/${task.sourceSegments?.length || 0}` : null,
      telemetry: task?.lastTelemetry?.throughputStatus || null,
      requests: window.__SHENYI_MOCK_SERVER_STATE__?.requestCount || null,
    }
  })
  console.log('[final-draft] post click', JSON.stringify(postClickTask))

  const recoveredSnapshot = await waitForSourceTurnComplete(page, 'home', {
    expectedUsers: 1,
    label: 'home:stalled-recovery',
  })
  const finalTask = await page.evaluate(() => {
    const messages = window.__pinia?._s?.get('chat')?.activeSession?.messages || []
    return [...messages].reverse().map(item => item?.finalDraftTask).find(Boolean) || null
  })
  const finalEditor = await page.evaluate(() => window.__pinia?._s?.get('editor')?.activeTab?.content || '')
  const eventTypes = await page.evaluate(() => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])].filter(item => item.source === 'home').sort((a, b) => b.startedAt - a.startedAt)[0]
    return (run?.events || []).map(event => event.type)
  })

  const record = {
    scenario: 'stalled-recovery',
    sourceChars: source.length,
    stalledTask: stalledSnapshot.task,
    recoveredTask: recoveredSnapshot.task,
    finalTask,
    finalEditorChars: finalEditor.length,
    initialRequests,
    totalRequests: mockServer.requestCount(),
    requests: mockServer.requests(),
    providerSwitchEvent: eventTypes.includes('final-draft-provider-switch'),
    stalledEvent: eventTypes.includes('final-draft-throughput-stalled'),
    retryEvent: eventTypes.includes('final-draft-segment-user-retry-requested'),
    eventTypes,
  }
  fs.writeFileSync(path.join(evidenceDir, 'record.json'), JSON.stringify(record, null, 2), 'utf8')
  await page.screenshot({ path: path.join(evidenceDir, 'home.png'), fullPage: false })

  assert(record.stalledEvent, 'stalled recovery: throughput-stalled event exists')
  assert(record.retryEvent, 'stalled recovery: segment retry event exists')
  assert(record.providerSwitchEvent, 'stalled recovery: provider switch event exists')
  assert.equal(finalTask?.status, 'completed', 'stalled recovery: final task completes')
  assert.equal(
    normalizeParagraphSeparators(finalTask?.completedText || ''),
    finalEditor,
    'stalled recovery: completed text is written to editor',
  )
  assert.equal(finalTask?.activeSegmentIndex, 3, 'stalled recovery: all three segments complete')
  assert(record.totalRequests > initialRequests, 'stalled recovery: retry issues a new request')
  assert(
    finalTask?.completedText.includes('第一段源文内容')
      && finalTask?.completedText.includes('第二段源文内容')
      && finalTask?.completedText.includes('第三段源文内容'),
    'stalled recovery: final text contains all three segment outputs',
  )
  await page.evaluate(() => {
    delete window.__SHENYI_FINAL_DRAFT_TEST_OVERRIDES__
  })

  report.scales.push({
    scale: 'STALLED_RECOVERY',
    sourceChars: source.length,
    model: MODEL,
    operations: [{
      status: 'success',
      stalledTask: stalledSnapshot.task,
      finalTask,
      requests: mockServer.requestCount(),
    }],
  })
}

function restoreLiveCredentialsFromPreviousProfile() {
  if (process.env.SHENYI_LIVE_API_KEY && process.env.SHENYI_LIVE_BASE_URL) return
  for (const credentialProfile of CREDENTIAL_PROFILE_FALLBACKS) {
    const providerPath = path.join(credentialProfile, 'documents-data', 'wa_providers.json')
    if (!fs.existsSync(providerPath)) continue
    const stored = JSON.parse(fs.readFileSync(providerPath, 'utf8'))
    const provider = (stored?.providers || []).find(item =>
      item?.baseUrl
      && typeof item?.apiKey === 'string'
      && (item.apiKey.startsWith('enc:') || item.apiKey.startsWith('sk-')))
    if (!provider) continue
    const apiKey = provider.apiKey.startsWith('enc:')
      ? safeStorage.decryptString(Buffer.from(provider.apiKey.slice(4), 'base64'))
      : provider.apiKey
    if (!apiKey) continue
    process.env.SHENYI_LIVE_API_KEY = apiKey
    process.env.SHENYI_LIVE_BASE_URL = provider.baseUrl
    return
  }
  assert(false, 'live credentials are not available from SHENYI_LIVE_* env vars or previous encrypted profiles')
}

async function main() {
  assertFreshRendererBuild()
  await removeDir(PROFILE)
  await removeDir(EXPORT_ROOT)
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })

  let watchdog = null
  if (GLOBAL_TIMEOUT_MS > 0) {
    watchdog = setTimeout(() => {
      console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
      process.exit(1)
    }, GLOBAL_TIMEOUT_MS)
  }

  const electronProcess = startElectron()
  let browser = null
  let mockServer = null
  const report = {
    schema: 'shenyi.final-draft.electron-live',
    version: 1,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    baseUrl: process.env.SHENYI_LIVE_BASE_URL,
    electronPid: null,
    scales: [],
  }
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
      if (!page) await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (String(message.text()).includes('[final-draft]')) {
        console.error(`[PAGE CONSOLE] ${message.text()}`)
      }
      if (message.type() === 'error' || message.type() === 'warning') {
        console.error(`[PAGE ${message.type().toUpperCase()}] ${String(message.text()).slice(0, 600)}`)
      }
    })
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    report.electronPid = electronProcess.pid

    if (SCENARIOS.includes('stalled-recovery')) {
      mockServer = await startFinalDraftMockServer()
      try {
        const heartbeat = await createHeartbeat(page, path.join(EVIDENCE_ROOT, 'stalled-recovery-heartbeat.jsonl'), electronProcess.pid)
        try {
          await runStalledRecovery(page, report, mockServer)
          console.log('[STALLED_RECOVERY] PASS stalled card -> retry -> provider switch -> completed')
        } finally {
          heartbeat.stop()
        }
      } finally {
        await mockServer.close()
        mockServer = null
      }
    }

    if (SCENARIOS.includes('scale')) {
      restoreLiveCredentialsFromPreviousProfile()
      for (const scale of SIZES) {
        const heartbeat = await createHeartbeat(page, path.join(EVIDENCE_ROOT, `${scale.id}-heartbeat.jsonl`), electronProcess.pid)
        try {
          await runScale(page, scale, report)
          console.log(`[${scale.id}] PASS home+outline final draft live verification`)
        } finally {
          heartbeat.stop()
        }
      }
    }
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'summary.json'), JSON.stringify(report, null, 2), 'utf8')
    console.log('===== FINAL DRAFT ELECTRON LIVE PASSED =====')
    console.log(`[PASS] report saved: ${path.join(EVIDENCE_ROOT, 'summary.json')}`)
  } finally {
    if (watchdog) clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
