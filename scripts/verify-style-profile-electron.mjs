import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-style-profile-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_STYLE_PROFILE_ELECTRON
  ? path.resolve(process.env.SHENYI_STYLE_PROFILE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_STYLE_PROFILE_CDP_PORT || 9377)
const PROFILE = path.join(ROOT, '_data', 'style-profile-electron-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-style-profile-electron')
const EVIDENCE_ARCHIVE_ROOT = `${EVIDENCE_ROOT}-archive`
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const PROJECT_ID = 'style-profile-electron'
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_STYLE_PROFILE_GLOBAL_TIMEOUT_MS || 10 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_STYLE_PROFILE_STEP_TIMEOUT_MS || 120_000)
const STYLE_TAGS = '冷硬推理, 近未来都市'
const PACING_PARAMS = '速度:快节奏, 紧张度:4, 密度:密集, 视角:第三人称限知, 基调:热血'
const STYLE_BLOCK_MARKER = '[创作风格约束（应用级，优先级高于普通建议）]'
const BENCHMARK_SOURCE = 'D:/codex/拆文库/踏星/.novel/benchmarks/踏星/文风.md'
const BENCHMARK_IMPORT_PATH = path.join(PROFILE, 'fixtures', '文风.md')
const AI_ANALYSIS_TAGS = '末世高武, 星际升级, 冷硬快节奏'
const AI_ANALYSIS_REPLY = JSON.stringify({
  positioning: {
    coreTemperament: ['冷硬', '务实', '危机感强'],
    genreTags: ['末世高武', '星际升级'],
    oneLinePositioning: '用干净动作和身份重估推进更大的世界。',
  },
  styleTags: AI_ANALYSIS_TAGS,
  pacingParams: '速度:快节奏, 紧张度:4, 密度:密集, 视角:第三人称限知, 基调:热血',
  positiveRules: ['动作推进优先，少写情绪空喊。', '世界观说明必须挂在事件后果上。'],
  voice: { protagonistSpeech: '模型越权返回的声口' },
  sentencePatterns: ['模型越权返回的句式'],
})
const PROVIDER_REPLIES = {
  unlockedDraft: '未锁定阶段只做讨论，不注入创作风格。',
  lockedDraft: '已按锁定风格给出大纲建议。',
  unlockedLocalTransform: '本地确定性整理已执行。',
  lockedLocalTransform: '本地确定性整理已执行，不需要模型改写。',
}

function isStyleAnalysisRequest(body) {
  return (body?.messages || []).some(message =>
    message?.role === 'system' && String(message.content || '').includes('小说风格分析专家'))
}

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
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collectSources(path.join(ROOT, 'src'))
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundles = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)]
    .map(match => path.join(ROOT, 'dist-renderer', match[0]))
  assert(bundles.length > 0, 'renderer index references at least one JS bundle')
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundles.filter(bundle => fs.statSync(bundle).mtimeMs < newestSourceMs)
  assert.equal(
    staleBundles.length,
    0,
    `renderer build is stale; run npm run build:vue first. Stale: ${staleBundles.join(', ')}`,
  )
}

function archiveExistingEvidence() {
  if (!fs.existsSync(EVIDENCE_ROOT)) return
  const files = fs.readdirSync(EVIDENCE_ROOT, { recursive: true }).filter(file => {
    try { return fs.statSync(path.join(EVIDENCE_ROOT, file)).isFile() } catch { return false }
  })
  if (files.length === 0) {
    removeDir(EVIDENCE_ROOT)
    console.log('[EVIDENCE] previous evidence directory was empty; nothing to archive')
    return
  }
  fs.mkdirSync(EVIDENCE_ARCHIVE_ROOT, { recursive: true })
  const archive = path.join(EVIDENCE_ARCHIVE_ROOT, new Date().toISOString().replace(/[:.]/g, '-'))
  fs.cpSync(EVIDENCE_ROOT, archive, { recursive: true })
  const copied = fs.readdirSync(archive, { recursive: true })
  assert(copied.length > 0, 'archived evidence contains files')
  for (const file of copied) {
    const source = path.join(EVIDENCE_ROOT, file)
    const target = path.join(archive, file)
    if (!fs.statSync(source).isFile()) continue
    assert.equal(
      fs.statSync(source).size,
      fs.statSync(target).size,
      `archived evidence byte size matches: ${file}`,
    )
  }
  removeDir(EVIDENCE_ROOT)
  console.log(`[EVIDENCE] archived previous run to ${archive}`)
}

