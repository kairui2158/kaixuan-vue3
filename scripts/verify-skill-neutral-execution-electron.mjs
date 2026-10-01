import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = path.resolve(process.cwd())
const ELECTRON_EXE = process.env.SHENYI_SKILL_NEUTRAL_ELECTRON
  ? path.resolve(process.env.SHENYI_SKILL_NEUTRAL_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = Number(process.env.SHENYI_SKILL_NEUTRAL_CDP_PORT || 9316)
const PROFILE = path.join(ROOT, '_data', 'skill-neutral-execution-profile')
const EXPORT_ROOT = path.join(PROFILE, 'run-trace-exports')
const EVIDENCE_ROOT = path.join(ROOT, '_audit', 'verification-skill-neutral-execution-electron')
const PROVIDER_ID = 'skill-neutral-provider'
const MODEL = 'skill-neutral-model'
const PROJECT_ID = 'skill-neutral-matrix'
const OUTLINE_TEXT = [
  '# SKILL中立矩阵',
  '## 第一章 夜行',
  '男主在风暴中找到旧信。',
  '## 第二章 灯塔',
  '他确认了寄信人的身份。',
  '## 第三章 南下',
  '旧信把航线指向南方。',
].join('\n\n')
const GUIDANCE_MARKER = 'SKILL_NEUTRAL_GUIDANCE_MARKER'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
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
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
    },
    windowsHide: false,
  })
  console.log(`[VISIBLE ELECTRON] pid=${child.pid}`)
  child.stdout.on('data', chunk => process.stdout.write(`[ELECTRON] ${chunk}`))
  child.stderr.on('data', chunk => process.stderr.write(`[ELECTRON STDERR] ${chunk}`))
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

function startMockProvider() {
  const requests = []
  const server = http.createServer((request, response) => {
    let bodyText = ''
    request.on('data', chunk => {
      bodyText += chunk
    })
    request.on('end', () => {
      let body = null
      try { body = JSON.parse(bodyText || '{}') } catch {}
      const systemPrompt = (body?.messages || [])
        .filter(message => message?.role === 'system')
        .map(message => String(message?.content || ''))
        .join('\n')
      const userPrompt = (body?.messages || [])
        .filter(message => message?.role === 'user')
        .map(message => String(message?.content || ''))
        .join('\n')
      const wantsGuidance = systemPrompt.includes(GUIDANCE_MARKER)
      const isTargetedEdit = userPrompt.includes('把第二章灯塔的旧信内容修改为')
      const hasToolResult = (body?.messages || []).some(message => message?.role === 'tool')
      const tools = Array.isArray(body?.tools) ? body.tools : []
      const requestRecord = {
        url: request.url,
        guidance: wantsGuidance,
        tools: tools.map(tool => tool?.function?.name || tool?.name),
      }
      requests.push(requestRecord)

      if (isTargetedEdit && !hasToolResult) {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({
          choices: [{
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: `skill-neutral-call-${requests.length}`,
                type: 'function',
                function: {
                  name: 'editor.write',
                  arguments: JSON.stringify({
                    commands: [{
                      operation: 'replace_match',
                      target: '他确认了寄信人的身份。',
                      content: '他在灯塔下确认了寄信人的身份，并决定南下。',
                    }],
                    reason: '修改第二章局部内容',
                    reveal: { mode: 'instant', firstChange: true },
                  }),
                },
              }],
            },
          }],
        }))
        return
      }

      if (isTargetedEdit && hasToolResult) {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({
          choices: [{
            finish_reason: 'stop',
            message: { role: 'assistant', content: '已按指令完成第二章局部修改，并保持其余大纲内容不变。' },
          }],
        }))
        return
      }

      const finalText = wantsGuidance
        ? '# SKILL中立矩阵\n\n## 第一章 夜行\n\n男主在风暴中找到旧信，SKILL领域能力已注入。\n\n## 第二章 灯塔\n\n他确认了寄信人的身份。\n\n## 第三章 南下\n\n旧信把航线指向南方。\n'
        : '# SKILL中立矩阵\n\n## 第一章 夜行\n\n男主在风暴中找到旧信。\n\n## 第二章 灯塔\n\n他确认了寄信人的身份。\n\n## 第三章 南下\n\n旧信把航线指向南方。\n'
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: finalText },
        }],
      }))
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

