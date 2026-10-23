import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-chapter-batch-modes-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_CHAPTER_MODES_ELECTRON
  ? path.resolve(process.env.SHENYI_CHAPTER_MODES_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_CHAPTER_MODES_CDP_PORT || 9374)
const PROFILE = path.join(ROOT, '_data', 'chapter-batch-modes-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-chapter-batch-modes-electron')
const EVIDENCE_ARCHIVE_ROOT = `${EVIDENCE_ROOT}-archive`
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_CHAPTER_MODES_GLOBAL_TIMEOUT_MS || 7 * 60_000)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_CHAPTER_MODES_STEP_TIMEOUT_MS || 120_000)
const DEAD_TIMEOUT_MS = Number(process.env.SHENYI_CHAPTER_MODES_DEAD_TIMEOUT_MS || 45_000)
const TOTAL_CHAPTERS = 6
const BATCH_SIZE = 2

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { fs.rmSync(target, { recursive: true, force: true }); return } catch {}
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
  const bundles = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => path.join(ROOT, 'dist-renderer', match[0]))
  const newestSource = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  assert(bundles.every(bundle => fs.statSync(bundle).mtimeMs >= newestSource), 'renderer build is stale')
}

function archiveExistingEvidence() {
  if (!fs.existsSync(EVIDENCE_ROOT)) return
  const existingFiles = fs.readdirSync(EVIDENCE_ROOT, { recursive: true }).filter(file => {
    try { return fs.statSync(path.join(EVIDENCE_ROOT, file)).isFile() } catch { return false }
  })
  if (existingFiles.length === 0) {
    removeDir(EVIDENCE_ROOT)
    console.log('[EVIDENCE] previous evidence directory was empty; nothing to archive')
    return
  }
  fs.mkdirSync(EVIDENCE_ARCHIVE_ROOT, { recursive: true })
  const archive = path.join(EVIDENCE_ARCHIVE_ROOT, new Date().toISOString().replace(/[:.]/g, '-'))
  fs.cpSync(EVIDENCE_ROOT, archive, { recursive: true })
  const copiedFiles = fs.readdirSync(archive, { recursive: true })
  assert(copiedFiles.length > 0, 'archived evidence contains files')
  for (const file of copiedFiles) {
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

function startElectron() {
  const child = spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: DATA_DIR,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] pid=${child.pid}`)
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

function closeElectron(app) {
  if (!app || app.exitCode !== null) return
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
}

async function connectPage(browser) {
  let page = null
  for (let attempt = 0; attempt < 24 && !page; attempt++) {
    page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable')
  return page
}

function startProvider() {
  const requests = []
  let holdMode = false
  let releaseHeld = null
  const buildChapters = bodyText => {
    const startMatch = bodyText.match(/生成第(\d+)章到第(\d+)章/)
    const start = startMatch ? Number(startMatch[1]) : 1
    const end = startMatch ? Number(startMatch[2]) : BATCH_SIZE
    return Array.from({ length: end - start + 1 }, (_, index) => ({
      title: `第${start + index}章 批次标题${start + index}`,
      plot: `第${start + index}章剧情点，衔接上一章并保持不重复。`
    }))
  }
  const respond = (response, bodyText) => {
    let requestBody = null
    try { requestBody = JSON.parse(bodyText) } catch {}
    const payload = {
      id: 'chatcmpl-chapter-batch-modes',
      object: 'chat.completion',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: JSON.stringify(buildChapters(bodyText)) },
      }],
    }
    if (requestBody?.stream !== true) {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(payload))
      return
    }
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    response.write(`data: ${JSON.stringify({
      id: payload.id,
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: { role: 'assistant', content: payload.choices[0].message.content },
      }],
    })}\n\n`)
    response.write('data: [DONE]\n\n')
    response.end()
  }
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      requests.push({ at: new Date().toISOString(), bodyText })
      if (holdMode) {
        releaseHeld = () => {
          respond(response, bodyText)
        }
        return
      }
      respond(response, bodyText)
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        requests: () => requests.map(item => ({ ...item })),
        holdNext: () => { holdMode = true },
        releaseHeld: () => {
          holdMode = false
          releaseHeld?.()
          releaseHeld = null
        },
        close: () => new Promise(done => server.close(() => done())),
      })
    })
  })
}

async function seedApplication(page, provider) {
  await page.evaluate(async ({ baseUrl }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', 'chapter-batch-modes')
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'chapter-batch-modes-provider', name: 'Chapter Batch Modes Provider', baseUrl,
        apiKey: 'chapter-batch-modes-key', models: ['chapter-modes-model'], selectedModel: 'chapter-modes-model',
        temperature: 0.1, maxTokens: 4096, contextWindowTokens: 128000, purpose: ['generate'],
        providerType: 'openai-compatible', streamMode: true,
      }],
      generateProvider: 'chapter-batch-modes-provider',
    })
    await window.electronAPI.storageWrite('wa_project_chapter-batch-modes', {
      schemaVersion: 3,
      projectName: '章节分批模式实测',
      outlineText: '全书大纲', outlineLocked: true, outlineLockedText: '全书大纲',
      bookWordCount: 120000, volumesConfirmed: true, chaptersConfirmed: false, settingsGenerated: true,
      pipelineConfig: { volumeCount: 1, volumeWords: 18000, chapterWords: 3000 },
      volumes: [{
        id: 'volume-batch-modes', name: '第一卷 分批', index: 0, outline: '第一卷剧情纲要。',
        summary: '第一卷剧情纲要。', suggestedWords: 18000, chapterCount: 6, wordsPerChapter: 3000,
        confirmed: true, locked: true, isBound: true,
      }],
      chapters: {}, settings: [], settingBindings: {}, settingsCollection: { categories: [], items: {} },
      memories: {}, memoryBlacklist: [], aiNaming: null, outlineChat: [], chat: [], editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_skills', { skills: [], pipelineSkills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' }, skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' }, skillAgents: {},
    })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
  }, { baseUrl: `http://127.0.0.1:${provider.port}` })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
}

