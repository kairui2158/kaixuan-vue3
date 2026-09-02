import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { spawn, execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, '_data')
const BACKUP = path.join(ROOT, '_audit', 'tmp', 'ai-editor-interaction-backup')
const PROFILE = path.join(ROOT, '_audit', 'tmp', 'ai-editor-interaction-profile')
const ELECTRON_EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9237
const MOCK_PORT = 18777
const RESULT_FILE = path.join(ROOT, '_audit', 'tmp', 'ai-editor-interaction-result.json')

const result = {
  allStepsOk: false,
  steps: [],
  runtimeErrors: [],
  requestLog: [],
  restored: false,
  residual: []
}

function record(name, ok, detail = '') {
  result.steps.push({ name, ok, detail })
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' | ' + detail : ''))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function sseHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  })
}

async function streamChunks(res, chunks, finishReason) {
  sseHeaders(res)
  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify({
      id: 'chatcmpl-editor-probe',
      object: 'chat.completion.chunk',
      created: Date.now(),
      model: 'editor-probe-model',
      choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
    })}\n\n`)
    await sleep(20)
  }
  res.write(`data: ${JSON.stringify({
    id: 'chatcmpl-editor-probe',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'editor-probe-model',
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }]
  })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}

const mockServer = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    })
    res.end()
    return
  }
  let body = ''
  req.on('data', data => { body += data })
  req.on('end', async () => {
    let payload = {}
    try { payload = JSON.parse(body || '{}') } catch { payload = {} }
    const lastUser = [...(payload.messages || [])].reverse().find(message => message.role === 'user')
    const lastUserText = String(lastUser?.content || '')
    const isOutline = lastUserText.includes('大纲协议探针')
    const request = {
      url: req.url,
      at: new Date().toISOString(),
      role: isOutline ? 'outline' : 'main',
      containsProtocol: payload.messages?.some(message => String(message.content || '').includes('受限编辑协议')) || false
    }
    result.requestLog.push(request)
    if (isOutline) {
      await streamChunks(res, ['{"type":"outline_edit","operation":"append","content":"\\n第二阶段：北境防线告破。"}'], 'stop')
      return
    }
    if (lastUserText.includes('无编辑探针')) {
      await streamChunks(res, ['普通回答：', '这次不修改编辑区。'], 'stop')
      return
    }
    if (lastUserText.includes('错误指令探针')) {
      await streamChunks(res, ['{"type":"editor_edit","operation":"delete","target":"不存在的原文"}'], 'stop')
      return
    }
    await streamChunks(res, ['{"type":"editor_edit","version":1,"operation":"replace_match","content":"北境防线在第七夜被攻破。","target":"北方防线被攻破。","reason":"补充时间与细节"}'], 'stop')
  })
})

const BACKUP_PATTERNS = [/^wa_providers\.json(\.bak)?$/, /^wa_chat_.*\.json(\.bak)?$/, /^wa_continuation_.*\.json(\.bak)?$/, /^wa_lastProjectId\.json(\.bak)?$/]
const backupFiles = []

function backupData() {
  fs.rmSync(BACKUP, { recursive: true, force: true })
  fs.mkdirSync(BACKUP, { recursive: true })
  for (const file of fs.readdirSync(DATA)) {
    if (BACKUP_PATTERNS.some(pattern => pattern.test(file))) {
      fs.copyFileSync(path.join(DATA, file), path.join(BACKUP, file))
      backupFiles.push(file)
    }
  }
}

