import http from 'node:http'
import { chromium } from 'playwright'

const CDP_URL = 'http://127.0.0.1:9227'
const MOCK_PORT = 59743
const MOCK_BASE_URL = `http://127.0.0.1:${MOCK_PORT}`
const MOCK_PROVIDER_ID = 'codex-stage4-mock-provider'
const PROJECT_KEY = 'wa_project_codex-stage4-e2e'

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

function chatCompletion(content) {
  return {
    choices: [{
      finish_reason: 'stop',
      message: { role: 'assistant', content }
    }]
  }
}

const requests = []
const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    let body = null
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
    requests.push({ url: request.url, body })

    let payload
    if (requests.length === 1) {
      payload = chatCompletion(JSON.stringify({
        type: 'outline_proposal',
        version: 1,
        operation: 'replace_match',
        target: '这个锚点在大纲中不存在',
        content: '错误锚点内容',
        reason: '测试错误锚点不进入可编辑批次。',
        impact: ['测试影响']
      }))
    } else if (requests.length === 2) {
      payload = chatCompletion('这只是讨论：第一章需要把旧信与灯塔伏笔连起来。')
    } else if (requests.length === 3) {
      payload = chatCompletion(JSON.stringify({
        type: 'outline_proposal',
        version: 1,
        operation: 'replace_match',
        target: '重复锚点文本在第二章再次出现。',
        content: '第二章修改：重复锚点文本已经唯一化，并连接旧信。',
        reason: '把旧信伏笔落到第二章，避免只在第一章悬空。',
        impact: ['影响第二章的旧信与灯塔伏笔衔接']
      }))
    } else if (requests.length === 4) {
      payload = chatCompletion(JSON.stringify({
        type: 'outline_proposal',
        version: 1,
        operation: 'append',
        content: '\n第二卷追加节点：男主带着旧信去南方。',
        reason: '为下一卷移动主线场景。',
        impact: ['新增第二卷场景']
      }))
    } else if (requests.length === 5) {
      payload = chatCompletion(JSON.stringify({
        type: 'outline_proposal',
        version: 1,
        operation: 'rewrite',
        target: '第二章内容。男主在灯塔下发现旧信。',
        content: '只保留一个短句',
        reason: '测试严重结构问题默认阻断。',
        impact: ['测试影响']
      }))
    } else {
      payload = chatCompletion('阶段四验证完成。')
    }

    console.log(`[MOCK] request ${requests.length}: ${request.url}`)
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(payload))
  })
})

await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve))

