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
  let passed = true
  let projectKey = null
  let projectSnapshot = null
  let configSnapshot = null

  try {
    const saved = await page.evaluate(() => {
      const id = window.electronAPI.storageRead('wa_lastProjectId')
      const keys = window.electronAPI.storageList() || []
      const candidates = ['wa_project_' + id, 'wa_project-' + id]
      const key = candidates.find(candidate => keys.includes(candidate)) || candidates[0]
      return {
        key,
        project: window.electronAPI.storageRead(key),
        config: window.electronAPI.storageRead('wa_pipeline_step_config')
      }
    })
    projectKey = saved.key
    projectSnapshot = saved.project
    configSnapshot = saved.config
    passed = record(results, '项目快照已保存', !!projectKey && !!projectSnapshot, projectKey || 'missing') && passed
    passed = record(results, '上游大纲已锁定', !!projectSnapshot?.outlineText?.trim() && !!projectSnapshot?.outlineLocked, JSON.stringify({ outlineLength: projectSnapshot?.outlineText?.length || 0, locked: !!projectSnapshot?.outlineLocked })) && passed
    if (!projectSnapshot?.outlineText?.trim() || !projectSnapshot?.outlineLocked) throw new Error('没有已锁定大纲，无法验证字数联动')

    if (!(await page.locator('#pipeline-panel').count())) {
      await page.locator('#btn-pipeline').click()
      await page.waitForTimeout(700)
    }
    if (!(await page.locator('#pl-step-1-content').isVisible())) {
      await page.locator('.pl-step').filter({ hasText: '大纲' }).click()
      await page.waitForTimeout(400)
    }
    passed = record(results, '进入流水线大纲层', await page.locator('#pl-step-1-content').isVisible(), '') && passed

    const count = page.locator('#pl-book-word-count')
    await count.fill('60')
    await count.dispatchEvent('change')
    await page.waitForTimeout(250)
    passed = record(results, '输入全书字数后确认入口可用', !(await page.locator('#btn-pl-confirm-outline').isDisabled()), `value=${await count.inputValue()}`) && passed
    await page.locator('#btn-pl-confirm-outline').click()
    await page.waitForTimeout(500)

    const settingsVisible = await page.locator('#pl-step-2-content').isVisible()
    passed = record(results, '确认大纲字数后按链路进入设定层', settingsVisible, `settingsVisible=${settingsVisible}`) && passed
    await page.locator('.pl-step').filter({ hasText: '卷纲' }).click()
    await page.waitForTimeout(400)
    const volumePanel = page.locator('#pl-step-3-content')
    passed = record(results, '沿真实链路进入卷纲层', await volumePanel.isVisible(), '') && passed

    const state = await page.evaluate(() => ({
      bookWordsText: document.querySelector('#pl-volume-linked-book-words')?.textContent.trim() || '',
      hintText: document.querySelector('#pl-volume-linked-count-hint')?.textContent.trim() || '',
      volumeCountValue: document.querySelector('#pl-volume-count')?.value || '',
      volumeCountReadonly: document.querySelector('#pl-volume-count')?.readOnly === true,
      config: window.electronAPI.storageRead('wa_pipeline_step_config'),
      panelRect: (() => {
        const el = document.querySelector('#pl-volume-config')
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return { width: Math.round(rect.width), height: Math.round(rect.height) }
      })()
    }))
    passed = record(results, '卷纲层显示大纲已锁定全书字数', state.bookWordsText.includes('大纲已锁定全书字数') && state.bookWordsText.includes('60 万字'), state.bookWordsText) && passed
    passed = record(results, '卷纲层显示按每卷字数自动分配结果', state.hintText.includes('自动分配') && state.hintText.includes('卷'), state.hintText) && passed
    passed = record(results, '卷数联动结果可读', state.volumeCountValue === '6' && state.volumeCountReadonly, JSON.stringify({ value: state.volumeCountValue, readonly: state.volumeCountReadonly })) && passed
    passed = record(results, '字数配置已持久化', state.config?.bookWordCount === 600000, JSON.stringify(state.config)) && passed
    passed = record(results, '联动状态容器有稳定尺寸', !!state.panelRect && state.panelRect.width > 0 && state.panelRect.height > 0, JSON.stringify(state.panelRect)) && passed

    const cdp = await page.context().newCDPSession(page)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(OUT + '/P7_volume_word_link_verify.png', Buffer.from(shot.data, 'base64'))
    fs.writeFileSync(OUT + '/P7_volume_word_link_verify.json', JSON.stringify({ results, state, passed }, null, 2), 'utf8')
  } finally {
    if (projectKey && projectSnapshot) {
      await page.evaluate(({ key, project, config }) => {
        window.electronAPI.storageWrite(key, project)
        if (config === null || config === undefined) window.electronAPI.storageRemove('wa_pipeline_step_config')
        else window.electronAPI.storageWrite('wa_pipeline_step_config', config)
        location.reload()
      }, { key: projectKey, project: projectSnapshot, config: configSnapshot })
      await page.waitForTimeout(1200)
    }
    await browser.close()
  }
  if (!passed) process.exit(1)
}

main().catch(error => {
  console.error('ERROR | P7 volume word link verification | ' + error.stack)
  process.exit(1)
})
