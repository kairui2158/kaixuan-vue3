import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9263
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'outline-v6-baseline-profile')
const RESULT_DIR = path.join(ROOT, '_audit', 'verification-outline-v6-baseline')
const RESULT_FILE = path.join(RESULT_DIR, 'baseline.json')
const PROJECT_ID = 'outline-v6-baseline-project'
const OUTLINE_TEXT = '第一卷 风暴起点\n北方风暴逼近，男主发现旧信。\n第二章 男主决定南下。\n第三章 男主抵达灯塔。'

const STEP_TIMEOUT_MS = Number(process.env.BASELINE_STEP_TIMEOUT_MS || 120000)
const GLOBAL_TIMEOUT_MS = Number(process.env.BASELINE_GLOBAL_TIMEOUT_MS || 1800000)
const RUN_ONLY = (process.env.BASELINE_ONLY || '').split(',').map(item => item.trim()).filter(Boolean)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
  }
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}

function archivePreviousScene() {
  if (!fs.existsSync(RESULT_DIR)) return
  const entries = fs.readdirSync(RESULT_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name !== 'baseline.json')
  if (!entries.length) return
  const archive = path.join(RESULT_DIR, `archived-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  fs.mkdirSync(archive, { recursive: true })
  for (const entry of entries) {
    fs.copyFileSync(path.join(RESULT_DIR, entry.name), path.join(archive, entry.name))
  }
}

function assertFreshRendererBuild() {
  const indexPath = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(indexPath), 'dist-renderer/index.html exists; run npm run build:vue first')
  const buildTime = fs.statSync(indexPath).mtimeMs
  const roots = ['src', 'electron', 'public']
  for (const root of roots) {
    const dir = path.join(ROOT, root)
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir, { recursive: true })) {
      const full = path.join(dir, file)
      if (!fs.statSync(full).isFile()) continue
      assert(fs.statSync(full).mtimeMs <= buildTime, `stale renderer source: ${path.relative(ROOT, full)}`)
    }
  }
  for (const config of ['package.json', 'vite.config.mts', 'vite.protocols.config.mts']) {
    const full = path.join(ROOT, config)
    assert(fs.statSync(full).mtimeMs <= buildTime, `stale build config: ${config}`)
  }
}

function startElectron() {
  return spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], {
    cwd: ROOT,
    stdio: 'ignore',
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: true,
  })
}

async function stopElectron(processHandle) {
  if (!processHandle) return
  if (processHandle.exitCode != null) return
  const exited = new Promise(resolve => processHandle.once('exit', resolve))
  try { execFileSync('taskkill', ['/PID', String(processHandle.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  const timeout = sleep(10000, true).then(() => false)
  const result = await Promise.race([exited.then(() => true), timeout])
  if (!result) processHandle.kill('SIGKILL')
}

async function waitForCdp() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(400)
  }
  return false
}

async function withStep(name, fn) {
  const startedAt = Date.now()
  console.log(`[STEP START] ${name}`)
  try {
    const result = await Promise.race([
      fn(),
      sleep(STEP_TIMEOUT_MS, true).then(() => {
        throw new Error(`step timeout after ${STEP_TIMEOUT_MS}ms`)
      }),
    ])
    console.log(`[STEP PASS] ${name} (${Date.now() - startedAt}ms)`)
    return result
  } catch (error) {
    console.error(`[STEP FAIL] ${name}: ${error && error.stack ? error.stack : error}`)
    throw error
  }
}

function buildMessage(chars) {
  const paragraph = '大纲压测文本。主角推进剧情，冲突持续升级，同时保持语义自然以覆盖真实 Markdown 渲染成本。'
  const filler = paragraph.repeat(Math.ceil(chars / paragraph.length))
  return `# 基线消息 ${chars}\n\n${filler.slice(0, Math.max(0, chars - 20))}\n`
}

function buildMessages(count, charsPerMessage) {
  const result = []
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant'
    result.push({ role, content: `${i + 1}. ${buildMessage(charsPerMessage)}` })
  }
  return result
}