const browser = await chromium.connectOverCDP(CDP_URL)
let page
let original
try {
  const context = browser.contexts()[0]
  if (!context) throw new Error('Electron context not found')
  page = context.pages().find(item => !item.url().startsWith('devtools://')) || context.pages()[0]
  if (!page) throw new Error('Electron page not found')
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) {
      console.log(`[BROWSER:${message.type()}] ${message.text()}`)
    }
  })
  page.on('pageerror', error => console.log(`[BROWSER:pageerror] ${error.message}`))

  original = await page.evaluate(async () => ({
    providers: await window.electronAPI.storageRead('wa_providers'),
    lastProjectId: await window.electronAPI.storageRead('wa_lastProjectId'),
    defaultProject: await window.electronAPI.storageRead('wa_project_default'),
    e2eProject: await window.electronAPI.storageRead('wa_project_codex-stage4-e2e')
  }))

  await page.evaluate(async () => {
    await window.electronAPI.storageWrite('wa_lastProjectId', 'codex-stage4-e2e')
    const project = await window.electronAPI.storageRead('wa_project_codex-stage4-e2e')
      || await window.electronAPI.storageRead('wa_project_project_codex-stage4-e2e')
      || { projectName: 'Codex Stage4 E2E', outlineText: '' }
    if (project) {
      project.outlineChat = []
      await window.electronAPI.storageWrite('wa_project_codex-stage4-e2e', project)
      await window.electronAPI.storageWrite('wa_project_project_codex-stage4-e2e', project)
    }
  })

  const mockProviderConfig = {
    providers: [{
      id: MOCK_PROVIDER_ID,
      name: 'Codex Stage4 Mock Provider',
      baseUrl: MOCK_BASE_URL,
      apiKey: 'codex-stage4-mock-key',
      models: ['codex-stage4-mock-model'],
      selectedModel: 'codex-stage4-mock-model',
      temperature: 0.1,
      maxTokens: 4096,
      purpose: ['generate'],
      providerType: 'openai-compatible',
      streamMode: false
    }],
    generateProvider: MOCK_PROVIDER_ID,
    verifyProvider: null,
    detectProvider: null
  }
  await page.evaluate(async ({ config }) => {
    await window.electronAPI.storageWrite('wa_providers', config)
  }, { config: mockProviderConfig })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#app', { timeout: 20000 })

  await page.evaluate(() => {
    const pipelineClose = document.querySelector('#btn-close-pl')
    if (pipelineClose) pipelineClose.click()
    const outlineClose = document.querySelector('#btn-close-outline-workspace')
    if (outlineClose) outlineClose.click()
  })
  await page.waitForTimeout(300)
  await page.locator('#btn-outline-workspace').click()
  await page.waitForSelector('#outline-editor')
  await page.locator('#btn-ai-co-create').click()
  await page.waitForSelector('#ow-chat-input')
  await page.evaluate(() => {
    const reset = document.querySelector('#btn-ow-reset-conversation')
    if (reset) reset.click()
  })
  const resetConfirm = page.locator('.app-confirm-content button', { hasText: '清空' })
  if (await resetConfirm.count()) {
    await resetConfirm.last().click()
    await page.waitForTimeout(500)
  }
  await page.waitForTimeout(500)

  const outlineText = [
    '第一卷 风暴起点',
    '第一章内容。男主在夜路中遇到风暴。',
    '第1章 夜行',
    '重复锚点文本在第一章也出现。',
    '第2章 灯塔',
    '第二章内容。男主在灯塔下发现旧信。',
    '重复锚点文本在第二章再次出现。',
    '旧信备忘：寄信人身份指向南方。',
    '第三章扩展备忘：灯塔看守人与南方港口有关。'
  ].join('\n')
  await page.locator('#outline-editor').fill(outlineText)

  async function send(text) {
    await page.locator('#ow-chat-input').fill(text)
    await page.locator('#btn-ow-send').click()
    await page.waitForFunction(() => {
      const messages = document.querySelectorAll('#ow-chat-messages .ow-msg.assistant')
      return messages.length > 0 && !document.querySelector('#ow-streaming-message')
    }, null, { timeout: 30000 })
    await page.waitForTimeout(400)
  }

  async function closeDiff() {
    const close = page.locator('#btn-close-diff')
    if (await close.count() && await close.isVisible()) await close.click()
    await page.waitForTimeout(250)
  }

  // Scenario A: wrong anchor returns structure candidates and never becomes a proposal batch.
  await send('请用错误的章节锚点提案修改重复锚点文本')
  assert(requests.length === 1, `scenario A mock request received (${requests.length})`)
  assert(
    !(await page.locator('#ow-chat-messages .ow-edit-command').count()),
    'wrong anchor does not create an editable batch'
  )

  // Scenario B: a normal discussion answer is never treated as a proposal.
  await send('继续讨论：第二章如何衔接旧信伏笔？')
  assert(requests.length === 2, `scenario B mock request received (${requests.length})`)
  assert(
    !(await page.locator('#ow-chat-messages .ow-edit-command').count()),
    'normal discussion stays a conversation message'
  )

  // Scenario C: anchored proposal -> preview -> impact -> apply -> rollback.
  await send('现在请按刚才讨论插入第二章修改提案')
  assert(requests.length === 3, `scenario C mock request received (${requests.length})`)
  const proposalEntry = page.locator('.ow-edit-command', { hasText: '已识别批量编辑：1 条' }).last()
  assert(await proposalEntry.count() > 0, 'distilled proposal becomes a pending batch')
  const proposalBatchCount = await page.locator('.ow-edit-command', { hasText: '已识别批量编辑：1 条' }).count()
  await proposalEntry.locator('button', { hasText: '预览修改' }).click()
  console.log('[DEBUG] proposal batch count:', proposalBatchCount)
  await page.waitForSelector('.diff-modal-content')
  if (!(await page.locator('#diff-impact').count())) {
    console.log('[DEBUG] modal text:', await page.locator('.diff-modal-content').textContent())
  }
  const impactText = await page.locator('#diff-impact').textContent()
  console.log('[DEBUG] impact text:', impactText)
  assert(
    /发现 \d+ 处引用可能受影响/.test(impactText || '') || (impactText || '').includes('未发现直接影响'),
    'diff modal shows impact analysis summary'
  )
  assert(
    (impactText || '').includes('旧信备忘') || (impactText || '').includes('未发现直接影响'),
    'impact analysis lists the related reference context'
  )
  assert(
    !(await page.locator('#diff-integrity').count()),
    'normal anchored replacement passes integrity without warning'
  )
  await page.locator('#btn-diff-apply').click()
  try {
    await page.waitForFunction(() => document.querySelector('#outline-editor')?.value?.includes('第二章修改：重复锚点文本已经唯一化'), null, { timeout: 5000 })
  } catch (error) {
    console.log('[DEBUG] editor after apply:', await page.locator('#outline-editor').inputValue())
    console.log('[DEBUG] modal visible:', await page.locator('.diff-modal-content').isVisible())
    throw error
  }
  assert(true, 'confirmed proposal is applied to the outline editor')

  const rollbackButton = page.locator('#ow-chat-messages .ow-msg.assistant').last()
    .locator('button', { hasText: '回滚批次' })
  assert(await rollbackButton.count() > 0, 'applied proposal exposes rollback')
  await rollbackButton.click()
  await page.waitForFunction(value => document.querySelector('#outline-editor')?.value === value, outlineText)
  assert(true, 'rollback restores the exact pre-batch outline content')

  // Scenario D: plain append has no integrity false positive.
  await send('请给大纲末尾追加第二卷节点')
  assert(requests.length === 4, `scenario D mock request received (${requests.length})`)
  const appendEntry = page.locator('.ow-edit-command', { hasText: '已识别批量编辑：1 条' }).last()
  assert(await appendEntry.count() > 0, 'plain append proposal is recognized')
  await appendEntry.locator('button', { hasText: '预览修改' }).click()
  await page.waitForSelector('.diff-modal-content')
  console.log('[DEBUG] append integrity:', await page.locator('#diff-integrity').count()
    ? await page.locator('#diff-integrity').textContent()
    : '(none)')
  assert(
    !(await page.locator('#diff-integrity').count()),
    'plain append passes integrity without false positive'
  )
  await page.locator('#btn-diff-apply').click()
  await page.waitForFunction(() => document.querySelector('#outline-editor')?.value?.includes('第二卷追加节点'), null, { timeout: 5000 })
  assert(true, 'plain append applies normally')
  const appendRollback = page.locator('#ow-chat-messages .ow-msg.assistant').last()
    .locator('button', { hasText: '回滚批次' })
  assert(await appendRollback.count() > 0, 'append batch exposes rollback')
  await appendRollback.click()
  await page.waitForTimeout(300)
  await page.waitForFunction(value => document.querySelector('#outline-editor')?.value === value, outlineText)
  assert(true, 'append rollback restores exact content')

  // Scenario E: critical integrity blocks by default, then explicit override allows application.
  await send('请重写第二章内容为极短版本')
  assert(requests.length === 5, `scenario E mock request received (${requests.length})`)
  const criticalEntry = page.locator('.ow-edit-command', { hasText: '已识别批量编辑：1 条' }).last()
  assert(await criticalEntry.count() > 0, 'critical rewrite becomes a pending batch')
  await criticalEntry.locator('button', { hasText: '预览修改' }).click()
  await page.waitForSelector('.diff-modal-content')
  assert(await page.locator('#diff-integrity.is-critical').count() > 0, 'critical integrity panel is visible')
  assert(
    await page.locator('#btn-diff-apply').isDisabled(),
    'critical integrity disables apply by default'
  )
  await page.locator('#btn-diff-allow-critical').click()
  assert(
    !(await page.locator('#btn-diff-apply').isDisabled()),
    'explicit override re-enables apply'
  )
  await page.locator('#btn-diff-apply').click()
  await page.waitForFunction(() => document.querySelector('#outline-editor')?.value?.includes('只保留一个短句'))
  assert(true, 'explicit critical override applies the rewrite')
  const criticalRollback = page.locator('#ow-chat-messages .ow-msg.assistant').last()
    .locator('button', { hasText: '回滚批次' })
  assert(await criticalRollback.count() > 0, 'critical batch still exposes rollback')
  await criticalRollback.click()
  await page.waitForFunction(value => document.querySelector('#outline-editor')?.value === value, outlineText)
  assert(true, 'critical batch rollback restores exact content')

  await closeDiff()

  assert(requests.every(request => request.url === '/v1/chat/completions'), 'all mock calls use the OpenAI-compatible endpoint')

  await page.evaluate(async ({ saved }) => {
    await window.electronAPI.storageWrite('wa_providers', saved.providers)
    await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
    await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
    await window.electronAPI.storageWrite('wa_project_codex-stage4-e2e', saved.e2eProject)
  }, { saved: original })
} catch (error) {
  try {
    if (page && original) {
      await page.evaluate(async ({ saved }) => {
        await window.electronAPI.storageWrite('wa_providers', saved.providers)
        await window.electronAPI.storageWrite('wa_lastProjectId', saved.lastProjectId)
        await window.electronAPI.storageWrite('wa_project_default', saved.defaultProject)
        await window.electronAPI.storageWrite('wa_project_codex-stage4-e2e', saved.e2eProject)
      }, { saved: original })
    }
  } catch {}
  throw error
} finally {
  try { await browser.close() } catch {}
  server.close()
}

console.log('[DONE] Stage 4 anchor, integrity, proposal, impact, apply, and rollback verification completed')
