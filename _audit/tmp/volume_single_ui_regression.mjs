import { _electron as electron } from 'playwright'
import fs from 'node:fs'

const result = {
  startedAt: new Date().toISOString(),
  mode: 'electron-source-ui',
  apiCalls: [],
  checks: [],
  screenshots: [],
  ok: false
}

function check(name, passed, detail) {
  result.checks.push({ name, passed, detail })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`)
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ''}`)
}

function makeSSE(text) {
  const chunks = []
  for (let i = 0; i < text.length; i += 24) {
    chunks.push(JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 24) } }] }))
  }
  chunks.push('[DONE]')
  return chunks.map(c => `data: ${c}\n\n`).join('') + 'data: [DONE]\n\n'
}

const firstVolumes = [
  { name: '第一卷 契约觉醒', outline: '1. 契约觉醒；2. 迷雾古城', summary: '主角获得契约并进入古城。', allocatedWords: 100000 },
  { name: '干扰卷A', outline: '不应进入正文', summary: '模型越界返回的第一项干扰。', allocatedWords: 100000 },
  { name: '干扰卷B', outline: '不应进入正文', summary: '模型越界返回的第二项干扰。', allocatedWords: 100000 }
]

const continueVolumes = [
  { name: '第二卷 潮汐断层', outline: '1. 潮汐断层；2. 深海信标', summary: '进入深海并发现信标。', allocatedWords: 100000 },
  { name: '第三卷 王座回响', outline: '1. 王座回响；2. 终局信标', summary: '回收伏笔并进入终局。', allocatedWords: 100000 }
]

let volumeMockPayload = firstVolumes

const projectName = `PW-卷纲闭环-${Date.now()}`
let electronApp
let page
let originalProviderConfig
let originalLastProjectId
let createdProjectId

async function storageRead(key) {
  return await page.evaluate(async key => await window.electronAPI.storageRead(key), key)
}

async function storageWrite(key, value) {
  await page.evaluate(async ({ key, value }) => await window.electronAPI.storageWrite(key, value), { key, value })
}

async function storageRemove(key) {
  await page.evaluate(async key => await window.electronAPI.storageRemove(key), key)
}

async function waitForGenerationDone() {
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#pl-volume-generation-overlay')
    if (!overlay) return false
    return Array.from(overlay.querySelectorAll('button')).some(b => b.textContent.trim() === '关闭')
  }, null, { timeout: 60000 })
}

async function navigateToVolumeLayer() {
  await page.locator('#btn-pipeline').click()
  await page.locator('#pipeline-panel').waitFor({ state: 'visible' })
  await page.locator('#pl-steps .pl-step').nth(2).click()
  await page.locator('#pl-volume-generation-overlay').waitFor({ state: 'hidden' })
  return page.locator('.pl-volume-row').count()
}

async function openPipelinePanel() {
  // 项目创建/刷新后 activePanel 为空；流水线是 v-if 面板，必须先走真实入口。
  await page.locator('#btn-pipeline').waitFor({ state: 'visible' })
  await page.locator('#btn-pipeline').click()
  await page.locator('#pipeline-panel').waitFor({ state: 'visible' })
  await page.locator('#pl-outline').waitFor({ state: 'visible' })
}