async function installObserver(page) {
  await page.evaluate(() => {
    if (window.__OUTLINE_V6_BASELINE__) return
    const observer = new PerformanceObserver(list => {
      const state = window.__OUTLINE_V6_BASELINE__
      for (const entry of list.getEntries()) {
        if (entry.entryType !== 'longtask') continue
        state.longTasks.push({
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration,
          attribution: entry.attribution?.map(item => ({ name: item.name, scriptURL: item.scriptURL })) || [],
        })
      }
      if (!state.pendingFrame) {
        state.pendingFrame = true
        requestAnimationFrame(() => {
          state.frameDelays.push(performance.now() - state.lastFrameAt)
          state.lastFrameAt = performance.now()
          state.pendingFrame = false
        })
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
    window.__OUTLINE_V6_BASELINE__ = {
      longTasks: [],
      frameDelays: [],
      lastFrameAt: performance.now(),
      pendingFrame: false,
      marks: {},
      mark(name) {
        performance.mark(`v6:${name}:start`)
      },
      measure(name) {
        try {
          performance.measure(`v6:${name}`, `v6:${name}:start`)
          const entries = performance.getEntriesByName(`v6:${name}`, 'measure')
          return entries.at(-1)?.duration ?? -1
        } finally {
          performance.clearMarks(`v6:${name}:start`)
          performance.clearMeasures(`v6:${name}`)
        }
      },
    }
  })
}

async function memorySample(page) {
  return await page.evaluate(async () => {
    if (performance.memory?.usedJSHeapSize) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      }
    }
    const metrics = await window.__OUTLINE_V6_CDP_METRICS__
    return metrics ? { ...metrics } : null
  })
}

async function collectMetrics(page) {
  const state = await page.evaluate(() => {
    const state = window.__OUTLINE_V6_BASELINE__
    const longTasks = state.longTasks.slice()
    const frameDelays = state.frameDelays.slice()
    state.longTasks.length = 0
    state.frameDelays.length = 0
    return { longTasks, frameDelays }
  })
  const memory = await memorySample(page)
  return {
    longTaskCount: state.longTasks.length,
    longTaskTotalMs: Math.round(state.longTasks.reduce((sum, item) => sum + item.duration, 0)),
    longTaskMaxMs: Math.round(state.longTasks.reduce((max, item) => Math.max(max, item.duration), 0)),
    longTasks: state.longTasks.map(item => ({
      duration: Math.round(item.duration),
      startTime: Math.round(item.startTime),
      attribution: item.attribution.slice(0, 3),
    })),
    frameDelayCount: state.frameDelays.length,
    frameDelayMaxMs: Math.round(state.frameDelays.reduce((max, item) => Math.max(max, item), 0)),
    frameDelayAvgMs: state.frameDelays.length
      ? Math.round(state.frameDelays.reduce((sum, item) => sum + item, 0) / state.frameDelays.length)
      : null,
    memory,
  }
}

async function measureTyping(page, text) {
  return await page.evaluate(async input => {
    const inputElement = document.querySelector('#ow-chat-input')
    if (!inputElement) throw new Error('chat input unavailable')
    inputElement.focus()
    const marker = `${Date.now()}-${Math.random()}`
    const state = window.__OUTLINE_V6_BASELINE__
    const typed = `${input} ${marker}`
    state.mark('typing')
    inputElement.value = typed
    inputElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: typed }))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const duration = state.measure('typing')
    const renderedMarker = inputElement.value.includes(marker)
    inputElement.value = ''
    inputElement.dispatchEvent(new Event('input', { bubbles: true }))
    return { duration, renderedMarker, length: typed.length }
  }, text)
}

async function resetConversation(page) {
  await page.evaluate(messages => {
    const project = window.__pinia?._s?.get('project')
    project.outlineChat = messages
  }, [])
  await page.waitForTimeout(300)
}

