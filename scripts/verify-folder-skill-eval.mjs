import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, '_data')
const AUDIT_TMP = path.join(ROOT, '_audit', 'tmp')
const BACKUP = path.join(AUDIT_TMP, 'folder-skill-eval-backup')
const PROFILE = path.join(AUDIT_TMP, 'folder-skill-eval-profile')
const PROBE = path.join(AUDIT_TMP, 'folder-skill-eval-skill')
const RESULT_FILE = path.join(AUDIT_TMP, 'folder-skill-eval-result.json')
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9243
const MOCK_PORT = 18791

const result = {
  allStepsOk: false,
  steps: [],
  runtimeErrors: [],
  requests: [],
  restored: false,
  residual: [],
}

function record(name, ok, detail = '') {
  result.steps.push({ name, ok, detail })
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}${detail ? ' | ' + detail : ''}`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

function createProbeSkill() {
  fs.rmSync(PROBE, { recursive: true, force: true })
  writeText(path.join(PROBE, 'SKILL.md'), [
    '---',
    'id: folder-skill-eval-probe',
    'name: 技能评测探针',
    'description: 验证 with/baseline 评测闭环',
    '---',
    '',
    '你是技能评测探针。'
  ].join('\n'))
  writeText(path.join(PROBE, 'template.md'), '你必须输出：技能探针输出。')
  writeText(path.join(PROBE, 'evals.json'), JSON.stringify({
    schema: 'shenyi.skill-evals/1',
    cases: [{
      id: 'case-1',
      name: '基础对照',
      input: '请输出探针结果',
      assertions: [
        { type: 'min_length', min: 3 },
        { type: 'contains', value: '技能探针输出' }
      ]
    }]
  }, null, 2))
  writeText(path.join(PROBE, 'references', 'protocol.md'), '探针资源：北境防线。')
}

const backupFiles = []

function backupData() {
  fs.rmSync(BACKUP, { recursive: true, force: true })
  fs.mkdirSync(BACKUP, { recursive: true })
  for (const file of fs.readdirSync(DATA)) {
    const match = file.match(/^(wa_skills|wa_projects|wa_co_creation_config|wa_providers|wa_lastProjectId|wa_chat_[^.]*)\.json(\.bak)?$/)
    if (!match) continue
    fs.copyFileSync(path.join(DATA, file), path.join(BACKUP, file))
    backupFiles.push(file)
  }
}

function restoreData() {
  for (const file of backupFiles) {
    try {
      fs.copyFileSync(path.join(BACKUP, file), path.join(DATA, file))
    } catch (error) {
      result.runtimeErrors.push(`restore ${file}: ${error.message}`)
    }
  }
  for (const file of fs.readdirSync(DATA)) {
    const match = file.match(/^(wa_skills|wa_projects|wa_co_creation_config|wa_providers|wa_lastProjectId|wa_chat_[^.]*)\.json(\.bak)?$/)
    if (!match || backupFiles.includes(file)) continue
    try {
      fs.rmSync(path.join(DATA, file), { force: true })
    } catch (error) {
      result.runtimeErrors.push(`clean ${file}: ${error.message}`)
    }
  }
  result.restored = result.runtimeErrors.length === 0
  result.residual = fs.readdirSync(DATA).filter(file => /folder-skill-eval|技能评测探针/.test(file))
}

function writeProbeProvider() {
  fs.writeFileSync(path.join(DATA, 'wa_providers.json'), JSON.stringify({
    providers: [{
      id: 'folder-eval-probe-provider',
      name: 'Folder 评测探针供应商',
      baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`,
      apiKey: 'probe-key',
      models: ['folder-eval-model'],
      selectedModel: 'folder-eval-model',
      temperature: 0.7,
      maxTokens: 8192,
      purpose: ['generate'],
      streamMode: false,
      systemPrompt: '',
      providerType: 'openai-compatible',
      endpointMode: 'base',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }],
    generateProvider: 'folder-eval-probe-provider',
    verifyProvider: null,
    detectProvider: null,
  }, null, 2), 'utf8')
}

function json(res, text) {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify({
    id: 'chatcmpl-folder-eval',
    object: 'chat.completion',
    created: Date.now(),
    model: 'folder-eval-model',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  }))
}

