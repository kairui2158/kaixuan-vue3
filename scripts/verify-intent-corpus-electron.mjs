import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import {
  buildIntentTestManuscriptContext,
  INTENT_TEST_MANUSCRIPT,
  INTENT_TEST_MANUSCRIPT_VERSION,
} from '../src/services/intentTestManuscript.ts'

const ROOT = process.cwd()
const ELECTRON_EXE = process.env.SHENYI_INTENT_CORPUS_ELECTRON
  ? path.resolve(process.env.SHENYI_INTENT_CORPUS_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9396
const MOCK_PORT = 59986
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'intent-corpus-electron-profile')
const EVIDENCE_DIR = path.join(ROOT, '_audit', 'verification-intent-corpus-electron')
const PROJECT_ID = 'intent-corpus-v2-project'
const CORPUS_FILE = path.join(PROFILE, 'app-data', 'intent-corpus', 'samples.jsonl')

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
  const sourceRoot = path.join(ROOT, 'src')
  const sourceFiles = []
  const collect = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collect(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collect(sourceRoot)
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundleNames = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale: ${staleBundles.join(', ')}`)
}

function completion(content) {
  return {
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
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

let llmFallbackScenario = 'normal'
let manuscriptScenario = null
let manuscriptWriteRequestCount = 0
let manuscriptWriteCount = 0
let manuscriptScenarioName = null
const requests = []
const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const isIntentClassifier = (body?.messages || []).some(message =>
      message?.role === 'system' && String(message.content || '').includes('意图分类器'),
    )
    requests.push({
      isIntentClassifier,
      tools: (body?.tools || []).map(tool => tool?.function?.name || tool?.name || '').filter(Boolean),
    })
    if (isIntentClassifier) {
      if (llmFallbackScenario === 'low-confidence') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(completion('{"intent":"discuss","confidence":0.41,"reason":"低置信"}')))
        return
      }
      if (llmFallbackScenario === 'invalid-json') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(completion('不是合法JSON')))
        return
      }
      if (llmFallbackScenario === 'request-failed') {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: { message: 'classifier unavailable' } }))
        return
      }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(completion('{"intent":"discuss","confidence":0.92,"reason":"正常"}')))
      return
    }
    if (manuscriptScenario) {
      if (
        manuscriptScenario === 'write' &&
        requests.filter(item => item.manuscriptWrite).length === manuscriptWriteCount &&
        requests.filter(item => !item.isIntentClassifier && item.manuscriptScenarioName === manuscriptScenarioName).length === 0
      ) {
        requests.at(-1).manuscriptWrite = true
        requests.at(-1).manuscriptScenarioName = manuscriptScenarioName
        manuscriptWriteCount += 1
        manuscriptWriteRequestCount += 1
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(toolCall('editor.write', {
          commands: [{
            operation: 'append',
            content: `写入前的路由不变量：${INTENT_TEST_MANUSCRIPT_VERSION}`,
            reason: 'F5 manuscript expected write',
          }],
          reveal: { mode: 'instant', firstChange: true },
          reason: 'F5 manuscript expected write',
        }, `intent-corpus-manuscript-${manuscriptScenarioName}-${manuscriptWriteRequestCount}`)))
        return
      }
      const payload = completion('已按当前意图完成讨论。')
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(payload))
      return
    }
    const payload = completion('已按当前意图完成讨论。')
    if (body?.stream) {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      response.write(`data: ${JSON.stringify({
        id: `intent-corpus-electron-${requests.length}`,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, finish_reason: 'stop', delta: { role: 'assistant', content: payload.choices[0].message.content } }],
      })}\n\n`)
      response.write('data: [DONE]\n\n')
      response.end()
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(payload))
  })
})

function startElectron() {
  return spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
    },
    windowsHide: true,
  })
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

function stopElectron(processHandle) {
  if (!processHandle?.pid) return
  try {
    execFileSync('taskkill', ['/PID', String(processHandle.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {}
}

function skillPayload(id, name, intent) {
  return {
    id,
    name,
    template: `你是${name}，只处理${intent}请求。`,
    format: 'text',
    injectMode: 'system_prefix',
    boundTo: [],
    intents: [intent],
    outputFormat: 'text',
    validationRules: [],
    customVars: {},
    executionMode: 'chain',
  }
}

async function setupWorkspace(page) {
  await page.evaluate(async ({ mockUrl, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'intent-corpus-mock-provider',
        name: 'Intent Corpus Mock',
        baseUrl: mockUrl,
        apiKey: 'intent-corpus-key',
        models: ['intent-corpus-model'],
        selectedModel: 'intent-corpus-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate', 'verify'],
        providerType: 'openai-compatible',
        streamMode: false,
      }],
      generateProvider: 'intent-corpus-mock-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'Intent Corpus V2',
      outlineText: '第一卷 风暴起点\n男主在夜路中遇到风暴。',
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
      editorTabs: [{
        id: 'intent-corpus-main-tab',
        title: '第二章 灯塔',
        mode: 'ch-body',
        chapterId: 'intent-corpus-chapter',
        content: '夜风压过山脊。',
      }],
    })
    await window.electronAPI.storageWrite('wa_skills', {
      skills: [
        skillPayload('intent-corpus-analyze', '语料分析师', 'analyze'),
        skillPayload('intent-corpus-edit', '语料编辑师', 'edit'),
        skillPayload('intent-corpus-generate', '语料生成师', 'generate'),
        skillPayload('intent-corpus-discuss', '语料讨论师', 'discuss'),
      ],
      pipelineSkills: [],
      deAiSkills: [],
    })
    await window.electronAPI.storageWrite('wa_pipeline_step_config', {
      agents: { 0: '', 1: '', 2: '', 3: '', 4: '' },
      skills: {
        0: ['intent-corpus-analyze', 'intent-corpus-edit', 'intent-corpus-generate', 'intent-corpus-discuss'],
        1: [], 2: [], 3: [], 4: [],
      },
      modes: { 0: 'chain', 1: 'compose', 2: 'chain', 3: 'chain', 4: 'chain' },
      skillAgents: {},
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    await window.electronAPI.storageRemove('wa_pipeline_breakpoint')
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: ['intent-corpus-analyze', 'intent-corpus-edit', 'intent-corpus-generate', 'intent-corpus-discuss'],
      mode: 'chain',
      skillAgents: {},
    })

    function skillPayload(id, name, intent) {
      return {
        id,
        name,
        template: `你是${name}，只处理${intent}请求。`,
        format: 'text',
        injectMode: 'system_prefix',
        boundTo: [],
        intents: [intent],
        outputFormat: 'text',
        validationRules: [],
        customVars: {},
        executionMode: 'chain',
      }
    }
  }, { mockUrl: MOCK_BASE_URL, projectId: PROJECT_ID })
}

async function sendFromHomeUi(page, input) {
  const fallbackBefore = await page.locator('.chat-routing-fallback').count()
  const assistantBefore = await page.locator('#messages-list .msg.assistant').count()
  const turnIdsBefore = await page.evaluate(() => {
    const runs = window.__pinia?._s?.get('runTrace')?.runs || []
    return runs.filter(run => run.source === 'home').flatMap(run => (run.turns || []).map(turn => turn.id))
  })
  await page.locator('#user-input').fill(input)
  await page.locator('#btn-send').click()
  await page.waitForFunction(({ fallbackCount, assistantCount, requestText, turnIdsBefore }) => {
    if (document.querySelectorAll('.chat-routing-fallback').length > fallbackCount) return true
    const runs = window.__pinia?._s?.get('runTrace')?.runs || []
    const turn = runs
      .filter(run => run.source === 'home')
      .flatMap(run => run.turns || [])
      .find(item => !turnIdsBefore.includes(item.id))
    return Boolean(turn && turn.userRequest === requestText && turn.status !== 'running')
  }, { fallbackCount: fallbackBefore, assistantCount: assistantBefore, requestText: input, turnIdsBefore }, { timeout: 30000, polling: 200 })
  await page.waitForFunction(() => !document.querySelector('#chat-generation-status'), null, { timeout: 30000, polling: 200 })
  await sleep(500)
  return {
    fallbackVisible: (await page.locator('.chat-routing-fallback').count()) - fallbackBefore,
    assistantAfter: await page.locator('#messages-list .msg.assistant').count(),
    trace: await page.evaluate(() => {
      const runs = window.__pinia?._s?.get('runTrace')?.runs || []
      const run = [...runs].filter(item => item.source === 'home').sort((a, b) => b.startedAt - a.startedAt)[0]
      if (!run) return null
      return {
        id: run.id,
        status: run.status,
        turns: (run.turns || []).map(turn => ({
          id: turn.id,
          status: turn.status,
          userRequest: turn.userRequest,
          intent: turn.intent || null,
          toolSurface: (turn.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
        })),
      }
    }),
  }
}

async function sendFromOutlineUi(page, input) {
  const assistantBefore = await page.locator('#ow-messages .ow-msg.assistant').count()
  const turnIdsBefore = await page.evaluate(() => {
    const runs = window.__pinia?._s?.get('runTrace')?.runs || []
    return runs.filter(run => run.source === 'outline').flatMap(run => (run.turns || []).map(turn => turn.id))
  })
  await page.locator('#ow-chat-input').fill(input)
  await page.locator('#btn-ow-send').click()
  await page.waitForFunction(({ assistantCount, requestText, turnIdsBefore }) => {
    const runs = window.__pinia?._s?.get('runTrace')?.runs || []
    const turn = runs
      .filter(run => run.source === 'outline')
      .flatMap(run => run.turns || [])
      .find(item => !turnIdsBefore.includes(item.id))
    return Boolean(
      turn &&
      turn.userRequest === requestText &&
      turn.status !== 'running' &&
      !document.querySelector('#ow-streaming-message'),
    )
  }, { assistantCount: assistantBefore, requestText: input, turnIdsBefore }, { timeout: 30000, polling: 200 })
  await sleep(500)
  return {
    trace: await page.evaluate(() => {
      const runs = window.__pinia?._s?.get('runTrace')?.runs || []
      const run = [...runs].filter(item => item.source === 'outline').sort((a, b) => b.startedAt - a.startedAt)[0]
      if (!run) return null
      return {
        id: run.id,
        status: run.status,
        turns: (run.turns || []).map(turn => ({
          id: turn.id,
          status: turn.status,
          userRequest: turn.userRequest,
          intent: turn.intent || null,
        })),
      }
    }),
  }
}

function hashText(text) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return `fnv1a-like-${hash}-${text.length}`
}

async function runManuscriptScenario(page, scenario) {
  const before = await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
  const beforeHash = hashText(before)
  const run = await sendFromOutlineUi(page, scenario.input)
  const after = await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
  const afterHash = hashText(after)
  const turn = run.trace?.turns?.at(-1)
  return {
    scenario: scenario.name,
    input: scenario.input,
    expectedIntent: scenario.intent,
    observed: {
      beforeHash,
      afterHash,
      hashUnchanged: beforeHash === afterHash,
      turnStatus: turn?.status || null,
      turnIntent: turn?.intent || null,
      toolSurface: turn?.toolSurface || [],
      beforeLength: before.length,
      afterLength: after.length,
    },
  }
}

async function debugManuscriptScenario(page, scenario) {
  const before = await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
  const run = await sendFromOutlineUi(page, scenario.input)
  const after = await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
  return { before, after, trace: run.trace }
}

async function waitForSamples(predicate, label) {
  const deadline = Date.now() + 12000
  let samples = []
  while (Date.now() < deadline) {
    samples = readSamples()
    if (predicate(samples)) return samples
    await sleep(300)
  }
  throw new Error(`intent corpus samples did not satisfy: ${label}\n${JSON.stringify(samples, null, 2)}`)
}

function readSamples() {
  if (!fs.existsSync(CORPUS_FILE)) return []
  return fs.readFileSync(CORPUS_FILE, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line))
}

async function main() {
  assertFreshRendererBuild()
  await removeDir(PROFILE)
  await removeDir(EVIDENCE_DIR)
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  const electronProcess = startElectron()
  let browser = null
  const evidence = []
  try {
    assert(await waitForCdp(), 'Electron CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.[0] || null
      if (!page) await sleep(400)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') console.log(`[PAGE CONSOLE ERROR] ${message.text()}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1200)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await setupWorkspace(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1200)
    await page.evaluate(() => document.querySelector('.project-modal-content .btn-close')?.click())
    await page.waitForSelector('#user-input', { timeout: 20000 })
    await page.evaluate(async () => {
      await window.electronAPI.intentEmbeddingWarmup()
    })
    await page.selectOption('#co-mode-select', 'chain')
    await page.waitForFunction(() => {
      const chips = document.querySelector('#co-skill-list')
      return Boolean(chips && (chips.textContent || '').includes('语料讨论师'))
    }, null, { timeout: 20000 })

    // 1. Normal matched dialogue records an observed sample with a real turnId.
    const observedInput = '我们现在来讨论一下钩子的问题'
    const observedRun = await sendFromHomeUi(page, observedInput)
    assert.equal(observedRun.fallbackVisible, 0, 'normal dialogue does not show fallback')
    assert.equal(observedRun.trace?.turns?.at(-1)?.status, 'success', 'normal dialogue turn closes')
    await waitForSamples(samples => {
      const sample = samples.find(item => item.requestText === observedInput)
      return sample?.annotation === 'observed' && Boolean(sample?.turnId)
    }, 'observed sample with turnId')
    const observedSample = readSamples().find(item => item.requestText === observedInput)
    evidence.push({
      scenario: 'observed-routing',
      input: observedInput,
      observed: {
        annotation: observedSample.annotation,
        turnId: observedSample.turnId,
        runId: observedSample.runId,
        workspace: observedSample.workspace,
        projectId: observedSample.projectId,
      },
      verdict: 'pass',
    })

    // 2. A fallback bubble click writes confirmed and is not overwritten by the resumed observed sample.
    llmFallbackScenario = 'low-confidence'
    const confirmedInput = '生成后讨论一下'
    const confirmedRun = await sendFromHomeUi(page, confirmedInput)
    assert.equal(confirmedRun.fallbackVisible, 1, 'low-confidence ambiguity shows fallback bubble')
    const fallbackBubbles = page.locator('.chat-routing-fallback')
    const fallbackCount = await fallbackBubbles.count()
    await fallbackBubbles.nth(fallbackCount - 1).locator('button', { hasText: '按推荐技能继续' }).click()
    await page.waitForFunction(() => !document.querySelector('#chat-generation-status'), null, { timeout: 30000, polling: 200 })
    await sleep(700)
    await waitForSamples(samples => {
      const matches = samples.filter(item => item.requestText === confirmedInput)
      return matches.length === 1 && matches[0].annotation === 'confirmed'
    }, 'confirmed sample not overwritten')
    const confirmedSamples = readSamples().filter(item => item.requestText === confirmedInput)
    assert.equal(confirmedSamples.length, 1, 'confirmed sample is unique')
    assert.equal(confirmedSamples[0].annotation, 'confirmed', 'confirmed annotation survives resume')
    evidence.push({
      scenario: 'fallback-confirmation',
      input: confirmedInput,
      observed: {
        sampleCount: confirmedSamples.length,
        annotation: confirmedSamples[0].annotation,
        annotationBasis: confirmedSamples[0].annotationBasis,
      },
      verdict: 'pass',
    })

    // 3. A low-confidence classifier stages inference evidence; an explicit next-turn edit creates an inferred sample.
    llmFallbackScenario = 'low-confidence'
    const inferenceInput = '生成后再讨论一下'
    const inferenceRun = await sendFromHomeUi(page, inferenceInput)
    assert.equal(inferenceRun.fallbackVisible, 1, 'low-confidence classifier leaves a fallback bubble')
    llmFallbackScenario = 'normal'
    const rewriteInput = '把开篇第一场改成倒叙结构'
    const rewriteRun = await sendFromHomeUi(page, rewriteInput)
    assert.equal(rewriteRun.fallbackVisible, 0, 'next-turn explicit rewrite executes directly')
    await waitForSamples(samples => {
      const sample = samples.find(item => item.requestText === inferenceInput)
      return sample?.annotation === 'inferred' && Boolean(sample?.relatedTurnId)
    }, 'inferred sample with relatedTurnId')
    const inferredSample = readSamples().find(item => item.requestText === inferenceInput)
    const rewriteTurn = rewriteRun.trace?.turns?.find(turn => turn.userRequest === rewriteInput)
    assert.equal(inferredSample.annotation, 'inferred', 'inference annotation is present')
    assert.equal(inferredSample.relatedTurnId, rewriteTurn?.id, 'inference relates to the next turn')
    evidence.push({
      scenario: 'next-turn-inference',
      input: inferenceInput,
      nextTurnInput: rewriteInput,
      observed: {
        annotation: inferredSample.annotation,
        relatedTurnId: inferredSample.relatedTurnId,
        expectedNextTurnId: rewriteTurn?.id,
      },
      verdict: 'pass',
    })

    // 4. Corpus write failure is fail-open and does not break the conversation.
    const originalAppend = await page.evaluate(() => window.electronAPI.intentCorpusAppend)
    await page.evaluate(() => {
      window.electronAPI.intentCorpusAppend = async () => ({ success: false, reason: 'injected-disk-full' })
    })
    const failOpenInput = '这段设定的表达我再确认一下'
    const failOpenRun = await sendFromHomeUi(page, failOpenInput)
    await page.evaluate(append => {
      window.electronAPI.intentCorpusAppend = append
    }, originalAppend)
    assert.equal(failOpenRun.trace?.turns?.at(-1)?.status, 'success', 'conversation succeeds when corpus write fails')
    assert.equal(failOpenRun.fallbackVisible, 0, 'corpus write failure does not create fallback')
    evidence.push({
      scenario: 'write-failure-fail-open',
      input: failOpenInput,
      observed: {
        turnStatus: failOpenRun.trace?.turns?.at(-1)?.status,
        fallbackVisible: failOpenRun.fallbackVisible,
      },
      verdict: 'pass',
    })

    // 5. Project-scoped package export contains only this project's samples.
    const exportResult = await page.evaluate(async projectId => {
      return await window.electronAPI.intentCorpusExportPackage({ projectId })
    }, PROJECT_ID)
    assert.equal(exportResult?.success, true, 'corpus package export succeeds')
    const exportedPackage = exportResult.package
    assert.equal(exportedPackage.schema, 'shenyi.intent-corpus-package', 'package schema is correct')
    assert.equal(exportedPackage.scope, 'project', 'package scope is project')
    assert(exportedPackage.sampleCount > 0, 'package contains samples')
    assert(exportedPackage.samples.every(sample => sample.projectId === PROJECT_ID), 'package only contains current project samples')
    evidence.push({
      scenario: 'project-package-export',
      observed: {
        schema: exportedPackage.schema,
        scope: exportedPackage.scope,
        sampleCount: exportedPackage.sampleCount,
        annotations: exportedPackage.samples.reduce((acc, sample) => {
          acc[sample.annotation] = (acc[sample.annotation] || 0) + 1
          return acc
        }, {}),
      },
      verdict: 'pass',
    })

    // 6. Community shadow corpus never enters the real corpus package.
    const shadowTexts = [
      '这一段能不能帮我指出结构问题',
      '把开头改成倒叙',
      '续写下一场冲突',
      '我解释一下这个设定为什么这样设计',
      '这里为什么保留伏笔',
    ]
    const shadowLeaks = exportedPackage.samples.filter(sample =>
      sample.annotationBasis?.includes('community-shadow') || String(sample.id || '').startsWith('shadow-'),
    )
    assert.equal(shadowLeaks.length, 0, 'shadow corpus does not leak into the real package')
    const samplesOnDisk = readSamples()
    const diskShadowLeaks = samplesOnDisk.filter(sample =>
      sample.annotationBasis?.includes('community-shadow') || String(sample.id || '').startsWith('shadow-'),
    )
    assert.equal(diskShadowLeaks.length, 0, 'shadow corpus does not leak into samples.jsonl')
    evidence.push({
      scenario: 'shadow-corpus-isolation',
      observed: {
        packageLeaks: shadowLeaks.length,
        diskLeaks: diskShadowLeaks.length,
        diskSampleCount: samplesOnDisk.length,
      },
      verdict: 'pass',
    })

    // 7. The 1000-character manuscript validates long-context routing and write isolation.
    await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
    await sleep(300)
    await page.evaluate(async () => {
      const pipeline = window.__pinia?._s?.get('pipeline')
      if (pipeline) await pipeline.updateStepConfig(0, { skillIds: [
        'intent-corpus-analyze',
        'intent-corpus-edit',
        'intent-corpus-generate',
        'intent-corpus-discuss',
      ] })
    })
    await sleep(300)
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 20000 })
    await page.locator('#outline-editor').fill(INTENT_TEST_MANUSCRIPT)
    await sleep(500)
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 20000 })
    await sleep(500)

    manuscriptScenario = 'manuscript-response'
    const manuscriptWriteRequestBase = requests.filter(item => !item.isIntentClassifier).length
    manuscriptWriteRequestCount = manuscriptWriteRequestBase + 1
    const manuscriptScenarios = [
      { name: 'analyze', intent: 'analyze', input: '审核这份大纲看看结构缺什么' },
      { name: 'discuss', intent: 'discuss', input: '讨论一下沈萤脚踝旧伤这个钩子为什么这样设计' },
      { name: 'location', intent: 'discuss', input: '这段潮汐档案设定应该放在第几段？请帮我定位' },
      { name: 'edit', intent: 'edit', input: '把开篇钩子改成倒叙结构，直接写入大纲' },
      { name: 'generate', intent: 'generate', input: '为第三卷生成一个新的情节链' },
    ]
    const manuscriptEvidence = []
    for (const scenario of manuscriptScenarios) {
      manuscriptScenario = ['edit', 'generate'].includes(scenario.name) ? 'write' : 'read'
      manuscriptScenarioName = scenario.name
      if (process.env.SHENYI_DEBUG_MANUSCRIPT) {
        const debug = await debugManuscriptScenario(page, scenario)
        console.log(`[MANUSCRIPT DEBUG] ${JSON.stringify({
          scenario: scenario.name,
          input: scenario.input,
          changed: debug.before !== debug.after,
          requests: requests.slice(-3).map(item => ({ tools: item.tools, isIntentClassifier: item.isIntentClassifier })),
          trace: debug.trace,
        })}`)
        continue
      }
      manuscriptEvidence.push(await runManuscriptScenario(page, scenario))
    }
    manuscriptScenario = null
    manuscriptScenarioName = null
    const readonlyScenarios = manuscriptEvidence.filter(item =>
      ['analyze', 'discuss', 'location'].includes(item.scenario),
    )
    for (const item of readonlyScenarios) {
      assert.equal(item.observed.turnStatus, 'success', `${item.scenario}: manuscript turn closes`)
      assert.equal(
        item.observed.turnIntent,
        item.expectedIntent,
        `${item.scenario}: manuscript intent does not drift (${item.observed.turnIntent})`,
      )
      assert.equal(
        item.observed.hashUnchanged,
        true,
        `${item.scenario}: editor hash stays unchanged under the manuscript`,
      )
      assert(
        !(item.observed.toolSurface || []).some(tool => tool.name === 'editor.write'),
        `${item.scenario}: manuscript turn does not expose editor.write`,
      )
    }
    const editEvidence = manuscriptEvidence.find(item => item.scenario === 'edit')
    const generateEvidence = manuscriptEvidence.find(item => item.scenario === 'generate')
    assert.equal(editEvidence.observed.turnStatus, 'success', 'edit: manuscript turn closes')
    assert.equal(editEvidence.observed.turnIntent, 'edit', 'edit: manuscript intent stays edit')
    assert.equal(
      editEvidence.observed.hashUnchanged,
      false,
      'edit: expected write changes the editor hash under the manuscript',
    )
    assert.equal(generateEvidence.observed.turnStatus, 'success', 'generate: manuscript turn closes')
    assert.equal(generateEvidence.observed.turnIntent, 'generate', 'generate: manuscript intent stays generate')
    assert.equal(
      generateEvidence.observed.hashUnchanged,
      false,
      'generate: expected write changes the editor hash under the manuscript',
    )
    const manuscriptAfter = await page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
    assert.equal(
      (manuscriptAfter.match(/写入前的路由不变量：/g) || []).length,
      2,
      'edit and generate each apply exactly one expected write batch',
    )
    assert(
      manuscriptAfter.includes('写入前的路由不变量：'),
      'expected write batches are present in the editor',
    )
    evidence.push({
      scenario: 'manuscript-long-context-write-isolation',
      manuscriptVersion: INTENT_TEST_MANUSCRIPT_VERSION,
      manuscriptLength: [...INTENT_TEST_MANUSCRIPT].length,
      routingContextVersion: INTENT_TEST_MANUSCRIPT_VERSION,
      requests: manuscriptEvidence,
      verdict: 'pass',
    })

    // 8. Outline plain dialogue keeps routing fidelity and does not fabricate inferred labels.
    // OutlineWorkspace reads step config only on mount, so clear skills before reopening it.
    await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
    await sleep(300)
    await page.evaluate(async () => {
      const pipeline = window.__pinia?._s?.get('pipeline')
      if (pipeline) await pipeline.updateStepConfig(0, { skillIds: [] })
    })
    await sleep(300)
    await page.click('#btn-outline-workspace')
    await page.waitForSelector('#outline-editor', { timeout: 20000 })
    await sleep(300)
    await page.click('#btn-ai-co-create')
    await page.waitForSelector('#ow-chat-input', { timeout: 20000 })
    await sleep(300)
    const outlineFidelityInput = '这一段我想听你分析一下开篇节奏'
    const outlineFidelityRun = await sendFromOutlineUi(page, outlineFidelityInput)
    const outlineContinueInput = '我继续解释一下这个开篇设计'
    const outlineContinueRun = await sendFromOutlineUi(page, outlineContinueInput)
    assert.equal(outlineFidelityRun.trace?.turns?.at(-1)?.status, 'success', 'outline plain dialogue turn closes')
    assert.equal(outlineContinueRun.trace?.turns?.at(-1)?.status, 'success', 'outline continued discussion turn closes')
    await waitForSamples(samples => {
      const fidelity = samples.filter(item => item.requestText === outlineFidelityInput)
      const continued = samples.filter(item => item.requestText === outlineContinueInput)
      return fidelity.length === 1 && fidelity[0].annotation === 'observed' &&
        continued.length === 1 && continued[0].annotation === 'observed'
    }, 'outline plain samples stay observed without fabricated inference')
    const outlineFidelitySample = readSamples().find(item => item.requestText === outlineFidelityInput)
    const outlineContinueSample = readSamples().find(item => item.requestText === outlineContinueInput)
    assert.equal(outlineFidelitySample.annotation, 'observed', 'outline first discussion stays observed')
    assert.equal(outlineContinueSample.annotation, 'observed', 'outline continued discussion stays observed')
    assert.ok(outlineFidelitySample.routing, 'outline observed sample keeps routing shape')
    assert(
      !outlineFidelitySample.annotationBasis?.includes('next-turn'),
      'outline matched discussion is not staged as inference',
    )
    assert(
      !outlineContinueSample.annotationBasis?.includes('next-turn'),
      'outline continued discussion does not fabricate inferred label',
    )
    evidence.push({
      scenario: 'outline-plain-routing-fidelity',
      input: outlineFidelityInput,
      nextInput: outlineContinueInput,
      observed: {
        firstAnnotation: outlineFidelitySample.annotation,
        nextAnnotation: outlineContinueSample.annotation,
        firstReason: outlineFidelitySample.routing?.reason,
        nextReason: outlineContinueSample.routing?.reason,
      },
      verdict: 'pass',
    })

    fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
    const evidencePath = path.join(EVIDENCE_DIR, 'intent-corpus-electron-evidence.json')
    fs.writeFileSync(evidencePath, JSON.stringify({
      schema: 'shenyi.intent-corpus-electron-verification',
      version: 1,
      generatedAt: new Date().toISOString(),
      scenarios: evidence,
      corpusPath: CORPUS_FILE,
    }, null, 2), 'utf8')
    console.log('\n===== INTENT CORPUS V2 ELECTRON VERIFICATION PASSED =====')
    console.log(`scenarios=${evidence.length}; corpusSamples=${samplesOnDisk.length}`)
    console.log(`evidence=${evidencePath}`)
  } finally {
    try { await browser?.close() } catch {}
    stopElectron(electronProcess)
    server.close()
    await sleep(800)
    await removeDir(PROFILE)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