async function measureLargeMessageCase(page, chars) {
  await resetConversation(page)
  const result = await page.evaluate(async message => {
    const state = window.__OUTLINE_V6_BASELINE__
    const project = window.__pinia?._s?.get('project')
    state.mark('render')
    project.outlineChat = [message]
    let rendered = false
    const deadline = performance.now() + 30000
    while (performance.now() < deadline) {
      await new Promise(resolve => requestAnimationFrame(resolve))
      if (document.querySelectorAll('#ow-chat-messages .ow-msg').length >= 1) {
        rendered = true
        break
      }
    }
    const renderMs = state.measure('render')
    state.mark('save')
    const save = await project.saveProject()
    const saveMs = state.measure('save')
    return { renderMs, saveMs, rendered, saveOk: save?.ok === true, failedKeys: save?.failedKeys || [] }
  }, { role: 'assistant', content: buildMessage(chars) })
  assert(result.rendered, `large message rendered (${chars})`)
  assert.equal(result.saveOk, true, `save project ok (${chars})`)
  const typing = await measureTyping(page, '输入响应压测，请在长消息存在时保持响应。')
  const metrics = await collectMetrics(page)
  return { case: `single-${chars}`, chars, ...result, typing, metrics }
}

async function measureMessageCountCase(page, count, charsPerMessage) {
  await resetConversation(page)
  const messages = buildMessages(count, charsPerMessage)
  const result = await page.evaluate(async messages => {
    const state = window.__OUTLINE_V6_BASELINE__
    const project = window.__pinia?._s?.get('project')
    state.mark('render')
    project.outlineChat = messages
    let renderedCount = 0
    let virtualized = false
    const deadline = performance.now() + 60000
    while (performance.now() < deadline) {
      await new Promise(resolve => requestAnimationFrame(resolve))
      renderedCount = document.querySelectorAll('#ow-chat-messages .ow-msg').length
      virtualized = Boolean(document.querySelector('.ow-message-scroller'))
      if (virtualized && renderedCount > 0) break
      if (!virtualized && renderedCount >= messages.length) break
    }
    const scroller = document.querySelector('.ow-message-scroller')
    const scrollerHeight = scroller ? Math.round(scroller.getBoundingClientRect().height) : null
    const scrollerScrollHeight = scroller ? Math.round(scroller.scrollHeight) : null
    const renderMs = state.measure('render')
    state.mark('save')
    const save = await project.saveProject()
    const saveMs = state.measure('save')
    return {
      renderMs,
      saveMs,
      renderedCount,
      virtualized,
      scrollerHeight,
      scrollerScrollHeight,
      saveOk: save?.ok === true,
      failedKeys: save?.failedKeys || [],
    }
  }, messages)
  assert(result.virtualized, `message list virtualized (${count})`)
  assert(result.renderedCount > 0, `message window rendered (${count})`)
  assert(
    result.renderedCount <= 400,
    `virtualized window stays bounded (${count}): rendered=${result.renderedCount}`
  )
  assert(
    result.scrollerHeight != null && result.scrollerHeight > 0 && result.scrollerScrollHeight != null && result.scrollerScrollHeight > result.scrollerHeight,
    `virtualized scroller is scrollable (${count}): viewport=${result.scrollerHeight}, content=${result.scrollerScrollHeight}`
  )
  assert.equal(result.saveOk, true, `save project ok (${count})`)
  const typing = await measureTyping(page, '输入响应压测，请在大量历史消息存在时保持响应。')
  const metrics = await collectMetrics(page)
  await resetConversation(page)
  return {
    case: `count-${count}-${charsPerMessage}`,
    messageCount: count,
    charsPerMessage,
    totalChars: count * charsPerMessage,
    ...result,
    typing,
    metrics,
  }
}

