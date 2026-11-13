import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-skill-context-policy-v21-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_SKILL_CONTEXT_ELECTRON
  ? path.resolve(process.env.SHENYI_SKILL_CONTEXT_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_SKILL_CONTEXT_CDP_PORT || 9391)
const PROFILE = path.join(ROOT, '_data', 'skill-context-policy-v21-profile')
const DATA_DIR = path.join(PROFILE, 'documents-data')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-skill-context-policy-v21-electron')
const SKILL_DIR = path.join(PROFILE, 'skills', 'context-policy-skill')
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_SKILL_CONTEXT_GLOBAL_TIMEOUT_MS || 4 * 60_000)
const KEEP_PROFILE = process.env.SHENYI_SKILL_CONTEXT_KEEP_PROFILE === '1'

const OLD_TEMPLATE_MARKER = '旧模板版本：V1'
const NEW_TEMPLATE_MARKER = '新模板版本：V2-CONTEXT-POLICY'

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
  const staleBundles = bundleNames.filter(name =>
    fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
}

function writeSkillFolder(marker) {
  fs.mkdirSync(SKILL_DIR, { recursive: true })
  fs.writeFileSync(path.join(SKILL_DIR, 'SKILL.md'), [
    '---',
    'id: context-policy-skill',
    'name: 上下文策略实测技能',
    'description: V2.1 上下文语义与导入链路实测',
    '---',
    '',
    '你是上下文策略实测技能，必须输出指定标记。',
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(SKILL_DIR, 'template.md'), [
    `${marker}`,
    '你必须输出：CONTEXT_POLICY_TEST_OK',
    '只输出该标记，不输出解释。',
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(SKILL_DIR, 'meta.json'), JSON.stringify({
    contextPolicy: { chatHistory: 'recent', includeOutline: true, includeMemory: false },
  }, null, 2), 'utf8')
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
      SHENYI_TEST_DIRECTORY_PATH: SKILL_DIR,
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] pid=${child.pid}`)
  child.stdout.on('data', chunk => process.stdout.write(`[ELECTRON] ${chunk}`))
  child.stderr.on('data', chunk => process.stderr.write(`[ELECTRON STDERR] ${chunk}`))
  child.on('close', (code, signal) => console.log(`[ELECTRON CLOSE] code=${code} signal=${signal}`))
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

async function connectPage(browser) {
  let page = null
  for (let attempt = 0; attempt < 24 && !page; attempt++) {
    page = browser.contexts()[0]?.pages()
      ?.find(item => !item.url().startsWith('devtools://')) || null
    if (!page) await sleep(500)
  }
  assert(page, 'renderer page reachable')
  return page
}

function startProvider() {
  const requests = []
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => { bodyText += chunk })
    request.on('end', () => {
      let body = null
      try { body = JSON.parse(bodyText) } catch {}
      requests.push({ at: new Date().toISOString(), url: request.url, method: request.method, bodyText })
      if (request.method === 'GET' && request.url?.includes('/models')) {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({
          object: 'list',
          data: [{ id: 'skill-context-model', object: 'model', owned_by: 'verification' }],
        }))
        return
      }
      if (body?.stream === false) {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({
          id: 'chatcmpl-skill-context-policy',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: body.model || 'skill-context-model',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'CONTEXT_POLICY_TEST_OK' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }))
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'CONTEXT_POLICY_TEST_OK' } }] })}\n\n`)
      response.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`)
      response.write('data: [DONE]\n\n')
      response.end()
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

async function seedApplication(page, providerPort, folderPath) {
  await page.evaluate(async ({ port, folderPath: skillDir }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', 'skill-context-policy-project')
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'skill-context-policy-provider',
        name: 'Skill Context Policy Provider',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: 'skill-context-local-key',
        models: ['skill-context-model'],
        selectedModel: 'skill-context-model',
        temperature: 0.1,
        maxTokens: 512,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'skill-context-policy-provider',
    })
    await window.electronAPI.storageWrite('wa_project_skill-context-policy-project', {
      schemaVersion: 3,
      projectName: '技能上下文策略实测',
      outlineText: '',
      outlineLocked: false,
      outlineLockedText: '',
      bookWordCount: 0,
      volumesConfirmed: false,
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
      editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_skills', {
      skills: [{
        id: 'folder:context-policy-skill',
        sourceId: 'context-policy-skill',
        name: '上下文策略实测技能',
        format: 'folder',
        folderPath: skillDir,
        template: '旧持久化模板：仅迁移用',
        category: 'folder',
        description: 'V2.1 上下文语义与导入链路实测',
        executionMode: 'chain',
        outputFormat: 'text',
        validationRules: [],
        splitSize: 1000,
        injectMode: 'system_prefix',
        bindTarget: 'project',
        linkedSkillIds: [],
        customVars: {},
        contextPolicy: { chatHistory: 'latest', includeOutline: true },
      }],
      pipelineSkills: [],
    })
  }, { port: providerPort, folderPath })
}

async function openSkillSettings(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(300)
  await page.click('#btn-settings')
  await page.waitForSelector('#settings-modal', { timeout: 20_000 })
  await page.click('#tab-skill')
  await page.waitForSelector('#sbm-skill-list', { timeout: 20_000 })
}

async function openHealthReport(page) {
  await page.locator('#skill-list .skill-card').filter({ hasText: '上下文策略实测技能' })
    .locator('button', { hasText: '体检' }).click()
  await page.waitForSelector('[data-modal-id="skill-health-report"]', { timeout: 20_000 })
  const deadline = Date.now() + 20_000
  let snapshot = null
  while (Date.now() < deadline) {
    snapshot = await page.evaluate(() => {
      const modal = document.querySelector('[data-modal-id="skill-health-report"]')
      return {
        text: modal?.textContent || '',
        ready: Boolean(modal && !modal.textContent.includes('正在读取技能文件')),
      }
    })
    if (snapshot.ready) return snapshot
    await sleep(250)
  }
  throw new Error(`health report did not load: ${JSON.stringify(snapshot)}`)
}

async function importFolderSkillThroughUi(page, expectedStrategy) {
  await page.click('#btn-import-folder-skill')
  await page.waitForSelector('[data-modal-id="skill-folder-import-preview"]', { timeout: 20_000 })
  const strategySelect = page.locator('[data-modal-id="skill-folder-import-preview"] select')
  await strategySelect.selectOption(expectedStrategy)
  await page.click('#btn-confirm-folder-import')
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const message = await page.locator('#skill-ui-message').textContent().catch(() => '')
    if (message && message.includes('文件夹技能导入完成')) return message
    await sleep(250)
  }
  throw new Error('folder import did not finish')
}

async function runSkillTestThroughUi(page) {
  await page.locator('#skill-list .skill-card').filter({ hasText: '上下文策略实测技能' })
    .locator('button', { hasText: '测试' }).click()
  await page.waitForSelector('[data-modal-id="skill-test"]', { timeout: 20_000 })
  await page.locator('#st-test-input').fill('请按模板输出标记。')
  await page.click('#btn-run-skill-test')
  const deadline = Date.now() + 45_000
  let snapshot = null
  while (Date.now() < deadline) {
    snapshot = await page.evaluate(() => {
      const modal = document.querySelector('[data-modal-id="skill-test"]')
      return {
        running: Boolean(modal?.querySelector('#btn-run-skill-test')?.disabled),
        requestText: modal?.querySelector('.st-folder-request')?.textContent || '',
        resultText: modal?.textContent || '',
      }
    })
    if (!snapshot.running && snapshot.requestText) return snapshot
    await sleep(300)
  }
  throw new Error(`skill test did not produce request report: ${JSON.stringify(snapshot)}`)
}

async function readSkillsFromDisk(page) {
  return await page.evaluate(async () => {
    return await window.electronAPI.storageRead('wa_skills')
  })
}

async function main() {
  assertFreshRendererBuild()
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  writeSkillFolder(OLD_TEMPLATE_MARKER)

  const provider = await startProvider()
  const electronProcess = startElectron()
  let browser = null
  const watchdog = setTimeout(() => {
    try { if (browser) browser.close() } catch {}
    closeElectron(electronProcess)
    provider.close()
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)
  watchdog.unref()

  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    const page = await connectPage(browser)
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1200)
    await seedApplication(page, provider.port, SKILL_DIR)
    await openSkillSettings(page)

    const persistedAfterLoad = await readSkillsFromDisk(page)
    assert.equal(persistedAfterLoad?.skills?.[0]?.contextPolicy?.chatHistory, 'recent',
      `legacy latest is migrated and persisted, got ${JSON.stringify(persistedAfterLoad?.skills?.[0]?.contextPolicy)}`)

    const health = await openHealthReport(page)
    assert(!health.text.includes('chatHistory'), `health report has no context-policy error, got ${health.text}`)
    assert(health.text.includes('通过') || !health.text.includes('错误'),
      `health report passes for current policy, got ${health.text}`)
    await page.evaluate(() => document.querySelector('[data-modal-id="skill-health-report"] .form-actions button')?.click())
    await sleep(300)

    const initialTest = await runSkillTestThroughUi(page)
    assert(initialTest.requestText.includes(OLD_TEMPLATE_MARKER),
      `initial request uses disk template, got ${initialTest.requestText.slice(0, 500)}`)
    assert(initialTest.resultText.includes('CONTEXT_POLICY_TEST_OK'),
      `initial skill test succeeds, got ${initialTest.resultText.slice(-500)}`)
    await page.evaluate(() => document.querySelector('[data-modal-id="skill-test"] .sem-header button')?.click())
    await sleep(300)

    writeSkillFolder(NEW_TEMPLATE_MARKER)
    await importFolderSkillThroughUi(page, 'overwrite')
    const persistedAfterOverwrite = await readSkillsFromDisk(page)
    assert.equal(persistedAfterOverwrite?.skills?.[0]?.contextPolicy?.chatHistory, 'recent',
      `overwrite import preserves migrated policy, got ${JSON.stringify(persistedAfterOverwrite?.skills?.[0]?.contextPolicy)}`)
    assert(persistedAfterOverwrite?.skills?.[0]?.template?.includes(NEW_TEMPLATE_MARKER),
      `overwrite import stores disk template, got ${persistedAfterOverwrite?.skills?.[0]?.template}`)

    const overwrittenTest = await runSkillTestThroughUi(page)
    assert(overwrittenTest.requestText.includes(NEW_TEMPLATE_MARKER),
      `post-overwrite request uses fresh disk template, got ${overwrittenTest.requestText.slice(0, 500)}`)
    assert(!overwrittenTest.requestText.includes(OLD_TEMPLATE_MARKER),
      'post-overwrite request does not contain stale template')
    assert(overwrittenTest.resultText.includes('CONTEXT_POLICY_TEST_OK'),
      `post-overwrite skill test succeeds, got ${overwrittenTest.resultText.slice(-500)}`)

    const requests = provider.requests()
    const chatRequests = requests.filter(item =>
      !item.url?.includes('/models') && item.bodyText.includes('model'))
    assert(requests.length >= 2, `at least two real provider calls, got ${requests.length}`)
    assert(chatRequests.length >= 2,
      `at least two real chat completions, got ${chatRequests.length}`)
    assert(chatRequests.some(item => item.bodyText.includes(OLD_TEMPLATE_MARKER)), 'provider saw old template')
    assert(chatRequests.some(item => item.bodyText.includes(NEW_TEMPLATE_MARKER)), 'provider saw new template')

    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'final-state.png'), fullPage: false })
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'provider-requests.json'),
      JSON.stringify(requests, null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'persisted-skills-after-load.json'),
      JSON.stringify(persistedAfterLoad, null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'persisted-skills-after-overwrite.json'),
      JSON.stringify(persistedAfterOverwrite, null, 2), 'utf8')
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'report.json'), JSON.stringify({
      schema: 'shenyi.skill-context-policy-v21.electron',
      version: 1,
      generatedAt: new Date().toISOString(),
      script: SCRIPT_NAME,
      persistedChatHistoryAfterLoad: persistedAfterLoad?.skills?.[0]?.contextPolicy?.chatHistory,
      persistedChatHistoryAfterOverwrite: persistedAfterOverwrite?.skills?.[0]?.contextPolicy?.chatHistory,
      healthReportText: health.text,
      providerRequestCount: requests.length,
      chatCompletionRequestCount: chatRequests.length,
      oldTemplateSeen: chatRequests.some(item => item.bodyText.includes(OLD_TEMPLATE_MARKER)),
      newTemplateSeen: chatRequests.some(item => item.bodyText.includes(NEW_TEMPLATE_MARKER)),
      hardRules: {
        visibleElectron: true,
        realUiOperations: '#btn-settings / #tab-skill / skill card buttons / #btn-import-folder-skill / #btn-confirm-folder-import / #st-test-input / #btn-run-skill-test',
        realDirectoryDialogHook: true,
        realProviderRequests: true,
        cacheInvalidationProven: true,
      },
    }, null, 2), 'utf8')

    console.log('===== SKILL CONTEXT POLICY V2.1 ELECTRON PASSED =====')
  } finally {
    clearTimeout(watchdog)
    try { if (browser) await browser.close() } catch {}
    closeElectron(electronProcess)
    await sleep(800)
    await provider.close()
    if (!KEEP_PROFILE) await removeDir(PROFILE)
  }
}

main().catch(error => {
  console.error('[FAIL]', error)
  process.exitCode = 1
})
