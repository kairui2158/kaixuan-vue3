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

async function snapshot(page) {
  return page.evaluate(() => {
    const id = window.__pinia?.state?.value?.project?.currentProjectId
    const keys = window.electronAPI.storageList() || []
    const candidates = ['wa_project_' + id, 'wa_project-' + id]
    const key = candidates.find(candidate => keys.includes(candidate)) || candidates[0]
    return { key, project: window.electronAPI.storageRead(key), config: window.electronAPI.storageRead('wa_pipeline_step_config') }
  })
}

async function writeProject(page, key, project, config) {
  await page.evaluate(({ key, project, config }) => {
    window.electronAPI.storageWrite(key, project)
    if (config === null || config === undefined) window.electronAPI.storageRemove('wa_pipeline_step_config')
    else window.electronAPI.storageWrite('wa_pipeline_step_config', config)
    location.reload()
  }, { key, project, config })
  await page.waitForTimeout(900)
}

async function openChapterStep(page) {
  if (!(await page.locator('#pipeline-panel').count()) || !(await page.locator('#pipeline-panel').isVisible().catch(() => false))) {
    await page.locator('#btn-pipeline').click()
    await page.waitForTimeout(900)
  }
  await page.locator('.pl-step').nth(3).click()
  await page.waitForTimeout(300)
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
    saved = await snapshot(page)
    passed = record(results, '项目快照已保存', !!saved.key && !!saved.project, saved.key || 'missing') && passed
    if (!saved.project?.outlineText?.trim() || !saved.project?.outlineLocked) throw new Error('没有已锁定大纲，无法进入章节层')

    if ((await page.evaluate(() => window.__getActivePanel?.() || '')) !== 'pipeline') {
      await page.locator('#btn-pipeline').click()
      await page.waitForTimeout(900)
    }
    await page.locator('.pl-step').nth(3).click()
    await page.waitForTimeout(400)
    passed = record(results, '章节层已打开', await page.locator('#pl-step-4-content').isVisible(), '') && passed

    const noVolumeProject = { ...saved.project, volumes: [], chapters: {}, volumesConfirmed: false, chaptersConfirmed: false }
    await writeProject(page, saved.key, noVolumeProject, saved.config)
    await openChapterStep(page)
    const noVolumeState = await page.evaluate(() => ({
      cardsArea: !!document.querySelector('#pl-ch-cards-area'),
      cards: document.querySelectorAll('.pl-ch-card').length,
      hint: document.querySelector('#pl-ch-empty-no-volume')?.textContent?.trim() || '',
      otherHint: !!document.querySelector('#pl-ch-empty-no-chapters')
    }))
    passed = record(results, '无锁定卷时不渲染章节框', !noVolumeState.cardsArea && noVolumeState.cards === 0, JSON.stringify(noVolumeState)) && passed
    passed = record(results, '无锁定卷显示专用空状态', noVolumeState.hint.includes('暂无已锁定卷纲') && !noVolumeState.otherHint, JSON.stringify(noVolumeState)) && passed

    const lockedVolume = { id: 'p10-temp-volume', name: 'P10临时卷', outline: '临时卷纲', summary: '临时摘要', suggestedWords: 10000, confirmed: true, locked: true }
    const lockedProject = { ...noVolumeProject, volumes: [lockedVolume], chapters: { [lockedVolume.id]: [] } }
    await writeProject(page, saved.key, lockedProject, saved.config)
    await openChapterStep(page)
    const lockedEmptyState = await page.evaluate(() => ({
      cardsArea: !!document.querySelector('#pl-ch-cards-area'),
      cards: document.querySelectorAll('.pl-ch-card').length,
      hint: document.querySelector('#pl-ch-empty-no-chapters')?.textContent?.trim() || '',
      otherHint: !!document.querySelector('#pl-ch-empty-no-volume')
    }))
    passed = record(results, '有锁定卷但无章节时保留章节区容器', lockedEmptyState.cardsArea && lockedEmptyState.cards === 0, JSON.stringify(lockedEmptyState)) && passed
    passed = record(results, '有锁定卷但无章节显示专用空状态', lockedEmptyState.hint.includes('暂无章节') && !lockedEmptyState.otherHint, JSON.stringify(lockedEmptyState)) && passed

    const cdp = await page.context().newCDPSession(page)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(path.join(OUT, 'P10_chapter_empty_state_verify.png'), Buffer.from(shot.data, 'base64'))
    fs.writeFileSync(path.join(OUT, 'P10_chapter_empty_state_verify.json'), JSON.stringify({ results, noVolumeState, lockedEmptyState, passed }, null, 2), 'utf8')
  } finally {
    if (saved?.key && saved.project) await writeProject(page, saved.key, saved.project, saved.config)
    await browser.close()
  }
  if (!passed) process.exit(1)
}

main().catch(error => {
  console.error('ERROR | P10 chapter empty state verification | ' + error.stack)
  process.exit(1)
})
