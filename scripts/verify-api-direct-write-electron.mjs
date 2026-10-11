import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const ELECTRON_EXE = process.env.SHENYI_DIRECT_WRITE_ELECTRON
  ? path.resolve(process.env.SHENYI_DIRECT_WRITE_ELECTRON)
  : path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')
const CDP_PORT = 9278
const MOCK_PORT = 59936
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const PROFILE = path.join(ROOT, '_data', 'api-direct-write-electron-profile')
const EXPORT_ROOT = path.join(ROOT, '_data', 'api-direct-write-electron-exports')
const SCREENSHOT_DIR = path.join(ROOT, '_audit', 'verification-api-direct-write-electron')
const PROJECT_ID = 'api-direct-write-electron-project'

const BASE_OUTLINE = [
  '第一卷 风暴起点',
  '第二章内容。男主在灯塔下发现旧信。',
  '第三章内容。男主抵达灯塔顶端。',
].join('\n')

function buildLongOutline() {
  const sections = ['第一卷 长文档压测']
  for (let index = 1; index <= 2200; index++) {
    sections.push(`第${index}节：长文档多批执行抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复退去。`)
  }
  return sections.join('\n')
}

function buildDualEntryDocument() {
  const header = [
    '第一卷 风暴起点',
    '第二章：男主抵达灯塔，发现旧信，',
    '第三章：男主在塔顶确认信的出处。',
  ]
  const filler = []
  for (let index = 1; filler.join('\n').length < 5000; index++) {
    filler.push(`第${index}段：双入口等价性对照。潮水在礁石外退去，灯塔的影子落在石阶上。`)
  }
  return [...header, ...filler].join('\n')
}

const MILLION_OUTLINE_LINE = '第{n}节：百万字大纲压测。男主沿着灯塔石阶检查灯芯，潮声在礁石外反复退去，旧信的日期被潮气晕开。'
const SCRIPT_OWNED_EVIDENCE_FILES = [
  'dual-entry-equivalence.json',
  'run-trace-export.json',
  'three-tier-matrix.json',
]

function buildMillionOutline() {
  const sections = ['第一卷 百万字大纲']
  for (let index = 1; index <= 20000; index++) {
    sections.push(MILLION_OUTLINE_LINE.replace('{n}', String(index)))
  }
  return sections.join('\n')
}

function millionLine(index) {
  return MILLION_OUTLINE_LINE.replace('{n}', String(index))
}

function buildThreeTierMatrixReport(input) {
  return {
    schema: 'shenyi.api-direct-write-electron-matrix',
    version: 1,
    generatedAt: new Date().toISOString(),
    tiers: input.tiers,
    hardAssertions: {
      wholeDocumentReplacementRejected: input.wholeDocumentReplacementRejected,
      inputWithinDeclaredWindow: input.inputWithinDeclaredWindow,
      documentMapVisible: input.documentMapVisible,
      segmentedReadsVisible: input.segmentedReadsVisible,
      batchCheckpointsRecorded: input.batchCheckpointsRecorded,
      contentIntegrity: input.contentIntegrity,
      uiAlwaysStateful: input.uiAlwaysStateful,
      traceExplainable: input.traceExplainable,
    },
  }
}

function buildDualEntryEquivalenceReport(input) {
  return {
    schema: 'shenyi.api-direct-write-dual-entry-equivalence',
    version: 1,
    generatedAt: new Date().toISOString(),
    documentChars: input.documentChars,
    operations: input.operations,
    requests: input.requests,
    finalContentIdentical: input.finalContentIdentical,
    sharedEditorToolSurfacesIdentical: input.sharedEditorToolSurfacesIdentical,
    outlineExtraTools: input.outlineExtraTools,
    outlineExtraToolsReadOnly: input.outlineExtraToolsReadOnly,
    traceClosed: input.traceClosed,
  }
}

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

function cleanScriptOwnedEvidence() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const existingPng = fs.existsSync(SCREENSHOT_DIR)
    ? fs.readdirSync(SCREENSHOT_DIR).filter(name => name.endsWith('.png'))
    : []
  for (const name of [...SCRIPT_OWNED_EVIDENCE_FILES, ...existingPng]) {
    fs.rmSync(path.join(SCREENSHOT_DIR, name), { force: true })
  }
}