try {
  electronApp = await electron.launch({
    args: ['.', '--dev'],
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'development' }
  })
  // dev 模式下应用会自动打开 DevTools，firstWindow() 可能拿到 DevTools 窗口，
  // 必须按 URL 过滤出真实应用窗口。
  for (let i = 0; i < 40; i++) {
    page = electronApp.windows().find(w => /^https?:\/\/localhost:5173/.test(w.url()))
    if (page) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!page) throw new Error('未找到 localhost:5173 应用窗口（只拿到 DevTools 或空窗口）')
  page.on('pageerror', err => console.log('[pageerror]', err.message))
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => !!window.electronAPI)

  originalProviderConfig = await storageRead('wa_providers')
  originalLastProjectId = await storageRead('wa_lastProjectId')

  await storageWrite('wa_providers', {
    providers: [{
      id: 'pw_volume_provider',
      name: 'Playwright卷纲供应商',
      baseUrl: 'https://mock-volume.local',
      apiKey: 'pw-test-key',
      models: ['pw-volume-model'],
      selectedModel: 'pw-volume-model',
      temperature: 0.2,
      maxTokens: 8192,
      purpose: ['generate'],
      streamMode: true
    }],
    generateProvider: 'pw_volume_provider',
    verifyProvider: null,
    detectProvider: null
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.electronAPI)

  await page.route('https://mock-volume.local/v1/chat/completions', async route => {
    const request = route.request()
    const body = JSON.parse(request.postData() || '{}')
    const userPrompt = body.messages?.map(m => m.content).join('\n') || ''
    const isSingleFirst = userPrompt.includes('请只生成第1卷')
    const isContinue = userPrompt.includes('请继续生成第2卷到第3卷')
    const isOutlineStyle = userPrompt.includes('请分析以下小说大纲的写作风格和节奏特征')
    result.apiCalls.push({
      at: new Date().toISOString(),
      userPrompt,
      isSingleFirst,
      isContinue,
      stream: body.stream
    })
    // 卷纲层可能启用 SKILL chain：首步携带构建后的业务 prompt，
    // 后续 chain 步只携带上一步输出。Mock 必须按“当前生成阶段”返回，
    // 不能按单条 prompt 文本判断，否则中间步骤会返回空数组并污染最终结果。
    const payload = isOutlineStyle
      ? [{ styleTags: '快节奏', pacingParams: '紧张度:3' }]
      : volumeMockPayload
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: makeSSE(JSON.stringify(payload))
    })
  })

  await page.locator('#btn-open-project').click()
  await page.getByText('项目管理', { exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '+ 新建项目' }).click()
  await page.locator('input[placeholder="项目名称（可选）"]').fill(projectName)
  await page.locator('textarea[placeholder="大纲内容（可选）"]').fill('测试大纲')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  // 已有项目加载时，点击“创建”才会触发过渡确认；必须在此处理而不是展开表单后。
  const transitionAfterCreate = page.locator('.project-transition-confirm')
  if (await transitionAfterCreate.isVisible().catch(() => false)) {
    await transitionAfterCreate.getByRole('button', { name: '保存并继续' }).click()
  }
  await page.locator('.modal-content.project-modal-content').waitFor({ state: 'hidden' })
  createdProjectId = await storageRead('wa_lastProjectId')

  await openPipelinePanel()
  await page.locator('#pl-outline').fill('主线：少年获得契约，穿过古城，找到深海信标，最终面对王座回响。')
  await page.locator('#pl-book-word-count').fill('30')
  await page.locator('#btn-pl-confirm-outline').click()
  await page.locator('#pl-steps .pl-step').nth(2).click()

  await page.locator('#btn-pl-gen-single-volume').click()
  await page.locator('#pl-volume-generation-overlay').waitFor({ state: 'visible' })
  check('生成反馈为单一弹窗', (await page.locator('.pl-generation-feedback-overlay:visible').count()) === 1, '真实 Electron UI')
  await waitForGenerationDone()
  const singleCall = result.apiCalls.find(c => c.isSingleFirst)
  check('逐卷请求命中第1卷', singleCall?.isSingleFirst === true, singleCall?.userPrompt?.slice(-120) || '')
  check('逐卷硬钳制为1卷', (await page.locator('.pl-volume-row').count()) === 1, '模型越界返回3项')
  const firstVolumeRow = page.locator('.pl-volume-row', { hasText: '第一卷 契约觉醒' })
  check(
    '第一卷出现在UI',
    await firstVolumeRow.isVisible(),
    `rows=${await firstVolumeRow.count()} text=${(await firstVolumeRow.count()) ? await firstVolumeRow.first().textContent() : ''}`
  )

  volumeMockPayload = continueVolumes

  await page.locator('#pl-volume-generation-overlay button', { hasText: '关闭' }).click()
  await page.locator('#pl-volume-generation-overlay').waitFor({ state: 'hidden' })

  const continueButton = page.locator('#btn-pl-continue-volume-0')
  check('第一卷出现续生成入口', await continueButton.isVisible(), 'btn-pl-continue-volume-0')
  await continueButton.click()
  await page.locator('#pl-volume-generation-overlay').waitFor({ state: 'visible' })
  await waitForGenerationDone()
  const continueCall = result.apiCalls.find(c => c.isContinue)
  check('续生成请求携带上一卷锚点', continueCall?.isContinue === true, continueCall?.userPrompt?.slice(-160) || '')
  check('续生成补齐到3卷', (await page.locator('.pl-volume-row').count()) === 3, '模型越界返回2项，剩余2卷')
  const thirdVolumeRow = page.locator('.pl-volume-row', { hasText: '第三卷 王座回响' })
  check(
    '第三卷出现在UI',
    await thirdVolumeRow.isVisible(),
    `rows=${await thirdVolumeRow.count()} text=${(await thirdVolumeRow.count()) ? await thirdVolumeRow.first().textContent() : ''}`
  )

  await page.locator('#pl-volume-generation-overlay button', { hasText: '关闭' }).click()
  await page.locator('#pl-volume-generation-overlay').waitFor({ state: 'hidden' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.electronAPI)
  await openPipelinePanel()
  await page.locator('#pl-steps .pl-step').nth(2).click()
  const persistedCount = await page.locator('.pl-volume-row').count()
  check('关闭重启后3卷持久化', persistedCount === 3, `Electron storage volume rows=${persistedCount}`)
  const persistedFirstRow = page.locator('.pl-volume-row', { hasText: '第一卷 契约觉醒' })
  check('重启后第一卷内容仍在', await persistedFirstRow.isVisible(), 'Electron持久化')

  result.ok = true
} catch (error) {
  result.ok = false
  result.error = error.stack || error.message
  console.error('[TEST ERROR]', error)
} finally {
  try {
    if (page) {
      await page.screenshot({ path: '_audit/tmp/volume_single_ui_final.png', fullPage: false, timeout: 15000 })
      result.screenshots.push('_audit/tmp/volume_single_ui_final.png')
      if (originalProviderConfig === null) await storageRemove('wa_providers')
      else await storageWrite('wa_providers', originalProviderConfig)
      if (originalLastProjectId === null) await storageRemove('wa_lastProjectId')
      else await storageWrite('wa_lastProjectId', originalLastProjectId)
      if (createdProjectId && createdProjectId !== originalLastProjectId) {
        for (const key of [
          'wa_project_' + createdProjectId,
          'wa_project-' + createdProjectId,
          'project_' + createdProjectId,
          'project-' + createdProjectId
        ]) {
          await storageRemove(key)
        }
      }
    }
  } catch (cleanupError) {
    console.error('[CLEANUP ERROR]', cleanupError)
  }
  fs.writeFileSync('_audit/tmp/volume_single_ui_result.json', JSON.stringify(result, null, 2), 'utf8')
  process.exit(result.ok ? 0 : 1)
}