function startProvider() {
  const requests = []
  let nextReply = PROVIDER_REPLIES.unlockedDraft
  const respond = (response, bodyText) => {
    let body = null
    try { body = JSON.parse(bodyText) } catch {}
    if (isStyleAnalysisRequest(body)) {
      const payload = {
        id: 'style-profile-analysis',
        object: 'chat.completion',
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: AI_ANALYSIS_REPLY },
        }],
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(payload))
      return
    }
    if ((body?.messages || []).some(message => message?.role === 'system' && String(message.content || '').includes('意图分类器'))) {
      const requestedIntent = (() => {
        const userMessage = (body?.messages || []).find(message => message?.role === 'user')
        const text = String(userMessage?.content || '')
        return /(整理|排版|符号|空行|编号|重排|顺序)/.test(text) ? 'edit' : 'discuss'
      })()
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        id: 'style-profile-intent',
        object: 'chat.completion',
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: JSON.stringify({ intent: requestedIntent, confidence: 0.97, reason: '风格注入实测按请求语义分类' }) },
        }],
      }))
      return
    }
    const payload = {
      id: 'style-profile-turn',
      object: 'chat.completion',
      choices: [{
        finish_reason: 'stop',
        message: { role: 'assistant', content: nextReply },
      }],
    }
    if (body?.stream === true) {
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      response.write(`data: ${JSON.stringify({
        id: payload.id,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { role: 'assistant', content: payload.choices[0].message.content } }],
      })}\n\n`)
      response.write('data: [DONE]\n\n')
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(payload))
  }
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      let body = null
      try { body = JSON.parse(bodyText) } catch {}
      requests.push({
        at: new Date().toISOString(),
        isIntentClassifier: (body?.messages || []).some(message =>
          message?.role === 'system' && String(message.content || '').includes('意图分类器')),
        isStyleAnalysis: isStyleAnalysisRequest(body),
        systemPrompt: (body?.messages || [])
          .filter(message => message?.role === 'system')
          .map(message => String(message.content || ''))
          .join('\n'),
      })
      respond(response, bodyText)
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        requests: () => requests.map(item => ({ ...item })),
        setReply: reply => { nextReply = reply },
        close: () => new Promise(done => server.close(() => done())),
      })
    })
  })
}

function startElectron() {
  const child = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: DATA_DIR,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_IMPORT_PATH: BENCHMARK_IMPORT_PATH,
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] pid=${child.pid}`)
  child.stdout.on('data', chunk => {
    const text = `[ELECTRON] ${chunk}`
    process.stdout.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.stderr.on('data', chunk => {
    const text = `[ELECTRON STDERR] ${chunk}`
    process.stderr.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  return child
}

function installStyleAnalysisObserver(page) {
  return page.evaluate(() => {
    window.__styleAnalysisResults = []
    window.addEventListener('style-analysis-result', event => {
      window.__styleAnalysisResults.push(event.detail)
    })
  })
}

async function readStyleAnalysisEvents(page) {
  return page.evaluate(() => (window.__styleAnalysisResults || []).map(item => ({
    sourceId: item?.sourceId || null,
    host: item?.host || null,
    ok: item?.report?.ok ?? null,
    insufficientEvidenceFields: item?.report?.insufficientEvidenceFields || [],
    ignoredFields: item?.report?.ignoredFields || [],
  })))
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

function closeElectron(app) {
  if (!app || app.exitCode !== null) return
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
}

async function seedApplication(page, provider) {
  await page.evaluate(async ({ baseUrl }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', 'style-profile-electron')
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'style-profile-provider', name: 'Style Profile Provider', baseUrl,
        apiKey: 'style-profile-local-key', models: ['style-profile-model'], selectedModel: 'style-profile-model',
        temperature: 0.1, maxTokens: 4096, contextWindowTokens: 128000, purpose: ['generate'],
        providerType: 'openai-compatible', streamMode: true,
      }],
      generateProvider: 'style-profile-provider',
    })
    await window.electronAPI.storageWrite('wa_project_style-profile-electron', {
      schemaVersion: 3,
      projectName: '风格锁定同步实测',
      outlineText: '# 风格锁定实测大纲\n\n第一章 灯塔与旧信。\n\n\n\n第二章 菌膜外套。\n',
      outlineLocked: false,
      outlineLockedText: '',
      bookWordCount: 120000,
      volumesConfirmed: false,
      chaptersConfirmed: false,
      settingsGenerated: true,
      pipelineConfig: { volumeCount: 1, volumeWords: 18000, chapterWords: 3000 },
      volumes: [], chapters: {}, settings: [], settingBindings: {},
      settingsCollection: { categories: [], items: {} },
      memories: {}, memoryBlacklist: [], aiNaming: null,
      outlineChat: [], chat: [], editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_skills', { skills: [], pipelineSkills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '', skillIds: [], mode: 'compose', skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_dAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
  }, { baseUrl: `http://127.0.0.1:${provider.port}` })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(300)
}