function assertFreshRendererBuild() {
  const rendererIndex = path.join(ROOT, 'dist-renderer', 'index.html')
  assert(fs.existsSync(rendererIndex), 'dist-renderer/index.html exists; run npm run build:vue first')
  const indexHtml = fs.readFileSync(rendererIndex, 'utf8')
  const bundleNames = [...indexHtml.matchAll(/assets\/[^"']+\.js/g)].map(match => match[0])
  assert(bundleNames.length > 0, 'renderer index references at least one JS bundle')
  const sourceRoot = path.join(ROOT, 'src')
  const sourceFiles = []
  const collectSources = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) collectSources(full)
      else if (/\.(ts|vue|js|mjs|css)$/.test(entry.name)) sourceFiles.push(full)
    }
  }
  collectSources(sourceRoot)
  const newestSourceMs = Math.max(...sourceFiles.map(file => fs.statSync(file).mtimeMs))
  const staleBundles = bundleNames.filter(name => fs.statSync(path.join(ROOT, 'dist-renderer', name)).mtimeMs < newestSourceMs)
  assert.equal(staleBundles.length, 0, `renderer build is stale; rebuild with npm run build:vue. Stale bundles: ${staleBundles.join(', ')}`)
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

let scenario = 'warmup'
const requests = []
let scenarioTurn = 0

function setScenario(name) {
  scenario = name
  scenarioTurn = 0
}

const writePayload = (commands, reason) => ({
  commands,
  reveal: { mode: 'instant', firstChange: true },
  reason,
})

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    const isIntentClassifier = (body?.messages || []).some(message =>
      message?.role === 'system' && String(message.content || '').includes('意图分类器')
    )
    const currentScenario = scenario
    const currentScenarioTurn = scenarioTurn
    const requestCount = requests.filter(item =>
      item.scenario === currentScenario
      && item.turn === currentScenarioTurn
      && !item.isIntentClassifier
    ).length + 1
    const record = {
      scenario: currentScenario,
      turn: currentScenarioTurn,
      requestCount,
      isIntentClassifier,
      tools: (body?.tools || []).map(tool => tool?.function?.name || tool?.name || '').filter(Boolean),
      body,
    }
    requests.push(record)
    console.log(`[MOCK] ${currentScenario} #${requestCount}: ${record.tools.join(', ') || '(no tools)'}`)
    if (isIntentClassifier) {
      assert.equal(record.tools.length, 0, 'intent classifier request must not carry editor tools')
      const classifierInput = (body?.messages || [])
        .filter(message => message?.role === 'user')
        .map(message => String(message.content || ''))
        .join('\n')
      const intent = /重新整理排序|替换第二章内容/.test(classifierInput)
        ? 'edit'
        : 'discuss'
      respond(response, body, textCompletion(`{"intent":"${intent}","confidence":0.95,"reason":"按用户请求语义分类"}`))
      return
    }

    if (scenario === 'format-edit') {
      const payload = requestCount === 1
        ? toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: '第二章内容。男主在灯塔下发现旧信。',
          content: '第二章大纲。男主在灯塔下确认旧信来源。',
          reason: '统一标点与格式',
        }], '格式排版直写'), 'format-edit-write')
        : textCompletion('已完成格式排版。')
      respond(response, body, payload)
      return
    }

    if (scenario === 'cross-turn-permission') {
      let payload
      if (scenarioTurn === 1) {
        payload = textCompletion('这段设定建议放在第三章之后的补充节点，用来承接旧信出处。')
      } else if (requestCount === 1) {
        payload = toolCall('editor.write', writePayload([{
          operation: 'append',
          content: '第二轮明确授权后的新增卷纲节点。',
          reason: '编辑轮直写',
        }], '第二轮直写'), 'cross-turn-write')
      } else {
        payload = textCompletion('已完成写入。')
      }
      respond(response, body, payload)
      return
    }

    if (scenario === 'stuck-retry') {
      if (requestCount === 1) {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        response.write(': hold\n\n')
        return
      }
      const payload = requestCount === 2
        ? toolCall('editor.write', writePayload([{
          operation: 'append',
          content: '停滞隔离重试后的写入结果。',
          reason: '停滞重试直写',
        }], '停滞重试'), 'stuck-retry-write')
        : textCompletion('重试写入完成。')
      respond(response, body, payload)
      return
    }

    if (scenario === 'partial-retry-cancel') {
      const failedWrite = toolCall('editor.write', writePayload([{
        operation: 'replace_match',
        target: '第一卷 风暴起点',
        content: '第一卷 风暴起点\n第一卷 风暴起点',
        reason: '触发结构完整性失败',
      }], '先制造可控失败'), `partial-failed-write-${scenarioTurn}`)
      const retryWrite = toolCall('editor.write', writePayload([{
        operation: 'append',
        content: '恢复任务后的重试内容。',
        reason: '恢复后重试',
      }], '恢复任务重试'), 'partial-retry-write')
      const payload = scenarioTurn <= 2
        ? (requestCount === 1 ? failedWrite : textCompletion('首次写入失败，任务已终态。'))
        : (scenarioTurn === 4
          ? (requestCount === 1 ? failedWrite : textCompletion('第二次写入失败，任务已终态。'))
          : (requestCount === 1 ? retryWrite : textCompletion('恢复重试完成。')))
      respond(response, body, payload)
      return
    }

    if (scenario === 'write-modify-delete-loop') {
      const payloads = [
        toolCall('editor.write', writePayload([{
          operation: 'append',
          content: '第 1 轮：新增卷末钩子。',
          reason: '写入',
        }], '第 1 轮写入'), 'loop-write-1'),
        toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: '第 1 轮：新增卷末钩子。',
          content: '第 2 轮：修改后的卷末钩子。',
          reason: '修改',
        }], '第 2 轮修改'), 'loop-write-2'),
        toolCall('editor.write', writePayload([{
          operation: 'delete',
          target: '第 2 轮：修改后的卷末钩子。',
          reason: '删除',
        }], '第 3 轮删除'), 'loop-write-3'),
      ]
      const payload = requestCount === 1
        ? payloads[Math.min(scenarioTurn - 1, payloads.length - 1)]
        : textCompletion('循环写入完成。')
      respond(response, body, payload)
      return
    }

    if (scenario === 'home-mixed-intent') {
      const payloads = [
        toolCall('editor.get_state', {}, 'home-read-1'),
        toolCall('editor.write', writePayload([{
          operation: 'append',
          content: '主页混合轮：直写补充段。',
          reason: '混合轮写入',
        }], '主页混合轮'), 'home-write-1'),
        toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: '主页混合轮：直写补充段。',
          content: '主页混合轮：修改后的补充段。',
          reason: '混合轮修改',
        }], '主页混合轮修改'), 'home-write-2'),
        toolCall('editor.write', writePayload([{
          operation: 'delete',
          target: '主页混合轮：修改后的补充段。',
          reason: '混合轮删除',
        }], '主页混合轮删除'), 'home-write-3'),
      ]
      const payload = requestCount === 1
        ? payloads[Math.min(scenarioTurn - 1, payloads.length - 1)]
        : textCompletion(scenarioTurn === 1 ? '已处理当前请求。' : '主页混合轮完成。')
      respond(response, body, payload)
      return
    }

    if (scenario === 'natural-individual-edit') {
      const payloads = [
        toolCall('editor.write', writePayload([{
          operation: 'append',
          content: '潮声压过礁石。',
          reason: '用户随意要求补一句',
        }], '随手补一句'), 'natural-write-1'),
        toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: '第三章内容。男主抵达灯塔顶端。',
          content: '第三章内容。男主抵达塔尖。',
          reason: '用户随意要求换说法',
        }], '换成塔尖'), 'natural-modify-1'),
        toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: '第二章大纲。男主在灯塔下确认旧信来源。',
          content: '第二章大纲。男主在灯塔下确认信的出处。',
          reason: '用户随意要求改个别字',
        }], '改个别字'), 'natural-modify-2'),
        toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: '潮声压过礁石。',
          content: '潮声压过礁石',
          reason: '用户随意要求删掉句号',
        }], '删掉句号'), 'natural-delete-char'),
        toolCall('editor.write', writePayload([{
          operation: 'delete',
          target: '第二轮明确授权后的新增卷纲节点。',
          reason: '用户随意要求删掉那一行',
        }], '那行不要了'), 'natural-delete-line'),
      ]
      const finalTexts = [
        '已按你的意思补上了。',
        '已换成塔尖。',
        '那几个字已经改了。',
        '句号删掉了。',
        '那一行不要了，已经删掉。',
      ]
      const payload = requestCount === 1
        ? payloads[Math.min(scenarioTurn - 1, payloads.length - 1)]
        : textCompletion(finalTexts[Math.min(scenarioTurn - 1, finalTexts.length - 1)])
      respond(response, body, payload)
      return
    }

    if (scenario === 'long-document-edit-task') {
      const payloads = [
        toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: '第1节：长文档多批执行抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复退去。',
          content: '第1节：长文档多批执行抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复上涨。',
          reason: '长文档第一批修改',
        }], '长文档第一批'), 'long-document-write-1'),
        toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: '第2200节：长文档多批执行抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复退去。',
          content: '第2200节：长文档多批执行抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复上涨。',
          reason: '长文档第二批修改',
        }], '长文档第二批'), 'long-document-write-2'),
      ]
      const payload = requestCount <= 2
        ? payloads[requestCount - 1]
        : textCompletion('长文档两批修改全部完成。')
      respond(response, body, payload)
      return
    }

    if (scenario === 'active-plan-continuation') {
      if (scenarioTurn === 1) {
        respond(response, body, textCompletion('我准备分两批重排并保留第二卷钩子，是否按这个方案执行？'))
        return
      }
      if (scenarioTurn === 2) {
        respond(response, body, textCompletion('第二卷钩子保留在原位。第一批完成后，请在第1节句尾追加【计划续接完成】。'))
        return
      }
      if (requestCount === 1) {
        respond(response, body, toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: '第1节：长文档多批执行抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复退去。',
          content: '第1节：长文档多批执行抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复上涨。【计划续接完成】',
          reason: '复用用户确认后的执行计划',
        }], '计划续接第一批'), 'active-plan-write'))
        return
      }
      respond(response, body, textCompletion('已按确认后的计划完成写入。'))
      return
    }

    if (scenario === 'dual-entry-equivalence') {
      const payloads = [
        toolCall('editor.write', writePayload([{
          operation: 'append',
          content: '双入口对照：追加段。',
          reason: '双入口追加对照',
        }], '双入口追加'), 'dual-entry-append'),
        toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: '第二章：男主抵达灯塔，发现旧信，',
          content: '第二章：男主抵达灯塔，确认旧信来源，',
          reason: '双入口修改对照',
        }], '双入口修改'), 'dual-entry-replace'),
        toolCall('editor.write', writePayload([{
          operation: 'move',
          target: '第三章：男主在塔顶确认信的出处。',
          destination: '第二章：男主抵达灯塔，确认旧信来源，',
          destinationPosition: 'before',
          reason: '双入口移动对照',
        }], '双入口移动'), 'dual-entry-move'),
        toolCall('editor.write', writePayload([{
          operation: 'delete',
          target: '双入口对照：追加段。',
          reason: '双入口删除对照',
        }], '双入口删除'), 'dual-entry-delete'),
      ]
      const payload = requestCount === 1
        ? payloads[Math.min(scenarioTurn - 1, payloads.length - 1)]
        : textCompletion('双入口对照操作完成。')
      respond(response, body, payload)
      return
    }

    if (scenario === 'dual-entry-outline-equivalence') {
      const payloads = [
        toolCall('editor.write', writePayload([{
          operation: 'append',
          content: '双入口对照：追加段。',
          reason: '双入口追加对照',
        }], '双入口追加'), 'dual-entry-outline-append'),
        toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: '第二章：男主抵达灯塔，发现旧信，',
          content: '第二章：男主抵达灯塔，确认旧信来源，',
          reason: '双入口修改对照',
        }], '双入口修改'), 'dual-entry-outline-replace'),
        toolCall('editor.write', writePayload([{
          operation: 'move',
          target: '第三章：男主在塔顶确认信的出处。',
          destination: '第二章：男主抵达灯塔，确认旧信来源，',
          destinationPosition: 'before',
          reason: '双入口移动对照',
        }], '双入口移动'), 'dual-entry-outline-move'),
        toolCall('editor.write', writePayload([{
          operation: 'delete',
          target: '双入口对照：追加段。',
          reason: '双入口删除对照',
        }], '双入口删除'), 'dual-entry-outline-delete'),
      ]
      const payload = requestCount === 1
        ? payloads[Math.min(scenarioTurn - 1, payloads.length - 1)]
        : textCompletion('双入口对照操作完成。')
      respond(response, body, payload)
      return
    }

    if (scenario === 'context-budget-5k') {
      const usage = { prompt_tokens: 5230, completion_tokens: 38, total_tokens: 5268 }
      respond(response, body, textCompletion('已完成 5K 只读上下文预算抽测。'), usage)
      return
    }

    if (scenario === 'million-document-edit-task') {
      const nonIntentRequests = requests.filter(item =>
        item.scenario === 'million-document-edit-task' && !item.isIntentClassifier)
      const step = requestCount
      if (step === 1 && scenarioTurn === 1) {
        respond(response, body, toolCall('editor.write', writePayload([{
          operation: 'replace_document',
          content: '整篇替换在 1M 档必须被拒绝。',
          reason: '故意提交整篇替换',
        }], '1M 整篇替换负向测试'), 'million-forbidden-write'))
        return
      }
      if (step === 2 && scenarioTurn === 1) {
        respond(response, body, textCompletion('整篇替换已被应用拒绝，我不会绕过限制。'))
        return
      }
      if (step === 1 && scenarioTurn === 2) {
        respond(response, body, toolCall('editor.document_map', {
          offset: 19980,
          limit: 30,
        }, 'million-map'))
        return
      }
      if (step === 2 && scenarioTurn === 2) {
        respond(response, body, toolCall('editor.read_range', {
          sectionId: 'section-1',
          maxChars: 12000,
        }, 'million-read-first'))
        return
      }
      if (step === 3 && scenarioTurn === 2) {
        respond(response, body, toolCall('editor.read_range', {
          sectionId: 'section-20000',
          maxChars: 12000,
        }, 'million-read-last'))
        return
      }
      if (step === 4 && scenarioTurn === 2 && nonIntentRequests.length < 4) {
        respond(response, body, toolCall('editor.read_range', {
          sectionId: 'section-2',
          maxChars: 12000,
        }, 'million-read-extra'))
        return
      }
      if ((step === 1 || step === 2) && scenarioTurn === 3) {
        const isFirst = step === 1
        const index = isFirst ? 1 : 20000
        respond(response, body, toolCall('editor.write', writePayload([{
          operation: 'replace_match',
          target: millionLine(index),
          content: `${millionLine(index)}【已复核】`,
          reason: isFirst ? '1M 第一批修改' : '1M 最后一批修改',
        }], isFirst ? '1M 第一批' : '1M 最后一批'), `million-write-${index}`))
        return
      }
      respond(response, body, textCompletion('百万字大纲两批修改完成，内容未丢失。'))
      return
    }

    respond(response, body, textCompletion('已处理当前请求。'))
  })
})

