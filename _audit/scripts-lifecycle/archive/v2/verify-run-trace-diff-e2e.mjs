import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9264
const PROFILE = path.join(ROOT, '_data', 'run-trace-diff-e2e-profile')
const DATA_DIR = path.join(PROFILE, 'app-data')
const EXPORT_BASE = path.join(ROOT, '_data', 'run-trace-diff-e2e-exports')
const KEEP_PROFILE = process.env.SHENYI_E2E_KEEP_PROFILE === '1'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

let electronProcess = null

function startElectron() {
  electronProcess = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_BASE,
      SHENYI_TEST_USER_DATA_DIR: DATA_DIR,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data')
    }
  })
  electronProcess.stdout.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection/i.test(text)) console.log('[ELECTRON:stdout] ' + text.slice(0, 800))
  })
  electronProcess.stderr.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection|EADDRINUSE/i.test(text)) console.log('[ELECTRON:stderr] ' + text.slice(0, 800))
  })
}

async function waitForCdp(timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch {}
    await sleep(400)
  }
  return false
}

function stopElectron() {
  if (!electronProcess?.pid) return
  try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  electronProcess = null
}

async function cleanup() {
  stopElectron()
  if (KEEP_PROFILE) {
    console.log('[CLEANUP] profile retained: ' + PROFILE)
    return
  }
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      fs.rmSync(EXPORT_BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
      break
    } catch (error) {
      if (attempt === 5) throw error
      await sleep(500)
    }
  }
  assert(!fs.existsSync(PROFILE), 'E2E profile is cleaned up')
  assert(!fs.existsSync(EXPORT_BASE), 'E2E export directory is cleaned up')
}