async function openOutlineWorkspace(page) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
}

async function expandStyleCard(page) {
  await page.waitForSelector('.ow-footer-config #pl-style-card', { timeout: 20_000 })
  await page.click('.ow-footer-config #pl-style-card .pl-style-card-header')
  await page.waitForSelector('.ow-footer-config #pl-style-card .pl-style-card-body:visible', { timeout: 20_000 })
}

async function fillStyleThroughUi(page) {
  await expandStyleCard(page)
  const input = page.locator('.ow-footer-config #pl-style-card input[placeholder="添加自定义标签"]')
  await input.fill(STYLE_TAGS)
  await input.press('Enter')
  const tension = page.locator('.ow-footer-config #pl-style-card input[type="range"]')
  await tension.fill('4')
  await tension.dispatchEvent('input')
  const selectValues = ['快节奏', '密集', '第三人称限知', '热血']
  const selectElements = page.locator('.ow-footer-config #pl-style-card select')
  const count = await selectElements.count()
  assert.equal(count, 4, 'style card exposes four pacing selects')
  for (let index = 0; index < count; index++) {
    await selectElements.nth(index).selectOption(selectValues[index])
    await selectElements.nth(index).dispatchEvent('change')
  }
}

async function lockStyleThroughUi(page) {
  await page.waitForSelector('#btn-lock-style-profile', { state: 'visible', timeout: 20_000 })
  await page.click('#btn-lock-style-profile')
  await page.waitForSelector('#btn-unlock-style-profile', { state: 'visible', timeout: 20_000 })
}

