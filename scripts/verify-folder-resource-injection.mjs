import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, '_data')
const AUDIT_TMP = path.join(ROOT, '_audit', 'tmp')
const BACKUP = path.join(AUDIT_TMP, 'folder-resource-injection-backup')
const PROFILE = path.join(AUDIT_TMP, 'folder-resource-injection-profile')
const PROBE = path.join(AUDIT_TMP, 'folder-resource-injection-skill')
const RESULT_FILE = path.join(AUDIT_TMP, 'folder-resource-injection-result.json')
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9241
const MOCK_PORT = 18789

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
    'id: folder-resource-injection-probe',
    'name: 资源注入探针',
    'description: 验证 SKILL.md 正文、模板与深层资源完整进入真实请求',
    '---',
    '',
    '【入口正文】你必须完整执行以下包内协议，不得改写协议结构。',
    '',
  ].join('\n'))
  writeText(path.join(PROBE, 'template.md'), '【执行模板】按探针协议输出，不要省略资源内容。')
  writeText(path.join(PROBE, 'meta.json'), '{invalid-json')
  writeText(path.join(PROBE, 'references', 'protocol.md'), '【深层资源一】北境第七夜防线告破，伏笔 A17 必须保留。')
  writeText(path.join(PROBE, 'assets', 'nested', 'style.md'), '【深层资源二】叙述保持冷峻，禁止 AI 腔总结句。')
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
  result.residual = fs.readdirSync(DATA).filter(file => /folder-resource-injection|资源注入探针/.test(file))
}

function writeProbeProvider() {
  fs.writeFileSync(path.join(DATA, 'wa_providers.json'), JSON.stringify({
    providers: [{
      id: 'folder-probe-provider',
      name: 'Folder 资源注入探针供应商',
      baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`,
      apiKey: 'probe-key',
      models: ['folder-probe-model'],
      selectedModel: 'folder-probe-model',
      temperature: 0.7,
      maxTokens: 8192,
      purpose: ['generate'],
      streamMode: true,
      systemPrompt: '',
      providerType: 'openai-compatible',
      endpointMode: 'base',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }],
    generateProvider: 'folder-probe-provider',
    verifyProvider: null,
    detectProvider: null,
  }, null, 2), 'utf8')
}

function sseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
}

async function streamText(res, text) {
  sseHeaders(res)
  res.write(`data: ${JSON.stringify({
    id: 'chatcmpl-folder-probe',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'folder-probe-model',
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  })}\n\n`)
  await sleep(20)
  res.write(`data: ${JSON.stringify({
    id: 'chatcmpl-folder-probe',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'folder-probe-model',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
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
  req.on('end', async () => {
    let payload = {}
    try { payload = JSON.parse(body || '{}') } catch { payload = {} }
    const system = payload.messages?.find(message => message.role === 'system')?.content || ''
    result.requests.push({
      systemPromptLength: system.length,
      hasBody: system.includes('【入口正文】'),
      hasTemplate: system.includes('【执行模板】'),
      hasResourceOne: system.includes('【深层资源一】北境第七夜防线告破，伏笔 A17 必须保留。'),
      hasResourceTwo: system.includes('【深层资源二】叙述保持冷峻，禁止 AI 腔总结句。'),
      hasResourceOneLabel: system.includes('[folder resource: references/protocol.md]'),
      hasResourceTwoLabel: system.includes('[folder resource: assets/nested/style.md]'),
    })
    await streamText(res, 'folder-resource-injection-ok')
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
  await page.locator('.new-project-form input').fill('Folder资源注入探针')
  await page.locator('.new-project-form textarea').fill('北境第七夜防线告破。')
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
  const previewText = await page.locator('.skill-import-modal').innerText()
  record('导入预览显示资源与警告', previewText.includes('资源 2 个') && previewText.includes('警告 1 条'), previewText.replace(/\s+/g, ' ').slice(0, 240))
  await page.locator('#btn-confirm-folder-import').click()
  await page.waitForSelector('.skill-card-badge.is-folder', { timeout: 10000 })
  const cardText = await page.locator('.skill-card', { hasText: '资源注入探针' }).first().innerText()
  record('技能卡片显示资源摘要', cardText.includes('资源 2 个 / 警告 1 条'), cardText.replace(/\s+/g, ' ').slice(0, 240))
  await page.locator('#btn-close-settings').click()
  await page.waitForTimeout(300)
}

async function sendHomeSkillRequest() {
  await closeVisibleModals()
  await page.locator('#co-skill-select').selectOption('folder:folder-resource-injection-probe')
  await page.waitForTimeout(300)
  await page.fill('#user-input', '请生成完整探针结果')
  await page.locator('#btn-send').click()
  await page.waitForFunction(() => {
    const messages = document.querySelectorAll('#messages-list .chat-message.assistant')
    const last = messages[messages.length - 1]
    return last && last.textContent?.includes('folder-resource-injection-ok')
  }, null, { timeout: 30000 })
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
  await sendHomeSkillRequest()

  const request = result.requests.at(-1)
  const checks = [
    ['真实 API 请求已捕获', Boolean(request), `requests=${result.requests.length}`],
    ['请求仅 1 次 API 调用', result.requests.length === 1, `requests=${result.requests.length}`],
    ['SKILL.md 正文完整注入', Boolean(request?.hasBody), `systemLength=${request?.systemPromptLength || 0}`],
    ['template.md 独立完整注入', Boolean(request?.hasTemplate), `systemLength=${request?.systemPromptLength || 0}`],
    ['深层资源一完整注入', Boolean(request?.hasResourceOne && request?.hasResourceOneLabel)],
    ['深层资源二完整注入', Boolean(request?.hasResourceTwo && request?.hasResourceTwoLabel)],
  ]
  for (const [name, ok, detail] of checks) record(name, ok, detail)

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