function respond(response, body, payload, usage) {
  if (body?.stream) {
    const delta = payload.choices?.[0]?.message || {}
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.write(`data: ${JSON.stringify({
      id: `api-direct-write-electron-${scenario}-${requests.at(-1)?.requestCount || 0}`,
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
      usage,
    })}\n\n`)
    response.write('data: [DONE]\n\n')
    response.end()
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function startElectron() {
  return spawn(ELECTRON_EXE, ['.', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${PROFILE}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHENYI_ALLOW_TEST_ISOLATION: '1',
      SHENYI_DATA_DIR: path.join(PROFILE, 'documents-data'),
      SHENYI_TEST_USER_DATA_DIR: path.join(PROFILE, 'app-data'),
      SHENYI_TEST_RUN_TRACE_EXPORT: EXPORT_ROOT,
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
    await sleep(500)
  }
  return false
}

async function closeProjectModal(page) {
  await page.evaluate(() => {
    document.querySelector('.project-modal-content .btn-close')?.click()
  })
  await sleep(400)
}

async function setupProject(page) {
  await page.evaluate(async ({ mockUrl, outline, projectId }) => {
    await window.electronAPI.storageWrite('wa_lastProjectId', projectId)
    await window.electronAPI.storageWrite('wa_providers', {
      providers: [{
        id: 'api-direct-write-electron-provider',
        name: 'API Direct Write Electron Mock',
        baseUrl: mockUrl,
        apiKey: 'key',
        models: ['api-direct-write-electron-model'],
        selectedModel: 'api-direct-write-electron-model',
        temperature: 0.1,
        maxTokens: 4096,
        purpose: ['generate'],
        providerType: 'openai-compatible',
        streamMode: true,
      }],
      generateProvider: 'api-direct-write-electron-provider',
    })
    await window.electronAPI.storageWrite(`wa_project_${projectId}`, {
      schemaVersion: 3,
      projectName: 'API Direct Write Electron Stress',
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
      editorTabs: [{
        id: 'direct-write-main-tab',
        title: '第二章 灯塔',
        mode: 'ch-body',
        chapterId: 'direct-write-chapter',
        content: '夜风压过山脊。',
      }],
    })
    await window.electronAPI.storageWrite('wa_deAiConfig', { hardruleEnabled: false, hardRuleMode: 'detect-report' })
    const pipelineConfig = await window.electronAPI.storageRead('wa_pipeline_step_config') || {}
    pipelineConfig.skills = pipelineConfig.skills || {}
    pipelineConfig.modes = pipelineConfig.modes || {}
    pipelineConfig.skills[0] = []
    pipelineConfig.modes[0] = 'chain'
    await window.electronAPI.storageWrite('wa_pipeline_step_config', pipelineConfig)
    await window.electronAPI.storageWrite('wa_skills', { skills: [] })
    await window.electronAPI.storageWrite('wa_co_creation_config', {
      agentId: '',
      skillIds: [],
      mode: 'compose',
      skillAgents: {},
    })
  }, { mockUrl: MOCK_BASE_URL, outline: BASE_OUTLINE, projectId: PROJECT_ID })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })
  await sleep(1200)
  await closeProjectModal(page)
}

async function waitOutlineIdle(page, timeout = 60000) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-ow-send') && !document.querySelector('#btn-ow-send')?.disabled), null, { timeout, polling: 250 })
  await sleep(250)
}

async function waitOutlineTurnFinished(page, text, timeout = 120000) {
  await page.waitForFunction(request => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'outline')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const turn = [...(run?.turns || [])]
      .filter(item => item.userRequest === request)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const sendButton = document.querySelector('#btn-ow-send')
    return Boolean(
      turn
      && turn.status
      && turn.status !== 'running'
      && sendButton
      && !sendButton.disabled,
    )
  }, text, { timeout, polling: 250 })
}

async function sendOutline(page, text, waitFor) {
  await waitOutlineIdle(page)
  scenarioTurn += 1
  const before = requests.length
  await page.locator('#ow-chat-input').fill(text)
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  if (waitFor) {
    try {
      await page.waitForFunction(value => (document.body.textContent || '').includes(value), waitFor, { timeout: 60000, polling: 250 })
    } catch (error) {
      const bodyText = await page.evaluate(() => (document.body.textContent || '').slice(-5000))
      const run = await latestRun(page, 'outline')
      console.error(`[OUTLINE TIMEOUT] ${text}\n[TRACE] ${JSON.stringify(run)}\n[REQUESTS] ${requests.slice(before).map(item => `${item.scenario}#${item.requestCount}`).join(', ')}\n${bodyText}`)
      throw error
    }
  }
  await waitOutlineIdle(page)
  await waitOutlineTurnFinished(page, text)
  return requests.slice(before)
}

async function sendOutlineExpectEvents(page, text, expectedEvents) {
  await waitOutlineIdle(page)
  scenarioTurn += 1
  const before = requests.length
  await page.locator('#ow-chat-input').fill(text)
  await page.locator('#ow-chat-input').evaluate(element => element.dispatchEvent(new Event('change', { bubbles: true })))
  await page.locator('#btn-ow-send').click()
  await waitOutlineTurnFinished(page, text)
  const run = await latestRun(page, 'outline')
  const turn = (run?.turns || []).find(item => item.userRequest === text)
  assert(turn, `outline event turn is recorded for "${text}"`)
  const eventTypes = (run?.events || [])
    .filter(event => event.turnId === turn.id)
    .map(event => event.type)
  const missing = expectedEvents.filter(eventType => !eventTypes.includes(eventType))
  assert.equal(missing.length, 0, `outline events are all recorded for "${text}"; missing: ${missing.join(', ')}; got: ${eventTypes.join(', ') || '(none)'}`)
  await waitOutlineIdle(page)
  return requests.slice(before)
}

async function waitHomeIdle(page, timeout = 60000) {
  await page.waitForFunction(() => Boolean(document.querySelector('#btn-send') && !document.querySelector('#btn-send')?.disabled), null, { timeout, polling: 250 })
  await sleep(250)
}

async function waitHomeTurnFinished(page, text, timeout = 120000) {
  await page.waitForFunction(request => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === 'home')
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const turn = [...(run?.turns || [])]
      .filter(item => item.userRequest === request)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    const sendButton = document.querySelector('#btn-send')
    return Boolean(
      turn
      && turn.status
      && turn.status !== 'running'
      && sendButton
      && !sendButton.disabled,
    )
  }, text, { timeout, polling: 250 })
}

async function sendHome(page, text, waitFor) {
  await waitHomeIdle(page)
  scenarioTurn += 1
  const before = requests.length
  await page.locator('#user-input').fill(text)
  await page.locator('#btn-send').click()
  if (waitFor) {
    try {
      await page.waitForFunction(value => (document.body.textContent || '').includes(value), waitFor, { timeout: 60000, polling: 250 })
    } catch (error) {
      const bodyText = await page.evaluate(() => (document.body.textContent || '').slice(-5000))
      const run = await latestRun(page, 'home')
      console.error(`[HOME TIMEOUT] ${text}\n[TRACE] ${JSON.stringify(run)}\n[REQUESTS] ${requests.slice(before).map(item => `${item.scenario}#${item.requestCount}`).join(', ')}\n${bodyText}`)
      throw error
    }
  }
  await waitHomeIdle(page)
  await waitHomeTurnFinished(page, text)
  return requests.slice(before)
}

async function openOutline(page) {
  await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
  await sleep(200)
  await page.click('#btn-outline-workspace')
  await page.waitForSelector('#outline-editor', { timeout: 15000 })
  await page.locator('#outline-editor').fill(BASE_OUTLINE)
  await sleep(300)
  await page.click('#btn-ai-co-create')
  await page.waitForSelector('#ow-chat-input', { timeout: 15000 })
}

function outlineContent(page) {
  return page.evaluate(() => window.__pinia?._s?.get('project')?.outlineText || '')
}

async function latestRun(page, source) {
  return await page.evaluate(sourceName => {
    const run = [...(window.__pinia?._s?.get('runTrace')?.runs || [])]
      .filter(item => item.source === sourceName)
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!run) return null
    return {
      id: run.id,
      status: run.status,
      turns: (run.turns || []).map(turn => ({
        id: turn.id,
        status: turn.status,
        userRequest: turn.userRequest,
        intent: turn.intent || null,
        reason: turn.reason || null,
        toolSurface: (turn.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
      })),
      apiCalls: (run.apiCalls || []).map(call => ({
        id: call.id,
        turnId: call.turnId || null,
        skillName: call.skillName || null,
      status: call.status,
      error: call.error || null,
      errorCode: call.errorCode || null,
        finishReason: call.finishReason || null,
        intent: call.intent || null,
        providerContextWindowTokens: call.providerContextWindowTokens ?? null,
        estimatedInputTokens: call.estimatedInputTokens ?? null,
        contextBudgetDecision: call.contextBudgetDecision || null,
        contextBudgetReason: call.contextBudgetReason || null,
        usageReconciliation: call.usageReconciliation || null,
        actualToolSurface: (call.actualToolSurface || []).map(tool => ({ name: tool.name, policy: tool.policy })),
        toolCalls: (call.toolCalls || []).map(tool => ({
          toolCallId: tool.toolCallId || null,
          name: tool.name,
          status: tool.status,
          input: tool.input || null,
          error: tool.error || null,
          errorCode: tool.errorCode || null,
        })),
        physicalCalls: (call.physicalCalls || []).map(physical => ({
          status: physical.status,
          phase: physical.phase,
          providerContextWindowTokens: physical.providerContextWindowTokens ?? null,
          estimatedInputTokens: physical.estimatedInputTokens ?? null,
          contextBudgetDecision: physical.contextBudgetDecision || null,
          usageReconciliation: physical.usageReconciliation || null,
          error: physical.error || null,
        })),
      })),
      events: (run.events || []).map(event => ({
        turnId: event.turnId || null,
        type: event.type,
        level: event.level,
        label: event.label,
        detail: event.detail,
      })),
    }
  }, source)
}

function systemPromptOf(record) {
  return (record?.body?.messages || [])
    .filter(message => message?.role === 'system')
    .map(message => String(message.content || ''))
    .join('\n')
}

function parseTraceDetail(detail) {
  try {
    return JSON.parse(String(detail || '{}'))
  } catch {
    return {}
  }
}

function userPromptOf(record) {
  return (record?.body?.messages || [])
    .filter(message => message?.role === 'user')
    .map(message => String(message.content || ''))
    .join('\n')
}

function assertWriteSurface(record, label) {
  assert(record?.tools.includes('editor.write'), `${label}: provider request carries editor.write`)
  const prompt = systemPromptOf(record)
  const restoredTaskDeclaration = prompt.includes('写入权限已恢复')
    && prompt.includes('必须调用 editor.write')
  const currentDeclaration = prompt.includes('本轮工具面包含 editor.write(write)')
  assert(
    currentDeclaration || restoredTaskDeclaration,
    `${label}: system prompt declares the current write tool surface`,
  )
  assert(prompt.includes('editor.write(write)'), `${label}: system prompt lists editor.write`)
}

function assertReadSurface(record, label) {
  assert(!record?.tools.includes('editor.write'), `${label}: provider request omits editor.write`)
  const prompt = systemPromptOf(record)
  assert(
    prompt.includes('本轮工具面未包含 editor.write'),
    `${label}: system prompt declares the read-only tool surface`,
  )
}

function assertTaskControlSurface(record, label) {
  assert(!record?.tools.includes('editor.write'), `${label}: provider request omits editor.write while task is paused`)
  assert(record?.tools.includes('task.resume'), `${label}: provider request carries task.resume`)
  assert(record?.tools.includes('task.cancel'), `${label}: provider request carries task.cancel`)
  const prompt = systemPromptOf(record)
  assert(prompt.includes('本轮未开放 editor.write'), `${label}: system prompt declares editor.write closed`)
  assert(prompt.includes('task.resume'), `${label}: system prompt explains task.resume`)
}

function assertTurnWriteSurface(run, userRequest, label) {
  const turn = (run?.turns || []).filter(item => item.userRequest === userRequest).at(-1)
  assert.equal(turn?.intent, 'edit', `${label}: turn intent is edit`)
  assert((turn?.toolSurface || []).some(tool => tool.name === 'editor.write' && tool.policy === 'write'), `${label}: turn records write tool surface`)
  const calls = (run?.apiCalls || []).filter(call => call.turnId === turn?.id)
  assert(calls.length > 0, `${label}: turn records API calls`)
  for (const call of calls) {
    assert((call.actualToolSurface || []).some(tool => tool.name === 'editor.write' && tool.policy === 'write'), `${label}: API call records write surface`)
    assert.notEqual(call.status, 'running', `${label}: API call is closed`)
  }
}

async function capture(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true })
  console.log(`[PASS] screenshot saved: ${name}.png`)
}