async function runOutlineTurn(page, request) {
  await page.locator('#ow-chat-input').fill(request)
  await page.locator('#ow-chat-input').evaluate(element =>
    element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.click('#btn-ow-send')
  await page.waitForFunction(() => {
    const button = document.querySelector('#btn-ow-send')
    return Boolean(button && !button.disabled)
  }, null, { timeout: STEP_TIMEOUT_MS, polling: 250 })
  await sleep(400)
}

async function latestOutlineTurn(page) {
  return page.evaluate(({ tags, pacing }) => {
    const trace = window.__pinia?._s?.get('runTrace')
    const runId = trace?.getLastRunId?.('outline') || null
    const run = runId ? trace?.getRun?.(runId) : null
    const turn = run?.turns?.at(-1) || null
    const project = window.__pinia?._s?.get('project')
    const turnEvents = turn ? (run?.events || []).filter(event => event.turnId === turn?.id) : []
    const styleEvents = (run?.events || [])
      .filter(event => event.type === 'style-profile')
      .map(event => JSON.parse(event.detail))
    const runEvents = (run?.events || []).map(event => ({
      id: event.id,
      type: event.type,
      turnId: event.turnId || null,
      label: event.label,
      detail: String(event.detail || '').slice(0, 400),
    }))
    if (!run || !turn || turn.status === 'running') {
      return {
        diagnostic: {
          runFound: Boolean(run),
          runId: run?.id || null,
          sessionKind: run?.sessionKind || null,
          runStatus: run?.status || null,
          turnCount: run?.turns?.length || 0,
          currentTurnId: run?.currentTurnId || null,
          eventTypes: [...new Set((run?.events || []).map(event => event.type))],
        },
        runId: run?.id || null,
        turnId: turn?.id || null,
        turnStatus: turn?.status || null,
        turnReason: turn?.reason || null,
        intent: turn?.intent || null,
        styleEvents,
        runEvents,
        styleProfile: window.__pinia?._s?.get('project')?.styleProfile || null,
        outlineText: window.__pinia?._s?.get('project')?.outlineText || '',
        expectedTags: tags,
        expectedPacing: pacing,
      }
    }
    return {
      diagnostic: null,
      runId: run?.id || null,
      turnId: turn?.id || null,
      turnStatus: turn?.status || null,
      turnReason: turn?.reason || null,
      intent: turn?.intent || null,
      styleEvents: styleEvents,
      runEvents,
      styleProfile: project?.styleProfile || null,
      outlineText: project?.outlineText || '',
      expectedTags: tags,
      expectedPacing: pacing,
    }
  }, { tags: STYLE_TAGS, pacing: PACING_PARAMS })
}

async function storeSnapshot(page) {
  return page.evaluate(() => {
    const project = window.__pinia?._s?.get('project')
    return {
      outlineLocked: Boolean(project?.outlineLocked),
      styleProfile: project?.styleProfile || null,
    }
  })
}

async function main() {
  assertFreshRendererBuild()
  archiveExistingEvidence()
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(path.dirname(BENCHMARK_IMPORT_PATH), { recursive: true })
  fs.copyFileSync(BENCHMARK_SOURCE, BENCHMARK_IMPORT_PATH)
  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()
  const provider = await startProvider()
  const electronProcess = startElectron()
  let browser = null
  let latestTurnEvidence = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, provider)
    await openOutlineWorkspace(page)
    await installStyleAnalysisObserver(page)

    provider.setReply(PROVIDER_REPLIES.unlockedDraft)
    await runOutlineTurn(page, '先讨论第一章的钩子设计。')
    const unlockedTurn = await latestOutlineTurn(page)
    latestTurnEvidence = unlockedTurn
    assert.equal(unlockedTurn.turnStatus, 'success', 'unlocked draft turn succeeds')
    assert.equal(unlockedTurn.styleEvents.at(-1)?.injected, false, 'unlocked draft is not injected')
    assert.equal(unlockedTurn.styleEvents.at(-1)?.reason, 'style_unlocked', 'unlocked draft records style_unlocked')
    assert(!unlockedTurn.styleProfile.locked, 'draft style remains unlocked')

    await fillStyleThroughUi(page)
    const filledSnapshot = await storeSnapshot(page)
    assert.equal(filledSnapshot.styleProfile.styleTags, STYLE_TAGS, 'style tags are filled through the UI')
    assert.equal(filledSnapshot.styleProfile.pacingParams, PACING_PARAMS, 'pacing params are filled through the UI')

    await lockStyleThroughUi(page)
    const lockedSnapshot = await storeSnapshot(page)
    assert.equal(lockedSnapshot.styleProfile.locked, true, 'style lock is visible in the store')
    assert.equal(lockedSnapshot.outlineLocked, false, 'style lock does not lock the outline')

    provider.setReply(PROVIDER_REPLIES.lockedDraft)
    await runOutlineTurn(page, '继续讨论第二章的信息密度安排。')
    const lockedTurn = await latestOutlineTurn(page)
    latestTurnEvidence = lockedTurn
    assert.equal(lockedTurn.turnStatus, 'success', 'locked draft turn succeeds')
    assert.equal(lockedTurn.styleEvents.at(-1)?.injected, true, 'locked draft is injected')
    assert.equal(lockedTurn.styleEvents.at(-1)?.locked, true, 'locked draft trace records locked state')
    assert.equal(lockedTurn.styleProfile.styleTags, STYLE_TAGS, 'turn does not mutate locked style tags')
    assert.equal(lockedTurn.styleProfile.pacingParams, PACING_PARAMS, 'turn does not mutate locked pacing params')

    const outlineBeforeLocalTransform = lockedTurn.outlineText
    provider.setReply(PROVIDER_REPLIES.lockedLocalTransform)
    await runOutlineTurn(page, '请把全文空行规范整理。')
    const localTransformTurn = await latestOutlineTurn(page)
    latestTurnEvidence = localTransformTurn
    assert.equal(localTransformTurn.turnStatus, 'success', 'local transform turn succeeds')
    assert(
      localTransformTurn.styleEvents.some(event => event.injected === false && event.reason === 'local_transform'),
      'local transform records the exemption event',
    )
    assert.notEqual(localTransformTurn.outlineText, outlineBeforeLocalTransform, 'local transform changes the document')

    await page.evaluate(() => {
      const button = document.querySelector('#btn-close-outline-workspace')
      if (button instanceof HTMLElement) button.click()
    })
    await page.waitForSelector('#outline-editor', { state: 'detached', timeout: 20_000 })
    await sleep(300)
    await page.click('#btn-pipeline')
    await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
    await page.locator('#pl-steps .pl-step').nth(1).click()
    await page.waitForSelector('#pl-step-2-content', { state: 'visible' })
    await page.waitForSelector('#pipeline-panel #pl-style-card', { timeout: 20_000 })
    const pipelineCardText = await page.locator('#pipeline-panel #pl-style-card').innerText()
    assert(pipelineCardText.includes(STYLE_TAGS), 'pipeline card shows the same style tags')
    assert(pipelineCardText.includes(PACING_PARAMS), 'pipeline card shows the same pacing params')
    assert(pipelineCardText.includes('已锁定'), 'pipeline card shows the locked state')
    await page.click('#pipeline-panel #pl-style-card .pl-style-card-header')
    await page.waitForSelector('#pipeline-panel #pl-style-card .pl-style-card-body:visible', { timeout: 20_000 })
    // Style lock freezes editing, not inspection. Tab navigation must stay
    // usable while every mutating control is disabled.
    const pipelineControlsDisabled = await page.locator(
      '#pipeline-panel #pl-style-card input, #pipeline-panel #pl-style-card select, #pipeline-panel #pl-style-card button:not(#btn-unlock-style-profile):not(.pl-style-tab)',
    ).evaluateAll(elements => elements.map(element => element.disabled))
    assert(pipelineControlsDisabled.every(Boolean), 'pipeline style controls are locked')
    const pipelineTabEnabled = await page.locator('#pipeline-panel #pl-style-card .pl-style-tab').first().isEnabled()
    assert(pipelineTabEnabled, 'pipeline style tabs remain navigable while locked')

    await page.click('#btn-unlock-style-profile')
    await page.waitForSelector('#btn-lock-style-profile', { state: 'visible', timeout: 20_000 })
    const unlockedStore = await storeSnapshot(page)
    assert.equal(unlockedStore.styleProfile.locked, false, 'unlock is shared through the single store')
    assert.equal(unlockedStore.styleProfile.styleTags, STYLE_TAGS, 'unlock keeps the style draft')

    await page.evaluate(() => {
      const button = document.querySelector('#btn-close-pl')
      if (button instanceof HTMLElement) button.click()
    })
    await page.waitForSelector('#pipeline-panel', { state: 'detached', timeout: 20_000 })
    await sleep(300)
    await sleep(500)
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 20_000 })
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
    const unlockedCardText = await page.locator('.ow-footer-config #pl-style-card').innerText()
    assert(unlockedCardText.includes('未锁定'), 'outline card reflects the unlocked state')
    assert(unlockedCardText.includes(STYLE_TAGS), 'outline card keeps the unlocked draft')

    await expandStyleCard(page)
    await page.click('.ow-footer-config #pl-style-card #btn-style-import')
    await page.waitForSelector('.ow-footer-config #pl-style-card #style-import-preview:visible', { timeout: STEP_TIMEOUT_MS })
    const importPreviewText = await page.locator('.ow-footer-config #pl-style-card #style-import-preview').innerText()
    assert(importPreviewText.includes('导入拆书档案预览'), 'import preview opens from the real file dialog path')
    assert(importPreviewText.includes('末世高武'), 'import preview shows parsed benchmark tags')
    assert(importPreviewText.includes('标志性句式'), 'import preview shows structured rule diff')
    await page.click('.ow-footer-config #pl-style-card #btn-style-preview-apply')
    await page.waitForSelector('.ow-footer-config #pl-style-card #style-import-preview', { state: 'detached', timeout: STEP_TIMEOUT_MS })
    const importedSnapshot = await storeSnapshot(page)
    const importedProfile = importedSnapshot.styleProfile
    assert.equal(importedProfile.profileVersion, 2, 'benchmark import upgrades the draft to profileVersion 2')
    assert.equal(importedProfile.source, 'benchmark-import', 'benchmark import records its source')
    assert(importedProfile.styleTags.includes('末世高武'), 'benchmark import applies parsed tags')
    assert.equal(importedProfile.sentencePatterns?.length, 8, 'benchmark import applies eight sentence patterns')
    assert.equal(importedProfile.sceneTemplates?.length, 4, 'benchmark import applies four scene templates')
    assert.equal(importedProfile.prohibitions?.length, 4, 'benchmark import applies four prohibitions')
    assert.equal(importedProfile.dailyRules?.length, 5, 'benchmark import applies five daily rules')
    assert(importedProfile.voice?.protagonistSpeech?.includes('短句'), 'benchmark import applies voice evidence')

    await page.click('.ow-footer-config #pl-style-card #pl-style-tab-voice')
    const firstPatternBefore = importedProfile.sentencePatterns?.[0]
    await page.locator('.ow-footer-config #pl-style-card .pl-style-rule input[type="checkbox"]').first().click()
    await page.waitForFunction(ruleId => {
      const profile = window.__pinia?._s?.get('project')?.styleProfile
      return profile?.sentencePatterns?.find(rule => rule.id === ruleId)?.enabled === false
    }, firstPatternBefore?.id, { timeout: STEP_TIMEOUT_MS, polling: 200 })
    const toggledSnapshot = await storeSnapshot(page)
    const toggledPattern = toggledSnapshot.styleProfile.sentencePatterns
      ?.find(rule => rule.id === firstPatternBefore?.id)
    assert.equal(toggledPattern?.enabled, false, 'sentence pattern can be disabled through the real UI')

    await page.click('.ow-footer-config #pl-style-card #btn-style-ai-analysis')
    await page.waitForSelector('.ow-footer-config #pl-style-card #style-import-preview:visible', { timeout: STEP_TIMEOUT_MS })
    const analysisPreviewText = await page.locator('.ow-footer-config #pl-style-card #style-import-preview').innerText()
    assert(analysisPreviewText.includes('AI 分析结果预览'), 'AI analysis preview opens in the outline host')
    assert(analysisPreviewText.includes('证据不足，未填充'), 'AI analysis preview exposes evidence boundaries')
    assert(analysisPreviewText.includes('voice'), 'AI analysis preview lists voice as insufficient evidence')
    assert(analysisPreviewText.includes('已忽略模型越权返回'), 'AI analysis preview exposes ignored model overreach')
    const analysisEvents = await readStyleAnalysisEvents(page)
    assert.equal(analysisEvents.length, 1, 'exactly one style-analysis result is published')
    assert.equal(analysisEvents[0]?.host, 'outline', 'outline card request is routed to the outline host')
    assert.equal(analysisEvents[0]?.ok, true, 'outline style analysis succeeds')
    assert.deepEqual(
      analysisEvents[0]?.insufficientEvidenceFields,
      ['voice', 'sentencePatterns', 'sceneTemplates', 'dailyRules', 'prohibitions'],
      'AI analysis declares all evidence-bound fields',
    )
    assert.deepEqual(
      analysisEvents[0]?.ignoredFields,
      ['voice', 'sentencePatterns'],
      'AI analysis ignores model overreach fields',
    )
    await page.click('.ow-footer-config #pl-style-card #btn-style-preview-apply')
    await page.waitForSelector('.ow-footer-config #pl-style-card #style-import-preview', { state: 'detached', timeout: STEP_TIMEOUT_MS })
    const analyzedSnapshot = await storeSnapshot(page)
    const analyzedProfile = analyzedSnapshot.styleProfile
    assert.equal(analyzedProfile.styleTags, AI_ANALYSIS_TAGS, 'AI analysis applies supported tags')
    assert.equal(analyzedProfile.source, 'ai-analysis', 'AI analysis records its source')
    assert.equal(analyzedProfile.positiveRules?.length, 2, 'AI analysis applies positive rules')
    assert(
      analyzedProfile.voice?.protagonistSpeech === importedProfile.voice?.protagonistSpeech,
      'AI analysis does not overwrite imported voice evidence',
    )
    assert(
      analyzedProfile.sentencePatterns?.length === importedProfile.sentencePatterns?.length
        && !analyzedProfile.sentencePatterns?.some(rule => rule.text === '模型越权返回的句式'),
      'AI analysis does not fabricate sentence patterns',
    )

    await lockStyleThroughUi(page)
    provider.setReply(PROVIDER_REPLIES.lockedDraft)
    await runOutlineTurn(page, '按已锁定的结构化风格讨论第一章开场。')
    const lockedV2Turn = await latestOutlineTurn(page)
    latestTurnEvidence = lockedV2Turn
    assert.equal(lockedV2Turn.turnStatus, 'success', 'locked V2 draft turn succeeds')
    const lockedV2StyleEvent = lockedV2Turn.styleEvents.at(-1)
    assert.equal(lockedV2StyleEvent?.profileVersion, 2, 'locked V2 trace records profileVersion')
    assert.equal(lockedV2StyleEvent?.injected, true, 'locked V2 profile is injected')
    assert.equal(lockedV2StyleEvent?.target, 'outline', 'locked V2 trace records the outline target')
    assert(lockedV2StyleEvent?.injectedChars > 0, 'locked V2 trace records injected characters')
    assert(lockedV2StyleEvent?.injectedChars <= 600, 'locked V2 outline injection stays inside budget')
    assert(
      (lockedV2StyleEvent?.sections || []).some(section => section.section === '定位'),
      'locked V2 trace records the positioning section',
    )
    assert(
      (lockedV2StyleEvent?.sections || []).some(section => section.section === '警戒线'),
      'locked V2 trace records the prohibition section',
    )
    const lockedImportDisabled = await page.locator('.ow-footer-config #pl-style-card #btn-style-import').isDisabled()
    const lockedAnalysisDisabled = await page.locator('.ow-footer-config #pl-style-card #btn-style-ai-analysis').isDisabled()
    const lockedRuleDisabled = await page.locator(
      '.ow-footer-config #pl-style-card .pl-style-rule input[type="checkbox"]',
    ).first().isDisabled()
    assert(lockedImportDisabled, 'locked profile disables benchmark import')
    assert(lockedAnalysisDisabled, 'locked profile disables AI analysis')
    assert(lockedRuleDisabled, 'locked profile disables rule toggles')
    await page.click('.ow-footer-config #pl-style-card #btn-unlock-style-profile')
    await page.waitForSelector('.ow-footer-config #pl-style-card #btn-lock-style-profile', { state: 'visible', timeout: 20_000 })

    await page.click('#btn-lock-outline')
    const outlineLockedSnapshot = await storeSnapshot(page)
    assert.equal(outlineLockedSnapshot.outlineLocked, true, 'outline lock succeeds')
    assert.equal(outlineLockedSnapshot.styleProfile.locked, false, 'outline lock does not lock style')
    assert.equal(
      outlineLockedSnapshot.styleProfile.styleTags,
      AI_ANALYSIS_TAGS,
      'outline lock preserves the independently imported style evidence',
    )

    const persisted = await page.evaluate(async projectId => {
      return await window.electronAPI.storageRead(`wa_project_${projectId}`)
    }, PROJECT_ID)
    assert.equal(persisted?.styleProfile?.profileVersion, 2, 'V2 profile version persists to project storage')
    assert.equal(persisted?.styleProfile?.styleTags, AI_ANALYSIS_TAGS, 'analyzed style tags persist to project storage')
    assert.equal(persisted?.styleProfile?.source, 'ai-analysis', 'style source persists to project storage')
    assert.equal(persisted?.styleProfile?.sentencePatterns?.length, 8, 'sentence patterns persist to project storage')
    assert.equal(persisted?.styleProfile?.sceneTemplates?.length, 4, 'scene templates persist to project storage')
    assert.equal(persisted?.styleProfile?.locked, false, 'unlocked draft state persists to project storage')

    const providerRequests = provider.requests()
    // Persist requests before assertions so a failed audit still leaves a
    // inspectable request-level scene instead of a bare assertion message.
    fs.writeFileSync(
      path.join(EVIDENCE_ROOT, 'provider-requests.json'),
      JSON.stringify(providerRequests, null, 2),
      'utf8',
    )
    const unlockedDraftRequest = providerRequests.find(item =>
      !item.isIntentClassifier && item.systemPrompt.includes('继续讨论第一章的钩子设计') === false && item.systemPrompt.includes('冷硬推理') === false)
    assert(unlockedDraftRequest, 'unlocked draft request is captured')
    assert(
      !unlockedDraftRequest.systemPrompt.includes(STYLE_BLOCK_MARKER),
      'unlocked draft request carries no style block',
    )
    const lockedDraftRequest = providerRequests.find(item =>
      !item.isIntentClassifier && item.systemPrompt.includes(STYLE_BLOCK_MARKER))
    assert(lockedDraftRequest, 'locked draft request is captured')
    assert(lockedDraftRequest.systemPrompt.includes(STYLE_TAGS), 'locked draft request carries style tags')
    assert(lockedDraftRequest.systemPrompt.includes(PACING_PARAMS), 'locked draft request carries pacing params')
    const nonIntentRequests = providerRequests.filter(item => !item.isIntentClassifier)
    const styleInjectionRequests = nonIntentRequests
      .filter(item => item.systemPrompt.includes(STYLE_BLOCK_MARKER))
    assert(
      styleInjectionRequests.length > 0
        && styleInjectionRequests.every(item => item === lockedDraftRequest || item === nonIntentRequests.at(-1)),
      'style block only appears in locked style injection requests',
    )
    const styleAnalysisRequest = providerRequests.find(item => item.isStyleAnalysis)
    assert(styleAnalysisRequest, 'style analysis request is captured')
    assert(
      styleAnalysisRequest.systemPrompt.includes('小说风格分析专家'),
      'style analysis request uses the evidence-bound system prompt',
    )
    const lockedV2Request = providerRequests.filter(item =>
      !item.isIntentClassifier && !item.isStyleAnalysis && item.systemPrompt.includes('[定位]'))
    assert(lockedV2Request.length > 0, 'locked V2 request carries structured positioning block')
    assert(
      lockedV2Request.at(-1)?.systemPrompt.includes('[警戒线]'),
      'locked V2 outline request carries the prohibition block',
    )

    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'final-state.png'), fullPage: false })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.style-profile-lock-sync.electron',
      version: 2,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      cases: {
        unlockedDraft: { status: unlockedTurn.turnStatus, injected: unlockedTurn.styleEvents.at(-1)?.injected, reason: unlockedTurn.styleEvents.at(-1)?.reason },
        lockedDraft: { status: lockedTurn.turnStatus, injected: lockedTurn.styleEvents.at(-1)?.injected, reason: lockedTurn.styleEvents.at(-1)?.reason },
        localTransform: {
          status: localTransformTurn.turnStatus,
          exemption: localTransformTurn.styleEvents.some(event => event.reason === 'local_transform' && event.injected === false),
        },
        pipelineSync: { tags: pipelineCardText.includes(STYLE_TAGS), pacing: pipelineCardText.includes(PACING_PARAMS), locked: pipelineCardText.includes('已锁定') },
        persistence: {
          profileVersion: persisted?.styleProfile?.profileVersion || null,
          styleTags: persisted?.styleProfile?.styleTags || null,
          sentencePatterns: persisted?.styleProfile?.sentencePatterns?.length || 0,
          sceneTemplates: persisted?.styleProfile?.sceneTemplates?.length || 0,
          prohibitions: persisted?.styleProfile?.prohibitions?.length || 0,
          dailyRules: persisted?.styleProfile?.dailyRules?.length || 0,
          locked: persisted?.styleProfile?.locked ?? null,
        },
        v2Import: {
          profileVersion: importedProfile.profileVersion,
          source: importedProfile.source,
          sentencePatterns: importedProfile.sentencePatterns?.length || 0,
          sceneTemplates: importedProfile.sceneTemplates?.length || 0,
          prohibitions: importedProfile.prohibitions?.length || 0,
          dailyRules: importedProfile.dailyRules?.length || 0,
          ruleToggleDisabledId: firstPatternBefore?.id || null,
        },
        aiAnalysis: {
          host: analysisEvents[0]?.host || null,
          ok: analysisEvents[0]?.ok ?? null,
          insufficientEvidenceFields: analysisEvents[0]?.insufficientEvidenceFields || [],
          ignoredFields: analysisEvents[0]?.ignoredFields || [],
          appliedTags: analyzedProfile.styleTags,
          preservedVoice: analyzedProfile.voice?.protagonistSpeech === importedProfile.voice?.protagonistSpeech,
        },
        hostRouting: {
          resultCount: analysisEvents.length,
          outlineHandled: analysisEvents[0]?.host === 'outline',
          providerPromptEvidence: Boolean(styleAnalysisRequest),
        },
        lockedV2Injection: {
          status: lockedV2Turn.turnStatus,
          profileVersion: lockedV2StyleEvent?.profileVersion || null,
          injectedChars: lockedV2StyleEvent?.injectedChars || 0,
          sections: lockedV2StyleEvent?.sections || [],
          importDisabled: lockedImportDisabled,
          analysisDisabled: lockedAnalysisDisabled,
          ruleDisabled: lockedRuleDisabled,
        },
      },
    }, null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'), JSON.stringify(providerRequests, null, 2), 'utf8')
    console.log('===== STYLE PROFILE LOCK SYNC ELECTRON PASSED =====')
  } finally {
    if (latestTurnEvidence) {
      fs.writeFileSync(
        path.join(EVIDENCE_ROOT, 'latest-turn-evidence.json'),
        JSON.stringify(latestTurnEvidence, null, 2),
        'utf8',
      )
    }
    clearTimeout(watchdog)
    try { await browser?.close() } catch {}
    closeElectron(electronProcess)
    await provider.close()
    await removeDir(PROFILE)
  }
}

main().catch(error => {
  console.error(`[FAIL] ${error?.stack || error}`)
  process.exitCode = 1
})
