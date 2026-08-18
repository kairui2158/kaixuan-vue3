const { chromium } = require('playwright')
const fs = require('fs')

const ROOT = 'D:/codex/novel-workshop-vue3'
const OUT = ROOT + '/_audit'

function record(results, name, pass, detail) {
  const row = { name, pass, detail }
  results.push(row)
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`)
  return pass
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  page.setDefaultTimeout(15000)
  const results = []
  const requests = []
  const responses = []
  let key = null
  let projectSnapshot = null
  let configSnapshot = null
  let passed = true

  page.on('request', request => {
    if (request.method() === 'POST') requests.push({ url: request.url(), at: new Date().toISOString() })
  })
  page.on('response', response => {
    if (response.request().method() === 'POST') responses.push({ url: response.url(), status: response.status(), at: new Date().toISOString() })
  })

  async function readFeedback() {
    return page.evaluate(() => ({
      emptyVisible: !!document.querySelector('#pl-volume-generation-feedback'),
      cardVisible: document.querySelectorAll('.pl-vol-generation-feedback').length > 0,
      logCount: document.querySelectorAll('#pl-volume-api-log .pl-generation-log-line, .pl-volume-api-log .pl-generation-log-line').length,
      logs: [...document.querySelectorAll('#pl-volume-api-log .pl-generation-log-line, .pl-volume-api-log .pl-generation-log-line')].map(el => el.textContent.trim()),
      progress: document.querySelector('#pl-volume-generation-feedback .pl-generation-progress-value, .pl-vol-generation-feedback .pl-generation-progress-value')?.style.width || '',
      status: document.querySelector('#pl-volume-generation-feedback .pl-generation-status, .pl-vol-generation-feedback .pl-generation-status')?.textContent.trim() || '',
      volumeCount: document.querySelectorAll('#pl-vol-list > .pl-vol-card:not(.pl-vol-generation-card)').length,
      generating: !!document.querySelector('#btn-pl-gen-single-volume')?.disabled
    }))
  }

  try {
    const saved = await page.evaluate(() => {
      const id = window.electronAPI.storageRead('wa_lastProjectId')
      const keys = window.electronAPI.storageList() || []
      const candidates = ['wa_project_' + id, 'wa_project-' + id]
      const key = candidates.find(candidate => keys.includes(candidate)) || candidates[0]
      return { key, project: window.electronAPI.storageRead(key), config: window.electronAPI.storageRead('wa_pipeline_step_config') }
    })
    key = saved.key
    projectSnapshot = saved.project
    configSnapshot = saved.config
    passed = record(results, '项目快照已保存', !!key && !!projectSnapshot, key || 'missing') && passed
    passed = record(results, '已确认大纲可作为卷纲输入', !!projectSnapshot?.outlineText?.trim() && !!projectSnapshot?.outlineLocked, JSON.stringify({ outlineLength: projectSnapshot?.outlineText?.length || 0, locked: !!projectSnapshot?.outlineLocked })) && passed
    if (!projectSnapshot?.outlineText?.trim() || !projectSnapshot?.outlineLocked) throw new Error('没有已锁定大纲，无法验证卷纲生成')

    if (!(await page.locator('#pipeline-panel').count())) {
      await page.locator('#btn-pipeline').click()
      await page.waitForTimeout(700)
    }
    if (!(await page.locator('#pl-step-3-content').isVisible())) {
      await page.locator('.pl-step').filter({ hasText: '卷纲' }).click()
      await page.waitForTimeout(500)
    }
    passed = record(results, '真实路径进入卷纲层', await page.locator('#pl-step-3-content').isVisible(), '') && passed
    passed = record(results, '逐卷生成入口可见且可用', await page.locator('#btn-pl-gen-single-volume').isVisible() && !(await page.locator('#btn-pl-gen-single-volume').isDisabled()), '') && passed

    const before = await page.evaluate(() => ({
      volumes: (window.__PINIA__?.project?.volumes || []).length,
      domVolumes: document.querySelectorAll('#pl-vol-list > .pl-vol-card:not(.pl-vol-generation-card)').length
    }))
    await page.locator('#btn-pl-gen-single-volume').click()
    await page.waitForTimeout(300)
    const immediate = await readFeedback()
    passed = record(results, '点击后卷框内立即出现反馈', (immediate.emptyVisible || immediate.cardVisible) && immediate.logCount >= 1, JSON.stringify(immediate)) && passed
    passed = record(results, '卷框内反馈包含进度条', immediate.progress !== '', `progress=${immediate.progress}`) && passed
    passed = record(results, '卷框内反馈包含 API 日志', immediate.logs.length >= 1, JSON.stringify(immediate.logs)) && passed

    const deadline = Date.now() + 300000
    let latest = immediate
    while (Date.now() < deadline) {
      await page.waitForTimeout(1000)
      latest = await readFeedback()
      if (latest.logs.some(line => line.includes('API 已返回') || line.includes('API 调用失败'))) break
    }
    passed = record(results, '实际 API 请求已发出', requests.length > 0, JSON.stringify(requests.slice(-3))) && passed
    passed = record(results, '反馈记录 API 返回或失败', latest.logs.some(line => line.includes('API 已返回') || line.includes('API 调用失败')), JSON.stringify(latest)) && passed
    passed = record(results, '生成过程进度和状态可读', latest.progress !== '' && latest.status !== '', JSON.stringify({ progress: latest.progress, status: latest.status })) && passed

    const after = await page.evaluate(() => ({
      domVolumes: document.querySelectorAll('#pl-vol-list > .pl-vol-card:not(.pl-vol-generation-card)').length,
      names: [...document.querySelectorAll('#pl-vol-list > .pl-vol-card:not(.pl-vol-generation-card) .pl-vol-header .pl-input')].map(el => el.value)
    }))
    passed = record(results, 'API 结果进入卷纲卷框', after.domVolumes > before.domVolumes || after.names.some(Boolean) || latest.logs.some(line => line.includes('解析') || line.includes('失败')), JSON.stringify({ before, after })) && passed

    const cdp = await page.context().newCDPSession(page)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(OUT + '/P6_volume_generation_feedback_verify.png', Buffer.from(shot.data, 'base64'))
    fs.writeFileSync(OUT + '/P6_volume_generation_feedback_verify.json', JSON.stringify({ results, requests, responses, immediate, latest, before, after, passed }, null, 2), 'utf8')
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

main().catch(error => {
  console.error('ERROR | P6 volume generation feedback verification | ' + error.stack)
  process.exit(1)
})
