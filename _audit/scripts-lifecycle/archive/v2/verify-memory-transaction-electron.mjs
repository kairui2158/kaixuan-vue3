import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const ELECTRON_EXE = process.env.SHENYI_MEMORY_TRANSACTION_ELECTRON
  ? path.resolve(process.env.SHENYI_MEMORY_TRANSACTION_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_MEMORY_TRANSACTION_CDP_PORT || 9336)
const PROFILE = path.join(ROOT, '_data', 'memory-transaction-profile')
const EXPORT_ROOT = path.join(PROFILE, 'run-trace-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-memory-transaction-electron')
const PROJECT_ID = 'memory-transaction-matrix'
const CHAPTER_ID = 'chapter-memory-transaction'
const CHAPTER_TEXT = '林照在旧城里找到一枚铜铃。'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function parseDetail(value) {
  if (typeof value !== 'string') return value || {}
  try { return JSON.parse(value) } catch { return { raw: value } }
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
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
}

function startElectron(importPath) {
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
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
      SHENYI_TEST_IMPORT_PATH: importPath,
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

function startMemoryProvider() {
  const requests = []
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      requests.push({ bodyText })
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        choices: [{
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: JSON.stringify({
              entities: [{
                name: '林照',
                type: 'character',
                description: '在旧城寻找铜铃的少年',
                evidence: [{ chapterId: CHAPTER_ID, snippet: CHAPTER_TEXT }]
              }],
              relations: [], events: [], world: [], foreshadowing: []
            })
          }
        }]
      }))
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        requests: () => requests.map(item => ({ ...item })),
        close: () => new Promise(done => server.close(() => done())),
      })
    })
  })
}