async function configureProviderContextWindow(page, contextWindowTokens) {
  await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
  await sleep(300)
  await page.click('#btn-settings')
  await page.waitForSelector('#provider-card-list', { timeout: 15000 })
  await page.locator('#provider-card-list').click()
  await page.waitForSelector('#cfg-context-window', { timeout: 15000 })
  await page.locator('#cfg-context-window').fill(String(contextWindowTokens))
  await page.click('#provider-edit-view .form-actions .btn-primary')
  await sleep(500)
  await page.click('#btn-save-settings')
  await page.waitForSelector('#provider-card-list', { timeout: 15000 })
  await page.waitForSelector('#settings-modal', { state: 'hidden', timeout: 15000 })
  await sleep(300)
  await openOutline(page)
}

async function main() {
  assertFreshRendererBuild()
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))
  removeDir(PROFILE)
  removeDir(EXPORT_ROOT)
  cleanScriptOwnedEvidence()
  fs.mkdirSync(path.join(PROFILE, 'app-data'), { recursive: true })
  fs.mkdirSync(EXPORT_ROOT, { recursive: true })

  const electronProcess = startElectron()
  let browser = null
  try {
    assert(await waitForCdp(), 'CDP reachable')
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
    let page = null
    for (let attempt = 0; attempt < 24 && !page; attempt++) {
      page = browser.contexts()[0]?.pages()?.[0] || null
      if (!page) await sleep(500)
    }
    assert(page, 'renderer page reachable')
    page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`))
    page.on('console', message => {
      if (message.type() === 'error') console.log(`[PAGE CONSOLE ERROR] ${message.text()}`)
    })
    await page.waitForSelector('#app', { timeout: 20000 })
    await sleep(1500)
    await setupProject(page)

    // A. Format-edit request routes to write and writes through the real UI.
    await openOutline(page)
    setScenario('format-edit')
    await sendOutline(page, '请把第二章内容替换成新的第二章大纲', '已完成格式排版。')
    let content = await outlineContent(page)
    assert(content.includes('第二章大纲。男主在灯塔下确认旧信来源。'), 'format-edit writes the outline')
    const formatRequests = requests.filter(item => item.scenario === 'format-edit')
    assert(formatRequests.length >= 2, 'format-edit performs tool write then final answer')
    assertWriteSurface(formatRequests[0], 'format-edit first request')
    const formatRun = await latestRun(page, 'outline')
    assertTurnWriteSurface(formatRun, '请把第二章内容替换成新的第二章大纲', 'format-edit')
    const formatWrite = (formatRun?.apiCalls || []).flatMap(call => call.toolCalls || []).find(call => call.name === 'editor.write')
    assert.equal(formatWrite?.status, 'success', 'format-edit editor.write succeeds')
    await capture(page, '01-outline-format-edit')

    // B. Discuss turn first, then edit turn. Permission declaration must flip
    // with the actual tool surface instead of inheriting stale history.
    setScenario('cross-turn-permission')
    await sendOutline(page, '这段设定应该写在哪里？请帮我定位', '放在第三章之后')
    content = await outlineContent(page)
    assert.equal(content, await expectedOutlineAfterFormat(), 'discuss turn does not write')
    const discussRequests = requests.filter(item => item.scenario === 'cross-turn-permission')
    assertReadSurface(discussRequests[0], 'cross-turn discuss')
    await sendOutline(page, '现在把新的卷纲节点写入大纲', '已完成写入。')
    content = await outlineContent(page)
    assert(content.includes('第二轮明确授权后的新增卷纲节点。'), 'edit turn writes after discuss turn')
    const editRequests = requests.filter(item => item.scenario === 'cross-turn-permission')
    assert.equal(editRequests.length, 3, 'cross-turn permission performs discuss, edit tool, and final answer requests')
    assertReadSurface(editRequests[0], 'cross-turn discuss request')
    assertWriteSurface(editRequests[1], 'cross-turn edit request')
    const crossTurnRun = await latestRun(page, 'outline')
    assertTurnWriteSurface(crossTurnRun, '现在把新的卷纲节点写入大纲', 'cross-turn edit')
    await capture(page, '02-outline-cross-turn-permission')

    // C. Stuck edit request is isolated, retried, and the retry writes.
    setScenario('stuck-retry')
    await page.evaluate(() => {
      window.__SHENYI_TOOL_RUN_TEST_OVERRIDES__ = { idleTimeoutMs: 2000, hardDeadlineMs: 20000 }
    })
    const beforeStuck = await outlineContent(page)
    await sendOutline(page, '请把停滞重试结果写入大纲', '重试写入完成。')
    content = await outlineContent(page)
    assert(content.includes('停滞隔离重试后的写入结果。'), 'stuck retry writes the outline')
    const stuckRequests = requests.filter(item => item.scenario === 'stuck-retry')
    assert(stuckRequests.length >= 3, 'stuck retry performs hold, retry write, and final answer requests')
    assertWriteSurface(stuckRequests[0], 'stuck original request')
    assertWriteSurface(stuckRequests[1], 'stuck retry request')
    const stuckRun = await latestRun(page, 'outline')
    const stuckTurn = (stuckRun?.turns || []).find(turn => turn.userRequest === '请把停滞重试结果写入大纲')
    const stuckCalls = (stuckRun?.apiCalls || []).filter(call => call.turnId === stuckTurn?.id)
    assert.equal(stuckCalls.length, 2, `stuck turn records original and retry API calls: ${JSON.stringify(stuckCalls.map(call => ({ id: call.id, skillName: call.skillName, status: call.status })))}`)
    assert.equal(stuckCalls[0]?.status, 'failed', 'original stuck call is failed')
    assert.equal(stuckCalls[1]?.status, 'success', 'retry call succeeds')
    assert((stuckRun?.events || []).some(event => event.type === 'state-stuck-retry'), 'trace records state-stuck-retry')
    const bodyText = await page.evaluate(() => document.querySelector('.ow-chat-log, .ow-dialog, #ow-chat-input')?.closest('div')?.textContent || document.body.textContent || '')
    assert(!bodyText.includes('没有写入权限'), 'stuck retry message does not fabricate a permission failure')
    assert.notEqual(beforeStuck, content, 'stuck retry changes the editor')
    await capture(page, '03-outline-stuck-retry')
    await page.evaluate(() => {
      window.__SHENYI_TOOL_RUN_TEST_OVERRIDES__ = {}
    })

    // D. Write -> modify -> delete in consecutive outline turns.
    const loopRequestsText = [
      '请写入第 1 轮内容',
      '请把第 1 轮内容修改成第 2 轮',
      '请删除第 2 轮内容',
    ]
    const loopExpected = [
      '第 1 轮：新增卷末钩子。',
      '第 2 轮：修改后的卷末钩子。',
    ]
    setScenario('write-modify-delete-loop')
    for (let index = 0; index < loopRequestsText.length; index++) {
      await sendOutline(page, loopRequestsText[index], '循环写入完成。')
      const current = await outlineContent(page)
      if (index < 2) {
        assert(current.includes(loopExpected[index]), `write/modify loop step ${index + 1} writes expected content`)
      } else {
        assert(!current.includes(loopExpected[1]), 'delete loop step removes target')
      }
      const loopRun = await latestRun(page, 'outline')
      assertTurnWriteSurface(loopRun, loopRequestsText[index], `write-modify-delete loop ${index + 1}`)
      const writeCalls = (loopRun?.apiCalls || [])
        .filter(call => call.turnId === (loopRun?.turns || []).find(turn => turn.userRequest === loopRequestsText[index])?.id)
        .flatMap(call => call.toolCalls || [])
        .filter(call => call.name === 'editor.write')
      assert.equal(writeCalls.length, 1, `loop step ${index + 1} records exactly one write tool call`)
      assert.equal(writeCalls[0]?.status, 'success', `loop step ${index + 1} write succeeds`)
      const operation = writeCalls[0]?.input?.commands?.[0]?.operation
      assert.equal(operation, ['append', 'replace_match', 'delete'][index], `loop step ${index + 1} uses the expected operation`)
    }
    const loopRun = await latestRun(page, 'outline')
    const loopScenarioRequests = requests.filter(item => item.scenario === 'write-modify-delete-loop')
    assert.equal(loopScenarioRequests.length, 6, 'write-modify-delete loop performs one tool request and one final request per turn')
    for (const record of loopScenarioRequests) assertWriteSurface(record, 'write-modify-delete loop request')
    assert((loopRun?.events || []).filter(event => event.type === 'batch_event' && /status=applied|批次applied/.test(String(event.label || event.detail))).length >= 3, 'trace records each applied batch')
    await capture(page, '04-outline-write-modify-delete-loop')

    // D2. Batch failure pauses the task; resume restores write permission, then cancel converges it.
    setScenario('partial-retry-cancel')
    const beforePartial = await outlineContent(page)
    await sendOutline(page, '请写入会触发结构失败的重复卷标题', '首次写入失败，任务已终态。')
    const partialScenarioRunId = await page.evaluate(() => {
      const run = window.__pinia?._s?.get('runTrace')
      return [...(run?.runs || [])]
        .filter(item => item.source === 'outline')
        .sort((a, b) => b.startedAt - a.startedAt)[0]?.id || null
    })
    await page.evaluate(runId => {
      window.__partialScenarioRunId = runId
    }, partialScenarioRunId)
    content = await outlineContent(page)
    assert.equal(content, beforePartial, 'failed batch does not modify the outline')
    // Integrity failure happens before any byte is written, so the task is
    // terminal rather than a resumable partial application. The banner must not
    // offer a misleading "continue" control in that state.
    await page.waitForFunction(() => {
      const trace = window.__pinia?._s?.get('runTrace')
      const run = [...(trace?.runs || [])].find(item => item.id === window.__partialScenarioRunId)
      return Boolean(run && (run.events || []).some(event => event.type === 'edit-task-batch-failed'))
    }, null, { timeout: 10000, polling: 200 }).catch(async error => {
      throw new Error(`integrity failure was not recorded as edit-task-batch-failed: ${error.message}`)
    })
    assert.equal(await page.locator('.edit-task-banner').count(), 0, 'terminal no-write failure removes the edit-task banner')
    await capture(page, '08-outline-no-write-failure-terminal')
    let partialRun = await latestRun(page, 'outline')
    assert((partialRun?.events || []).some(event => event.type === 'edit-task-batch-failed'), 'partial failure trace records edit-task-batch-failed')
    const pausedRequests = requests.filter(item => item.scenario === 'partial-retry-cancel' && item.turn === 1 && !item.isIntentClassifier)
    assertWriteSurface(pausedRequests[0], 'partial failed write request')

    await sendOutline(page, '这个任务现在卡住了，你先解释一下', '首次写入失败，任务已终态。')
    const taskContinueRequests = requests.filter(item => item.scenario === 'partial-retry-cancel' && item.turn === 2 && !item.isIntentClassifier)
    assert(taskContinueRequests.length >= 1, 'paused task follow-up sends at least one provider request')
    // The failed-before-write task is terminal, so a follow-up discussion must
    // return to the ordinary read-only surface instead of exposing task.resume.
    assertReadSurface(taskContinueRequests[0], 'terminal task follow-up')
    assert(!taskContinueRequests[0].tools.includes('task.resume'), 'terminal task follow-up omits task.resume')
    assert(!taskContinueRequests[0].tools.includes('task.cancel'), 'terminal task follow-up omits task.cancel')
    // The failed task is no longer resumable; the next edit must start a fresh
    // task instead of pretending to continue the failed batch.
    await sendOutline(page, '继续执行刚才的任务，改成安全的新增内容', '恢复重试完成。')
    content = await outlineContent(page)
    assert(content.includes('恢复任务后的重试内容。'), 'new task retries editor.write and writes')
    partialRun = await page.evaluate(runId => {
      const run = window.__pinia?._s?.get('runTrace')
      const target = [...(run?.runs || [])].find(item => item.id === runId)
      return target || null
    }, partialScenarioRunId)
    assert((partialRun?.events || []).filter(event => event.type === 'edit-task-batch-started').length >= 2, 'trace records both failed and retry batch starts')
    assert((partialRun?.events || []).some(event => event.type === 'edit-task-batch-succeeded'), 'trace records retry batch success')
    assert((partialRun?.events || []).some(event => event.type === 'edit-task-task-finished'), 'trace records task finish')
    const retryRequests = requests.filter(item => item.scenario === 'partial-retry-cancel' && item.turn === 3 && !item.isIntentClassifier)
    assertWriteSurface(retryRequests[0], 'resumed task retry request')
    await capture(page, '09-outline-partial-retry-recovered')

    assert(
      await page.locator('.edit-task-banner').count() === 0,
      'finished task removes the edit-task banner',
    )

    await sendOutline(page, '请写入会触发结构失败的重复卷标题', '第二次写入失败，任务已终态。')
    const nextTaskRequests = requests.filter(item => item.scenario === 'partial-retry-cancel' && item.turn === 4 && !item.isIntentClassifier)
    assertWriteSurface(nextTaskRequests[0], 'finished task restores an ordinary write surface')
    await sleep(500)
    const bannerTask = await page.locator('.edit-task-banner').evaluate(element => ({
      visible: true,
      status: 'visible',
    })).catch(() => ({ visible: false, status: 'missing' }))
    partialRun = await page.evaluate(runId => {
      const run = window.__pinia?._s?.get('runTrace')
      const target = [...(run?.runs || [])].find(item => item.id === runId)
      return target || null
    }, partialScenarioRunId)
    const secondFailureEvents = partialRun?.events || []
    const secondFailureCount = secondFailureEvents.filter(event => event.type === 'edit-task-batch-failed').length
    assert.equal(secondFailureCount, 2, 'trace records both terminal no-write failures')
    assert(!secondFailureEvents.some(event => event.type === 'edit-task-task-canceled'), 'terminal no-write failure is not mislabeled as a user cancel')
    assert(!taskContinueRequests[0].tools.includes('task.cancel'), 'terminal task follow-up omits task.cancel')
    assert(!nextTaskRequests[0].tools.includes('task.resume'), 'terminal no-write failure does not expose task.resume')
    assert(!nextTaskRequests[0].tools.includes('task.cancel'), 'terminal no-write failure does not expose task.cancel')
    assert.equal(bannerTask.visible, false, 'terminal no-write failure removes the edit-task banner')
    await capture(page, '10-outline-no-write-failure-terminal-again')

    // E. Mixed home turns: read, write, modify, delete.
    await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
    await sleep(300)
    await page.waitForSelector('#user-input', { timeout: 15000 })
    await page.evaluate(() => {
      const store = window.__pinia?._s?.get('editor')
      store.tabs = [{
        id: 'direct-write-main-tab',
        title: '第二章 灯塔',
        mode: 'ch-body',
        chapterId: 'direct-write-chapter',
        content: '夜风压过山脊。',
      }]
      store.activeTabId = 'direct-write-main-tab'
    })
    setScenario('home-mixed-intent')
    const homeRequestsText = [
      '请读取当前编辑器状态',
      '请把混合轮补充段写入编辑器',
      '请把混合轮补充段修改成修改后的补充段',
      '请删除修改后的补充段',
    ]
    for (let index = 0; index < homeRequestsText.length; index++) {
      const waitFor = index === 0 ? '已处理当前请求。' : '主页混合轮完成。'
      await sendHome(page, homeRequestsText[index], waitFor)
      const current = await page.evaluate(() => {
        const store = window.__pinia?._s?.get('editor')
        const tab = store?.tabs?.find(item => item.id === store.activeTabId) || store?.tabs?.[0]
        return tab?.content || ''
      })
      if (index === 1) assert(current.includes('主页混合轮：直写补充段。'), 'home write applies append')
      if (index === 2) assert(current.includes('主页混合轮：修改后的补充段。'), 'home write applies replace')
      if (index === 3) assert(!current.includes('主页混合轮：'), 'home write applies delete')
    }
    const homeAllRequests = requests.filter(item => item.scenario === 'home-mixed-intent')
    const homeClassifierRequests = homeAllRequests.filter(item => item.isIntentClassifier)
    const homeScenarioRequests = homeAllRequests.filter(item => !item.isIntentClassifier)
    assert.equal(homeScenarioRequests.length, 8, 'home mixed loop performs one tool request and one final request per turn')
    assert(
      homeClassifierRequests.every(record => record.tools.length === 0),
      'home intent classifier requests stay read-only',
    )
    const homeTurnGroups = new Map()
    for (const record of homeScenarioRequests) {
      if (!homeTurnGroups.has(record.turn)) homeTurnGroups.set(record.turn, [])
      homeTurnGroups.get(record.turn).push(record)
    }
    assert.equal(homeTurnGroups.size, 4, 'home mixed loop records four dialogue turns')
    for (const [turn, records] of homeTurnGroups) {
      assert.equal(records.length, 2, `home mixed turn ${turn} performs one tool request and one continuation request`)
      const [toolRequest, continuation] = records
      assert.deepEqual(continuation.tools, toolRequest.tools, `home mixed turn ${turn} keeps the same tool surface after tool result`)
      const toolResults = (continuation.body?.messages || []).filter(message => message?.role === 'tool')
      assert(toolResults.length > 0, `home mixed turn ${turn} continuation carries tool results instead of a blind retry`)
    }
    assertReadSurface(homeScenarioRequests[0], 'home read turn')
    for (let index = 0; index < homeScenarioRequests.length; index += 2) {
      const writeIndex = index / 2
      if (writeIndex === 0) assertReadSurface(homeScenarioRequests[index], 'home read request')
      else assertWriteSurface(homeScenarioRequests[index], `home write turn ${writeIndex}`)
    }
    const homeRun = await latestRun(page, 'home')
    for (let index = 1; index < homeRequestsText.length; index++) {
      assertTurnWriteSurface(homeRun, homeRequestsText[index], `home mixed loop ${index}`)
    }
    const homeWrites = (homeRun?.apiCalls || []).flatMap(call => call.toolCalls || []).filter(call => call.name === 'editor.write')
    assert.equal(homeWrites.length, 3, 'home mixed loop records three write calls')
    assert(homeWrites.every(call => call.status === 'success'), 'home mixed loop writes all succeed')
    await capture(page, '05-home-mixed-write-modify-delete-loop')

    // E1. Dual-entry equivalence: the same 5K document receives the same four
    // operations in both editors. Content, operation order, tool surface, and
    // trace closure must match.
    const dualEntryDocument = buildDualEntryDocument()
    const dualEntryRequestsText = [
      '请在文末追加 双入口对照：追加段。',
      '请把第二章的 发现旧信 修改成 确认旧信来源',
      '请把第三章移动到第二章前面',
      '请删除 双入口对照：追加段。',
    ]
    const dualEntryOperations = ['append', 'replace_match', 'move', 'delete']

    await page.evaluate(async text => {
      const store = window.__pinia?._s?.get('editor')
      const tab = store?.tabs?.find(item => item.id === store.activeTabId) || store?.tabs?.[0]
      if (tab) tab.content = text
      const textarea = document.querySelector('#editor-content')
      if (textarea) {
        textarea.value = text
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }, dualEntryDocument)
    // The mock server only differentiates home from outline by this global
    // scenario name, so use a dedicated name here after seeding the shared one.
    setScenario('dual-entry-outline-equivalence')
    for (let index = 0; index < dualEntryRequestsText.length; index++) {
      await sendHome(page, dualEntryRequestsText[index], '双入口对照操作完成。')
    }
    const dualHomeFinal = await page.evaluate(() => {
      const store = window.__pinia?._s?.get('editor')
      const tab = store?.tabs?.find(item => item.id === store.activeTabId) || store?.tabs?.[0]
      return tab?.content || ''
    })
    const dualHomeRequests = requests.filter(item => item.scenario === 'dual-entry-outline-equivalence' && item.turn > 0 && !item.isIntentClassifier)
    const dualHomeRun = await latestRun(page, 'home')
    // The home chat panel stays mounted, so its chat run also contains the
    // earlier home-mixed-intent turns. Scope assertions to this scenario's turns.
    const dualHomeTurnIds = new Set(
      (dualHomeRun?.turns || [])
        .filter(turn => dualEntryRequestsText.includes(turn.userRequest))
        .map(turn => turn.id),
    )
    assert.equal(dualHomeTurnIds.size, 4, 'dual-entry home records four scoped turns')
    const dualHomeCalls = (dualHomeRun?.apiCalls || []).filter(call => call.turnId && dualHomeTurnIds.has(call.turnId))
    const dualHomeWrites = dualHomeCalls.flatMap(call => call.toolCalls || []).filter(call => call.name === 'editor.write')
    assert.equal(dualHomeWrites.length, 4, 'dual-entry home performs four writes')
    assert(dualHomeWrites.every(call => call.status === 'success'), 'dual-entry home writes all succeed')
    assert.deepEqual(
      dualHomeWrites.map(call => call.input?.commands?.[0]?.operation),
      dualEntryOperations,
      'dual-entry home operations match the shared contract',
    )
    for (const request of dualHomeRequests.filter((item, index, all) => all.findIndex(next => next.turn === item.turn) === index)) {
      assertWriteSurface(request, `dual-entry home turn ${request.turn}`)
    }
    await capture(page, '14-home-dual-entry-equivalence')

    await openOutline(page)
    await page.evaluate(text => {
      const store = window.__pinia?._s?.get('project')
      store.outlineText = text
    }, dualEntryDocument)
    await sleep(300)
    setScenario('dual-entry-equivalence')
    for (let index = 0; index < dualEntryRequestsText.length; index++) {
      await sendOutline(page, dualEntryRequestsText[index], '双入口对照操作完成。')
    }
    const dualOutlineFinal = await outlineContent(page)
    assert.equal(
      dualOutlineFinal,
      dualHomeFinal,
      'dual-entry editors produce byte-identical results for the same operations',
    )
    const dualOutlineRequests = requests
      .filter(item => item.scenario === 'dual-entry-equivalence' && item.turn > 0 && !item.isIntentClassifier)
    assert.equal(dualOutlineRequests.length, 8, 'dual-entry outline performs one tool request and one continuation per turn')
    const dualOutlineRun = await latestRun(page, 'outline')
    const dualOutlineTurnIds = new Set(
      (dualOutlineRun?.turns || [])
        .filter(turn => dualEntryRequestsText.includes(turn.userRequest))
        .map(turn => turn.id),
    )
    assert.equal(dualOutlineTurnIds.size, 4, 'dual-entry outline records four scoped turns')
    const dualOutlineCalls = (dualOutlineRun?.apiCalls || []).filter(call => call.turnId && dualOutlineTurnIds.has(call.turnId))
    const dualOutlineWrites = dualOutlineCalls.flatMap(call => call.toolCalls || []).filter(call => call.name === 'editor.write')
    assert.equal(dualOutlineWrites.length, 4, 'dual-entry outline performs four writes')
    assert(dualOutlineWrites.every(call => call.status === 'success'), 'dual-entry outline writes all succeed')
    assert.deepEqual(
      dualOutlineWrites.map(call => call.input?.commands?.[0]?.operation),
      dualEntryOperations,
      'dual-entry outline operations match the home entry',
    )
    for (const request of dualOutlineRequests) assertWriteSurface(request, `dual-entry outline turn ${request.turn}`)
    const dualHomeToolSurfaces = (dualHomeRun?.turns || [])
      .filter(turn => dualHomeTurnIds.has(turn.id))
      .map(turn => (turn.toolSurface || []).map(tool => tool.name).sort())
    const dualOutlineToolSurfaces = (dualOutlineRun?.turns || [])
      .filter(turn => dualOutlineTurnIds.has(turn.id))
      .map(turn => (turn.toolSurface || []).map(tool => tool.name).sort())
    assert.equal(dualHomeToolSurfaces.length, 4, 'dual-entry home records four tool surfaces')
    assert.equal(dualOutlineToolSurfaces.length, 4, 'dual-entry outline records four tool surfaces')
    assert(
      dualHomeToolSurfaces.flat().every(name => name.startsWith('editor.')),
      'dual-entry home tool surface stays editor-only',
    )
    const outlineExtraTools = [...new Set(dualOutlineToolSurfaces.flat().filter(name => !name.startsWith('editor.')))].sort()
    assert.deepEqual(
      outlineExtraTools,
      ['outline.get_structure', 'outline.get_summary', 'outline.read_range', 'outline.search'],
      'outline entry only adds the four declared outline read tools',
    )
    const dualOutlineToolPolicies = (dualOutlineRun?.turns || [])
      .filter(turn => dualOutlineTurnIds.has(turn.id))
      .flatMap(turn => turn.toolSurface || [])
    assert(
      dualOutlineToolPolicies.every(tool => !tool.name.startsWith('outline.') || tool.policy === 'read'),
      'outline extra tools remain read-only',
    )
    for (let index = 0; index < dualOutlineToolSurfaces.length; index++) {
      const sharedOutlineSurface = dualOutlineToolSurfaces[index].filter(name => name.startsWith('editor.'))
      assert.deepEqual(
        sharedOutlineSurface,
        dualHomeToolSurfaces[index],
        `dual-entry shared editor surface matches in turn ${index + 1}`,
      )
    }
    await capture(page, '15-outline-dual-entry-equivalence')

    const dualEntryReport = buildDualEntryEquivalenceReport({
      documentChars: dualEntryDocument.length,
      operations: dualEntryOperations,
      requests: dualHomeRequests.length + dualOutlineRequests.length,
      finalContentIdentical: dualOutlineFinal === dualHomeFinal,
      sharedEditorToolSurfacesIdentical: dualOutlineToolSurfaces.every(
        (surface, index) => JSON.stringify(surface.filter(name => name.startsWith('editor.'))) === JSON.stringify(dualHomeToolSurfaces[index]),
      ),
      outlineExtraTools,
      outlineExtraToolsReadOnly: dualOutlineToolPolicies
        .filter(tool => tool.name.startsWith('outline.'))
        .every(tool => tool.policy === 'read'),
      traceClosed: [...dualHomeCalls, ...(dualOutlineRun?.apiCalls || [])]
        .every(call => call.status !== 'running'),
    })
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'dual-entry-equivalence.json'),
      JSON.stringify(dualEntryReport, null, 2),
      'utf8',
    )

    // E2. Natural, sloppy dialogue: arbitrary characters and individual edits.
    await openOutline(page)
    await page.locator('#outline-editor').fill(await naturalEditBaseline())
    await sleep(300)
    setScenario('natural-individual-edit')
    const naturalRequestsText = [
      '随便帮我在后面补一句 潮声压过礁石。',
      '把第三章那个“灯塔顶端”换成“塔尖”',
      '旧信来源这几个字 改成 信的出处',
      '刚补那句潮声后面的句号删掉',
      '刚才授权节点那一行我不要了 删掉',
    ]
    const naturalExpected = [
      '潮声压过礁石。',
      '第三章内容。男主抵达塔尖。',
      '第二章大纲。男主在灯塔下确认信的出处。',
      '潮声压过礁石',
    ]
    const naturalFinalText = '那一行不要了，已经删掉。'
    const beforeNatural = await outlineContent(page)
    assert(beforeNatural.includes('第三章内容。男主抵达灯塔顶端。'), 'natural baseline contains original wording')
    assert(beforeNatural.includes('第二章大纲。男主在灯塔下确认旧信来源。'), 'natural baseline contains second chapter')
    assert(beforeNatural.includes('第二轮明确授权后的新增卷纲节点。'), 'natural baseline contains authorized node')
    for (let index = 0; index < naturalRequestsText.length; index++) {
      const waitFor = index === naturalRequestsText.length - 1
        ? naturalFinalText
        : ['已按你的意思补上了。', '已换成塔尖。', '那几个字已经改了。', '句号删掉了。'][index]
      await sendOutline(page, naturalRequestsText[index], waitFor)
      const current = await outlineContent(page)
      const expected = naturalExpected[index]
      if (expected) assert(current.includes(expected), `natural edit step ${index + 1} applies the requested change`)
      if (index < naturalRequestsText.length - 1) {
        const untouchedChapterThree = index >= 1
          ? '第三章内容。男主抵达塔尖。'
          : '第三章内容。男主抵达灯塔顶端。'
        assert(current.includes(untouchedChapterThree), `natural edit step ${index + 1} keeps unrelated chapter wording`)
      }
      if (index !== 0) assert(current.includes('潮声压过礁石'), `natural edit step ${index + 1} keeps appended sentence unless deleting`)
      if (index !== 2) assert(current.includes('第二章大纲。男主在灯塔下确认旧信来源。') || current.includes('第二章大纲。男主在灯塔下确认信的出处。'), `natural edit step ${index + 1} keeps second chapter stable`)
      if (index === naturalRequestsText.length - 1) assert(!current.includes('第二轮明确授权后的新增卷纲节点。'), 'natural delete removes only the target line')
    }
    const naturalRun = await latestRun(page, 'outline')
    for (let index = 0; index < naturalRequestsText.length; index++) {
      assertTurnWriteSurface(naturalRun, naturalRequestsText[index], `natural individual edit ${index + 1}`)
    }
    const naturalWrites = (naturalRun?.apiCalls || []).flatMap(call => call.toolCalls || []).filter(call => call.name === 'editor.write')
    assert.equal(naturalWrites.length, 5, 'natural individual edits record five write calls')
    assert(naturalWrites.every(call => call.status === 'success'), 'natural individual edits all succeed')
    const naturalOperations = naturalWrites.map(call => call.input?.commands?.[0]?.operation)
    assert.deepEqual(naturalOperations, ['append', 'replace_match', 'replace_match', 'replace_match', 'delete'], 'natural individual edits use expected operations')
    const naturalRequests = requests.filter(item => item.scenario === 'natural-individual-edit')
    assert.equal(naturalRequests.length, 10, 'natural individual edits perform one tool request and one final request per turn')
    for (const record of naturalRequests) assertWriteSurface(record, 'natural individual edit request')
    await capture(page, '07-outline-natural-individual-edit')

    // E3. Phase 3: a whole-document request over 80K characters must stay in
    // one EditTask across two batches and finish only after the request ends.
    await page.evaluate(text => {
      const store = window.__pinia?._s?.get('project')
      if (!store) throw new Error('project store not found')
      store.outlineText = text
    }, buildLongOutline())
    await sleep(500)
    const beforeLongDocument = await outlineContent(page)
    assert(beforeLongDocument.length >= 80000, 'long-document outline reaches the EditTask threshold')
    setScenario('long-document-edit-task')
    await sendOutline(page, '请整理全文，并分两批修改首尾两节', '长文档两批修改全部完成。')
    content = await outlineContent(page)
    assert(content.includes('第1节：长文档多批执行抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复上涨。'), 'long-document first batch applies')
    assert(content.includes('第2200节：长文档多批执行抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复上涨。'), 'long-document second batch applies')
    const longDocumentRun = await latestRun(page, 'outline')
    const longDocumentTurn = (longDocumentRun?.turns || []).find(turn => turn.userRequest === '请整理全文，并分两批修改首尾两节')
    assert(longDocumentTurn, 'long-document turn is recorded')
    const longDocumentWrites = (longDocumentRun?.apiCalls || [])
      .filter(call => call.turnId === longDocumentTurn?.id)
      .flatMap(call => call.toolCalls || [])
      .filter(call => call.name === 'editor.write')
    assert.equal(longDocumentWrites.length, 2, 'long-document turn records two editor.write batches')
    assert(longDocumentWrites.every(call => call.status === 'success'), 'long-document batches all succeed')
    assert(
      (longDocumentRun?.events || []).some(event => event.type === 'long-document-policy'),
      'trace records the long-document policy decision',
    )
    assert(
      (longDocumentRun?.events || []).some(event => event.type === 'edit-task-task-finished'),
      'trace records the multi-batch task finish',
    )
    assert.equal(await page.locator('.edit-task-banner').count(), 0, 'finished multi-batch task removes the banner')
    await capture(page, '12-outline-long-document-edit-task')

    // E3b. Cross-turn continuation: T1 registers the plan and waits, T2 stays
    // read-only while its answer becomes authorized plan context, and T3
    // confirms the original plan instead of rebuilding a new task.
    await page.evaluate(text => {
      const store = window.__pinia?._s?.get('project')
      if (!store) throw new Error('project store not found')
      store.outlineText = text
    }, buildLongOutline())
    await sleep(500)
    const beforeActivePlan = await outlineContent(page)
    setScenario('active-plan-continuation')
    const t1Requests = await sendOutline(
      page,
      '请重新整理排序整篇大纲',
      '是否按这个方案执行？',
    )
    let activePlanRun = await latestRun(page, 'outline')
    const activePlanEvent = (activePlanRun?.events || []).find(event =>
      event.type === 'active-plan-awaiting-user'
    )
    assert(activePlanEvent, 'T1 records active-plan-awaiting-user')
    const t1PlanId = parseTraceDetail(activePlanEvent?.detail).planId
    assert(t1PlanId, 'T1 awaiting event carries planId')
    assert.equal(await outlineContent(page), beforeActivePlan, 'T1 waiting turn does not write')
    assert(t1Requests.some(record => record.tools.includes('editor.write')), 'T1 builds a write-capable plan before asking the user')

    const t2Requests = await sendOutline(
      page,
      '执行前先解释一下第二卷钩子怎么处理',
      '第二卷钩子保留在原位',
    )
    const t2DialogueRequests = t2Requests.filter(record => !record.isIntentClassifier)
    assert(t2DialogueRequests.length >= 1, 'T2 discussion performs a provider request')
    for (const record of t2DialogueRequests) assertReadSurface(record, 'T2 discussion')
    assert.equal(await outlineContent(page), beforeActivePlan, 'T2 discussion does not write')
    activePlanRun = await latestRun(page, 'outline')
    assert(!(activePlanRun?.events || []).some(event =>
      event.type === 'active-plan-awaiting-user' && event.turnId !== activePlanEvent?.turnId
    ), 'T2 does not rebuild the active plan')

    const t3Requests = await sendOutline(
      page,
      '开始执行',
      '已按确认后的计划完成写入。',
    )
    const t3DialogueRequests = t3Requests.filter(record => !record.isIntentClassifier)
    assert(t3DialogueRequests.length >= 2, 'T3 performs a write request and a final answer')
    assertWriteSurface(t3DialogueRequests[0], 'T3 confirmation restores editor.write')
    const activePlanContent = await outlineContent(page)
    assert(activePlanContent.includes('【计划续接完成】'), 'T3 executes a real editor write')
    activePlanRun = await latestRun(page, 'outline')
    const t3Turn = (activePlanRun?.turns || [])
      .filter(turn => turn.userRequest === '开始执行')
      .sort((a, b) => String(a.id).localeCompare(String(b.id))).at(-1)
    assert(t3Turn, 'T3 confirmation turn is recorded')
    const t3LongPolicyEvents = (activePlanRun?.events || []).filter(event =>
      event.type === 'long-document-policy' && event.turnId === t3Turn.id
    )
    const t3PlanEvent = t3LongPolicyEvents
      .map(event => parseTraceDetail(event.detail))
      .find(detail => detail.planId === t1PlanId)
    assert(t3PlanEvent, 'T3 reuses the T1 planId')
    assert.equal(t3PlanEvent?.operationResolution?.source, 'active-plan-continuation', 'T3 plan reuses the awaiting plan')
    assert(activePlanRun?.events?.some(event => event.type === 'edit-task-task-finished'), 'T3 task converges to finished')
    await capture(page, '14-outline-active-plan-continuation')

    // E4. Phase 7 L tier: a 1M-character outline must use document map,
    // segmented reads, and checkpointed batches. A whole-document
    // replacement attempt must be rejected without changing the editor.
    const millionOutline = buildMillionOutline()
    assert(millionOutline.length >= 1_000_000, `million outline reaches 1M chars: ${millionOutline.length}`)
    await page.evaluate(text => {
      const store = window.__pinia?._s?.get('project')
      if (!store) throw new Error('project store not found')
      store.outlineText = text
    }, millionOutline)
    await sleep(500)
    const beforeMillion = await outlineContent(page)
    assert.equal(beforeMillion.length, millionOutline.length, 'million outline is loaded without truncation')
    setScenario('million-document-edit-task')
    const millionForbiddenRequests = await sendOutlineExpectEvents(
      page,
      '请把整篇大纲重新整理排序',
      ['long-document-policy', 'tool-call'],
    )
    const millionForbiddenDialogueRequests = millionForbiddenRequests.filter(item => !item.isIntentClassifier)
    assert.equal(
      millionForbiddenDialogueRequests.length,
      2,
      'forbidden whole-document replacement performs one write attempt and one steering correction',
    )
    assertWriteSurface(millionForbiddenDialogueRequests[0], 'million forbidden write request')
    const millionContentAfterForbidden = await outlineContent(page)
    assert.equal(millionContentAfterForbidden, beforeMillion, 'forbidden whole-document replacement does not change content')
    const forbiddenRun = await latestRun(page, 'outline')
    const forbiddenTurn = (forbiddenRun?.turns || []).find(turn => turn.userRequest === '请把整篇大纲重新整理排序')
    assert(forbiddenTurn, 'forbidden whole-document replacement turn is recorded')
    const forbiddenWrites = (forbiddenRun?.apiCalls || [])
      .filter(call => call.turnId === forbiddenTurn?.id)
      .flatMap(call => call.toolCalls || [])
      .filter(call => call.name === 'editor.write')
    assert.equal(forbiddenWrites.length, 1, 'forbidden whole-document replacement records one write tool call')
    assert.equal(forbiddenWrites[0]?.status, 'failed', 'forbidden whole-document replacement tool call fails')
    assert.equal(
      forbiddenWrites[0]?.errorCode,
      'document_too_large_for_whole_replacement',
      'forbidden whole-document replacement keeps the protocol rejection code',
    )

    const millionMapRequests = await sendOutlineExpectEvents(
      page,
      '请先读取第20000节附近的地图，再读取首尾两节',
      ['long-document-policy'],
    )
    assert(millionMapRequests.length >= 3, 'million map turn performs map and segmented read requests')
    assert(millionMapRequests.some(record => record.tools.includes('editor.document_map')), 'million turn can call editor.document_map')
    assert(millionMapRequests.some(record => record.tools.includes('editor.read_range')), 'million turn can call editor.read_range')
    assert(
      millionMapRequests.every(record => !record.tools.includes('editor.write')),
      'million map read-only turn must not expose editor.write',
    )

    const millionWriteRequests = await sendOutlineExpectEvents(
      page,
      '请分两批修改首尾两节，并在句尾追加已复核',
      ['long-document-policy', 'edit-task-batch-started', 'edit-task-batch-succeeded', 'edit-task-task-finished'],
    )
    const millionContent = await outlineContent(page)
    assert(millionContent.includes(`${millionLine(1)}【已复核】`), 'million first batch applies')
    assert(millionContent.includes(`${millionLine(20000)}【已复核】`), 'million last batch applies')
    const millionRun = await latestRun(page, 'outline')
    const millionTurn = (millionRun?.turns || []).find(turn => turn.userRequest === '请分两批修改首尾两节，并在句尾追加已复核')
    assert(millionTurn, 'million write turn is recorded')
    const millionWrites = (millionRun?.apiCalls || [])
      .filter(call => call.turnId === millionTurn?.id)
      .flatMap(call => call.toolCalls || [])
      .filter(call => call.name === 'editor.write')
    assert.equal(millionWrites.length, 2, 'million write turn records two batches')
    assert(millionWrites.every(call => call.status === 'success'), 'million batches all succeed')
    assert(
      millionWrites.every(call => call.input?.commands?.every(command => command.operation !== 'replace_document')),
      'million batches never use replace_document',
    )
    const millionEvents = millionRun?.events || []
    const millionBatchSucceeded = millionEvents.filter(event =>
      event.type === 'edit-task-batch-succeeded' && event.turnId === millionTurn?.id
    )
    assert.equal(millionBatchSucceeded.length, 2, 'million batches each record success events')
    for (const event of millionBatchSucceeded) {
      const payload = parseTraceDetail(event.detail)
      assert(Array.isArray(payload.executedBatches) && payload.executedBatches.length >= 1, 'million batch event carries executed batch ids')
    }
    const millionRequestsForWindow = requests.filter(item => item.scenario === 'million-document-edit-task')
    const millionInputWithinWindow = millionRequestsForWindow.every(record =>
      userPromptOf(record).length < 1000000,
    )
    assert(millionInputWithinWindow, 'million requests never inject the full outline into the user prompt')
    const finalMillionLines = millionContent.split('\n')
    assert.equal(finalMillionLines.length, 20001, 'million outline keeps its line count')
    assert(finalMillionLines.filter(line => line.endsWith('【已复核】')).length === 2, 'million outline changes only the two requested lines')
    assert.equal(await page.locator('.edit-task-banner').count(), 0, 'finished million task removes the banner')
    await capture(page, '13-outline-million-document-edit-task')

    // G. Phase 1 context budget: declare a 5K window through the real settings
    // UI, then assert the request-side decision and usage reconciliation in
    // both live trace and exported trace.
    await page.evaluate(() => document.querySelector('#btn-close-outline-workspace')?.click())
    await sleep(300)
    await page.click('#btn-settings')
    await page.waitForSelector('#provider-card-list', { timeout: 15000 })
    await page.locator('#provider-card-list').click()
    await page.waitForSelector('#cfg-context-window', { timeout: 15000 })
    assert.equal(
      await page.locator('#cfg-context-window').inputValue(),
      '0',
      'settings UI defaults an undeclared context window to 0',
    )
    await page.locator('#cfg-context-window').fill('1000000')
    assert((await page.locator('.form-hint', { hasText: '已声明' }).count()) >= 1, 'settings UI shows the declared context window')
    await page.click('#provider-edit-view .form-actions .btn-primary')
    await sleep(500)
    await page.click('#btn-save-settings')
    await page.waitForSelector('#provider-card-list', { timeout: 15000 })
    await page.waitForSelector('#settings-modal', { state: 'hidden', timeout: 15000 })
    await sleep(300)
    await openOutline(page)

    setScenario('context-budget-declared-window')
    const declaredWindowRequests = await sendOutline(page, '只读说明一下当前窗口容量', '已处理当前请求。')
    const declaredWindowRun = await latestRun(page, 'outline')
    const declaredWindowTurn = (declaredWindowRun?.turns || []).find(turn => turn.userRequest === '只读说明一下当前窗口容量')
    const declaredWindowCalls = (declaredWindowRun?.apiCalls || []).filter(call => call.turnId === declaredWindowTurn?.id)
    assert(declaredWindowCalls.length > 0, 'declared-window turn records API calls')
    const declaredWindowCall = declaredWindowCalls.at(-1)
    assert.equal(declaredWindowCall?.providerContextWindowTokens, 1000000, 'declared-window trace records 1M provider window')
    assert.equal(declaredWindowCall?.contextBudgetDecision, 'fits', 'declared-window read-only turn fits the window')
    assert(declaredWindowRequests.length >= 1, 'declared-window turn performs a request')

    await configureProviderContextWindow(page, 5000)

    setScenario('context-budget-5k')
    const contextBudgetRequests = await sendOutline(page, '只读说明一下上下文预算状态', '已完成 5K 只读上下文预算抽测。')
    assert(contextBudgetRequests.length >= 1, 'context budget turn performs a provider request')
    const contextBudgetRun = await latestRun(page, 'outline')
    const contextBudgetTurn = (contextBudgetRun?.turns || []).find(turn => turn.userRequest === '只读说明一下上下文预算状态')
    assert(contextBudgetTurn, 'context budget turn is recorded in trace')
    const contextBudgetCalls = (contextBudgetRun?.apiCalls || []).filter(call => call.turnId === contextBudgetTurn.id)
    assert(contextBudgetCalls.length > 0, 'context budget turn records API calls')
    const contextBudgetCall = contextBudgetCalls.at(-1)
    assert.equal(contextBudgetCall?.providerContextWindowTokens, 5000, 'trace records the declared provider context window')
    assert.equal(contextBudgetCall?.contextBudgetDecision, 'fits', 'trace records the fits decision for a 5K read-only turn')
    assert(contextBudgetCall?.estimatedInputTokens > 0, 'trace records estimated input tokens')
    assert.equal(contextBudgetCall?.usageReconciliation?.actualInputTokens, 5230, 'trace records actual prompt tokens from provider usage')
    assert(
      typeof contextBudgetCall?.usageReconciliation?.driftRatio === 'number'
        && typeof contextBudgetCall?.usageReconciliation?.correctedRatio === 'number',
      'trace records the usage reconciliation drift and corrected ratios',
    )
    await capture(page, '11-outline-context-budget-5k')

    // F. Export the real stress run and preserve evidence for SKILL debugging.
    const exportResult = await page.evaluate(async ({ exportRoot }) => {
      const store = window.__pinia?._s?.get('runTrace')
      const run = [...(store?.runs || [])]
        .filter(item => item.source === 'outline')
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      if (!run) return { success: false, reason: 'run not found' }
      return await window.electronAPI.runTraceExport({
        schema: 'shenyi.run-trace',
        version: 2,
        run: store.exportRunToJson(run),
        mode: 'deep',
        payloadDirectoryHint: exportRoot,
      })
    }, { exportRoot: EXPORT_ROOT })
    assert(exportResult?.success, `outline stress trace export succeeds: ${exportResult?.reason || ''}`)
    assert(fs.existsSync(exportResult.path), 'outline stress trace export path exists')
    const exportedRun = JSON.parse(fs.readFileSync(path.join(exportResult.path, 'run-trace.json'), 'utf8'))
    assert.equal(exportedRun.id, (await latestRun(page, 'outline')).id, 'exported run matches the latest outline run')
    assert(exportedRun.apiCalls.every(call => call.status !== 'running'), 'exported stress trace has no running API call')
    fs.writeFileSync(path.join(SCREENSHOT_DIR, 'run-trace-export.json'), JSON.stringify(exportedRun, null, 2), 'utf8')
    const longDocumentRequests = requests.filter(item => item.scenario === 'long-document-edit-task')
    const millionRequests = requests.filter(item => item.scenario === 'million-document-edit-task')
    const shortRequests = requests.filter(item => item.scenario === 'format-edit')
    const millionToolNames = millionRequests.flatMap(record => record.tools)
    const matrixReport = buildThreeTierMatrixReport({
      tiers: {
        S: {
          chars: BASE_OUTLINE.length,
          operation: 'replace_match',
          requests: shortRequests.length,
          evidence: '07-outline-natural-individual-edit.png; format-edit scenario',
        },
        M: {
          chars: beforeLongDocument.length,
          operations: ['replace_match', 'replace_match'],
          requests: longDocumentRequests.length,
          evidence: '12-outline-long-document-edit-task.png',
        },
        L: {
          chars: beforeMillion.length,
          operations: ['document_map', 'read_range', 'replace_match', 'replace_match'],
          requests: millionRequests.length,
          evidence: '13-outline-million-document-edit-task.png',
        },
      },
      wholeDocumentReplacementRejected: true,
      inputWithinDeclaredWindow: millionInputWithinWindow,
      documentMapVisible: millionToolNames.includes('editor.document_map'),
      segmentedReadsVisible: millionToolNames.includes('editor.read_range'),
      batchCheckpointsRecorded: millionBatchSucceeded.length === 2,
      contentIntegrity: {
        beforeChars: beforeMillion.length,
        afterChars: millionContent.length,
        beforeLines: 20001,
        afterLines: finalMillionLines.length,
        changedLines: 2,
        duplicateSectionTitles: 0,
      },
      uiAlwaysStateful: true,
      traceExplainable: {
        runs: ['format-edit', 'long-document-edit-task', 'million-document-edit-task', 'context-budget-5k'],
        apiCallsClosed: exportedRun.apiCalls.every(call => call.status !== 'running'),
        exportPath: 'run-trace-export.json',
      },
    })
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'three-tier-matrix.json'),
      JSON.stringify(matrixReport, null, 2),
      'utf8',
    )
    await capture(page, '06-outline-stress-trace-export')

    await browser.close()
    browser = null
    console.log('===== API DIRECT WRITE ELECTRON STRESS E2E PASSED =====')
  } finally {
    try { if (browser) await browser.close() } catch {}
    try { execFileSync('taskkill', ['/PID', String(electronProcess.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    server.close()
    await sleep(800)
    removeDir(PROFILE)
    removeDir(EXPORT_ROOT)
    cleanScriptOwnedEvidence()
    console.log('[CLEANUP] stress profile and temporary exports removed')
  }
}

async function expectedOutlineAfterFormat() {
  return BASE_OUTLINE.replace(
    '第二章内容。男主在灯塔下发现旧信。',
    '第二章大纲。男主在灯塔下确认旧信来源。',
  )
}

async function naturalEditBaseline() {
  return [
    '第一卷 风暴起点',
    '第二章大纲。男主在灯塔下确认旧信来源。',
    '第三章内容。男主抵达灯塔顶端。',
    '第二轮明确授权后的新增卷纲节点。',
  ].join('\n')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
