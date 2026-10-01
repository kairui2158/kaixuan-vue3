import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9276
const PROFILE = path.join(ROOT, '_data', 'agent-state-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const OUTPUT_FILE = path.join(ROOT, '_audit', 'verification-agent-state-electron', 'agent-state-evidence.json')
const GLOBAL_TIMEOUT_MS = 180_000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  if (!fs.existsSync(target)) return
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(400)
  }
}

function startElectron() {
  return spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: DATA_DIR,
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: true,
  })
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

async function connectPage() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  const context = browser.contexts()[0]
  const page = context.pages().at(-1) || await context.newPage()
  await page.waitForFunction(() => Boolean(window.electronAPI), null, { timeout: 30_000, polling: 200 })
  return { browser, page }
}

async function closeElectron(app) {
  if (!app || app.exitCode !== null) return
  app.kill()
  const deadline = Date.now() + 10_000
  while (app.exitCode === null && Date.now() < deadline) await sleep(200)
  if (app.exitCode === null && process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
  }
}

const watchdog = setTimeout(() => {
  console.error(`[TIMEOUT] agent state Electron verification exceeded ${GLOBAL_TIMEOUT_MS}ms`)
  process.exit(1)
}, GLOBAL_TIMEOUT_MS)
watchdog.unref()

const taskId = 'agent-state-e2e-task'
const checkpointId = 'agent-state-e2e-checkpoint'
const evidence = {
  schemaVersion: 'agent-state-electron-v1',
  generatedAt: new Date().toISOString(),
  checks: []
}

await removeDir(PROFILE)
fs.mkdirSync(PROFILE, { recursive: true })