async function measureEventCase(page, count) {
  const result = await page.evaluate(async eventCount => {
    const state = window.__OUTLINE_V6_BASELINE__
    const trace = window.__pinia?._s?.get('runTrace')
    trace.setMemoryLimits({ maxEvents: eventCount })
    const runId = trace.startRun({ source: 'outline', stepName: 'Phase 0 基线', mode: 'benchmark' })
    const run = trace.getRun(runId)
    state.mark('add-events')
    for (let i = 0; i < eventCount; i++) {
      trace.addEvent(runId, {
        type: i % 100 === 0 ? 'physical-call' : 'benchmark-event',
        level: i % 100 === 0 ? 'warn' : 'info',
        label: `基准事件 ${i}`,
        detail: `seq=${i} payload=${'x'.repeat(i % 120)}`,
      })
    }
    const addEventsMs = state.measure('add-events')
    state.mark('export')
    const json = trace.exportRunToJson(run)
    const exportMs = state.measure('export')
    trace.removeRun(runId)
    trace.setMemoryLimits({ maxEvents: 128 })
    return {
      addEventsMs,
      exportMs,
      eventCount: json.events?.length || 0,
      eventLedger: run.eventLedger || null,
      exportedTotalEvents: json.eventLedger?.totalEvents || 0,
      liveTotalEvents: run.eventLedger?.totalEvents || 0,
      maxSeq: (json.events || []).reduce((max, event) => Math.max(max, event.seq || 0), 0),
      jsonChars: JSON.stringify(json).length,
    }
  }, count)
  assert(
    result.liveTotalEvents >= count,
    `event ledger records all events (${count}): live=${result.liveTotalEvents} exported=${result.exportedTotalEvents} events=${result.eventCount} maxSeq=${result.maxSeq}`
  )
  const typing = await measureTyping(page, '输入响应压测，请在大量 trace 事件存在时保持响应。')
  const metrics = await collectMetrics(page)
  return { case: `events-${count}`, count, ...result, typing, metrics }
}

async function dumpFailureScene(page, phase, extra = {}) {
  const scene = await page.evaluate(() => ({
    readyState: document.readyState,
    workspaceOpen: Boolean(document.querySelector('#outline-workspace')),
    chatOpen: Boolean(document.querySelector('#ow-chat-input')),
    messageCount: document.querySelectorAll('#ow-chat-messages .ow-msg').length,
    scrollerGeometry: (() => {
      const el = document.querySelector('.ow-message-scroller')
      if (!el) return null
      const style = getComputedStyle(el)
      return {
        className: el.className,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        overflowY: style.overflowY,
        height: style.height,
        display: style.display,
        position: style.position,
      }
    })(),
    sendDisabled: document.querySelector('#btn-ow-send')?.disabled ?? null,
    outlineChatLength: window.__pinia?._s?.get('project')?.outlineChat?.length ?? null,
    runCount: window.__pinia?._s?.get('runTrace')?.runs?.length ?? null,
    longTasks: window.__OUTLINE_V6_BASELINE__?.longTasks?.slice(-5).map(item => Math.round(item.duration)) || [],
  })).catch(error => ({ evaluateError: String(error) }))
  const evidence = { phase, scene, ...extra }
  fs.writeFileSync(path.join(RESULT_DIR, `failure-${phase}.json`), JSON.stringify(evidence, null, 2))
  console.error(`[FAILURE SCENE] ${phase}: ${JSON.stringify(evidence, null, 2)}`)
}