const SKILL = {
  id: 'skill-neutral-guidance-skill',
  name: 'SKILL中立矩阵技能',
  template: `${GUIDANCE_MARKER} 你必须保持大纲语义，并优先使用南方航线设定。`,
  description: '验证 SKILL 只注入领域能力，不改变执行协议。',
  format: 'text',
  category: 'general',
  executionMode: 'chain',
  outputFormat: 'text',
  validationRules: [],
  splitSize: 1000,
  intents: ['discuss', 'analyze', 'edit', 'generate'],
}

async function seedApplication(page, mockProvider, options) {
  await page.evaluate(async ({ baseUrl, withSkill, skill }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', 'skill-neutral-matrix')
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'skill-neutral-provider',
        name: 'SKILL Neutral Provider',
        baseUrl,
        apiKey: 'skill-neutral-key',
        models: ['skill-neutral-model'],
        selectedModel: 'skill-neutral-model',
        temperature: 0.1,
        maxTokens: 4096,
        contextWindowTokens: 128000,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: false,
      }],
      generateProvider: 'skill-neutral-provider',
    })
    await window.electronAPI.storageWrite('wa_project_skill-neutral-matrix', {
      schemaVersion: 3,
      projectName: 'SKILL Neutral Matrix',
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
    await window.electronAPI.storageWrite('wa_skills', {
      skills: withSkill ? [skill] : [],
      pipelineSkills: [],
    })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '' },
      skills: { 0: withSkill ? ['skill-neutral-guidance-skill'] : [] },
      modes: { 0: 'compose' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: withSkill ? ['skill-neutral-guidance-skill'] : [],
      mode: 'compose',
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
  }, { baseUrl: `http://127.0.0.1:${mockProvider.port}/v1`, withSkill: options.withSkill, skill: SKILL })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20_000 })
  await sleep(1200)
  const seededState = await page.evaluate(() => ({
    skillIds: (window.__pinia?._s?.get('skill')?.skills || []).map(skill => skill.id),
    coCreationSkillIds: window.__pinia?._s?.get('coCreation')?.config?.skillIds || [],
  }))
  const expectedSkillIds = options.withSkill ? ['skill-neutral-guidance-skill'] : []
  assert.equal(seededState.skillIds.length, options.withSkill ? 1 : 0, `seed: skill store matches withSkill=${options.withSkill}`)
  assert.deepEqual(seededState.skillIds, expectedSkillIds, 'seed: skill ids match')
  assert.deepEqual(
    seededState.coCreationSkillIds,
    expectedSkillIds,
    `seed: co-creation config matches withSkill=${options.withSkill}`,
  )
  await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
  await sleep(400)
}

async function latestRun(page, source) {
  return page.evaluate(sourceName => {
    const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])]
      .filter(item => item.source === sourceName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run ? {
      id: run.id,
      status: run.status,
      events: (run.events || []).map(event => ({ type: event.type, level: event.level, payload: event.payload || null })),
      turns: (run.turns || []).map(turn => ({
        status: turn.status,
        actualToolSurface: turn.actualToolSurface || [],
      })),
      apiCalls: (run.apiCalls || []).map(call => ({ status: call.status })),
    } : null
  }, source)
}

async function waitIdle(page, selector, timeout = 60_000) {
  await page.waitForFunction(selectorName => {
    const button = document.querySelector(selectorName)
    return Boolean(button && !button.disabled)
  }, selector, { timeout, polling: 250 })
}

async function runHomeCase(page, mockProvider, caseName, requestText, expectedText) {
  await page.evaluate(content => {
    const editor = window.__pinia?._s?.get('editor')
    const active = editor.activeTab
    if (active) {
      active.content = content
      return
    }
    editor.openTab({
      id: 'skill-neutral-home',
      title: 'SKILL中立矩阵',
      chapterId: 'skill-neutral-home',
      content,
      isDirty: false,
      mode: 'text',
    })
  }, OUTLINE_TEXT)
  await waitIdle(page, '#btn-send')
  await page.locator('#user-input').fill(requestText)
  await page.locator('#user-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-send').click()
  try {
    await page.waitForFunction(expected => (window.__pinia?._s?.get('editor')?.activeTab?.content || '').includes(expected), expectedText, { timeout: 60_000, polling: 250 })
  } catch (error) {
    const content = await page.evaluate(() => window.__pinia?._s?.get('editor')?.activeTab?.content || '')
    console.error(`[CASE DUMP] ${caseName}`)
    console.error(content.slice(0, 800))
    console.error(JSON.stringify(mockProvider.requests().slice(-3), null, 2))
    throw error
  }
  await waitIdle(page, '#btn-send')
  const after = await page.evaluate(() => window.__pinia?._s?.get('editor')?.activeTab?.content || '')
  const run = await latestRun(page, 'home')
  return { caseName, after, run }
}