let app = null
let browser = null
let page = null
try {
  console.log('[stage] launch first app instance')
  app = startElectron()
  app.stdout?.on('data', chunk => process.stdout.write(`[app:stdout] ${chunk}`))
  app.stderr?.on('data', chunk => process.stderr.write(`[app:stderr] ${chunk}`))
  assert(await waitForCdp(), 'CDP became available')
  ;({ browser, page } = await connectPage())

  console.log('[stage] save and query task state')
  const saved = await page.evaluate(async id => {
    return await window.electronAPI.agentStateSave({
      taskId: id,
      status: 'running',
      snapshot: { taskId: id, goal: '整理长文档并写入' },
      updatedAt: Date.now()
    })
  }, taskId)
  assert(saved?.ok === true, `agentStateSave returned ok: ${JSON.stringify(saved)}`)
  const statuses = await page.evaluate(() => window.electronAPI.agentStatus('all'))
  assert(Array.isArray(statuses), 'agentStatus(all) returns array')
  assert(statuses.some(item => item.taskId === taskId), 'saved task visible in status')

  console.log('[stage] verify UI panel reads persisted state')
  await page.evaluate(() => document.querySelector('.agent-progress-panel .agp-header')?.click())
  await page.waitForFunction(() => {
    const items = Array.from(document.querySelectorAll('.agent-progress-panel .agp-item'))
    return items.some(item => item.textContent?.includes('整理长文档并写入'))
  }, null, { timeout: 10_000, polling: 200 })
  evidence.uiVisible = true

  console.log('[stage] checkpoint hash validation')
  const checkpointPayload = { goal: '整理长文档', hardConstraints: ['不丢目标'], pendingQuestions: [] }
  const checkpoint = await page.evaluate(async payload => {
    return await window.electronAPI.agentCheckpointSave({
      checkpointId: 'agent-state-e2e-checkpoint',
      taskId: 'agent-state-e2e-task',
      payload
    })
  }, checkpointPayload)
  assert(checkpoint?.ok === true, `checkpoint save ok: ${JSON.stringify(checkpoint)}`)
  const loaded = await page.evaluate(id => window.electronAPI.agentCheckpointLoad(id), checkpointId)
  assert(loaded?.ok === true, `checkpoint load ok: ${JSON.stringify(loaded)}`)
  assert.deepEqual(loaded.checkpoint.payload, checkpointPayload, 'checkpoint payload round-trips')

  const checkpointFile = path.join(DATA_DIR, 'agent-state', 'checkpoints', `${checkpointId}.json`)
  assert(fs.existsSync(checkpointFile), 'checkpoint file exists')
  const originalRecord = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'))
  const tamperedRecord = {
    ...originalRecord,
    payload: { ...originalRecord.payload, goal: '篡改后的目标' }
  }
  fs.writeFileSync(checkpointFile, JSON.stringify(tamperedRecord), 'utf8')
  const tampered = await page.evaluate(id => window.electronAPI.agentCheckpointLoad(id), checkpointId)
  assert(tampered?.ok === false, 'tampered checkpoint is rejected')
  assert.equal(tampered.reason, 'hash_mismatch', 'tampered checkpoint reason is hash_mismatch')
  fs.writeFileSync(checkpointFile, JSON.stringify(originalRecord), 'utf8')

  console.log('[stage] cancel writes token and terminal state')
  const canceled = await page.evaluate(id => window.electronAPI.agentCancel(id, 'user_cancel_e2e'), taskId)
  assert(canceled?.ok === true, `agentCancel ok: ${JSON.stringify(canceled)}`)
  assert.equal(canceled.status, 'canceled', 'cancel returns terminal status')
  const token = await page.evaluate(id => window.electronAPI.agentCancelToken({ taskId: id, action: 'get' }), taskId)
  assert(token?.cancelToken?.reason === 'user_cancel_e2e', 'cancel token persisted')

  console.log('[stage] close and relaunch app')
  await browser.close()
  await closeElectron(app)
  app = null
  browser = null
  page = null
  await sleep(500)
  app = startElectron()
  assert(await waitForCdp(), 'CDP became available after restart')
  ;({ browser, page } = await connectPage())

  console.log('[stage] recover non-terminal task after main-process restart')
  const seededTaskId = 'agent-state-recovery-task'
  const seededStatus = await page.evaluate(async id => {
    return await window.electronAPI.agentStateSave({
      taskId: id,
      status: 'running',
      snapshot: { taskId: id, goal: '恢复测试任务' },
      updatedAt: Date.now()
    })
  }, seededTaskId)
  assert(seededStatus?.ok === true, 'seed recovery task')
  await closeElectron(app)
  app = null
  browser = null
  page = null
  await sleep(500)
  app = startElectron()
  assert(await waitForCdp(), 'CDP became available for recovery run')
  ;({ browser, page } = await connectPage())
  const recovery = await page.evaluate(() => window.electronAPI.agentRecover())
  assert(recovery?.ok === true, `agentRecover ok: ${JSON.stringify(recovery)}`)
  const recoveredTask = recovery.recovered.find(item => item.task?.taskId === seededTaskId)
  assert(recoveredTask, 'seeded non-terminal task included in recovery')
  assert.equal(recoveredTask.task.status, 'needs_user', 'recovered task status is needs_user')
  assert.equal(recoveredTask.task.reason, 'main_process_restarted', 'recovery reason is main_process_restarted')
  assert.equal(recoveredTask.task.snapshot.reason, 'main_process_restarted', 'snapshot reason is updated')

  const terminalTask = recovery.recovered.find(item => item.task?.taskId === taskId)
  assert(terminalTask, 'canceled task included in recovery list')
  assert.equal(terminalTask.task.status, 'canceled', 'terminal status is not overwritten')

  evidence.checks = [
    'state save -> status visible',
    'UI panel reads persisted state',
    'checkpoint save/load hash passes',
    'checkpoint tamper rejected with hash_mismatch',
    'cancel token persisted and task terminal',
    'restart recovery converts running to needs_user',
    'terminal statuses survive recovery'
  ]
  evidence.verdict = 'pass'
  console.log('===== AGENT STATE ELECTRON VERIFICATION PASSED =====')
} catch (error) {
  evidence.verdict = 'fail'
  evidence.error = String(error?.stack || error)
  console.error('===== AGENT STATE ELECTRON VERIFICATION FAILED =====')
  console.error(evidence.error)
} finally {
  try { if (browser) await browser.close() } catch {}
  await closeElectron(app)
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(`[evidence] ${path.relative(ROOT, OUTPUT_FILE)}`)
}

if (evidence.verdict !== 'pass') process.exit(1)