function snapshot(page) {
  return page.evaluate(() => {
    const pipeline = window.__pinia?._s?.get('pipeline')
    const project = window.__pinia?._s?.get('project')
    const chapters = project?.chapters?.['volume-batch-modes'] || []
    return {
      chapterCount: chapters.filter(chapter => chapter?.pipelineGenerated === true).length,
      isGenerating: Boolean(pipeline?.isGenerating),
      status: pipeline?.activeChaptersRun?.statusText || null,
      runStatus: pipeline?.activeChaptersRun?.status || null,
      breakpoint: pipeline?.breakpoint || null,
    }
  })
}

async function waitForBatchBoundary(page, expectedCount) {
  let lastSnapshot = null
  let lastChange = Date.now()
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await snapshot(page)
    const fingerprint = JSON.stringify(state)
    const lastFingerprint = lastSnapshot ? JSON.stringify(lastSnapshot) : null
    if (lastFingerprint !== fingerprint) {
      lastSnapshot = state
      lastChange = Date.now()
      console.log(`[BATCH] ${JSON.stringify(state)}`)
    } else if (Date.now() - lastChange >= DEAD_TIMEOUT_MS) {
      throw new Error(`generation is dead: ${JSON.stringify(lastSnapshot)}`)
    }
    if (!state.isGenerating && state.chapterCount >= expectedCount) return state
    await sleep(300)
  }
  throw new Error(`batch boundary did not finish within ${STEP_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
}

async function waitForCancelBoundary(page, beforeCount) {
  let lastSnapshot = null
  let lastChange = Date.now()
  const deadline = Date.now() + STEP_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await snapshot(page)
    if (!lastSnapshot || JSON.stringify(state) !== JSON.stringify(lastSnapshot)) {
      lastSnapshot = state
      lastChange = Date.now()
      console.log(`[CANCEL] ${JSON.stringify(state)}`)
    } else if (Date.now() - lastChange >= DEAD_TIMEOUT_MS) {
      throw new Error(`cancel path is dead: ${JSON.stringify(lastSnapshot)}`)
    }
    if (!state.isGenerating && state.runStatus === 'canceled') return state
    await sleep(300)
  }
  throw new Error(`cancel did not finish within ${STEP_TIMEOUT_MS}ms: ${JSON.stringify(lastSnapshot)}`)
}

async function openChapterStep(page) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  await page.locator('#pl-steps .pl-step').nth(3).click()
  await page.waitForSelector('#pl-step-4-content', { state: 'visible' })
}

async function main() {
  assertFreshRendererBuild()
  archiveExistingEvidence()
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()
  const provider = await startProvider()
  const electronProcess = startElectron()
  let browser = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, provider)
    await openChapterStep(page)
    await page.locator('#pl-chapter-batch-size').fill(String(BATCH_SIZE))
    await page.locator('#pl-chapter-batch-size').dispatchEvent('change')

    const results = []
    let previousRunId = null
    for (let round = 1; round <= 2; round++) {
      const buttonId = round === 1 ? '#btn-pl-gen-chapters' : '#btn-pl-continue-chapters'
      const before = await snapshot(page)
      assert.equal(before.isGenerating, false, 'each batch starts from an idle UI')
      await page.click(buttonId)
      const state = await waitForBatchBoundary(page, round * BATCH_SIZE)
      const run = await page.evaluate(() => {
        const trace = window.__pinia?._s?.get('runTrace')
        return [...(trace?.runs || [])].filter(item => item.source === 'pipeline' && item.step === 3).at(0) || null
      })
      assert(run?.id, `round ${round} creates a run trace`)
      assert.notEqual(run.id, previousRunId, `round ${round} creates a fresh run trace`)
      previousRunId = run.id
      assert.equal(state.chapterCount, round * BATCH_SIZE, `round ${round} chapter count`)
      assert.equal(state.runStatus, 'success', `round ${round} ends successfully`)
      assert.equal(run?.status, 'success', `round ${round} trace status`)
      const finishReason = run?.stateHistory?.at(-1)?.reason
      assert.equal(finishReason, round === 3 ? 'chapters_generation_complete' : 'chapters_batch_complete', `round ${round} finish reason`)
      if (round < 3) {
        assert.equal(state.breakpoint?.phase, 'paused', `round ${round} breakpoint phase`)
        assert.equal(state.breakpoint?.chapterCount, round * BATCH_SIZE, `round ${round} breakpoint count`)
      } else {
        assert.equal(state.breakpoint, null, 'completed run clears the breakpoint')
      }
      results.push({ round, buttonId, chapterCount: state.chapterCount, status: state.status, runStatus: run?.status, finishReason, breakpointPhase: state.breakpoint?.phase || null })
    }

    const beforeCancel = await snapshot(page)
    provider.holdNext()
    await page.click('#btn-pl-continue-chapters')
    await page.waitForSelector('#btn-pl-cancel-generation', { state: 'visible', timeout: STEP_TIMEOUT_MS })
    await page.click('#btn-pl-cancel-generation')
    const cancelState = await waitForCancelBoundary(page, beforeCancel.chapterCount)
    provider.releaseHeld()
    assert.equal(cancelState.chapterCount, beforeCancel.chapterCount, 'cancel does not add a partial batch')
    assert.equal(cancelState.status, 'canceled', 'cancel keeps the canceled terminal status')
    assert.notEqual(cancelState.breakpoint?.phase, 'paused', 'canceled run cannot masquerade as a successful paused boundary')
    assert.notEqual(cancelState.breakpoint, null, 'canceled run keeps its recovery breakpoint')
    const cancelRun = await page.evaluate(() => {
      const trace = window.__pinia?._s?.get('runTrace')
      return [...(trace?.runs || [])].filter(item => item.source === 'pipeline' && item.step === 3).at(0) || null
    })
    assert.notEqual(cancelRun?.status, 'success', 'canceled chapter run is not successful')
    assert.equal(cancelRun?.stateHistory?.at(-1)?.reason, 'generation_failed', 'canceled run records the failed close reason')
    previousRunId = cancelRun?.id || previousRunId

    const finalState = await snapshot(page)
    assert.equal(finalState.isGenerating, false, 'post-cancel UI returns to idle')
    await page.click('#btn-pl-continue-chapters')
    const completedState = await waitForBatchBoundary(page, TOTAL_CHAPTERS)
    const completedRun = await page.evaluate(() => {
      const trace = window.__pinia?._s?.get('runTrace')
      return [...(trace?.runs || [])].filter(item => item.source === 'pipeline' && item.step === 3).at(0) || null
    })
    assert(completedRun?.id, 'final continuation creates a run trace')
    assert.notEqual(completedRun.id, previousRunId, 'final continuation creates a fresh run trace')
    assert.equal(completedState.runStatus, 'success', 'final continuation ends successfully')
    assert.equal(completedState.chapterCount, TOTAL_CHAPTERS, 'final continuation completes the volume')
    assert.equal(completedRun?.status, 'success', 'final continuation trace status')
    assert.equal(completedRun?.stateHistory?.at(-1)?.reason, 'chapters_generation_complete', 'final continuation records full completion')
    assert.equal(completedState.breakpoint, null, 'completed final continuation clears the breakpoint')
    results.push({
      round: 3,
      buttonId: '#btn-pl-continue-chapters',
      chapterCount: completedState.chapterCount,
      status: completedState.status,
      runStatus: completedRun?.status || null,
      finishReason: completedRun?.stateHistory?.at(-1)?.reason || null,
      breakpointPhase: completedState.breakpoint?.phase || null,
    })
    assert.equal((await page.locator('#btn-pl-continue-chapters').isDisabled()), true, 'continue is disabled after completion')

    const providerRequests = provider.requests()
    assert.equal(providerRequests.length, 4, 'three batch requests plus one canceled request')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'), JSON.stringify(providerRequests, null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.chapter-batch-modes.electron', version: 1, generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME, totalChapters: TOTAL_CHAPTERS, batchSize: BATCH_SIZE, rounds: results,
      cancelCase: {
        chapterCount: cancelState.chapterCount,
        status: cancelState.status,
        breakpointPhase: cancelState.breakpoint?.phase || null,
        runStatus: cancelRun?.status || null,
        finishReason: cancelRun?.stateHistory?.at(-1)?.reason || null,
      },
    }, null, 2), 'utf8')
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'final-state.png'), fullPage: false })
    console.log('===== CHAPTER BATCH MODES ELECTRON PASSED =====')
  } finally {
    clearTimeout(watchdog)
    try { await browser?.close() } catch {}
    closeElectron(electronProcess)
    await provider.close()
    await removeDir(PROFILE)
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
