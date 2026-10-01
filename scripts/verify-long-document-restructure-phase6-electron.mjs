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
const CDP_PORT = Number(process.env.SHENYI_PHASE6_CDP_PORT || 9297)
const PROFILE = path.join(ROOT, '_data', 'long-document-restructure-phase6-profile')
const CREDENTIAL_PROFILE = path.join(ROOT, '_data', 'long-document-restructure-phase6-credentials')
const CREDENTIAL_PROFILE_FALLBACKS = [
  path.join(ROOT, '_data', 'long-document-restructure-phase6-credentials'),
  path.join(ROOT, '_data', 'long-document-restructure-phase6-profile'),
  path.join(ROOT, '_data', 'outline-deletion-live-replay-profile'),
]
const EXPORT_ROOT = path.join(ROOT, '_data', 'long-document-restructure-phase6-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-long-document-restructure-phase6')
const { safeStorage } = require('electron')
const PROJECT_ID = 'long-document-restructure-phase6'
const MODEL = process.env.SHENYI_LIVE_MODEL || 'deepseek-v4-pro'
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_STEP_TIMEOUT_MS || 30 * 60_000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_LIVE_GLOBAL_TIMEOUT_MS || 12 * 60 * 60_000)
const HEARTBEAT_INTERVAL_MS = Number(process.env.SHENYI_PHASE6_HEARTBEAT_INTERVAL_MS || 15_000)

const ALL_SIZES = [
  { id: 'S100', targetChars: 100_000, tolerance: 2_000 },
  { id: 'S200', targetChars: 200_000, tolerance: 2_000 },
  { id: 'S1M', targetChars: 1_000_000, tolerance: 5_000 },
]
const REQUESTED_SIZES = (process.env.SHENYI_PHASE6_SIZES || '')
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

function makeSectionBody(index, paragraphIndex, duplicate) {
  const base = duplicate
    ? '重复冲突节点：银线在潮汐之间反复断裂。守灯人记录了同一段航路，并且把同一批物资重复登记了两次。'
    : `独立正文节点 ${index}-${paragraphIndex}：潮汐计在第三节偏移了 ${index % 9} 度。船坞内保留了旧信号灯，维修记录与沈萤的航线笔记互为印证。`
  return `${base} 该段用于长文档分段、重排与格式不变量校验，包含中文标点与少量英文 token-${index}-${paragraphIndex}。`
}

function buildSyntheticOutline(targetChars) {
  const lines = ['# 长文档压力测试大纲']
  let currentChars = lines[0].length
  let sectionIndex = 0
  while (currentChars < targetChars) {
    sectionIndex += 1
    const volume = Math.ceil(sectionIndex / 100)
    const chapter = ((sectionIndex - 1) % 100) + 1
    const heading = `## 第${volume}卷 第${chapter}节：压力节点${sectionIndex}`
    lines.push('', heading)
    currentChars += 2 + heading.length
    const paragraphs = 3 + (sectionIndex % 3)
    for (let paragraphIndex = 1; paragraphIndex <= paragraphs && currentChars < targetChars; paragraphIndex++) {
      const body = makeSectionBody(sectionIndex, paragraphIndex, sectionIndex % 17 === 0)
      lines.push('', body)
      currentChars += 2 + body.length
    }
  }
  return lines.join('\n')
}