function writeProbeProvider() {
  fs.writeFileSync(path.join(DATA, 'wa_providers.json'), JSON.stringify({
    providers: [{
      id: 'editor-probe-provider',
      name: '编辑协议探针供应商',
      baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`,
      apiKey: 'probe-key',
      models: ['editor-probe-model'],
      selectedModel: 'editor-probe-model',
      temperature: 0.7,
      maxTokens: 8192,
      purpose: ['generate'],
      streamMode: true,
      systemPrompt: '',
      providerType: 'openai-compatible',
      endpointMode: 'base',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }],
    generateProvider: 'editor-probe-provider',
    verifyProvider: null,
    detectProvider: null
  }, null, 2), 'utf8')
}

function restoreData() {
  for (const file of backupFiles) {
    try { fs.copyFileSync(path.join(BACKUP, file), path.join(DATA, file)) } catch (error) { result.runtimeErrors.push('restore ' + file + ': ' + error.message) }
  }
  for (const file of fs.readdirSync(DATA)) {
    if (BACKUP_PATTERNS.some(pattern => pattern.test(file)) && !backupFiles.includes(file)) {
      try { fs.rmSync(path.join(DATA, file), { force: true }) } catch (error) { result.runtimeErrors.push('clean ' + file + ': ' + error.message) }
    }
  }
  result.restored = result.runtimeErrors.length === 0
  result.residual = fs.readdirSync(DATA).filter(file => /^editor-probe/.test(file) || /^ai-editor-probe/.test(file))
}

let electronProcess = null

function startElectron() {
  electronProcess = spawn(ELECTRON_EXE, [
    '.',
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${PROFILE}`
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
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

async function stopElectron() {
  if (electronProcess?.pid) {
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* already exited */ }
    for (let i = 0; i < 10; i++) {
      try {
        if (!fs.existsSync(PROFILE)) break
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch { /* ignore */ }
    }
    electronProcess = null
  }
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
    const pipelineClose = document.querySelector('#btn-close-pl')
    if (pipelineClose) pipelineClose.click()
    const outlineClose = document.querySelector('#btn-close-outline-workspace')
    if (outlineClose) outlineClose.click()
    const projectModal = document.querySelector('.project-modal-content')
    if (projectModal && getComputedStyle(projectModal).display !== 'none') {
      projectModal.querySelector('.btn-close')?.click()
    }
    const transition = document.querySelector('.project-transition-confirm')
    if (transition && getComputedStyle(transition).display !== 'none') {
      ;[...transition.querySelectorAll('button')].find(button => button.textContent.trim() === '取消')?.click()
    }
  })
  await page.waitForTimeout(400)
}

async function createProbeProject() {
  await page.locator('#btn-open-project').click()
  await page.waitForTimeout(300)
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
  await page.locator('.new-project-form input').fill('Codex-AI编辑器交互探针')
  await page.locator('.new-project-form textarea').fill('第一卷 起源\n北方防线被攻破。')
  await page.getByRole('button', { name: '创建' }).click()
  await page.waitForTimeout(600)
  const createConfirm = page.locator('.project-transition-confirm')
  if (await createConfirm.isVisible().catch(() => false)) {
    await createConfirm.getByRole('button', { name: '保存并继续' }).click()
    await page.waitForTimeout(600)
  }
  if (await page.locator('.project-modal-content').isVisible().catch(() => false)) {
    await page.locator('.project-modal-content .btn-close').click()
    await page.waitForTimeout(300)
  }
  await page.waitForFunction(() => {
    const volume = document.querySelector('.volume-item')
    return !!volume
  }, null, { timeout: 10000 })

  const chapter = page.locator('.chapter-item').first()
  if (await chapter.isVisible().catch(() => false)) {
    await chapter.click()
  }
  await page.locator('#editor-content').fill('北方防线被攻破。')
  await page.evaluate(async () => {
    const skills = await window.electronAPI.storageRead('wa_skills') || {}
    const firstSkill = (skills.skills || [])[0]
    if (firstSkill) {
      const current = await window.electronAPI.storageRead('wa_pipeline_step_config') || {}
      current.agents = current.agents || {}
      current.skills = current.skills || {}
      current.modes = current.modes || {}
      current.skillAgents = current.skillAgents || {}
      current.skills[0] = [firstSkill.id]
      current.modes[0] = 'compose'
      await window.electronAPI.storageWrite('wa_pipeline_step_config', current)
    }
  })
  await page.reload()
  await page.waitForSelector('#user-input', { timeout: 25000 })
  await page.waitForTimeout(1000)
  await closeVisibleModals()
  const reopenedEditor = page.locator('#editor-content')
  const chapterItem = page.locator('.chapter-item').first()
  if (await chapterItem.isVisible().catch(() => false)) {
    await chapterItem.click()
  }
  await page.waitForTimeout(300)
  await reopenedEditor.fill('北方防线被攻破。')
  await page.waitForTimeout(300)
}

async function sendChat(prompt) {
  await page.fill('#user-input', prompt)
  await page.click('#btn-send')
  await page.waitForFunction(() => {
    const status = document.querySelector('#chat-generation-status')
    return !status || getComputedStyle(status).display === 'none' || status.textContent.includes('失败') || status.textContent.includes('已取消')
  }, null, { timeout: 30000 })
  await page.waitForTimeout(400)
}

async function readEditorValue() {
  return await page.locator('#editor-content').inputValue()
}

async function readRecentDiag(prefix) {
  return await page.evaluate(async prefixName => {
    const logs = await window.DiagLogger.read()
    return (Array.isArray(logs) ? logs : []).filter(entry => entry.cat === 'ai-service' && entry.detail?.includes(prefixName)).slice(-8)
  }, prefix)
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.mkdirSync(DATA, { recursive: true })
  await new Promise(resolve => mockServer.listen(MOCK_PORT, '127.0.0.1', resolve))
  backupData()
  writeProbeProvider()
  startElectron()
  const cdpUp = await waitForCdp()
  record('CDP 源 Electron 启动', cdpUp, 'port=' + CDP_PORT)
  if (!cdpUp) throw new Error('CDP did not open')
  await connectPage()
  await page.waitForSelector('#user-input', { timeout: 25000 })
  await closeVisibleModals()

  await createProbeProject()

  const originalEditorValue = await readEditorValue()
  const originalEditorEnabled = await page.locator('#editor-content').isEnabled()
  record('初始编辑器可读', typeof originalEditorValue === 'string', 'length=' + originalEditorValue.length + ' enabled=' + originalEditorEnabled)

  const beforeMainRequestCount = result.requestLog.length
  await sendChat('请把北方防线被攻破。改写为北境防线在第七夜被攻破。')
  const mainRequests = result.requestLog.slice(beforeMainRequestCount)
  record('主页编辑请求一次 API 调用', mainRequests.length === 1, 'requests=' + mainRequests.length)
  record('主页请求包含编辑协议', mainRequests.every(request => request.containsProtocol), JSON.stringify(mainRequests.map(request => request.containsProtocol)))

  const diffVisible = await page.locator('#btn-diff-apply').isVisible().catch(() => false)
  record('主页结构化编辑弹出预览', diffVisible)

  const editorAfterPreview = await readEditorValue()
  record('应用前编辑器未被写入', editorAfterPreview === originalEditorValue, 'before=' + originalEditorValue.length + ' after=' + editorAfterPreview.length)

  const applyButton = page.locator('#btn-diff-apply')
  if (await applyButton.isVisible().catch(() => false)) {
    await applyButton.click()
    await page.waitForTimeout(500)
  }
  const editorAfterApply = await readEditorValue()
  record('确认后编辑器写入编辑结果', editorAfterApply !== originalEditorValue, 'before=' + originalEditorValue.length + ' after=' + editorAfterApply.length)

  const noEditBefore = await readEditorValue()
  await sendChat('无编辑探针：请普通回答，不要修改编辑区。')
  const noEditAfter = await readEditorValue()
  record('普通回答不改编辑器', noEditBefore === noEditAfter, 'before=' + noEditBefore.length + ' after=' + noEditAfter.length)

  const beforeInvalid = await readEditorValue()
  await sendChat('错误指令探针：请尝试删除不存在的原文。')
  await page.waitForTimeout(500)
  const invalidAfter = await readEditorValue()
  const invalidPreviewVisible = await page.locator('#btn-diff-apply').isVisible().catch(() => false)
  const cancelVisible = await page.locator('#btn-diff-cancel').isVisible().catch(() => false)
  if (cancelVisible) {
    await page.locator('#btn-diff-cancel').click()
    await page.waitForTimeout(300)
  }
  record('无效编辑指令不写入编辑器', invalidAfter === beforeInvalid, 'before=' + beforeInvalid.length + ' after=' + invalidAfter.length)
  record('无效编辑指令提供可关闭预览', invalidPreviewVisible || cancelVisible)

  await closeVisibleModals()
  const outlineButton = page.locator('#btn-outline-workspace')
  if (await outlineButton.isVisible().catch(() => false)) {
    await outlineButton.click()
    const chatToggle = page.locator('#btn-ai-co-create')
    if (await chatToggle.isVisible().catch(() => false)) {
      await chatToggle.click()
      await page.waitForTimeout(300)
    }
    await page.waitForSelector('#ow-chat-input', { timeout: 10000 })
    await page.fill('#outline-editor', '第一卷 起源\n北方防线被攻破。')
    await page.waitForTimeout(300)
    const assistantCountBeforeOutline = await page.locator('#ow-chat-messages .ow-msg.assistant').count()
    await page.fill('#ow-chat-input', '大纲协议探针：请追加第二阶段内容。')
    await page.click('#btn-ow-send')
    await page.waitForFunction(beforeCount => {
      const messages = document.querySelectorAll('#ow-chat-messages .ow-msg.assistant')
      return messages.length > beforeCount
    }, assistantCountBeforeOutline, { timeout: 30000 })
    const outlineAssistantText = await page.locator('#ow-chat-messages .ow-msg.assistant').last().innerText()
    record('大纲响应已返回', outlineAssistantText.includes('第二阶段') || outlineAssistantText.includes('outline_edit') || outlineAssistantText.includes('生成失败'), outlineAssistantText.slice(0, 120))
    const outlinePreviewButton = page.locator('.ow-edit-command .msg-btn', { hasText: '预览修改' }).last()
    const outlinePreviewButtonVisible = await outlinePreviewButton.isVisible().catch(() => false)
    if (outlinePreviewButtonVisible) {
      await outlinePreviewButton.click()
      await page.waitForTimeout(300)
    }
    record('大纲旧协议识别并提供预览入口', outlinePreviewButtonVisible)
    await page.waitForSelector('#ow-edit-preview', { timeout: 30000 })
    const outlinePreviewText = await page.locator('#ow-edit-preview').innerText()
    record('大纲旧协议识别并可预览', outlinePreviewText.includes('append') || outlinePreviewText.includes('追加') || outlinePreviewText.includes('第二阶段'), outlinePreviewText.slice(0, 80))
    await page.click('#btn-ow-cancel-edit')
    await page.waitForTimeout(300)
    await page.click('#btn-close-outline-workspace')
    await page.waitForTimeout(400)
  } else {
    record('大纲工作台入口可见', false, '未找到 #btn-outline-workspace')
  }

  const mainEditLogs = await readRecentDiag('chat-edit_')
  const outlineEditLogs = await readRecentDiag('outline-edit_')
  record('主页编辑诊断日志存在', mainEditLogs.some(entry => entry.detail?.includes('operation') || entry.msg.includes('Editor edit')), 'count=' + mainEditLogs.length)
  record('大纲编辑诊断日志存在', outlineEditLogs.length > 0, 'count=' + outlineEditLogs.length)
  const mainApiRequestCount = result.requestLog.filter(request => request.role === 'main').length
  const outlineApiRequestCount = result.requestLog.filter(request => request.role === 'outline').length
  record('主页 API 请求计数', mainApiRequestCount === 3, 'expected=3 actual=' + mainApiRequestCount)
  record('大纲 API 请求计数', outlineApiRequestCount === 1, 'expected=1 actual=' + outlineApiRequestCount)

  result.allStepsOk = result.steps.every(step => step.ok) && result.runtimeErrors.length === 0
}

try {
  await main()
} catch (error) {
  result.allStepsOk = false
  result.runtimeErrors.push(error.message + '\n' + (error.stack || ''))
  console.error('[ERROR] ' + error.message)
} finally {
  try { await browser?.close() } catch { /* ignore */ }
  await stopElectron()
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
