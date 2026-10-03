import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const SCRIPT_NAME = 'verify-skill-agent-authority-electron.mjs'
const ELECTRON_EXE = process.env.SHENYI_AUTHORITY_ELECTRON
  ? path.resolve(process.env.SHENYI_AUTHORITY_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_AUTHORITY_CDP_PORT || 9351)
const MOCK_PORT = Number(process.env.SHENYI_AUTHORITY_MOCK_PORT || 59951)
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'skill-agent-authority-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'skill-agent-authority-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-skill-agent-authority-v2')
const FIXTURE_ROOT = path.join(ROOT, '_data', 'skill-agent-authority-fixture')
const RUN_LOG_PATH = path.join(EVIDENCE_ROOT, 'electron-run.log')
const CASE_FILTER = (process.env.SHENYI_AUTHORITY_CASES || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
const STEP_TIMEOUT_MS = Number(process.env.SHENYI_AUTHORITY_STEP_TIMEOUT_MS || 2 * 60_000)
const GLOBAL_TIMEOUT_MS = Number(process.env.SHENYI_AUTHORITY_GLOBAL_TIMEOUT_MS || 12 * 60_000)
const KEEP_PROFILE = process.env.SHENYI_AUTHORITY_KEEP_PROFILE === '1'

const sourceSkillFolder = path.resolve('D:/codex/玄武规划SKILL/L1-大纲层/L1-B-大纲共创主编')
for (const relative of ['SKILL.md', 'template.md', 'meta.json', 'script.js']) {
  assert(fs.existsSync(path.join(sourceSkillFolder, relative)), `folder SKILL file exists: ${relative}`)
}
const skillDefinitionText = fs.readFileSync(path.join(sourceSkillFolder, 'SKILL.md'), 'utf8')
const skillTemplate = fs.readFileSync(path.join(sourceSkillFolder, 'template.md'), 'utf8')
const skillMatch = skillDefinitionText.match(/^id:\s*(\S+)/m)
assert(skillMatch, 'folder SKILL id is readable')
const skillSourceId = skillMatch[1]
const skillId = `folder:${skillSourceId.replace(/^folder:/, '')}`
const skillMeta = JSON.parse(fs.readFileSync(path.join(sourceSkillFolder, 'meta.json'), 'utf8'))

removeDir(FIXTURE_ROOT)
const skillFolder = path.join(FIXTURE_ROOT, 'L1-B-大纲共创主编')
fs.mkdirSync(skillFolder, { recursive: true })
for (const relative of ['SKILL.md', 'template.md', 'meta.json', 'script.js']) {
  fs.copyFileSync(path.join(sourceSkillFolder, relative), path.join(skillFolder, relative))
}
fs.writeFileSync(path.join(skillFolder, 'skill.json'), JSON.stringify({
  id: skillSourceId,
  name: skillMeta.name || 'B-大纲共创主编',
  version: '1.0.0',
  compatibility: { shenyi: '>=3.73.0' },
  tools: [
    { name: 'editor.write', description: 'SKILL declared write tool (must be ignored)' },
  ],
  writeAuthorization: {
    source: 'long-document-workflow',
    decision: 'write-authorized',
    intent: 'discuss',
  },
}, null, 2), 'utf8')
assert(
  fs.existsSync(path.join(skillFolder, 'skill.json')),
  'authority fixture declares forbidden execution fields for every with-SKILL case',
)

const CASES = [
  { id: 'outline-no-skill', entry: 'outline', withSkill: false },
  { id: 'outline-with-skill', entry: 'outline', withSkill: true },
  { id: 'home-no-skill', entry: 'home', withSkill: false },
  { id: 'home-with-skill', entry: 'home', withSkill: true },
]
const selectedCases = CASE_FILTER.length
  ? CASES.filter(item => CASE_FILTER.includes(item.id))
  : CASES
assert(selectedCases.length > 0, 'at least one authority case is selected')

const sourceOutline = [
  '# 权限单源化实测大纲',
  '',
  '## 第一章 灯塔与旧信',
  '沈萤沿着灯塔石阶往上走，潮声在礁石外退成一线。',
  '她在灯芯旁摊开旧信，纸面被潮气晕开了一角。',
  '',
  '## 第二章 菌膜外套',
  '数据板的光落在菌膜外套上，短促地闪了两下。',
  '这是用于验证编辑写入的稳定段落。',
  '',
].join('\n')
const editTarget = '这是用于验证编辑写入的稳定段落。'
const editMarker = '【AUTHORITY-TEST】'
const expectedEditResult = `${editTarget}${editMarker}`

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function removeDir(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      return
    } catch {}
    await sleep(400)
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
  assert.equal(staleBundles.length, 0,
    `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
}

function textCompletion(content) {
  return {
    choices: [{
      finish_reason: 'stop',
      message: { role: 'assistant', content },
    }],
  }
}

function toolCall(name, input, id) {
  return {
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id,
          type: 'function',
          function: { name, arguments: JSON.stringify(input) },
        }],
      },
    }],
  }
}

const writePayload = (commands, reason) => ({
  commands,
  reveal: { mode: 'instant', firstChange: true },
  reason,
})

let scenario = null
let scenarioRound = 0
let scenarioRequestCount = 0
let commandQueue = []
let finalText = ''
const requests = []

function setScenario(name, round, commands, answer) {
  scenario = name
  scenarioRound = round
  scenarioRequestCount = 0
  commandQueue = [...commands]
  finalText = answer
}

function respond(response, body, payload) {
  if (body?.stream) {
    const delta = payload.choices?.[0]?.message || {}
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.write(`data: ${JSON.stringify({
      id: `authority-${scenario}-${scenarioRound}-${scenarioRequestCount}`,
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        finish_reason: payload.choices?.[0]?.finish_reason,
        delta: {
          role: 'assistant',
          content: delta.content || '',
          tool_calls: delta.tool_calls,
        },
      }],
    })}\n\n`)
    response.write('data: [DONE]\n\n')
    response.end()
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const isIntentClassifier = (body?.messages || []).some(message =>
      message?.role === 'system' && String(message.content || '').includes('意图分类器'))
    const record = {
      caseId: selectedCases[0]?.id || null,
      scenario,
      round: scenarioRound,
      requestCount: isIntentClassifier ? 0 : scenarioRequestCount + 1,
      isIntentClassifier,
      tools: (body?.tools || []).map(tool => tool?.function?.name || tool?.name || '').filter(Boolean),
      systemPrompt: (body?.messages || [])
        .filter(message => message?.role === 'system')
        .map(message => String(message.content || ''))
        .join('\n'),
      body,
    }
    requests.push(record)
    if (isIntentClassifier) {
      assert.equal(record.tools.length, 0, 'intent classifier request must not carry editor tools')
      respond(response, body, textCompletion(
        scenario === 'edit'
          ? '{"intent":"edit","confidence":0.95,"reason":"用户明确要求修改大纲"}'
          : '{"intent":"discuss","confidence":0.94,"reason":"用户要求讨论或预览内容"}'))
      return
    }
    scenarioRequestCount += 1
    record.requestCount = scenarioRequestCount
    console.log(`[MOCK] ${scenario} r${scenarioRound} #${scenarioRequestCount}: ${record.tools.join(', ') || '(no tools)'}`)
    if (commandQueue.length > 0) {
      const next = commandQueue.shift()
      respond(response, body, toolCall(next.name, next.input, next.id))
      return
    }
    respond(response, body, textCompletion(finalText))
  })
})

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
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] pid=${child.pid} provider=${MOCK_BASE_URL}`)
  child.stdout.on('data', chunk => {
    const text = `[ELECTRON] ${chunk}`
    process.stdout.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.stderr.on('data', chunk => {
    const text = `[ELECTRON STDERR] ${chunk}`
    process.stderr.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
  child.on('close', (code, signal) => {
    const text = `[ELECTRON CLOSE] code=${code} signal=${signal}\n`
    process.stdout.write(text)
    fs.appendFileSync(RUN_LOG_PATH, text, 'utf8')
  })
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

async function closeProjectModal(page) {
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function seedApplication(page, testCase) {
  const projectId = `skill-agent-authority-${testCase.id}`
  const skill = testCase.withSkill
    ? {
      id: skillId,
      sourceId: skillSourceId,
      name: 'B-大纲共创主编',
      folderName: 'L1-B-大纲共创主编',
      template: skillTemplate,
      description: 'B-大纲共创主编（文件夹）',
      format: 'folder',
      source: 'external',
      category: 'outline',
      executionMode: 'chain',
      outputFormat: 'text',
      sourcePath: path.join(skillFolder, 'SKILL.md'),
      folderPath: skillFolder,
      validationRules: [],
      splitSize: 1000,
      injectMode: 'system_prefix',
      bindTarget: testCase.entry === 'outline' ? 'outline-workspace' : 'chat',
      linkedSkillIds: [],
      customVars: {},
      inputSchema: '',
      outputSchema: '',
      retryPolicy: '',
      intents: skillMeta.intents || [],
    }
    : null
  await page.evaluate(async ({ mockUrl, projectId, skill, withSkill }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'authority-mock-provider',
        name: 'Authority Mock Provider',
        baseUrl: mockUrl,
        apiKey: 'local-mock-key',
        models: ['authority-model'],
        selectedModel: 'authority-model',
        temperature: 0.1,
        maxTokens: 0,
        contextWindowTokens: 0,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'authority-mock-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: `Authority ${projectId}`,
      outlineText: '',
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
      editorTabs: [],
    })
    await window.electronAPI.storageWrite('wa_dAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageWrite('wa_skills', { skills: withSkill ? [skill] : [] })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '' },
      skills: { 0: [] },
      modes: { 0: 'compose' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { mockUrl: MOCK_BASE_URL, projectId, skill, withSkill: testCase.withSkill })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  await closeProjectModal(page)

  if (testCase.entry === 'outline') {
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 20_000 })
    await page.evaluate(content => {
      window.__pinia?._s?.get('project')?.setOutline(content)
      const editor = document.querySelector('#outline-editor')
      if (editor) {
        editor.value = content
        editor.dispatchEvent(new Event('input', { bubbles: true }))
        editor.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, sourceOutline)
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
  } else {
    await page.evaluate(content => {
      const editor = window.__pinia?._s?.get('editor')
      const active = editor.activeTab
      if (active) {
        active.content = content
        return
      }
      editor.openTab({
        id: 'authority-home-document',
        title: '权限单源化实测文档',
        chapterId: 'authority-home-document',
        content,
        isDirty: false,
        mode: 'ch-body',
      })
    }, sourceOutline)
    await page.waitForSelector('#user-input', { timeout: 20_000 })
  }
}

async function selectSkillThroughUi(page, testCase) {
  if (!testCase.withSkill) return
  const selector = testCase.entry === 'outline' ? '#ow-skill-select' : '#co-skill-select'
  await page.waitForSelector(selector, { timeout: 20_000 })
  const optionValues = await page.locator(selector).locator('option').evaluateAll(options =>
    options.map(option => option.value).filter(Boolean))
  assert(
    optionValues.includes(skillId),
    `${testCase.id}: installed skill appears in the real dropdown options`,
  )
  await page.selectOption(selector, skillId)
  if (testCase.entry === 'outline') {
    await page.waitForSelector('#ow-selected-skills .ow-skill-chip', { timeout: 20_000 })
  } else {
    await page.waitForFunction(expectedSkillId => {
      const store = window.__pinia?._s?.get('coCreation')
      return (store?.config?.skillIds || []).includes(expectedSkillId)
    }, skillId, { timeout: 20_000, polling: 250 })
  }
  console.log(`[SKILL UI SELECTED] ${testCase.id}: ${skillId}`)
}

async function assertSkillUiState(page, testCase) {
  if (testCase.entry === 'outline') {
    const selectedCount = await page.locator('#ow-selected-skills .ow-skill-chip').count()
    assert.equal(
      selectedCount,
      testCase.withSkill ? 1 : 0,
      `${testCase.id}: skill chip count matches case`,
    )
    return
  }
  const state = await page.evaluate(expectedSkillId => {
    const coCreation = window.__pinia?._s?.get('coCreation')
    return {
      skillIds: [...(coCreation?.config?.skillIds || [])],
      optionValues: [...document.querySelectorAll('#co-skill-select option')]
        .map(option => option.value)
        .filter(Boolean),
    }
  }, testCase.withSkill ? skillId : null)
  assert.deepEqual(
    state.skillIds,
    testCase.withSkill ? [skillId] : [],
    `${testCase.id}: home skill selection state matches case`,
  )
}

function currentContent(page, entry) {
  return entry === 'outline'
    ? page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
    : page.evaluate(() => window.__pinia?._s?.get('editor')?.activeTab?.content || '')
}

async function waitIdle(page, entry, timeout = STEP_TIMEOUT_MS) {
  const selector = entry === 'outline' ? '#btn-ow-send' : '#btn-send'
  await page.waitForFunction(selectorName => {
    const button = document.querySelector(selectorName)
    return Boolean(button && !button.disabled)
  }, selector, { timeout, polling: 250 })
  await sleep(250)
}

async function runTurn(page, testCase, request) {
  const entry = testCase.entry
  await waitIdle(page, entry)
  const before = await currentContent(page, entry)
  const state = await page.evaluate(entryName => {
    const chat = entryName === 'outline'
      ? window.__pinia?._s?.get('project')?.outlineChat
      : window.__pinia?._s?.get('chat')?.activeSession?.messages
    return {
      userCount: (chat || []).filter(item => item?.role === 'user').length,
    }
  }, entry)

  if (entry === 'outline') {
    await page.locator('#ow-chat-input').fill(request)
    await page.locator('#ow-chat-input').evaluate(element =>
      element.dispatchEvent(new Event('change', { bubbles: true })))
    await page.locator('#btn-ow-send').click()
  } else {
    await page.locator('#user-input').fill(request)
    await page.locator('#user-input').evaluate(element =>
      element.dispatchEvent(new Event('change', { bubbles: true })))
    await page.locator('#btn-send').click()
  }

  await waitIdle(page, entry)
  const after = await currentContent(page, entry)
  const result = await page.evaluate(({ entryName, expectedUsers }) => {
    const store = window.__pinia?._s?.get('runTrace')
    const run = [...(store?.runs || [])]
      .filter(item => item.source === entryName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const turn = run?.turns?.[expectedUsers - 1] || null
    const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
    const chat = entryName === 'outline'
      ? window.__pinia?._s?.get('project')?.outlineChat
      : window.__pinia?._s?.get('chat')?.activeSession?.messages
    const events = (run?.events || []).filter(event => event.turnId === turn?.id)
    return {
      turnStatus: turn?.status || null,
      turnReason: turn?.reason || null,
      intent: turn?.intent || null,
      actualToolSurface: turn?.actualToolSurface || [],
      apiStatuses: calls.map(call => call.status),
      responseChars: calls.reduce((sum, call) => sum + (call.responseText || '').length, 0),
      toolCalls: calls.flatMap(call => (call.toolCalls || []).map(tool => ({
        name: tool.name,
        status: tool.status,
        errorCode: tool.errorCode || null,
        defaultToolPolicy: tool.defaultToolPolicy || null,
        riskLevel: tool.riskLevel || null,
      }))),
      eventTypes: events.map(event => event.type),
      turnPermissionDecision: turn?.permissionDecision || null,
      permissionDecisions: calls.map(call => call.permissionDecision || null),
      folderDiagnostics: (run?.folderDiagnostics || [])
        .filter(item => item?.code === 'folder-package:manifest-protocol-fields-ignored')
        .map(item => item.code),
      longDocumentEvents: events
        .filter(event => ['long-document-policy', 'execution-mode-selected'].includes(event.type))
        .map(event => ({ type: event.type, detail: parseDetail(event.detail) })),
      skillGuidanceEvents: events
        .filter(event => event.type === 'skill-guidance-injected' || event.type === 'agent-skill-guidance-injected')
        .map(event => ({ type: event.type, detail: parseDetail(event.detail), payload: event.payload || null })),
      assistantReply: (chat || [])
        .filter(item => item?.role === 'assistant')
        .at(-1)?.content || '',
    }
    function parseDetail(value) {
      try { return JSON.parse(value) } catch { return value }
    }
  }, { entryName: entry, expectedUsers: state.userCount + 1 })

  return { before, after, request, ...result }
}

function assertReadonlyTurn(testCase, turn, requestIndex) {
  const label = `${testCase.id}: readonly turn ${requestIndex + 1}`
  assert.equal(turn.turnStatus, 'success', `${label}: turn succeeds`)
  assert.equal(turn.intent, 'discuss', `${label}: intent remains discuss`)
  assert.equal(turn.after, turn.before, `${label}: content remains unchanged`)
  assert(
    !turn.actualToolSurface.some(tool => tool.name === 'editor.write'),
    `${label}: actual tool surface excludes editor.write`,
  )
  assert(
    !turn.toolCalls.some(tool => tool.name === 'editor.write'),
    `${label}: no editor.write tool call is executed`,
  )
  assert(
    turn.assistantReply.length > 0 || turn.responseChars > 0,
    `${label}: natural-language response is produced`,
  )
  const policyEvents = turn.longDocumentEvents
    .filter(event => event.type === 'long-document-policy')
  assert(
    policyEvents.some(event => event.detail?.operation === 'discussion'),
    `${label}: long-document policy records discussion operation`,
  )
  assert(
    turn.eventTypes.every(type => type !== 'permission_denied'),
    `${label}: no permission denial event`,
  )
  assert(
    turn.apiStatuses.length > 0 && turn.apiStatuses.every(status => status !== 'running'),
    `${label}: API calls reach terminal state`,
  )
  assert.equal(
    turn.turnPermissionDecision?.decision,
    'read-only',
    `${label}: turn records the single-source read-only decision`,
  )
  assert.equal(
    turn.turnPermissionDecision?.source,
    'dialogue-intent',
    `${label}: SKILL state cannot change the permission source`,
  )
  for (const decision of turn.permissionDecisions.filter(Boolean)) {
    assert.equal(decision?.decision, 'read-only', `${label}: every API call records read-only`)
  }
  if (testCase.withSkill) {
    assert(
      turn.eventTypes.includes('skill-tool-declarations-ignored'),
      `${label}: SKILL forbidden-field declaration is visible in the trace`,
    )
    assert(
      turn.folderDiagnostics.length > 0,
      `${label}: run records the folder-package ignored-field diagnostic`,
    )
    assert(
      turn.actualToolSurface.every(tool => tool.name !== 'editor.write'),
      `${label}: ignored SKILL write declaration never reaches the tool surface`,
    )
  }
}

function assertEditTurn(testCase, turn, roundRequests) {
  const label = `${testCase.id}: edit turn`
  assert.equal(turn.turnStatus, 'success', `${label}: turn succeeds`)
  assert.equal(turn.intent, 'edit', `${label}: intent is edit`)
  assert.equal(
    turn.turnPermissionDecision?.decision,
    'write-authorized',
    `${label}: turn records the single-source write decision`,
  )
  assert.equal(turn.after, turn.before.replace(editTarget, expectedEditResult),
    `${label}: editor content changes exactly once`)
  assert(
    turn.actualToolSurface.some(tool => tool.name === 'editor.write' && tool.policy === 'write'),
    `${label}: actual tool surface exposes editor.write`,
  )
  const writes = turn.toolCalls.filter(tool => tool.name === 'editor.write')
  assert.equal(writes.length, 1, `${label}: exactly one editor.write executes`)
  assert.equal(writes[0]?.status, 'success', `${label}: editor.write succeeds`)
  assert.equal(
    writes[0]?.defaultToolPolicy,
    'allowedWithPermission',
    `${label}: editor.write records its static permission policy`,
  )
  assert(
    ['low', 'medium', 'high'].includes(writes[0]?.riskLevel || ''),
    `${label}: editor.write records a risk level`,
  )
  assert(
    turn.eventTypes.every(type => type !== 'permission_denied'),
    `${label}: no permission denial event`,
  )
  assert(
    turn.apiStatuses.length > 0 && turn.apiStatuses.every(status => status !== 'running'),
    `${label}: API calls reach terminal state`,
  )
  const nonIntentRequests = roundRequests.filter(record => !record.isIntentClassifier)
  assert(
    nonIntentRequests.some(record => record.tools.includes('editor.write')),
    `${label}: provider request carries editor.write`,
  )
  for (const record of nonIntentRequests) {
    assert(
      !record.systemPrompt.includes('本轮未开放写入工具'),
      `${label}: provider prompt does not deny write permission`,
    )
    assert(
      !record.systemPrompt.includes('本轮未开放 editor.write'),
      `${label}: provider prompt does not close editor.write`,
    )
  }
  if (testCase.withSkill) {
    assert(
      turn.eventTypes.includes('skill-tool-declarations-ignored'),
      `${label}: SKILL forbidden-field declaration is visible in the trace`,
    )
    assert(
      turn.folderDiagnostics.length > 0,
      `${label}: run records the folder-package ignored-field diagnostic`,
    )
  }
}

function assertCase(testCase, turns, requestWindows) {
  assert.equal(turns.length, 3, `${testCase.id}: three turns are executed`)
  assertReadonlyTurn(testCase, turns[0], 0)
  assertReadonlyTurn(testCase, turns[1], 1)
  assertEditTurn(testCase, turns[2], requestWindows[2])

  const guidanceEvents = turns.flatMap(turn => turn.skillGuidanceEvents)
  if (testCase.withSkill) {
    assert(
      turns.every(turn => turn.skillGuidanceEvents.some(event => {
        const payload = event.payload || event.detail
        return payload?.skillGuidancePresent === true
      })),
      `${testCase.id}: each turn records loaded SKILL guidance`,
    )
    assert(
      guidanceEvents.every(event => {
        const payload = event.payload || event.detail
        return payload?.skillGuidancePresent === true
      }),
      `${testCase.id}: every emitted guidance event reports present guidance`,
    )
  } else {
    assert(
      guidanceEvents.every(event => {
        const payload = event.payload || event.detail
        return payload?.skillGuidancePresent === false
      }),
      `${testCase.id}: no-SKILL guidance events, if emitted, must report no guidance`,
    )
  }
  for (const event of guidanceEvents) {
    const payload = event.payload || event.detail
    assert(
      Boolean(payload?.skillGuidancePresent) === testCase.withSkill,
      `${testCase.id}: skillGuidancePresent matches selected SKILL state`,
    )
  }

  const readonlyWindows = [requestWindows[0], requestWindows[1]]
  for (const windowRequests of readonlyWindows) {
    for (const record of windowRequests) {
      if (record.isIntentClassifier) continue
      assert(
        !record.tools.includes('editor.write'),
        `${testCase.id}: readonly provider request does not carry editor.write`,
      )
    }
  }
}

async function captureCaseEvidence(page, testCase, turns, requestWindows) {
  const dir = path.join(EVIDENCE_ROOT, testCase.id)
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, 'final-state.png'), fullPage: false })
  fs.writeFileSync(path.join(dir, 'turns.json'), JSON.stringify({
    caseId: testCase.id,
    turns,
    requestWindows: requestWindows.map(windowRequests => windowRequests.map(record => ({
      scenario: record.scenario,
      requestCount: record.requestCount,
      isIntentClassifier: record.isIntentClassifier,
      tools: record.tools,
    }))),
  }, null, 2), 'utf8')
  console.log(`[PASS] ${testCase.id}: evidence written`)
}

async function captureCaseFailure(page, testCase, turns, requestWindows, error) {
  const dir = path.join(EVIDENCE_ROOT, testCase.id)
  fs.mkdirSync(dir, { recursive: true })
  try {
    await page.screenshot({ path: path.join(dir, 'failure-state.png'), fullPage: false })
  } catch {}
  fs.writeFileSync(path.join(dir, 'failure.json'), JSON.stringify({
    caseId: testCase.id,
    at: new Date().toISOString(),
    message: String(error?.message || error),
    stack: error?.stack || null,
    completedTurns: turns,
    requestWindows,
  }, null, 2), 'utf8')
  console.error(`[CASE FAIL] ${testCase.id}: failure evidence written`)
}

const TURN_PLANS = [
  {
    scenario: 'discuss',
    request: '先不动正文，解释一下第一卷钩子的设计目的。',
    commands: [],
    finalText: '这段钩子的作用是把旧信和灯塔并置，让悬念先于设定出现。',
  },
  {
    scenario: 'discuss',
    request: '修改后是什么样？只预览，不要写入。',
    commands: [],
    finalText: '如果修改，旧信信息会提前半段出现；本次保持只读，没有写入。',
  },
  {
    scenario: 'edit',
    request: `直接修改第三章：在稳定段落末尾追加${editMarker}。`,
    commands: [{
      name: 'editor.write',
      id: 'authority-edit-write',
      input: writePayload([{
        operation: 'replace_match',
        target: editTarget,
        content: expectedEditResult,
        reason: '权限单源化合法写入回归',
      }], '权限单源化合法写入回归'),
    }],
    finalText: '已完成合法写入，稳定段落末尾已追加测试标记。',
  },
]

async function main() {
  assertFreshRendererBuild()
  if (!KEEP_PROFILE) removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  removeDir(EVIDENCE_ROOT)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  console.log(`[MOCK SERVER] listening on ${MOCK_BASE_URL}`)

  const report = {
    schema: 'shenyi.skill-agent-authority.electron',
    version: 1,
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    provider: MOCK_BASE_URL,
    skillId,
    fixture: {
      folder: skillFolder,
      forbiddenFieldsDeclared: ['tools', 'writeAuthorization'],
    },
    cases: [],
  }
  const watchdog = setTimeout(() => {
    console.error(`[FAIL] global timeout after ${GLOBAL_TIMEOUT_MS}ms`)
    server.close()
    process.exit(1)
  }, GLOBAL_TIMEOUT_MS)

  const electronProcess = startElectron()
  let browser = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.find(item => !item.url().startsWith('devtools://')) || null
      if (!page) await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.error(`[PAGE ERROR] ${error.message}`))
    page.on('crash', () => console.error('[PAGE CRASH] renderer process crashed'))
    page.on('console', message => {
      if (message.type() === 'error') console.error(`[PAGE ERROR] ${String(message.text()).slice(0, 600)}`)
    })
    await page.waitForSelector('#app', { timeout: 20_000 })
    await sleep(1500)

    for (const testCase of selectedCases) {
      const caseStartedAt = Date.now()
      console.log(`[CASE START] ${testCase.id} (${testCase.entry}, withSkill=${testCase.withSkill})`)
      const turns = []
      const requestWindows = []
      try {
        await seedApplication(page, testCase)
        await selectSkillThroughUi(page, testCase)
        await assertSkillUiState(page, testCase)
        for (const [turnIndex, plan] of TURN_PLANS.entries()) {
          setScenario(plan.scenario, turnIndex + 1, plan.commands, plan.finalText)
          const requestStart = requests.length
          const turn = await runTurn(page, testCase, plan.request)
          turns.push(turn)
          requestWindows.push(requests.slice(requestStart))
          console.log(`[TURN] ${testCase.id}: ${turn.turnStatus}, intent=${turn.intent}, tools=${turn.toolCalls.map(tool => `${tool.name}:${tool.status}`).join(',') || 'none'}`)
        }
        assertCase(testCase, turns, requestWindows)
        const sameEntry = report.cases.filter(item => item.entry === testCase.entry)
        for (const priorCase of sameEntry) {
          for (const [turnIndex, priorTurn] of priorCase.turns.entries()) {
            const currentTurn = turns[turnIndex]
            assert(
              JSON.stringify(priorTurn.permissionDecision) === JSON.stringify(currentTurn.turnPermissionDecision),
              `${testCase.id}: permission decision matches ${priorCase.id} for turn ${turnIndex + 1}`,
            )
          }
        }
        await captureCaseEvidence(page, testCase, turns, requestWindows)
        report.cases.push({
          id: testCase.id,
          entry: testCase.entry,
          withSkill: testCase.withSkill,
          durationMs: Date.now() - caseStartedAt,
          turns: turns.map(turn => ({
            request: turn.request,
            status: turn.turnStatus,
            intent: turn.intent,
            permissionDecision: turn.turnPermissionDecision,
            contentChanged: turn.after !== turn.before,
            toolCalls: turn.toolCalls,
            skillGuidancePresent: turn.skillGuidanceEvents[0]?.payload?.skillGuidancePresent
              ?? turn.skillGuidanceEvents[0]?.detail?.skillGuidancePresent
              ?? null,
          })),
        })
        if (testCase.entry === 'outline') {
          await page.click('#btn-close-outline-workspace')
          await sleep(500)
        }
      } catch (error) {
        await captureCaseFailure(page, testCase, turns, requestWindows, error)
        throw error
      }
    }

    report.summary = {
      casesPassed: report.cases.length,
      expectedCases: selectedCases.length,
      readonlyTurnsPassed: report.cases.length * 2,
      editTurnsPassed: report.cases.length,
      editorWriteExecuted: report.cases.length,
    }
    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'summary.json'), JSON.stringify(report, null, 2), 'utf8')
    console.log('===== SKILL AGENT AUTHORITY ELECTRON PASSED =====')
    console.log(JSON.stringify(report.summary, null, 2))
  } finally {
    clearTimeout(watchdog)
    closeElectron(electronProcess)
    if (browser) await browser.close().catch(() => {})
    server.close()
    if (!KEEP_PROFILE) removeDir(PROFILE)
  }
}

main().catch(error => {
  console.error(`[FAIL] ${error?.stack || error}`)
  process.exitCode = 1
})