async function runOutlineCase(page, caseName, requestText, expectedText) {
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 20_000 })
  await page.evaluate(content => {
    const project = window.__pinia?._s?.get('project')
    project.setOutline(content)
  }, OUTLINE_TEXT)
  await page.locator('#outline-editor').fill(OUTLINE_TEXT)
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 20_000 })
  await waitIdle(page, '#btn-ow-send')
  await page.locator('#ow-chat-input').fill(requestText)
  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(expected => (document.querySelector('#outline-editor')?.value || '').includes(expected), expectedText, { timeout: 60_000, polling: 250 })
  await waitIdle(page, '#btn-ow-send')
  const after = await page.evaluate(() => document.querySelector('#outline-editor')?.value || '')
  const run = await latestRun(page, 'outline')
  await page.click('#btn-close-outline-workspace')
  await sleep(500)
  return { caseName, after, run }
}

function assertFinalDraftNeutral(result, withSkill, mockProvider, entry) {
  const label = `${entry}:${result.caseName}`
  assert(result.after.includes('## 第三章 南下'), `${label}: content is written back`)
  const request = mockProvider.requests().at(-1)
  assert(request, `${label}: provider request exists`)
  assert(!request.tools.includes('editor.write'), `${label}: final-draft does not expose editor.write`)
  assert.equal(request.guidance, withSkill, `${label}: guidance presence matches SKILL state`)
  assert(result.run?.events.some(event => event.type === 'final-draft-created'), `${label}: final-draft runner event exists`)
  const guidanceEvent = result.run?.events.find(event => event.type === 'final-draft-skill-guidance')
  assert(guidanceEvent, `${label}: guidance event exists`)
  assert.equal(guidanceEvent.level, 'info', `${label}: guidance event is info`)
  assert.equal(Boolean(guidanceEvent.payload?.skillGuidancePresent), withSkill, `${label}: guidance payload matches SKILL state`)
  assert(
    result.run.turns.some(turn => (turn.actualToolSurface || []).length === 0),
    `${label}: final-draft trace has an empty tool surface`,
  )
}

function assertTargetedEdit(result, mockProvider, entry) {
  const label = `${entry}:${result.caseName}`
  assert(result.after.includes('他在灯塔下确认了寄信人的身份，并决定南下。'), `${label}: targeted edit writes back`)
  const request = mockProvider.requests().at(-1)
  assert(request?.tools.includes('editor.write'), `${label}: targeted edit exposes editor.write`)
  assert(result.run?.turns.some(turn => turn.actualToolSurface?.some(tool => tool.name === 'editor.write')), `${label}: trace records write tool surface`)
}

async function exportLatestTrace(page, source) {
  const existingExports = new Set(fs.readdirSync(EXPORT_ROOT))
  const button = source === 'outline' ? '#btn-ow-run-trace' : '#btn-editor-run-trace'
  await page.click(button)
  await page.waitForSelector('#run-trace-overlay', { timeout: 10_000 })
  const runId = await page.evaluate(sourceName => {
    const run = [...(window.__pinia?.state?.value?.runTrace?.runs || [])]
      .filter(item => item.source === sourceName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return run?.id || ''
  }, source)
  await page.waitForSelector(`#run-trace-panel [data-run-id="${runId}"]`, { timeout: 10_000 })
  await page.click(`#run-trace-panel [data-run-id="${runId}"]`)
  await page.click('#run-trace-panel .rt-tabs button:nth-child(4)')
  await page.click('#run-trace-panel .rt-export button.btn-primary')
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    for (const name of fs.readdirSync(EXPORT_ROOT)) {
      if (existingExports.has(name)) continue
      const dir = path.join(EXPORT_ROOT, name)
      const runTraceFile = path.join(dir, 'run-trace.json')
      if (!fs.existsSync(runTraceFile)) continue
      try {
        const json = JSON.parse(fs.readFileSync(runTraceFile, 'utf8'))
        if (json.id === runId) {
          await page.click('#run-trace-panel .modal-close')
          return json
        }
      } catch {}
    }
    await sleep(200)
  }
  throw new Error(`trace export not found for ${source}:${runId}`)
}

