const { chromium } = require('playwright')
const fs = require('fs')

const ROOT = 'D:/codex/novel-workshop-vue3'
const OUT = ROOT + '/_audit'

function log(name, pass, detail) {
  const line = `${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`
  console.log(line)
  return pass
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  page.setDefaultTimeout(15000)
  let passed = true
  let key = null
  let projectSnapshot = null
  let configSnapshot = null
  const requests = []
  const responses = []
  const feedbackSnapshots = []

  page.on('request', request => {
    if (request.url().includes('/chat/completions')) requests.push({ url: request.url(), method: request.method() })
  })
  page.on('response', response => {
    if (response.url().includes('/chat/completions')) responses.push({ url: response.url(), status: response.status() })
  })

  try {
    const saved = await page.evaluate(() => {
      const id = window.electronAPI.storageRead('wa_lastProjectId')
      const keys = window.electronAPI.storageList() || []
      const key = keys.includes('wa_project_' + id) ? 'wa_project_' + id : 'wa_project-' + id
      return { key, project: window.electronAPI.storageRead(key), config: window.electronAPI.storageRead('wa_pipeline_step_config') }
    })
    key = saved.key
    projectSnapshot = saved.project
    configSnapshot = saved.config
    passed = log('当前项目快照可保存', !!key && !!projectSnapshot, key || 'missing') && passed
    passed = log('设定层输入为已确认大纲', !!projectSnapshot?.outlineText?.trim() && !!projectSnapshot?.outlineLocked, JSON.stringify({ outline: projectSnapshot?.outlineText?.length || 0, locked: !!projectSnapshot?.outlineLocked })) && passed
    if (!key || !projectSnapshot?.outlineText?.trim() || !projectSnapshot?.outlineLocked) throw new Error('当前项目没有可用于设定生成的已锁定大纲')

    if (!(await page.locator('#pipeline-panel').count())) {
      await page.locator('#btn-pipeline').click()
      await page.waitForTimeout(500)
    }
    if (!(await page.locator('#pl-step-2-content').isVisible())) {
      await page.locator('#pl-step-1-content').isVisible().catch(() => false)
      const wordCount = page.locator('#pl-book-word-count')
      if (await wordCount.isVisible()) {
        if (Number(await wordCount.inputValue()) <= 0) await wordCount.fill('60')
        await wordCount.dispatchEvent('change')
        await page.locator('#btn-pl-confirm-outline').click()
        await page.waitForTimeout(500)
      }
    }
    passed = log('真实路径进入设定层', await page.locator('#pl-step-2-content').isVisible(), '') && passed
    const generate = page.locator('#btn-pl-gen-settings')
    passed = log('设定生成按钮可用', await generate.isVisible() && !(await generate.isDisabled()), `disabled=${await generate.isDisabled()}`) && passed

    await generate.click()
    await page.waitForTimeout(250)
    const immediate = await page.evaluate(() => ({
      visible: !!document.querySelector('#pl-settings-generation-feedback'),
      progress: document.querySelector('#pl-settings-generation-feedback .pl-generation-progress-value')?.style.width || '',
      logs: [...document.querySelectorAll('#pl-settings-api-log .pl-generation-log-line')].map(el => el.textContent.trim()),
      status: document.querySelector('#pl-settings-generation-feedback .pl-generation-status')?.textContent.trim() || ''
    }))
    feedbackSnapshots.push({ phase: 'immediate', ...immediate })
    passed = log('点击后立即显示 API 反馈面板', immediate.visible, JSON.stringify(immediate)) && passed
    passed = log('反馈面板包含进度条', immediate.visible && !!immediate.progress, `width=${immediate.progress}`) && passed
    passed = log('反馈面板包含 API 工作日志', immediate.logs.length >= 1, JSON.stringify(immediate.logs)) && passed

    const deadline = Date.now() + 180000
    while (Date.now() < deadline) {
      await page.waitForTimeout(1000)
      const snap = await page.evaluate(() => ({
        visible: !!document.querySelector('#pl-settings-generation-feedback'),
        progress: document.querySelector('#pl-settings-generation-feedback .pl-generation-progress-value')?.style.width || '',
        logs: [...document.querySelectorAll('#pl-settings-api-log .pl-generation-log-line')].map(el => el.textContent.trim()),
        status: document.querySelector('#pl-settings-generation-feedback .pl-generation-status')?.textContent.trim() || '',
        items: document.querySelectorAll('#pl-bound-settings-list .pl-setting-item').length,
        generating: !!document.querySelector('#btn-pl-gen-settings')?.disabled
      }))
      feedbackSnapshots.push({ phase: 'poll', ...snap })
      if (snap.logs.some(x => x.includes('API 已返回')) || snap.logs.some(x => x.includes('API 调用失败'))) break
    }
    const final = feedbackSnapshots[feedbackSnapshots.length - 1]
    const projectAfter = await page.evaluate(({ key }) => {
      const project = window.electronAPI.storageRead(key)
      const cats = project?.settingsCollection?.categories || []
      const items = Object.values(project?.settingsCollection?.items || {}).flat()
      return { categories: cats, itemCount: items.length, settingsGenerated: !!project?.settingsGenerated }
    }, { key })
    passed = log('API 请求实际发出', requests.length > 0, JSON.stringify(requests)) && passed
    passed = log('反馈记录 API 返回或失败结果', final.logs.some(x => x.includes('API 已返回') || x.includes('API 调用失败')), JSON.stringify(final)) && passed
    passed = log('反馈面板状态与进度可读', final.visible && final.progress !== '', JSON.stringify({ progress: final.progress, status: final.status })) && passed
    passed = log('生成结果进入设定分类或明确报告解析失败', projectAfter.itemCount > 0 || final.logs.some(x => x.includes('解析')), JSON.stringify(projectAfter)) && passed

    const cdp = await page.context().newCDPSession(page)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(OUT + '/P5_settings_generation_feedback_verify.png', Buffer.from(shot.data, 'base64'))
    fs.writeFileSync(OUT + '/P5_settings_generation_feedback_verify.json', JSON.stringify({ requests, responses, immediate, final, projectAfter, feedbackSnapshots: feedbackSnapshots.slice(-8), passed }, null, 2), 'utf8')
  } finally {
    if (key && projectSnapshot) {
      await page.evaluate(({ key, project, config }) => {
        window.electronAPI.storageWrite(key, project)
        if (config === null || config === undefined) window.electronAPI.storageRemove('wa_pipeline_step_config')
        else window.electronAPI.storageWrite('wa_pipeline_step_config', config)
        location.reload()
      }, { key, project: projectSnapshot, config: configSnapshot })
      await page.waitForTimeout(1200)
    }
    await browser.close()
  }
  if (!passed) process.exit(1)
}

main().catch(error => { console.error('ERROR | P5 settings generation feedback verification | ' + error.stack); process.exit(1) })
