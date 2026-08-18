const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const ROOT = path.resolve(__dirname, '../../..')
const OUT = path.join(ROOT, '_audit')

function record(results, name, passed, detail) {
  const row = { name, passed: !!passed, detail: detail || '' }
  results.push(row)
  console.log((row.passed ? 'PASS' : 'FAIL') + ' | ' + name + (row.detail ? ' | ' + row.detail : ''))
  return row.passed
}

async function readProjectSnapshot(page) {
  return page.evaluate(() => {
    const id = window.__pinia?.state?.value?.project?.currentProjectId
    const keys = window.electronAPI.storageList() || []
    const candidates = ['wa_project_' + id, 'wa_project-' + id]
    const key = candidates.find(candidate => keys.includes(candidate)) || candidates[0]
    return {
      key,
      project: window.electronAPI.storageRead(key),
      config: window.electronAPI.storageRead('wa_pipeline_step_config')
    }
  })
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const pages = browser.contexts()[0].pages()
  const page = pages.find(candidate => candidate.url().includes('dist-renderer/index.html')) || pages[0]
  page.setDefaultTimeout(15000)
  const results = []
  let passed = true
  let saved = null

  try {
    saved = await readProjectSnapshot(page)
    passed = record(results, '项目快照已保存', !!saved.key && !!saved.project, saved.key || 'missing') && passed
    if (!saved.project?.outlineText?.trim() || !saved.project?.outlineLocked) {
      throw new Error('没有已锁定大纲，无法进入卷纲按钮闭环')
    }

    if ((await page.evaluate(() => window.__getActivePanel?.() || '')) !== 'pipeline') {
      await page.locator('#btn-pipeline').click()
      await page.waitForTimeout(900)
    }
    passed = record(results, '流水线面板已打开', await page.locator('#pipeline-panel').isVisible(), '') && passed
    await page.locator('.pl-step').nth(2).click()
    await page.waitForTimeout(400)
    passed = record(results, '卷纲层已显示', await page.locator('#pl-step-3-content').isVisible(), '') && passed

    const buttons = await page.evaluate(() => {
      const ids = [
        'btn-pl-gen-volumes',
        'btn-pl-gen-single-volume',
        'btn-pl-confirm-volumes',
        'btn-pl-create-volumes',
        'btn-pl-continue-volumes'
      ]
      return Object.fromEntries(ids.map(id => {
        const el = document.getElementById(id)
        return [id, el ? {
          present: true,
          visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
          text: el.textContent?.trim() || '',
          disabled: !!el.disabled
        } : { present: false, visible: false, text: '', disabled: false }]
      }))
    })
    passed = record(results, 'AI生成全卷按钮可见', buttons['btn-pl-gen-volumes'].present && buttons['btn-pl-gen-volumes'].visible, JSON.stringify(buttons['btn-pl-gen-volumes'])) && passed
    passed = record(results, '逐卷生成按钮可见', buttons['btn-pl-gen-single-volume'].present && buttons['btn-pl-gen-single-volume'].visible, JSON.stringify(buttons['btn-pl-gen-single-volume'])) && passed
    passed = record(results, '确认完成下一步按钮可见', buttons['btn-pl-confirm-volumes'].present && buttons['btn-pl-confirm-volumes'].visible && buttons['btn-pl-confirm-volumes'].text === '确认完成下一步', JSON.stringify(buttons['btn-pl-confirm-volumes'])) && passed
    passed = record(results, '自动生成卷纲旧按钮已删除', !buttons['btn-pl-create-volumes'].present, JSON.stringify(buttons['btn-pl-create-volumes'])) && passed
    passed = record(results, '批量续生成旧按钮已删除', !buttons['btn-pl-continue-volumes'].present, JSON.stringify(buttons['btn-pl-continue-volumes'])) && passed

    const volumeCount = await page.locator('[id^="pl-volume-card-"]').count()
    passed = record(results, '当前项目存在卷纲内容可推进', volumeCount > 0, 'volumeCards=' + volumeCount) && passed
    if (volumeCount > 0) {
      await page.locator('#btn-pl-confirm-volumes').click()
      await page.waitForTimeout(500)
      const stepState = await page.evaluate(() => ({
        currentStep: window.__pinia?.state?.value?.pipeline?.currentStep,
        chapterVisible: !!document.querySelector('#pl-step-4-content')?.offsetParent
      }))
      passed = record(results, '确认完成下一步推进到章节层', stepState.currentStep === 3 && stepState.chapterVisible, JSON.stringify(stepState)) && passed
    }

    const cdp = await page.context().newCDPSession(page)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(OUT, 'P9_volume_buttons_verify.png'), Buffer.from(shot.data, 'base64'))
    fs.writeFileSync(path.join(OUT, 'P9_volume_buttons_verify.json'), JSON.stringify({ results, buttons, passed }, null, 2), 'utf8')
  } finally {
    if (saved?.key && saved.project) {
      await page.evaluate(({ key, project, config }) => {
        window.electronAPI.storageWrite(key, project)
        if (config === null || config === undefined) window.electronAPI.storageRemove('wa_pipeline_step_config')
        else window.electronAPI.storageWrite('wa_pipeline_step_config', config)
        location.reload()
      }, { key: saved.key, project: saved.project, config: saved.config })
      await page.waitForTimeout(1000)
    }
    await browser.close()
  }
  if (!passed) process.exit(1)
}

main().catch(error => {
  console.error('ERROR | P9 volume button verification | ' + error.stack)
  process.exit(1)
})