async function main() {
  assertFreshRendererBuild()
  fs.rmSync(PROFILE, { recursive: true, force: true })
  fs.rmSync(EVIDENCE_ROOT, { recursive: true, force: true })
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true })

  const electronProcess = startElectron()
  const mockProvider = await startMockProvider()
  const report = {
    schema: 'shenyi.skill-neutral-execution.electron',
    version: 1,
    generatedAt: new Date().toISOString(),
    electronPid: electronProcess.pid,
    cases: [],
  }
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

    const requestCountBefore = () => mockProvider.requests().length

    await seedApplication(page, mockProvider, { withSkill: false })
    let before = requestCountBefore()
    let result = await runHomeCase(page, mockProvider, 'home-final-draft-no-skill', '请对当前编辑器全文进行整理排序，并统一格式。', '## 第三章 南下')
    assertFinalDraftNeutral(result, false, mockProvider, 'home')
    result = await runOutlineCase(page, 'outline-final-draft-no-skill', '请对全文大纲进行整理排序，并统一格式。', '## 第三章 南下')
    assertFinalDraftNeutral(result, false, mockProvider, 'outline')
    report.cases.push({ skill: false, requests: mockProvider.requests().slice(before) })

    await seedApplication(page, mockProvider, { withSkill: true })
    before = requestCountBefore()
    result = await runHomeCase(page, mockProvider, 'home-final-draft-with-skill', '请对当前编辑器全文进行整理排序，并统一格式。', '旧信把航线指向南方。')
    assertFinalDraftNeutral(result, true, mockProvider, 'home')
    result = await runOutlineCase(page, 'outline-final-draft-with-skill', '请对全文大纲进行整理排序，并统一格式。', '旧信把航线指向南方。')
    assertFinalDraftNeutral(result, true, mockProvider, 'outline')
    result = await runHomeCase(page, mockProvider, 'home-targeted-edit-with-skill', '请把第二章灯塔的旧信内容修改为确认身份并决定南下。', '他在灯塔下确认了寄信人的身份，并决定南下。')
    assertTargetedEdit(result, mockProvider, 'home')
    result = await runOutlineCase(page, 'outline-targeted-edit-with-skill', '请把第二章灯塔的旧信内容修改为确认身份并决定南下。', '他在灯塔下确认了寄信人的身份，并决定南下。')
    assertTargetedEdit(result, mockProvider, 'outline')
    report.cases.push({ skill: true, requests: mockProvider.requests().slice(before) })

    const homeTrace = await exportLatestTrace(page, 'home')
    assert.equal(homeTrace.schemaVersion, 11, 'home exported trace uses schema v11')
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#btn-ow-run-trace', { timeout: 20_000 })
    const outlineTrace = await exportLatestTrace(page, 'outline')
    assert.equal(outlineTrace.schemaVersion, 11, 'outline exported trace uses schema v11')
    report.exportedSchemaVersion = homeTrace.schemaVersion

    fs.writeFileSync(path.join(EVIDENCE_ROOT, 'summary.json'), JSON.stringify(report, null, 2), 'utf8')
    await page.screenshot({ path: path.join(EVIDENCE_ROOT, 'final-state.png'), fullPage: false })
    console.log('===== SKILL NEUTRAL EXECUTION ELECTRON PASSED =====')
  } finally {
    try { if (browser) await browser.close() } catch {}
    closeElectron(electronProcess)
    await mockProvider.close()
    await sleep(800)
    if (process.env.SHENYI_SKILL_NEUTRAL_KEEP_PROFILE !== '1') {
      for (let attempt = 0; attempt < 5; attempt++) {
        try { fs.rmSync(PROFILE, { recursive: true, force: true }); break } catch {}
        await sleep(1000)
      }
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
