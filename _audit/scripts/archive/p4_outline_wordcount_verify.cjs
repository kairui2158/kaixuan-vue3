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
  let original = null
  let projectKey = null
  let projectSnapshot = null
  let configSnapshot = null

  try {
    original = await page.evaluate(() => ({
      activePanel: document.querySelector('.sidebar-btn.active')?.getAttribute('data-tooltip') || '',
      pipelineOpen: !!document.querySelector('#pipeline-panel'),
      step: document.querySelector('.pl-step.active')?.textContent?.trim() || '',
      outline: document.querySelector('#pl-outline')?.value || '',
      wordCount: document.querySelector('#pl-book-word-count')?.value || ''
    }))

    const storage = await page.evaluate(() => {
      const keys = window.electronAPI.storageList() || []
      const lastId = window.electronAPI.storageRead('wa_lastProjectId')
      const candidates = keys.filter(k => k === 'wa_project_' + lastId || k === 'wa_project-' + lastId)
      const key = candidates[0] || null
      return { keys, lastId, key, data: key ? window.electronAPI.storageRead(key) : null, config: window.electronAPI.storageRead('wa_pipeline_step_config') }
    })
    projectKey = storage.key
    projectSnapshot = storage.data
    configSnapshot = storage.config
    passed = log('当前项目可读取', !!projectKey && !!projectSnapshot, projectKey || '没有当前项目') && passed
    passed = log('当前项目存在大纲', !!projectSnapshot?.outlineText?.trim(), `长度=${projectSnapshot?.outlineText?.length || 0}`) && passed
    if (!projectKey || !projectSnapshot?.outlineText?.trim()) throw new Error('没有可验证的大纲项目，停止，不创建临时项目')

    if (!original.pipelineOpen) {
      await page.locator('#btn-pipeline').click()
      await page.waitForTimeout(500)
    }
    passed = log('从主页打开生成流水线', await page.locator('#pipeline-panel').isVisible(), '') && passed

    const outlineStep = page.locator('#pl-step-1-content')
    passed = log('进入流水线大纲层', await outlineStep.isVisible(), '') && passed
    const outlineActions = page.locator('#pl-step-1-content .pl-actions button')
    passed = log('大纲层底部唯一确认按钮', await outlineActions.count() === 1 && await page.locator('#btn-pl-confirm-outline').count() === 1, await outlineActions.allTextContents()) && passed
    passed = log('唯一按钮文案正确', (await page.locator('#btn-pl-confirm-outline').textContent()).trim() === '确认字数并进入下一步', (await page.locator('#btn-pl-confirm-outline').textContent()).trim()) && passed

    const outline = page.locator('#pl-outline')
    passed = log('锁定大纲只读', await outline.getAttribute('readonly') !== null, `readonly=${await outline.getAttribute('readonly')}`) && passed

    const count = page.locator('#pl-book-word-count')
    const beforeDisabled = await page.locator('#btn-pl-confirm-outline').isDisabled()
    passed = log('字数未确认前按钮受约束', beforeDisabled, `disabled=${beforeDisabled}`) && passed
    await count.fill('60')
    await count.dispatchEvent('change')
    await page.waitForTimeout(250)
    const afterDisabled = await page.locator('#btn-pl-confirm-outline').isDisabled()
    passed = log('填写总字数后按钮可用', !afterDisabled, `disabled=${afterDisabled}`) && passed

    await page.locator('#btn-pl-confirm-outline').click()
    await page.waitForTimeout(500)
    const stateAfter = await page.evaluate(() => ({
      activeStep: document.querySelector('.pl-step.active')?.textContent?.trim() || '',
      settingsVisible: !!document.querySelector('#pl-step-2-content') && getComputedStyle(document.querySelector('#pl-step-2-content')).display !== 'none',
      outlineReadonly: document.querySelector('#pl-outline')?.readOnly === true,
      project: (() => {
        const id = window.electronAPI.storageRead('wa_lastProjectId')
        const data = window.electronAPI.storageRead('wa_project_' + id) || window.electronAPI.storageRead('wa_project-' + id)
        return { outlineLocked: !!data?.outlineLocked, outlineLength: data?.outlineText?.length || 0 }
      })(),
      config: window.electronAPI.storageRead('wa_pipeline_step_config')
    }))
    passed = log('确认后跳转设定层', stateAfter.settingsVisible && stateAfter.activeStep.includes('设定'), JSON.stringify({ activeStep: stateAfter.activeStep, settingsVisible: stateAfter.settingsVisible })) && passed
    passed = log('确认后大纲锁定', stateAfter.outlineReadonly && stateAfter.project.outlineLocked, JSON.stringify(stateAfter.project)) && passed
    passed = log('总字数已持久化', stateAfter.config?.bookWordCount === 600000, JSON.stringify(stateAfter.config)) && passed

    const cdp = await page.context().newCDPSession(page)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(OUT + '/P4_outline_wordcount_verify.png', Buffer.from(shot.data, 'base64'))
    fs.writeFileSync(OUT + '/P4_outline_wordcount_verify.json', JSON.stringify({ original, stateAfter, projectKey, passed }, null, 2), 'utf8')
  } finally {
    if (projectKey && projectSnapshot) {
      await page.evaluate(({ key, data, config }) => {
        window.electronAPI.storageWrite(key, data)
        if (config === null || config === undefined) window.electronAPI.storageRemove('wa_pipeline_step_config')
        else window.electronAPI.storageWrite('wa_pipeline_step_config', config)
      }, { key: projectKey, data: projectSnapshot, config: configSnapshot })
    }
    await browser.close()
  }
  if (!passed) process.exit(1)
}

main().catch(error => { console.error('ERROR | P4 outline word count verification | ' + error.stack); process.exit(1) })
