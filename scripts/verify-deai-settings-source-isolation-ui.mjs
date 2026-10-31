import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'shenyi-deai-settings-isolation-'))
const CDP_PORT = Number(process.env.DEAI_SETTINGS_CDP_PORT || 9461)
const RUN_LOG = path.join(PROFILE, 'electron-run.log')

function appendLog(text) {
  fs.appendFileSync(RUN_LOG, text, 'utf8')
}

function assertRendererBuildFresh() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists')
  const indexSource = fs.readFileSync(rendererIndex, 'utf8')
  const bundles = [...indexSource.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundles.length > 0, 'renderer index references JS bundles')

  const sourceFiles = []
  const collectSources = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  for (const directory of ['src', 'electron', 'public']) collectSources(path.join(ROOT, directory))
  assert(sourceFiles.length > 0, 'renderer source files are discoverable')
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundles.filter(
    name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs,
  )
  assert.equal(
    staleBundles.length,
    0,
    `renderer build is stale; run npm run build:vue first: ${staleBundles.join(', ')}`,
  )
}

function startElectron() {
  const child = spawn(
    ELECTRON_EXE,
    [ROOT, `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1',
        SHENYI_ALLOW_TEST_ISOLATION: '1',
      },
      windowsHide: true,
    },
  )
  const redact = text => text.replace(/(sk-[A-Za-z0-9_-]{8,})/g, 'sk-***')
  for (const channel of ['stdout', 'stderr']) {
    child[channel].on('data', chunk => {
      const text = redact(String(chunk))
      appendLog(`[ELECTRON ${channel.toUpperCase()}] ${text}`)
      if (channel === 'stderr') process.stderr.write(text)
    })
  }
  return child
}

async function waitForCdp(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return false
}

async function stopElectron(app) {
  if (!app || app.exitCode !== null) return
  const exited = new Promise(resolve => app.once('exit', resolve))
  try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  const timeout = new Promise(resolve => setTimeout(() => resolve(false), 10_000))
  if (!(await Promise.race([exited.then(() => true), timeout]))) app.kill('SIGKILL')
  await exited
}

function removeProfile(target) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
      return
    } catch (error) {
      if (error?.code !== 'EPERM') throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
    }
  }
  console.warn(`[WARN] DEAI settings temp profile retained: ${target}`)
}

function seedObservations() {
  const trace = window.__pinia?._s?.get('runTrace')
  const deai = window.__pinia?._s?.get('deai')
  if (!trace?.startRun || !trace?.addEvent) throw new Error('run trace store is unreachable')
  if (!deai) throw new Error('manual DEAI store is unreachable')

  deai.hardruleEnabled = true
  deai.hardRuleMode = 'detect-report'
  deai.lastDetectReport = {
    kernelVersion: 'ui-smoke',
    provisional: true,
    score: 42,
    verdict: 'ui-smoke',
    metrics: {
      sentenceLengthCV: 0.2,
      connectorDensity: 0.1,
      protectedSpans: { total: 0 },
    },
    findings: [],
    dialogueChars: 10,
    styleDrift: null,
    aiEditedFraction: 0.1,
  }

  const homeRunId = trace.startRun({ source: 'home', stepName: '去AI味', mode: 'de-ai-test' })
  trace.addEvent(homeRunId, {
    type: 'deai-change-rate',
    level: 'info',
    label: '手动降AI深度修复变更率',
    detail: JSON.stringify({ changeRate: 0.37 }),
  })

  const pipelineRunId = trace.startRun({ source: 'pipeline', stepName: '正文层', mode: 'chain' })
  trace.addEvent(pipelineRunId, {
    type: 'deai-quality-gate-degraded',
    level: 'warn',
    label: '流水线降AI门禁降级',
    detail: 'pipeline-only',
  })
  trace.addEvent(pipelineRunId, {
    type: 'deai-injection-policy',
    level: 'info',
    label: 'SKILL降AI终步声明',
    detail: JSON.stringify({
      step: 4,
      policy: { finalStepDetection: 'off' },
    }),
  })

  return { homeRunId, pipelineRunId }
}

async function main() {
  assertRendererBuildFresh()
  assert(fs.existsSync(ELECTRON_EXE), 'source Electron executable exists')

  let browser = null
  const electronApp = startElectron()
  const consoleErrors = []
  const pageErrors = []
  try {
    assert(await waitForCdp(), 'Electron CDP endpoint became available')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const context = browser.contexts()[0]
    const page = context.pages().find(candidate => candidate.url().includes('index.html')) || context.pages()[0]
    assert(page, 'Electron renderer page is available')
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.waitForSelector('#app', { timeout: 30_000 })
    await page.waitForTimeout(800)
    await page.locator('.project-modal-content .btn-close').click({ timeout: 10_000 }).catch(() => {})
    await page.waitForSelector('#btn-settings', { state: 'visible', timeout: 20_000 })

    const seeded = await page.evaluate(seedObservations)
    assert.equal(typeof seeded.homeRunId, 'string', 'home trace run was created')
    assert.equal(typeof seeded.pipelineRunId, 'string', 'pipeline trace run was created')

    await page.locator('#btn-settings').click()
    await page.locator('#tab-deai').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('#tab-deai').click()
    await page.locator('#deai-progress-modal').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(300)

    const actual = await page.evaluate(() => ({
      reportText: document.querySelector('#deai-detect-report')?.textContent || '',
      skillDeclarationText: document.querySelector('#deai-skill-final-step-detection')?.textContent || '',
      settingsPanelText: document.querySelector('.settings-panel')?.textContent || '',
      reportVisible: Boolean(
        document.querySelector('#deai-detect-report')
        && document.querySelector('#deai-detect-report')?.getBoundingClientRect().height > 0,
      ),
      skillDeclarationVisible: Boolean(
        document.querySelector('#deai-skill-final-step-detection')
        && document.querySelector('#deai-skill-final-step-detection')?.getBoundingClientRect().height > 0,
      ),
    }))

    assert.equal(actual.reportVisible, true, 'manual detect report is rendered')
    assert.match(actual.reportText, /深度修复变更率 37%/, 'manual home change rate is visible')
    assert.equal(actual.reportText.includes('pipeline-only'), false, 'pipeline degraded detail must not leak into manual report')
    assert.equal(actual.reportText.includes('降AI门禁降级'), false, 'pipeline degraded warning must not leak into manual report')
    assert.equal(actual.skillDeclarationVisible, true, 'pipeline SKILL final-step declaration is rendered')
    assert.match(
      actual.skillDeclarationText,
      /终步降AI检测已由 SKILL 声明关闭/,
      'pipeline SKILL final-step declaration remains visible',
    )
    assert.equal(actual.settingsPanelText.includes('pipeline-only'), false, 'settings panel must not contain pipeline-only details')

    assert.deepEqual(pageErrors, [], `renderer page errors: ${pageErrors.join('; ')}`)
    const relevantConsoleErrors = consoleErrors.filter(message =>
      !message.includes('Failed to load resource')
      && !message.includes('net::')
      && !message.includes('chainIntentRouter')
      && !message.includes('检测到存储损坏并已从备份恢复'))
    assert.deepEqual(relevantConsoleErrors, [], `renderer console errors: ${relevantConsoleErrors.join('; ')}`)

    console.log('[PASS] DEAI settings source isolation renders correctly in real Electron UI')
    console.log('manualChangeRateVisible=true pipelineQualityGateVisible=false skillFinalStepDeclarationVisible=true')
  } finally {
    await browser?.close().catch(() => {})
    await stopElectron(electronApp)
    removeProfile(PROFILE)
  }
}

await main()