async function seedRuns(page) {
  return page.evaluate(() => {
    const rawStore = window.__pinia?._s?.get?.('runTrace')
    const store = rawStore?.value || rawStore
    if (!store) return { ok: false, reason: 'runTrace store not found' }
    store.clearRuns()

    const start = id => store.startRun({
      id,
      source: 'home',
      stepName: '主页共创',
      mode: 'chat',
      sessionKind: 'chat',
      projectId: 'run-trace-diff-e2e',
      projectName: 'RunTrace Diff E2E',
      providerId: 'mock-provider',
      providerName: 'Mock Provider',
      model: 'mock-model',
      skillNames: ['对比技能'],
      skillMode: 'chat',
      startedAt: Date.now()
    })
    const runA = start('diff-a')
    const turnA = store.startTurn(runA, { userRequest: '生成 A 版本', skillNames: ['对比技能'], mode: 'chat' })
    const callA = store.startApiCall(runA, {
      source: 'home',
      skillName: '对比技能',
      model: 'mock-model',
      requestMessages: [
        { role: 'system', content: 'Authorization: Bearer sk-12345678abcdefg' },
        { role: 'user', content: 'A 版本请求' }
      ]
    })
    store.appendToolCall(runA, callA, {
      name: 'editor.get_state',
      input: { targetId: 'main' },
      result: { ok: true },
      status: 'success',
      durationMs: 10
    })
    store.finishApiCall(runA, callA, {
      status: 'success',
      responseText: 'A 版本完整输出全文。',
      finishReason: 'stop',
      durationMs: 120
    })
    store.attachPromptSnapshot(runA, {
      apiCallId: callA,
      turnId: turnA,
      skillId: 'diff-skill',
      skillName: '对比技能',
      finalMessages: [{ role: 'system', content: 'A 系统提示' }],
      variables: [{ key: 'chapterTitle', source: 'pipeline', chars: 4, value: 'A 标题' }]
    })
    store.finishTurn(runA, turnA, 'success')
    store.finishRun(runA, 'success')

    const runB = start('diff-b')
    const turnB = store.startTurn(runB, { userRequest: '生成 B 版本', skillNames: ['对比技能'], mode: 'chat' })
    const callB = store.startApiCall(runB, {
      source: 'home',
      skillName: '对比技能',
      model: 'mock-model-b',
      requestMessages: [
        { role: 'system', content: 'Authorization: Bearer sk-12345678abcdefg' },
        { role: 'user', content: 'B 版本请求' }
      ]
    })
    store.finishApiCall(runB, callB, {
      status: 'degraded',
      responseText: 'B 版本完整输出全文，并且内容更长。',
      finishReason: 'length',
      durationMs: 220
    })
    store.attachPromptSnapshot(runB, {
      apiCallId: callB,
      turnId: turnB,
      skillId: 'diff-skill',
      skillName: '对比技能',
      finalMessages: [{ role: 'system', content: 'B 系统提示' }],
      variables: [{ key: 'chapterTitle', source: 'pipeline', chars: 4, value: 'B 标题' }]
    })
    store.appendPhysicalCall(runB, callB, {
      phase: 'retry',
      status: 'success',
      requestMessages: [{ role: 'user', content: 'B 物理请求' }],
      responseText: 'B 物理返回',
      durationMs: 80
    })
    store.finishTurn(runB, turnB, 'success')
    store.finishRun(runB, 'success')
    return { ok: true, runs: [runA, runB] }
  })
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.rmSync(EXPORT_BASE, { recursive: true, force: true })
  fs.mkdirSync(EXPORT_BASE, { recursive: true })
  startElectron()
  let browser = null
  try {
    assert(await waitForCdp(), 'source Electron CDP is reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const pages = browser.contexts()[0]?.pages() || []
    const page = pages[0]
    assert(page, 'renderer page is reachable')
    page.on('pageerror', error => console.log('[PAGE ERROR] ' + error.message))
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await sleep(400)

    const seeded = await seedRuns(page)
    assert(seeded.ok, 'two synthetic runs are injected into the real Pinia store')
    assert(typeof seeded.runs[0] === 'string' && typeof seeded.runs[1] === 'string', 'seeded runs return real store IDs')
    const [runIdA, runIdB] = seeded.runs

    await page.click('#btn-editor-run-trace')
    await page.waitForSelector('#run-trace-overlay', { timeout: 10000 })
    await page.waitForSelector('#run-trace-panel', { timeout: 10000 })

    await page.click('#run-trace-panel .rt-header-actions button:has-text("对比运行")')
    await page.click(`#run-trace-panel [data-run-id="${runIdA}"] .rt-run-compare button:has-text("选 A")`)
    await page.click(`#run-trace-panel [data-run-id="${runIdB}"] .rt-run-compare button:has-text("选 B")`)
    await page.waitForSelector('.rt-detail-compare', { timeout: 10000 })
    assert(true, 'compare mode renders after selecting A/B')

    for (const label of ['概览', 'API', '提示词', '输出', '工具与处理', '事件与状态']) {
      const count = await page.locator(`.rtd-tabs button:has-text("${label}")`).count()
      assert(count === 1, `compare panel has ${label} tab`)
    }
    assert(await page.locator('.rtd-tabs button:has-text("API")').count() === 1, 'API diff tab is present')

    await page.locator('.rtd-tabs button', { hasText: 'API' }).click()
    await page.locator('.rt-detail-compare summary', { hasText: '请求消息 / user' }).first().click()
    await sleep(200)
    const diffText = await page.locator('.rt-detail-compare').innerText()
    assert(diffText.includes('A 版本请求') && diffText.includes('B 版本请求'), 'request differences are visible')
    assert(diffText.includes('仅存在于 A') || diffText.includes('仅存在于 B') || diffText.includes('已对齐'), 'single-side or aligned labels are visible')

    await page.click('.rt-detail-compare button:has-text("导出对比 JSON（全文）")')
    await page.waitForSelector('.rt-compare-result, .rt-compare-error', { timeout: 20000 })
    const exportResultText = await page.locator('.rt-compare-result, .rt-compare-error').first().innerText()
    assert(exportResultText.includes('已导出'), 'diff export reports success')
    await sleep(500)

    const files = fs.readdirSync(EXPORT_BASE).filter(name => name.startsWith('run-trace-diff-') && name.endsWith('.json'))
    assert(files.length === 1, 'one diff JSON file is written')
    const filePath = path.join(EXPORT_BASE, files[0])
    const raw = fs.readFileSync(filePath, 'utf8')
    const exported = JSON.parse(raw)
    assert(exported.schema === 'shenyi.run-trace-diff', 'diff export schema is correct')
    assert(exported.version === 1, 'diff export schema version is correct')
    assert(exported.diff?.runs?.a?.id === runIdA && exported.diff?.runs?.b?.id === runIdB, 'export contains full A/B runs')
    assert(raw.includes('A 版本完整输出全文。'), 'export contains A response full text')
    assert(raw.includes('B 版本完整输出全文，并且内容更长。'), 'export contains B response full text')
    assert(!raw.includes('sk-12345678abcdefg'), 'diff export does not leak API key')
    assert(!raw.toLowerCase().includes('[object object]'), 'diff export is recursively serialized, not stringified to [object Object]')
    assert(fs.statSync(filePath).size > 1000, 'diff export has a substantive size')

    await page.click('#run-trace-panel .rt-header-actions button:has-text("退出对比")')
    await sleep(300)
    assert(await page.locator('.rt-detail-compare').count() === 0, 'compare detail is closed after exit')
    await page.click('.rt-tabs button:nth-child(2)')
    await sleep(300)
    assert(await page.locator('.rt-api').count() > 0, 'single-run API tab still works after compare exit')

    await page.click('#run-trace-panel .modal-close')
    await sleep(400)
    await page.click('#btn-editor-run-trace')
    await page.waitForSelector('#run-trace-panel', { timeout: 10000 })
    await sleep(300)
    assert(await page.locator('.rt-detail-compare').count() === 0, 'compare state is not remembered after panel close')
    await page.click('#run-trace-panel .rt-header-actions button:has-text("对比运行")')
    await sleep(300)
    assert(await page.locator('.rt-run-compare button.active').count() === 0, 'A/B selections are cleared on panel reopen')
  } finally {
    try { await browser?.close() } catch {}
    await cleanup()
  }
}

main().catch(error => {
  console.error('[FAIL] ' + (error?.stack || error?.message || String(error)))
  process.exitCode = 1
})
