import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_CHAPTER_BATCH_UI_CDP_PORT || 9388)
const PROFILE = path.join(ROOT, '_data', 'chapter-batch-ui-live-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'tmp', 'chapter-batch-ui-live')
const PROJECT_ID = 'chapter-batch-ui-live'
const VOLUME_ID = 'vol-batch-ui'
const TOTAL_CHAPTERS = 12
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_CHAPTER_BATCH_UI_GLOBAL_TIMEOUT_MS || 5 * 60_000)

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
    },
    windowsHide: false,
  })
  const logPath = path.join(EVIDENCE_ROOT, 'electron-run.log')
  child.stdout.on('data', chunk => fs.appendFileSync(logPath, chunk, 'utf8'))
  child.stderr.on('data', chunk => fs.appendFileSync(logPath, `[STDERR] ${chunk}`, 'utf8'))
  child.on('close', (code, signal) => fs.appendFileSync(
    logPath, `\n[ELECTRON CLOSE] code=${code} signal=${signal}\n`, 'utf8'))
  return child
}

function closeElectron(child) {
  if (!child || child.exitCode !== null) return
  try {
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
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

async function connectPage(browser) {
  let page = null
  for (let attempt = 0; attempt < 24 && !page; attempt++) {
    page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable')
  return page
}

function outlineText() {
  return [
    '# 章节批量 UI 真实烟测',
    ...Array.from({ length: 8 }, (_, index) =>
      `第${index + 1}节：主角在灯塔、旧航道与风暴信标之间推进线索。`),
    '第一卷 风暴起点：灯塔旧信与南方航线共同推动第一卷冲突。',
  ].join('\n')
}

async function seedApplication(page) {
  return await page.evaluate(async ({ projectId, volumeId, outline, totalChapters }) => {
    const seed = {
      schemaVersion: 3,
      projectName: '章节批量UI真实烟测',
      outlineText: outline,
      outlineLocked: true,
      outlineLockedText: outline,
      bookWordCount: 12000,
      volumesConfirmed: true,
      pipelineConfig: {
        volumeCount: 1,
        volumeWords: 12000,
        chapterWords: 1000,
        chapterBatchSize: 0,
      },
      chaptersConfirmed: false,
      settingsGenerated: true,
      settings: [],
      volumes: [{
        id: volumeId,
        name: '风暴起点',
        index: 0,
        outline: '主角发现灯塔旧信，确认风暴信标，并沿南方航线推进第一卷冲突。',
        summary: '灯塔旧信与南方航线锁定风暴起点。',
        suggestedWords: 12000,
        allocatedWords: 12000,
        wordsPerChapter: 1000,
        chapterCount: totalChapters,
        confirmed: true,
        locked: true,
        isBound: true,
      }],
      chapters: {},
      settingBindings: {},
      settingsCollection: { categories: [], items: {} },
      memories: {},
      memoryBlacklist: [],
      aiNaming: null,
      outlineChat: [],
      chat: [],
      editorTabs: [],
    }
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', { providers: [] })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, seed)
    await window.electronAPI.storageWrite('wa_skills', { skills: [], pipelineSkills: [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: { 0: [], 1: [], 2: [], 3: [], 4: [] },
      modes: { 0: 'compose', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    return {
      lastProject: await window.electronAPI.storageRead('wa_lastProjectId'),
      projectSize: JSON.stringify(seed).length,
    }
  }, { projectId: PROJECT_ID, volumeId: VOLUME_ID, outline: outlineText(), totalChapters: TOTAL_CHAPTERS })
}

async function reloadApplication(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1500)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
}

async function openPipelineChapters(page) {
  await page.click('#btn-pipeline')
  await page.waitForSelector('#pipeline-panel', { timeout: 20_000 })
  await page.locator('#pl-steps .pl-step').nth(3).click()
  await page.waitForSelector('#pl-step-4-content', { state: 'visible' })
  await page.selectOption('#pl-ch-volume-select', { label: '风暴起点' })
  await sleep(500)
}

async function expandGenerationLog(page) {
  const toggle = page.locator('.pl-gen-bar-stream-toggle').first()
  if (await toggle.count() && await toggle.isVisible().catch(() => false)) {
    await toggle.click()
  }
}

function snapshot(page) {
  return page.evaluate(volumeId => {
    const project = window.__pinia?._s?.get('project')
    const pipeline = window.__pinia?._s?.get('pipeline')
    const chapters = project?.chapters?.[volumeId] || []
    const generated = chapters.filter(item => item.pipelineGenerated === true)
    return {
      inputValue: Number(document.querySelector('#pl-chapter-batch-size')?.value || 0),
      projectBatchSize: project?.pipelineConfig?.chapterBatchSize ?? null,
      batchSizeButtonText: document.querySelector('#btn-pl-gen-chapters')?.textContent?.trim() || '',
      autoButtonText: document.querySelector('#btn-pl-autogen-chapters')?.textContent?.trim() || '',
      disabled: Boolean(document.querySelector('#btn-pl-gen-chapters')?.disabled),
      runCount: (pipeline?.runs || []).length,
      runStatuses: (pipeline?.runs || []).map(item => item.status),
      generatedCount: generated.length,
      progressStatus: document.querySelector('.pl-gen-bar-status')?.textContent?.trim() || '',
      visibleLogCount: document.querySelectorAll('.pl-gen-bar-stream-line').length,
      hasProviderErrorLog: [...document.querySelectorAll('.pl-gen-bar-stream-line, .pl-gen-hint, .log-line, [class*="log"]')]
        .some(node => (node.textContent || '').includes('供应商')),
    }
  }, VOLUME_ID)
}

async function writeEvidence(name, value) {
  fs.writeFileSync(
    path.join(EVIDENCE_ROOT, name),
    typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    'utf8')
}

async function main() {
  await removeDir(PROFILE)
  await removeDir(EVIDENCE_ROOT)
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()
  const electronProcess = startElectron()
  let browser = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)
    const screenshots = path.join(EVIDENCE_ROOT, 'screenshots')
    fs.mkdirSync(screenshots, { recursive: true })
    const evidence = { seed: null }

    evidence.seed = await seedApplication(page)
    await reloadApplication(page)
    await openPipelineChapters(page)
    await page.screenshot({ path: path.join(screenshots, '01-loaded.png'), fullPage: true })

    const loadedState = await snapshot(page)
    evidence.loadedState = loadedState
    assert.equal(loadedState.inputValue, 1, 'invalid persisted batch size 0 normalizes to 1 on load')
    assert.equal(loadedState.projectBatchSize, 1, 'project store persists normalized batch size')

    await page.locator('#pl-chapter-batch-size').fill('0')
    await page.locator('#pl-chapter-batch-size').dispatchEvent('change')
    await sleep(500)
    const zeroState = await snapshot(page)
    evidence.zeroState = zeroState
    assert.equal(zeroState.inputValue, 1, 'UI input 0 normalizes to minimum 1')

    await page.locator('#pl-chapter-batch-size').fill('3.8')
    await page.locator('#pl-chapter-batch-size').dispatchEvent('change')
    await sleep(500)
    const decimalState = await snapshot(page)
    evidence.decimalState = decimalState
    assert.equal(decimalState.inputValue, 3, 'decimal batch input floors to 3')
    assert.equal(decimalState.projectBatchSize, 3, 'normalized value is persisted to project config')

    await page.locator('#pl-chapter-batch-size').fill('25')
    await page.locator('#pl-chapter-batch-size').dispatchEvent('change')
    await sleep(500)
    const overState = await snapshot(page)
    evidence.overState = overState
    assert.equal(overState.inputValue, 20, 'batch input over max clamps to 20')

    await page.screenshot({ path: path.join(screenshots, '02-normalized.png'), fullPage: true })

    await page.click('#btn-pl-gen-chapters')
    await sleep(250)
    await expandGenerationLog(page)
    let triggerState = await snapshot(page)
    for (let attempt = 1; attempt <= 10 && !triggerState.hasProviderErrorLog; attempt++) {
      await sleep(500)
      triggerState = await snapshot(page)
    }
    evidence.triggerState = triggerState
    await writeEvidence('ui-evidence.json', evidence)
    assert.equal(triggerState.runCount > 0, true, 'clicking generation creates a pipeline run')
    assert.equal(triggerState.runStatuses[0], 'failed', 'run fails because no provider is configured')
    assert.equal(triggerState.generatedCount, 0, 'failed run does not create chapters')
    assert.equal(triggerState.hasProviderErrorLog, true, 'provider error reaches the visible generation log')

    await page.screenshot({ path: path.join(screenshots, '03-provider-failure.png'), fullPage: true })
    await writeEvidence('ui-evidence.json', evidence)
    console.log('[PASS] chapter batch UI live smoke evidence written')
  } finally {
    clearTimeout(watchdog)
    try { await browser?.close() } catch {}
    closeElectron(electronProcess)
  }
}

try {
  await main()
  process.exitCode = 0
} catch (error) {
  console.error(`[FAIL] ${error?.message || error}`)
  console.error(error?.stack || '')
  process.exitCode = 1
}