async function main() {
  const globalDeadline = Date.now() + GLOBAL_TIMEOUT_MS
  assertFreshRendererBuild()
  archivePreviousScene()
  removeDir(PROFILE)
  fs.mkdirSync(RESULT_DIR, { recursive: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })

  const electronProcess = startElectron()
  let browser = null
  const report = {
    schema: 'shenyi.outline-v6-baseline',
    version: 1,
    generatedAt: new Date().toISOString(),
    build: {
      rendererIndexMtime: fs.statSync(path.join(ROOT, 'dist-renderer', 'index.html')).mtime.toISOString(),
    },
    cases: [],
    environment: {
      stepTimeoutMs: STEP_TIMEOUT_MS,
      globalTimeoutMs: GLOBAL_TIMEOUT_MS,
      runOnly: RUN_ONLY,
    },
  }

  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = browser.contexts()[0]?.pages()?.[0]
    assert(page, 'renderer page reachable')
    page.setDefaultTimeout(30000)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[CONSOLE ERROR] ${message.text()}`)
    })

    await withStep('open-app', async () => {
      await page.waitForSelector('#app', { timeout: 30000 })
      await sleep(1500)
      await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
      await sleep(300)
    })

    await withStep('prepare-isolated-project', async () => {
      await page.evaluate(async ({ projectId, outline }) => {
        await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
        await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
          schemaVersion: 3,
          projectName: 'Outline V6 Baseline',
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
        })
      }, { projectId: PROJECT_ID, outline: OUTLINE_TEXT })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#app', { timeout: 30000 })
      await sleep(1500)
      await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
      await sleep(300)
    })

    await withStep('open-outline-ui', async () => {
      await page.click('#btn-outline-workspace')
      await page.waitForSelector('#outline-editor', { timeout: 20000 })
      await page.click('#btn-ai-co-create')
      await page.waitForSelector('#ow-chat-input', { timeout: 20000 })
      await installObserver(page)
    })

    const shouldRun = name => RUN_ONLY.length === 0 || RUN_ONLY.includes(name)
    const appendCase = async (name, phase, fn) => {
      if (!shouldRun(name)) return
      if (Date.now() >= globalDeadline) throw new Error('global baseline timeout reached')
      const item = await withStep(name, fn)
      report.cases.push(item)
      fs.writeFileSync(RESULT_FILE, JSON.stringify(report, null, 2))
      console.log(`[CASE RESULT] ${name}: ${JSON.stringify(item, null, 2)}`)
    }

    await appendCase('single-100000', 'message-size', () => measureLargeMessageCase(page, 100000))
    await appendCase('single-300000', 'message-size', () => measureLargeMessageCase(page, 300000))
    await appendCase('single-1000000', 'message-size', () => measureLargeMessageCase(page, 1000000))
    await appendCase('messages-10000', 'message-count', () => measureMessageCountCase(page, 10000, 200))
    await appendCase('messages-50000', 'message-count', () => measureMessageCountCase(page, 50000, 100))
    await appendCase('events-5000', 'trace-events', () => measureEventCase(page, 5000))
    await appendCase('events-20000', 'trace-events', () => measureEventCase(page, 20000))

    report.summary = {
      totalCases: report.cases.length,
      requiredCases: 7,
      allCasesExecuted: RUN_ONLY.length === 0 && report.cases.length >= 7,
      worstTypingDelayMs: Math.max(...report.cases.map(item => item.typing?.duration ?? 0)),
      worstRenderMs: Math.max(...report.cases.map(item => item.renderMs ?? 0)),
      worstSaveMs: Math.max(...report.cases.map(item => item.saveMs ?? 0)),
      worstLongTaskMs: Math.max(...report.cases.map(item => item.metrics?.longTaskMaxMs ?? 0)),
    }
    fs.writeFileSync(RESULT_FILE, JSON.stringify(report, null, 2))
    if (RUN_ONLY.length === 0) {
      assert(report.summary.allCasesExecuted, `all required cases executed: ${report.cases.length}/7`)
    } else {
      console.log(`PASS: outline V6 baseline partial run (${report.cases.length} selected case(s)); report=${RESULT_FILE}`)
    }
  } catch (error) {
    report.failure = { message: String(error), at: new Date().toISOString() }
    fs.writeFileSync(path.join(RESULT_DIR, 'baseline-failure.json'), JSON.stringify(report, null, 2))
    if (browser) {
      try {
        const page = browser.contexts()[0]?.pages()?.[0]
        if (page) await dumpFailureScene(page, 'baseline-failure', { message: String(error) })
      } catch {}
    }
    throw error
  } finally {
    if (browser) await browser.close().catch(() => {})
    await stopElectron(electronProcess)
    removeDir(PROFILE)
  }
}

let exitCode = 0
let mainPending = true
const globalTimer = setTimeout(() => {
  console.error(`[GLOBAL TIMEOUT] baseline exceeded ${GLOBAL_TIMEOUT_MS}ms`)
  process.exit(2)
}, GLOBAL_TIMEOUT_MS)
globalTimer.unref()

main().catch(error => {
  console.error(error)
  exitCode = 1
}).finally(() => {
  clearTimeout(globalTimer)
  mainPending = false
})

process.on('beforeExit', () => {
  if (mainPending) return
  process.exit(exitCode)
})