const mockServer = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    res.end()
    return
  }
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    let payload = {}
    try { payload = JSON.parse(body || '{}') } catch { payload = {} }
    const system = payload.messages?.find(message => message.role === 'system')?.content || ''
    const isWithSkill = system.includes('技能评测探针')
    result.requests.push({
      isWithSkill,
      systemLength: system.length,
      userText: payload.messages?.find(message => message.role === 'user')?.content || '',
    })
    json(res, isWithSkill ? '技能探针输出' : '基线普通输出')
  })
})

let electronProcess = null

function startElectron() {
  electronProcess = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`,
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SHENYI_TEST_DIRECTORY_PATH: PROBE },
  })
  electronProcess.stdout.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection/i.test(text)) result.runtimeErrors.push(text.slice(0, 500))
  })
  electronProcess.stderr.on('data', data => {
    const text = String(data)
    if (/Uncaught|unhandledRejection|EADDRINUSE/i.test(text)) result.runtimeErrors.push(text.slice(0, 500))
  })
}

async function waitForCdp(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (response.ok) return true
    } catch { /* retry */ }
    await sleep(500)
  }
  return false
}

function stopElectron() {
  if (!electronProcess?.pid) return
  try {
    execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch { /* already exited */ }
  electronProcess = null
}

let browser = null
let page = null

async function connectPage() {
  const { chromium } = await import('playwright')
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
  for (let i = 0; i < 24; i++) {
    const pages = browser.contexts()[0]?.pages() || []
    if (pages.length) {
      page = pages[0]
      return
    }
    await sleep(500)
  }
  throw new Error('CDP connected but no page appeared')
}

async function closeVisibleModals() {
  await page.evaluate(() => {
    const projectModal = document.querySelector('.project-modal-content')
    if (projectModal && getComputedStyle(projectModal).display !== 'none') {
      projectModal.querySelector('.btn-close')?.click()
    }
    const transition = document.querySelector('.project-transition-confirm')
    if (transition && getComputedStyle(transition).display !== 'none') {
      ;[...transition.querySelectorAll('button')].find(button => button.textContent.trim() === '取消')?.click()
    }
  })
  await page.waitForTimeout(300)
}

async function createProbeProject() {
  await page.locator('#btn-open-project').click()
  await page.waitForTimeout(400)
  const transition = page.locator('.project-transition-confirm')
  if (await transition.isVisible().catch(() => false)) {
    await transition.getByRole('button', { name: '取消' }).click()
    await page.waitForTimeout(200)
  }
  const projectToggle = page.locator('.new-project-btn')
  if ((await projectToggle.innerText().catch(() => '')) === '取消') {
    await projectToggle.click()
    await page.waitForTimeout(200)
  }
  await page.getByRole('button', { name: '+ 新建项目' }).click()
  await page.locator('.new-project-form input').fill('Folder技能评测探针')
  await page.locator('.new-project-form textarea').fill('北境防线。')
  await page.getByRole('button', { name: '创建' }).click()
  await page.waitForTimeout(700)
  const createConfirm = page.locator('.project-transition-confirm')
  if (await createConfirm.isVisible().catch(() => false)) {
    await createConfirm.getByRole('button', { name: '保存并继续' }).click()
    await page.waitForTimeout(700)
  }
  if (await page.locator('.project-modal-content').isVisible().catch(() => false)) {
    await page.locator('.project-modal-content .btn-close').click()
    await page.waitForTimeout(300)
  }
}

async function installProbeSkillThroughSettingsUi() {
  await page.locator('#btn-settings').click()
  await page.waitForSelector('#tab-skill', { timeout: 10000 })
  await page.locator('#tab-skill').click()
  await page.waitForSelector('#btn-import-folder-skill', { timeout: 10000 })
  await page.locator('#btn-import-folder-skill').click()
  await page.waitForSelector('#folder-import-title', { timeout: 10000 })
  await page.locator('#btn-confirm-folder-import').click()
  await page.waitForSelector('.skill-card-badge.is-folder', { timeout: 10000 })
  await page.waitForTimeout(500)
}

async function runEvalThroughSettingsUi() {
  const card = page.locator('.skill-card', { hasText: '技能评测探针' }).first()
  await card.getByRole('button', { name: '测试' }).click()
  await page.waitForSelector('#btn-run-skill-eval', { timeout: 10000 })
  await page.locator('#btn-run-skill-eval').click()
  await page.waitForSelector('#st-eval-report', { timeout: 30000 })
  await page.waitForFunction(() => {
    const report = document.querySelector('#st-eval-report')
    return report && report.textContent?.includes('技能提升')
  }, null, { timeout: 30000 })
  await page.evaluate(() => {
    document.querySelectorAll('#st-eval-report details').forEach(details => {
      details.open = true
    })
  })
  await page.waitForTimeout(300)
}

async function verifyRunTraceThroughHomeUi() {
  await page.locator('#btn-close-settings').click()
  await page.waitForTimeout(300)
  await closeVisibleModals()
  await page.locator('#btn-editor-run-trace').click()
  await page.waitForSelector('#run-trace-panel', { timeout: 10000 })
  await page.getByRole('button', { name: '技能评测' }).click()
  await page.waitForSelector('.rt-run', { timeout: 10000 })
  const runText = await page.locator('.rt-run').first().innerText()
  record('运行记录出现技能评测来源', runText.includes('技能评测'), runText.replace(/\s+/g, ' ').slice(0, 240))
  await page.locator('.rt-run').first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'API 调用' }).click()
  await page.waitForTimeout(300)
  const apiText = await page.locator('.rt-detail').innerText()
  record('运行记录包含双路 API 调用', apiText.includes('第 1 次调用') && apiText.includes('第 2 次调用'), `requests=${result.requests.length}`)
}

async function closeTestModal() {
  await page.locator('#skill-test-modal .modal-close, #skill-test-modal button[title="关闭"]').first().click()
  await page.waitForTimeout(300)
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.mkdirSync(DATA, { recursive: true })
  createProbeSkill()
  await new Promise(resolve => mockServer.listen(MOCK_PORT, '127.0.0.1', resolve))
  backupData()
  writeProbeProvider()
  startElectron()
  const cdpUp = await waitForCdp()
  record('源 Electron CDP 启动', cdpUp, `port=${CDP_PORT}`)
  if (!cdpUp) throw new Error('CDP did not open')
  await connectPage()
  await page.waitForSelector('#user-input', { timeout: 30000 })
  await closeVisibleModals()
  await createProbeProject()
  await installProbeSkillThroughSettingsUi()
  await runEvalThroughSettingsUi()

  const reportText = await page.locator('#st-eval-report').innerText()
  record('grading 显示 with 通过', reportText.includes('技能 1/1') && reportText.includes('with：通过'), reportText.replace(/\s+/g, ' ').slice(0, 240))
  record('grading 显示 baseline 未通过', reportText.includes('基线 0/1') && reportText.includes('baseline：未通过'))
  record('grading 显示断言结果', reportText.includes('断言结果') && reportText.includes('min_length'))
  record('grading 显示双路输出', reportText.includes('with 输出') && reportText.includes('技能探针输出') && reportText.includes('基线普通输出'))

  const withRequests = result.requests.filter(request => request.isWithSkill)
  const baselineRequests = result.requests.filter(request => !request.isWithSkill)
  record('真实 API 双路请求', withRequests.length === 1 && baselineRequests.length === 1, `with=${withRequests.length} baseline=${baselineRequests.length}`)
  record('with 请求读取模板', withRequests[0]?.systemLength > 100, `systemLength=${withRequests[0]?.systemLength || 0}`)
  record('baseline 不读取技能模板', baselineRequests[0]?.systemLength < withRequests[0]?.systemLength, `baselineLength=${baselineRequests[0]?.systemLength || 0} withLength=${withRequests[0]?.systemLength || 0}`)

  await closeTestModal()
  await verifyRunTraceThroughHomeUi()
  result.allStepsOk = result.steps.every(step => step.ok) && result.runtimeErrors.length === 0
}

try {
  await main()
} catch (error) {
  result.allStepsOk = false
  result.runtimeErrors.push(`${error.message}\n${error.stack || ''}`)
  console.error('[ERROR] ' + error.message)
} finally {
  try { await browser?.close() } catch { /* ignore */ }
  stopElectron()
  restoreData()
  try {
    fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  } catch (error) {
    result.runtimeErrors.push('profile cleanup: ' + error.message)
  }
  try { mockServer.close() } catch { /* ignore */ }
  fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2), 'utf8')
  console.log('[RESULT] ' + RESULT_FILE)
  console.log('[VERDICT] ' + (result.allStepsOk && result.restored && result.residual.length === 0 ? 'PASS' : 'FAIL'))
  process.exit(result.allStepsOk && result.restored && result.residual.length === 0 ? 0 : 1)
}