async function seedApplication(page, provider) {
  await page.evaluate(async ({ baseUrl, port, chapterId, chapterText, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'memory-transaction-provider',
        name: 'Memory Transaction Provider',
        baseUrl,
        apiKey: 'memory-transaction-key',
        models: ['memory-transaction-model'],
        selectedModel: 'memory-transaction-model',
        temperature: 0.1,
        maxTokens: 4096,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: false,
      }],
      generateProvider: 'memory-transaction-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Memory Transaction Matrix',
      outlineText: '',
      outlineLocked: false,
      outlineLockedText: '',
      bookWordCount: 0,
      volumesConfirmed: false,
      pipelineConfig: { volumeCount: 1, volumeWords: 20000, chapterWords: 2000 },
      chaptersConfirmed: false,
      settingsGenerated: true,
      settings: [],
      volumes: [{ id: 'volume-memory', name: '第一卷', index: 0 }],
      chapters: {
        'volume-memory': [{
          id: chapterId,
          title: '旧城铜铃',
          index: 1,
          body: chapterText,
          plot: ''
        }]
      },
      settingBindings: {},
      settingsCollection: { categories: [], items: {} },
      memories: {},
      memoryBlacklist: [],
      aiNaming: null,
      outlineChat: [],
      chat: [],
      editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_skills', { skills: [], pipelineSkills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', { agents: { 0: '' }, skills: { 0: [] }, modes: { 0: 'compose' }, skillAgents: {} })
    await window.electronAPI.storageWrite('wa_co_creation_config', { agentId: '', skillIds: [], mode: 'compose', skillAgents: {} })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    void port
  }, {
    baseUrl: `http://127.0.0.1:${provider.port}/v1`,
    port: provider.port,
    chapterId: CHAPTER_ID,
    chapterText: CHAPTER_TEXT,
    projectId: PROJECT_ID
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function openMemoryPanel(page) {
  await page.click('#btn-memory')
  await page.waitForSelector('#memory-panel', { timeout: 10_000 })
}

async function clickConfirm(page, timeout = 10_000) {
  await page.waitForSelector('[data-modal-id="app-confirm"] .btn-primary', { timeout })
  const before = await page.evaluate(() => document.querySelector('[data-modal-id="app-confirm"]')?.textContent || '')
  await page.click('[data-modal-id="app-confirm"] .btn-primary')
  // A queued alert can replace the confirm in the same tick, so wait for absence or content change.
  await page.waitForFunction(previous => {
    const modal = document.querySelector('[data-modal-id="app-confirm"]')
    return !modal || (modal.textContent || '') !== previous
  }, before, { timeout, polling: 100 })
}

async function clickAlert(page, timeout = 10_000) {
  await clickConfirm(page, timeout)
}

async function runUiImport(page) {
  await page.click('#memory-panel .mem-more-btn')
  await page.waitForSelector('#btn-import-memory', { timeout: 10_000, state: 'visible' })
  await page.click('#btn-import-memory')
  await page.waitForSelector('[data-modal-id="app-confirm"]', { timeout: 10_000, state: 'visible' })
  await clickConfirm(page)
  await clickAlert(page)
}

async function runHomeExtraction(page) {
  const editor = await page.evaluate(chapterId => {
    const store = window.__pinia?._s?.get('editor')
    store.openTab({
      id: `tab-${chapterId}`,
      title: '旧城铜铃',
      chapterId,
      content: '林照在旧城里找到一枚铜铃。',
      isDirty: false,
      mode: 'ch-body',
    })
    return store.activeTab?.id || null
  }, CHAPTER_ID)
  assert(editor, 'home editor tab opens through the editor store')
  // The home editor is always mounted; opening a chapter body tab exposes the real extraction button.
  await page.waitForSelector('#btn-extract-memory:not([disabled])', { timeout: 20_000 })
  await page.click('#btn-extract-memory')
  await page.waitForSelector('[data-modal-id="editor-memory-preview"]', { timeout: 30_000 })
  await page.waitForSelector('[data-modal-id="editor-memory-preview"] .btn-primary:not([disabled])', { timeout: 30_000 })
}

async function confirmHomeExtraction(page) {
  await page.click('[data-modal-id="editor-memory-preview"] .btn-primary')
  await page.waitForFunction(() => document.querySelectorAll('[data-modal-id="editor-memory-preview"]').length === 0, null, { timeout: 20_000, polling: 100 })
}

async function latestInfraRuns(page) {
  return page.evaluate(() => {
    const runs = [...(window.__pinia?.state?.value?.runTrace?.runs || [])]
      .filter(run => run.source === 'infra')
      .sort((a, b) => b.startedAt - a.startedAt)
    return runs.map(run => ({
      id: run.id,
      stepName: run.stepName,
      mode: run.mode,
      status: run.status,
      projectId: run.projectId,
      events: (run.events || []).map(event => ({
        type: event.type,
        level: event.level,
        detail: parseDetail(event.detail)
      }))
    }))
    function parseDetail(value) {
      if (typeof value !== 'string') return value || {}
      try { return JSON.parse(value) } catch { return { raw: value } }
    }
  })
}

async function main() {
  assertFreshRendererBuild()
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

  const validImport = {
    format: 'shenyi-memory',
    version: 1,
    exportedAt: new Date().toISOString(),
    source: 'memory-transaction-electron',
    memory: {
      version: 1,
      entities: [{ id: 'imported-entity', name: '导入实体', type: 'character', evidence: [] }],
      relations: [], events: [], world: [], foreshadowing: [],
      meta: {}, history: [], categories: [], items: []
    }
  }
  const oversizedImport = {
    format: 'shenyi-memory',
    version: 1,
    exportedAt: new Date().toISOString(),
    memory: {
      version: 1,
      entities: [{ id: 'oversized-import', name: '超大导入', description: 'x'.repeat(320_001), evidence: [] }],
      relations: [], events: [], world: [], foreshadowing: [],
      meta: {}, history: [], categories: [], items: []
    }
  }
  const validPath = path.join(os.tmpdir(), 'shenyi-memory-import-valid.json')
  const oversizedPath = path.join(os.tmpdir(), 'shenyi-memory-import-oversize.json')
  fs.writeFileSync(validPath, JSON.stringify(validImport), 'utf8')
  fs.writeFileSync(oversizedPath, JSON.stringify(oversizedImport), 'utf8')

  const electronProcess = startElectron(validPath)
  const provider = await startMemoryProvider()
  const report = {
    schema: 'shenyi.memory-transaction.electron',
    version: 1,
    generatedAt: new Date().toISOString(),
    electronPid: electronProcess.pid,
    cases: [],
  }
  let browser = null
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
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, provider)

    // Case 1: two real extraction transactions commit and advance revision.
    for (let index = 0; index < 2; index++) {
      await runHomeExtraction(page)
      await confirmHomeExtraction(page)
      await sleep(500)
    }
    let memoryState = await page.evaluate(() => window.__pinia?._s?.get('project')?.memories)
    assert.equal(memoryState?.entities?.length, 1, 'two extraction transactions keep one unique entity')
    assert.equal(memoryState?.meta?.stateRevision, 3, 'two extraction transactions advance revision to 3')
    report.cases.push({ case: 'two_extraction_transactions', revision: memoryState.meta.stateRevision })

    // Case 2: real UI import commits through the transaction queue.
    await openMemoryPanel(page)
    await runUiImport(page)
    let committedState = await page.evaluate(() => {
      const memories = window.__pinia?._s?.get('project')?.memories
      return {
        entities: memories?.entities?.length || 0,
        latestHistoryId: memories?.history?.at(-1)?.id || null
      }
    })
    let importedEntityCount = committedState.entities
    assert.equal(importedEntityCount, 2, 'merge import adds the imported entity')
    let infraRuns = await latestInfraRuns(page)
    let importRun = infraRuns.find(run => run.stepName === '记忆合并导入')
    assert(importRun, 'merge import creates an infra run')
    assert(importRun.status === 'success', 'merge import run succeeds')
    let importEvent = importRun.events.find(event => event.type === 'tracking_commit')
    assert(importEvent, 'merge import emits tracking_commit')
    assert.equal(importEvent.detail.ok, true)
    assert.equal(importEvent.detail.mode, 'merge')
    assert.equal(importEvent.detail.revision, 4)
    assert(importEvent.detail.recordId, 'merge import records an audit history id')
    assert.equal(importEvent.detail.recordId, committedState.latestHistoryId)
    report.cases.push({ case: 'ui_merge_import', revision: importEvent.detail.revision })

    // Case 3: real sequential UI chain; true concurrent rejection is covered by trackingStateService.spec.
    await page.click('#btn-close-mem')
    await page.waitForFunction(() => !document.querySelector('#memory-panel'), null, { timeout: 10_000, polling: 100 })
    await runHomeExtraction(page)
    await confirmHomeExtraction(page)
    await sleep(500)
    await openMemoryPanel(page)
    await runUiImport(page)
    await page.click('#btn-close-mem')
    await page.waitForFunction(() => !document.querySelector('#memory-panel'), null, { timeout: 10_000, polling: 100 })
    await runHomeExtraction(page)
    await confirmHomeExtraction(page)
    await sleep(500)
    memoryState = await page.evaluate(() => window.__pinia?._s?.get('project')?.memories)
    assert.equal(memoryState?.meta?.stateRevision, 7, 'sequential extraction/import/extraction chain advances revision to 7')
    report.cases.push({ case: 'sequential_rebuild_after_import', revision: memoryState.meta.stateRevision })

    // Case 4: real rollback click re-enters the import queue and is audited.
    await openMemoryPanel(page)
    await page.click('#memory-panel .mem-more-btn')
    await page.waitForSelector('#btn-memory-history', { timeout: 10_000, state: 'visible' })
    await page.click('#btn-memory-history')
    await page.waitForSelector('[data-modal-id="memory-history"] .mem-history-item', { timeout: 10_000 })
    await page.click('[data-modal-id="memory-history"] .mem-history-item .mem-history-actions .btn-secondary:last-child')
    await clickConfirm(page)
    await clickAlert(page)
    infraRuns = await latestInfraRuns(page)
    const rollbackRun = infraRuns.find(run => run.stepName === '记忆版本回滚')
    assert(rollbackRun, 'rollback creates an infra run')
    assert.equal(rollbackRun.status, 'success', 'rollback run succeeds')
    const rollbackEvent = rollbackRun.events.find(event => event.type === 'tracking_commit')
    assert(rollbackEvent, 'rollback emits tracking_commit')
    assert.equal(rollbackEvent.detail.mode, 'version')
    assert.equal(rollbackEvent.detail.ok, true)
    assert.equal(rollbackEvent.detail.revision, 8)
    report.cases.push({ case: 'ui_version_rollback', revision: rollbackEvent.detail.revision })

    await page.click('#btn-close-mem')
    await sleep(300)
  } catch (error) {
    report.error = error instanceof Error ? error.stack : String(error)
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'failure.json'), JSON.stringify(report, null, 2), 'utf8')
    throw error
  } finally {
    closeElectron(electronProcess)
    await provider.close()
    await browser?.close()
  }

  // Case 5: oversized import is rejected and the queue can still commit.
  const secondProcess = startElectron(oversizedPath)
  let secondBrowser = null
  let secondProvider = null
  try {
    secondProvider = await startMemoryProvider()
    assert(await waitForCdp(), 'oversized import CDP reachable')
    secondBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = secondBrowser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
      if (!page) await sleep(500)
    }
    assert(page, 'oversized import renderer page reachable')
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    await seedApplication(page, secondProvider)
    await openMemoryPanel(page)
    await page.click('#memory-panel .mem-more-btn')
    await page.waitForSelector('#btn-import-memory')
    await page.click('#btn-import-memory')
    await clickConfirm(page)
    await clickAlert(page)
    const state = await page.evaluate(() => ({
      revision: window.__pinia?._s?.get('project')?.memories?.meta?.stateRevision,
      imported: window.__pinia?._s?.get('project')?.memories?.entities?.some(entity => entity.id === 'oversized-import')
    }))
    assert.equal(state.imported, false, 'oversized import is not written')
    assert.equal(state.revision, 1, 'oversized import does not advance revision')
    const runs = await latestInfraRuns(page)
    const failedRun = runs.find(run => run.stepName === '记忆合并导入')
    assert(failedRun, 'oversized import creates an infra run')
    assert.equal(failedRun.status, 'failed', 'oversized import run fails')
    const failedEvent = failedRun.events.find(event => event.type === 'tracking_commit')
    assert(failedEvent, 'oversized import emits tracking_commit')
    assert.equal(failedEvent.detail.ok, false)
    assert.equal(failedEvent.detail.code, 'snapshot_limit_exceeded')
    assert.equal(failedEvent.detail.revision, null)
    report.cases.push({ case: 'oversized_import_rejected', revision: state.revision })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  } catch (error) {
    report.error = error instanceof Error ? error.stack : String(error)
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'failure.json'), JSON.stringify(report, null, 2), 'utf8')
    throw error
  } finally {
    closeElectron(secondProcess)
    await secondProvider?.close()
    await secondBrowser?.close()
  }

  console.log(`[PASS] memory transaction Electron verification: ${report.cases.map(item => item.case).join(', ')}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
