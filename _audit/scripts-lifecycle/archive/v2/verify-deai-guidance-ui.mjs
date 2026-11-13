import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'shenyi-deai-guidance-ui-'))
const CDP_PORT = Number(process.env.DEAI_GUIDANCE_CDP_PORT || 9462)
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
  console.warn(`[WARN] DEAI guidance temp profile retained: ${target}`)
}

function seedGuidanceRun(run) {
  const pipeline = window.__pinia?._s?.get('pipeline')
  const trace = window.__pinia?._s?.get('runTrace')
  if (!pipeline?.startGeneration || !pipeline?.finishGeneration) throw new Error('pipeline store is unreachable')
  if (!trace?.startRun || !trace?.addEvent || !trace?.finishRun) throw new Error('run trace store is unreachable')

  const target = `ui-smoke-body-${run}`
  const pipelineRunId = pipeline.startGeneration('body', target, {
    configSnapshot: { uiSmoke: true, run },
  })
  pipeline.updateProgress(35, `UI 冒烟：正文层 ${run}`, pipelineRunId)
  const traceRunId = trace.startRun({
    source: 'pipeline',
    step: 4,
    stepName: '正文层',
    mode: 'body',
    pipelineRunId,
    skillNames: ['ui-smoke-s1', 'ui-smoke-s2', 'ui-smoke-s3'],
  })
  pipeline.rememberTraceRunOwnership(traceRunId, pipelineRunId)

  const skillVariants = ['methodology', 'creative', 'polish']
  const addPolicy = (skillIndex, ownership, generation = 'on') => trace.addEvent(traceRunId, {
    type: 'deai-injection-policy',
    level: 'info',
    label: '降AI注入策略',
    detail: JSON.stringify({
      step: 4,
      skillIndex,
      totalSkillCount: 3,
      source: 'ui-smoke',
      variant: generation === 'off' ? 'off' : skillVariants[skillIndex],
      policy: {
        contractVersion: 2,
        generation,
        finalStepDetection: 'on',
        conflictPolicy: ownership === 'skill' ? 'skill-wins' : 'report',
        guidanceOwnership: ownership,
        overlaps: [],
      },
      warnings: [],
    }),
  })
  const addPack = (skillIndex, itemCount, guidanceChars) => trace.addEvent(traceRunId, {
    type: 'deai-guidance-pack',
    level: 'info',
    label: `降AI方法指导包已构造：${itemCount}条 / ${guidanceChars}字符`,
    detail: JSON.stringify({
      schemaVersion: 1,
      step: 4,
      bodyLayerStep: 4,
      skillIndex,
      totalSkillCount: 3,
      role: skillVariants[skillIndex],
      itemCount,
      droppedItemIds: [],
      guidanceChars,
      voiceProfileChars: 120,
      totalInjectionChars: guidanceChars + 120,
      truncated: false,
      constructionMs: 2,
      slowConstruction: false,
      hash: `ui-smoke-${run}-${skillIndex}`,
    }),
  })

  if (run === 'A') {
    addPolicy(0, 'app')
    addPack(0, 6, 1180)
    addPolicy(1, 'app')
    addPack(1, 6, 1210)
    addPolicy(2, 'app')
    addPack(2, 4, 820)
  } else if (run === 'B') {
    addPolicy(0, 'skill')
    addPolicy(1, 'skill')
    addPolicy(2, 'skill')
  } else if (run === 'C') {
    addPolicy(0, 'skill', 'off')
    addPolicy(1, 'skill', 'off')
    addPolicy(2, 'skill', 'off')
  } else if (run === 'E') {
    addPolicy(0, 'skill')
    addPolicy(1, 'app')
    addPack(1, 6, 1180)
    addPolicy(2, 'skill', 'off')
  }
  // Run D intentionally emits no deai events.

  trace.finishRun(traceRunId, 'success')
  pipeline.finishGeneration(pipelineRunId)

  return { pipelineRunId, traceRunId }
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
    await page.locator('#btn-pipeline').waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('#btn-pipeline').click()
    await page.locator('#pipeline-panel').waitFor({ state: 'visible', timeout: 20_000 })
    await page.locator('#pl-steps .pl-step').nth(4).click()
    await page.locator('#pl-step-5-content').waitFor({ state: 'visible', timeout: 10_000 })

    const cases = [
      {
        run: 'A',
        badge: '方法指导 16/3步 · 3210字符',
        feedback: [
          'S1 methodology · 6条/1180字符',
          'S2 creative · 6条/1210字符',
          'S3 polish · 4条/820字符',
        ],
      },
      {
        run: 'B',
        badge: 'SKILL 方法指导接管 · 0注入',
        feedback: [
          'S1 methodology · SKILL接管 0条/0字符',
          'S2 creative · SKILL接管 0条/0字符',
          'S3 polish · SKILL接管 0条/0字符',
        ],
      },
      {
        run: 'C',
        badge: '应用方法指导关闭',
        feedback: [
          'S1 off · 应用方法指导关闭',
          'S2 off · 应用方法指导关闭',
          'S3 off · 应用方法指导关闭',
        ],
      },
      {
        run: 'D',
        badge: '未观测到方法指导契约',
        feedback: [
          'S1 unknown · 未观测到契约',
          'S2 unknown · 未观测到契约',
          'S3 unknown · 未观测到契约',
        ],
      },
      {
        run: 'E',
        badge: '方法指导混合 · 展开查看',
        feedback: [
          'S1 methodology · SKILL接管 0条/0字符',
          'S2 creative · 6条/1180字符',
          'S3 off · 应用方法指导关闭',
        ],
      },
    ]

    for (const expected of cases) {
      const seedFunction = `(${seedGuidanceRun.toString()})(${JSON.stringify(expected.run)})`
      const seeded = await page.evaluate(source => window.eval(source), seedFunction)
      assert.equal(typeof seeded.pipelineRunId, 'string', `body pipeline run ${expected.run} was created`)
      assert.equal(typeof seeded.traceRunId, 'string', `body trace run ${expected.run} was created`)

      await page.locator('#pl-deai-guidance-badge').waitFor({ state: 'visible', timeout: 10_000 })
      await page.locator('#pl-deai-guidance-feedback').waitFor({ state: 'visible', timeout: 10_000 })
      await page.waitForTimeout(200)

      const actual = await page.evaluate(() => ({
        badgeText: document.querySelector('#pl-deai-guidance-badge')?.textContent || '',
        feedbackText: document.querySelector('#pl-deai-guidance-feedback')?.textContent || '',
        feedbackClass: document.querySelector('#pl-deai-guidance-feedback')?.className || '',
        badgeVisible: Boolean(
          document.querySelector('#pl-deai-guidance-badge')
          && document.querySelector('#pl-deai-guidance-badge')?.getBoundingClientRect().height > 0,
        ),
        feedbackVisible: Boolean(
          document.querySelector('#pl-deai-guidance-feedback')
          && document.querySelector('#pl-deai-guidance-feedback')?.getBoundingClientRect().height > 0,
        ),
      }))

      assert.equal(actual.badgeVisible, true, `guidance badge ${expected.run} is rendered in real UI`)
      assert.equal(actual.badgeText.trim(), expected.badge, `guidance badge ${expected.run} state text`)
      assert.equal(actual.feedbackVisible, true, `informational feedback ${expected.run} is rendered in real UI`)
      for (const line of expected.feedback) {
        assert.match(actual.feedbackText, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `feedback ${expected.run} line: ${line}`)
      }
      assert.match(actual.feedbackText, /informational-only/, `feedback ${expected.run} states its informational-only policy`)
      assert.match(actual.feedbackText, /不改写正文、不改终态/, `feedback ${expected.run} states no rewrite and no terminal impact`)
      assert.match(actual.feedbackClass, /informational-only/, `feedback ${expected.run} retains informational-only marker`)
      console.log(`[PASS] run ${expected.run}: ${actual.badgeText.trim()}`)
    }

    assert.deepEqual(pageErrors, [], `renderer page errors: ${pageErrors.join('; ')}`)
    const relevantConsoleErrors = consoleErrors.filter(message =>
      !message.includes('Failed to load resource')
      && !message.includes('net::')
      && !message.includes('chainIntentRouter')
      && !message.includes('检测到存储损坏并已从备份恢复'))
    assert.deepEqual(relevantConsoleErrors, [], `renderer console errors: ${relevantConsoleErrors.join('; ')}`)

    console.log('[PASS] DEAI guidance per-skill ownership states render in real Electron UI')
  } finally {
    await browser?.close().catch(() => {})
    await stopElectron(electronApp)
    removeProfile(PROFILE)
  }
}

await main()