function shuffleSectionOrder(text) {
  const lines = text.split(/\r?\n/)
  const headingIndexes = lines.reduce((indexes, line, index) => {
    if (/^##\s+/.test(line)) indexes.push(index)
    return indexes
  }, [])
  if (headingIndexes.length < 4) return { text, shuffled: false }
  const sections = headingIndexes.map((start, index) => {
    const end = index + 1 < headingIndexes.length
      ? headingIndexes[index + 1]
      : lines.length
    return lines.slice(start, end)
  })
  const midpoint = Math.ceil(sections.length / 2)
  const reordered = [
    ...sections.slice(0, midpoint),
    ...sections.slice(midpoint).reverse(),
  ]
  return { text: reordered.flat().join('\n'), shuffled: true }
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

function sentenceMultiset(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .split(/[。！？!?]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .sort()
}

function assertSameMultiset(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: item count unchanged`)
  const missing = expected.filter(item => !actual.includes(item))
  assert.equal(missing.length, 0, `${label}: missing items`)
  const added = actual.filter(item => !expected.includes(item))
  assert.equal(added.length, 0, `${label}: added items`)
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
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

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function seedProject(page, documentText) {
  await page.evaluate(async ({ baseUrl, model, apiKey, projectId, outline }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'long-document-phase6-provider',
        name: 'Long Document Phase6 Live',
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
      generateProvider: 'long-document-phase6-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Long Document Phase6 Live',
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

async function outlineContent(page) {
  return page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
}

async function waitOutlineIdle(page, timeout = STEP_TIMEOUT_MS) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout, polling: 500 })
  await sleep(300)
}

async function latestRun(page) {
  return page.evaluate(() => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run ? { id: run.id, status: run.status, startedAt: run.startedAt } : null
  })
}

async function createHeartbeat(page, file, electronPid) {
  let stopped = false
  const timer = setInterval(async () => {
    if (stopped) return
    try {
      const state = await page.evaluate(() => {
        const store = window.__pinia?._s?.get('runTrace')
        const run = [...(store?.runs || [])]
          .filter(item => item.source === 'outline')
          .sort((a, b) => b.startedAt - a.startedAt)[0]
        const chat = window.__pinia?._s?.get('project')?.outlineChat || []
        return {
          at: new Date().toISOString(),
          runId: run?.id || null,
          runStatus: run?.status || null,
          turnCount: run?.turns?.length || 0,
          apiCalls: run?.apiCalls?.length || 0,
          events: run?.events?.length || 0,
          lastEventType: run?.events?.at(-1)?.type || null,
          lastEventAt: run?.events?.at(-1)?.timestamp || null,
          physicalRunning: (run?.apiCalls || []).filter(call => call.status === 'running').length,
          lastAssistantChars: (chat.filter(item => item?.role === 'assistant').at(-1)?.content || '').length,
          sendDisabled: Boolean(document.querySelector('#btn-ow-send')?.disabled),
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

async function sendTurn(page, request, timeout = STEP_TIMEOUT_MS) {
  await waitOutlineIdle(page)
  const userCountBefore = await page.evaluate(() =>
    (window.__pinia?._s?.get('project')?.outlineChat || []).filter(item => item?.role === 'user').length
  )
  await page.locator('#ow-chat-input').fill(request)
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(expected => {
    const chat = window.__pinia?._s?.get('project')?.outlineChat || []
    return chat.filter(item => item?.role === 'user').length >= expected
  }, userCountBefore + 1, { timeout, polling: 500 })
  await page.waitForFunction(expected => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run || (run.turns || []).length < expected) return false
    const turn = run.turns[expected - 1]
    if (!turn || turn.status === 'running') return false
    const calls = (run.apiCalls || []).filter(call => call.turnId === turn.id)
    return calls.length > 0 && calls.every(call => call.status !== 'running')
  }, userCountBefore + 1, { timeout, polling: 500 })
  await waitOutlineIdle(page)
  return page.evaluate(({ request, userCount }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const turn = run?.turns?.[userCount - 1] || null
    const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
    const chat = window.__pinia?._s?.get('project')?.outlineChat || []
    return {
      runId: run?.id || null,
      turnId: turn?.id || null,
      request,
      turnStatus: turn?.status || null,
      intent: turn?.intent || null,
      reason: turn?.reason || null,
      apiStatuses: calls.map(call => call.status),
      physicalCalls: calls.reduce((sum, call) => sum + (call.physicalCalls || []).length, 0),
      toolCalls: calls.flatMap(call => (call.toolCalls || []).map(tool => ({
        name: tool.name,
        status: tool.status,
        errorCode: tool.errorCode || null,
      }))),
      physicalDiagnostics: calls.flatMap(call => (call.physicalCalls || []).map(physical => ({
        seq: physical.seq,
        status: physical.status,
        phase: physical.phase,
        finishReason: physical.finishReason || null,
        error: physical.error || null,
        retryStrategy: physical.retryStrategy || null,
        contextBudgetDecision: physical.contextBudgetDecision || null,
        contextBudgetReason: physical.contextBudgetReason || null,
        estimatedInputTokens: physical.estimatedInputTokens ?? null,
        responseChars: (physical.responseText || '').length,
        requestChars: (physical.requestMessages || []).reduce((sum, message) => sum + String(message.content || '').length, 0),
      }))),
      editTaskEvents: (run?.events || [])
        .filter(event => String(event?.type || '').startsWith('edit-task-'))
        .map(event => ({
          type: event.type,
          level: event.level || null,
          label: event.label || null,
          payload: event.payload || null,
          turnId: event.turnId || null,
        })),
      editTask: (() => {
        const events = (run?.events || [])
          .filter(event => String(event?.type || '').startsWith('edit-task-'))
        const latest = events.at(-1)?.payload || null
        if (!latest) return null
        return {
          id: latest.taskId || null,
          status: latest.status || null,
          executedBatches: latest.executedBatches || [],
          pendingBatches: latest.pendingBatches || [],
          failedBatches: latest.failedBatches || [],
          activeBatchId: latest.activeBatchId || null,
          batchCount: (latest.executionPlan?.batches || []).length,
          goal: latest.goal || null,
        }
      })(),
      eventTypes: (run?.events || []).map(event => event.type),
      assistantReply: (chat.filter(item => item?.role === 'assistant').at(-1)?.content || '').slice(0, 800),
      outlineChars: (window.__pinia?._s?.get('project')?.outlineText || '').length,
    }
  }, { request, userCount: userCountBefore + 1 })
}

async function exportTrace(page, runId, evidenceDir) {
  const exportDir = path.join(evidenceDir, 'trace')
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

async function runScale(page, scale) {
  const evidenceDir = path.join(EVIDENCE_ROOT, scale.id)
  await removeDir(evidenceDir)
  fs.mkdirSync(evidenceDir, { recursive: true })
  const documentText = buildSyntheticOutline(scale.targetChars)
  const shuffled = shuffleSectionOrder(documentText)
  assert(
    Math.abs(documentText.length - scale.targetChars) <= scale.tolerance,
    `${scale.id} generated document length is within tolerance: actual=${documentText.length}`,
  )
  const beforeHash = sha256(documentText)
  fs.writeFileSync(path.join(evidenceDir, 'before.md'), shuffled.text, 'utf8')
  await seedProject(page, shuffled.text)
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.waitForFunction(expected => (window.__pinia?._s?.get('project')?.outlineText || '').length === expected, shuffled.text.length, { timeout: 30_000, polling: 250 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
  console.log(`[${scale.id}] document ready: chars=${shuffled.text.length}, sections=${headingLines(shuffled.text).length}, preShuffled=${shuffled.shuffled}`)

  const report = {
    schema: 'shenyi.long-document-restructure.phase6',
    version: 1,
    scale: scale.id,
    targetChars: scale.targetChars,
    actualChars: documentText.length,
    headingCount: headingLines(documentText).length,
    beforeHash,
    preShuffledForReorder: shuffled.shuffled,
    model: MODEL,
    baseUrl: process.env.SHENYI_LIVE_BASE_URL,
    operations: [],
  }

  const saveOperationEvidence = (operation, record) => {
    fs.writeFileSync(path.join(evidenceDir, `${operation.id}-record.json`), JSON.stringify(record, null, 2), 'utf8')
  }

  const turnFailureDiagnostics = record => {
    const physical = (record.physicalDiagnostics || []).map(item =>
      `#${item.seq} ${item.status} phase=${item.phase} finish=${item.finishReason} tokens≈${item.estimatedInputTokens} reqChars=${item.requestChars} respChars=${item.responseChars} error=${item.error || '-'} budget=${item.contextBudgetDecision}/${item.contextBudgetReason}`
    )
    const tools = (record.toolCalls || []).map(item => `${item.name}:${item.status}${item.errorCode ? `/${item.errorCode}` : ''}`)
    return [
      `turn=${record.turnStatus} intent=${record.intent} reason=${record.reason}`,
      `api=${JSON.stringify(record.apiStatuses)}`,
      `physical=${JSON.stringify(physical)}`,
      `tools=${JSON.stringify(tools)}`,
      `editTask=${JSON.stringify(record.editTask)}`,
    ].join('\n')
  }

  const saveFinalEvidence = async finalContent => {
    fs.writeFileSync(path.join(evidenceDir, 'after.md'), finalContent, 'utf8')
    try {
      const run = await latestRun(page)
      if (run) report.trace = await exportTrace(page, run.id, evidenceDir)
    } catch (error) {
      report.traceExportError = String(error?.message || error)
    }
    report.afterHash = sha256(finalContent)
    fs.writeFileSync(path.join(evidenceDir, 'result.json'), JSON.stringify(report, null, 2), 'utf8')
    console.log(`[${scale.id}] report saved: ${path.join(evidenceDir, 'result.json')}`)
  }

  const operations = [
    { id: 'reorder', request: '请对全文大纲进行整理排序。不要改写正文内容，只调整章节顺序。' },
    { id: 'normalize', request: '请整理全文标点符号和格式。不要增删剧情实体，不要改写句子含义。' },
    { id: 'dedup-request', request: '请查找全文重复项目，并给出删除提案。' },
    { id: 'dedup-reject', request: '请继续查找另一个重复项目，并给出删除提案。' },
    { id: 'targeted-edit', request: '请把第1卷第1节标题中的“压力节点1”修改为“压力节点-已修订1”。' },
    { id: 'interrupt-resume', request: '请继续第2轮全文整理排序。' },
  ]

  let currentContent = shuffled.text
  for (const operation of operations) {
    try {
      const beforeOperation = currentContent
      const result = await sendTurn(page, operation.request)
      const afterOperation = await outlineContent(page)
      currentContent = afterOperation
      const record = {
        id: operation.id,
        request: operation.request,
        turnStatus: result.turnStatus,
        intent: result.intent,
        reason: result.reason,
        apiStatuses: result.apiStatuses,
        physicalCalls: result.physicalCalls,
        toolCalls: result.toolCalls,
        physicalDiagnostics: result.physicalDiagnostics,
        editTask: result.editTask,
        contentChanged: beforeOperation !== afterOperation,
        charsBefore: beforeOperation.length,
        charsAfter: afterOperation.length,
        beforeHash: sha256(beforeOperation),
        afterHash: sha256(afterOperation),
        eventTypes: result.eventTypes,
        assistantReply: result.assistantReply,
      }
      report.operations.push(record)
      console.log(`[${scale.id}:${operation.id}] turn=${result.turnStatus}, physical=${result.physicalCalls}, changed=${record.contentChanged}, chars=${record.charsAfter}`)

      if (operation.id === 'dedup-request') {
        const confirmation = page.locator('.ow-deletion-confirmation').first()
        const visible = await confirmation.count()
        record.deletionConfirmationVisible = visible > 0
        if (visible > 0) {
          const text = await confirmation.textContent()
          record.deletionConfirmationText = text.slice(0, 1000)
        }
      }

      if (operation.id === 'dedup-reject') {
        const confirmation = page.locator('.ow-deletion-confirmation').first()
        if (await confirmation.count()) {
          await confirmation.locator('.msg-btn', { hasText: '拒绝并保留原文' }).click()
          await waitOutlineIdle(page)
          const afterReject = await outlineContent(page)
          record.afterRejectHash = sha256(afterReject)
          assert.equal(record.afterRejectHash, record.afterHash, `${scale.id}: rejected deletion leaves content hash unchanged`)
          currentContent = afterReject
        } else {
          record.deletionConfirmationVisible = false
          record.rejectPath = 'no-confirmation-present'
        }
      }

      if (operation.id === 'reorder') {
        assertSameMultiset(leafBodyMultiset(afterOperation), leafBodyMultiset(beforeOperation), `${scale.id}: reorder leaf bodies`)
        record.reorderInputPreShuffled = true
        const beforeHeadings = headingLines(beforeOperation)
        const afterHeadings = headingLines(afterOperation)
        const orderChanged = beforeHeadings.join('\n') !== afterHeadings.join('\n')
        record.reorderHeadingOrderChanged = orderChanged
        if (!orderChanged) record.failureDiagnostics = turnFailureDiagnostics(record)
        assert(orderChanged, `${scale.id}: reorder must actually restore or change heading order\n${record.failureDiagnostics || ''}`)
      }
      if (operation.id === 'normalize') {
        assertSameMultiset(sentenceMultiset(afterOperation), sentenceMultiset(beforeOperation), `${scale.id}: normalize sentences`)
      }
      if (operation.id === 'targeted-edit') {
        const landed = afterOperation.includes('压力节点-已修订1')
        record.targetedEditLanded = landed
        if (!landed) record.failureDiagnostics = turnFailureDiagnostics(record)
      }
      if (result.turnStatus !== 'success' || result.apiStatuses.length === 0 || result.apiStatuses.some(status => status !== 'success')) {
        record.failureDiagnostics = turnFailureDiagnostics(record)
      }

      await page.screenshot({ path: path.join(evidenceDir, `${operation.id}.png`), fullPage: false })
      saveOperationEvidence(operation, record)

      assert.equal(result.turnStatus, 'success', `${scale.id}:${operation.id} turn succeeds\n${record.failureDiagnostics || ''}`)
      assert(result.apiStatuses.length > 0 && result.apiStatuses.every(status => status === 'success'), `${scale.id}:${operation.id} API calls succeed\n${record.failureDiagnostics || ''}`)
    } catch (error) {
      try {
        await saveFinalEvidence(await outlineContent(page))
      } catch (saveError) {
        console.error(`[${scale.id}:${operation.id}] final evidence save failed: ${saveError?.stack || saveError}`)
      }
      throw error
    }
  }

  await saveFinalEvidence(currentContent)
  assert(report.trace, `${scale.id}: trace export exists`)
  assert(report.trace.eventTypes.includes('long-request-in-progress'), `${scale.id}: trace records long physical requests`)
  return report
}

async function main() {
  assertFreshRendererBuild()
  await removeDir(PROFILE)
  await removeDir(EXPORT_ROOT)
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)

  const electronProcess = startElectron()
  let browser = null
  const report = {
    schema: 'shenyi.long-document-restructure.phase6.summary',
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
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    report.electronPid = electronProcess.pid

    restoreLiveCredentialsFromPreviousProfile()
    assert(process.env.SHENYI_LIVE_API_KEY && process.env.SHENYI_LIVE_BASE_URL, 'live API credentials are required for real Phase 6 verification')

    for (const scale of SIZES) {
      const heartbeat = await createHeartbeat(page, path.join(EVIDENCE_ROOT, `${scale.id}-heartbeat.jsonl`), electronProcess.pid)
      try {
        const scaleReport = await runScale(page, scale)
        report.scales.push(scaleReport)
      } finally {
        heartbeat.stop()
      }
    }

    const summaryPath = path.join(EVIDENCE_ROOT, 'summary.json')
    const previousScales = []
    if (fs.existsSync(summaryPath)) {
      try {
        const previous = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
        for (const scaleReport of previous?.scales || []) {
          if (!SIZES.some(scale => scale.id === scaleReport?.scale)) previousScales.push(scaleReport)
        }
      } catch {}
    }
    report.scales = [...previousScales, ...report.scales]
    fs.writeFileSync(summaryPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`===== LONG DOCUMENT RESTRUCTURE PHASE6 PASSED (${MODEL}) =====`)
    console.log(`[PASS] report saved: ${path.join(EVIDENCE_ROOT, 'summary.json')}`)
  } finally {
    clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
  }
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

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
