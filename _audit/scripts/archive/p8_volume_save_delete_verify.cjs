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

async function readProjectSnapshot(page) {
  return page.evaluate(() => {
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
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const pages = browser.contexts()[0].pages()
  const page = pages.find(candidate => candidate.url().includes('dist-renderer/index.html')) || pages[0]
  console.log('DEBUG | pages=' + pages.map(candidate => candidate.url()).join(' || '))
  page.on('pageerror', error => console.log('PAGEERROR | ' + error.stack))
  page.on('console', message => {
    if (message.type() === 'error') console.log('CONSOLEERROR | ' + message.text())
  })
  page.setDefaultTimeout(15000)
  const results = []
  let passed = true
  let saved = null
  let selectedIndex = -1
  let originalVolume = null
  let originalChapters = null
  let stateAfterLock = null
  let stateAfterDelete = null

  try {
    saved = await readProjectSnapshot(page)
    passed = record(results, '项目快照已保存', !!saved.key && !!saved.project, saved.key || 'missing') && passed
    passed = record(results, '上游大纲已锁定', !!saved.project?.outlineText?.trim() && !!saved.project?.outlineLocked, JSON.stringify({ locked: !!saved.project?.outlineLocked, outlineLength: saved.project?.outlineText?.length || 0 })) && passed
    if (!saved.project?.outlineText?.trim() || !saved.project?.outlineLocked) throw new Error('没有已锁定大纲，无法进入卷纲闭环')

    const activePanel = await page.evaluate(() => window.__getActivePanel?.() || '')
    if (activePanel !== 'pipeline') {
      await page.locator('#btn-pipeline').click()
      await page.waitForTimeout(1200)
    }
    console.log('DEBUG | pipeline=' + await page.locator('#pipeline-panel').count() + ' steps=' + await page.locator('.pl-step').count() + ' btn=' + await page.locator('#btn-pipeline').count() + ' active=' + await page.evaluate(() => window.__getActivePanel?.()) + ' body=' + (await page.locator('body').innerText()).slice(0, 160).replace(/\n/g, '|'))
    console.log('DEBUG | appHtml=' + (await page.locator('#app').innerHTML()).slice(-1200).replace(/\n/g, ' '))
    await page.locator('.pl-step').nth(2).click()
    await page.waitForTimeout(500)
    passed = record(results, '进入卷纲层', await page.locator('#pl-step-3-content').isVisible(), '') && passed

    const candidate = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[id^="pl-volume-card-"]')]
      const card = cards.find(item => !item.classList.contains('confirmed') && item.querySelector('input[placeholder="卷名"]')?.value?.trim())
      if (!card) return null
      const index = Number(card.id.replace('pl-volume-card-', ''))
      return { index, name: card.querySelector('input[placeholder="卷名"]')?.value || '' }
    })
    selectedIndex = candidate?.index ?? -1
    passed = record(results, '找到可验证的未锁定卷', selectedIndex >= 0, JSON.stringify(candidate)) && passed
    if (selectedIndex < 0) throw new Error('当前项目没有名称非空的未锁定卷')

    originalVolume = saved.project.volumes[selectedIndex]
    const volumeId = originalVolume.id || originalVolume.name
    originalChapters = saved.project.chapters?.[volumeId]
    const saveButton = page.locator(`#btn-pl-save-volume-${selectedIndex}`)
    const card = page.locator(`#pl-volume-card-${selectedIndex}`)
    passed = record(results, '未锁定卷显示保存按钮', await saveButton.count() === 1 && await saveButton.isVisible(), await saveButton.textContent()) && passed
    passed = record(results, '未锁定卷编辑字段可写', await card.locator('input[placeholder="卷名"]').isEditable() && await card.locator('textarea[placeholder="卷纲要"]').isEditable() && await card.locator('input[placeholder="摘要"]').isEditable(), '') && passed

    await saveButton.click()
    await page.waitForTimeout(500)
    stateAfterLock = await page.evaluate((index) => {
      const card = document.querySelector(`#pl-volume-card-${index}`)
      const save = document.querySelector(`#btn-pl-save-volume-${index}`)
      const readOnly = [...(card?.querySelectorAll('input, textarea') || [])].map(el => ({ placeholder: el.getAttribute('placeholder'), readOnly: el.readOnly }))
      const id = card?.querySelector('input[placeholder="卷名"]')?.value || ''
      return {
        chapterKey: id,
        saveText: save?.textContent?.trim() || '',
        readOnly,
        cardClass: card?.className || ''
      }
    }, selectedIndex)
    if (!stateAfterLock.storeVolume) {
      const stored = await readProjectSnapshot(page)
      stateAfterLock = { ...stateAfterLock, storedVolume: stored.project?.volumes?.[selectedIndex] || null, storedChapters: stored.project?.chapters || {} }
    }
    const lockedVolume = stateAfterLock.storedVolume
    passed = record(results, '保存后卷状态已锁定', !!lockedVolume?.confirmed && !!lockedVolume?.locked, JSON.stringify(lockedVolume)) && passed
    passed = record(results, '保存后卷输入变为只读', stateAfterLock.readOnly.length >= 3 && stateAfterLock.readOnly.every(field => field.readOnly), JSON.stringify(stateAfterLock.readOnly)) && passed
    passed = record(results, '保存按钮进入已锁定状态', stateAfterLock.saveText.includes('已锁定'), stateAfterLock.saveText) && passed
    passed = record(results, '锁定卷在章节层可选择', await page.locator('.pl-step').nth(3).click().then(() => page.waitForTimeout(400)).then(async () => {
      const option = page.locator('#pl-step-4-content select option').filter({ hasText: String(lockedVolume?.name || originalVolume.name) })
      return await option.count() > 0
    }), String(lockedVolume?.name || originalVolume.name)) && passed

    await page.locator('.pl-step').nth(2).click()
    await page.waitForTimeout(300)
    await page.locator(`#btn-pl-delete-volume-${selectedIndex}`).click()
    await page.waitForTimeout(500)
    stateAfterDelete = await page.evaluate(({ index, volumeName }) => {
      const cards = [...document.querySelectorAll('[id^="pl-volume-card-"]')]
      return {
        deletedCardPresent: cards.some(card => {
          const name = card.querySelector('input[placeholder="卷名"]')?.value || ''
          return name === volumeName
        }),
        remainingCards: cards.length
      }
    }, { index: selectedIndex, volumeName: originalVolume.name })
    const refreshed = await readProjectSnapshot(page)
    stateAfterDelete.persisted = {
      deletedFromStorage: !(refreshed.project?.volumes || []).some(vol => (vol.id || vol.name) === volumeId),
      chaptersDeleted: !Object.prototype.hasOwnProperty.call(refreshed.project?.chapters || {}, volumeId)
    }
    passed = record(results, '删除后卷从 store 移除', stateAfterDelete.persisted.deletedFromStorage, JSON.stringify(stateAfterDelete)) && passed
    passed = record(results, '删除后对应章节映射移除', stateAfterDelete.persisted.chaptersDeleted, JSON.stringify(stateAfterDelete)) && passed
    passed = record(results, '删除后卷从持久化数据移除', stateAfterDelete.persisted.deletedFromStorage && stateAfterDelete.persisted.chaptersDeleted, JSON.stringify(stateAfterDelete.persisted)) && passed
    passed = record(results, '删除后卷卡片不再显示', !stateAfterDelete.deletedCardPresent || stateAfterDelete.remainingCards === 0, JSON.stringify(stateAfterDelete)) && passed

    const cdp = await page.context().newCDPSession(page)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync(OUT + '/P8_volume_save_delete_verify.png', Buffer.from(shot.data, 'base64'))
    fs.writeFileSync(OUT + '/P8_volume_save_delete_verify.json', JSON.stringify({ results, selectedIndex, originalVolume, stateAfterLock, stateAfterDelete, passed }, null, 2), 'utf8')
  } finally {
    if (saved?.key && saved.project) {
      await page.evaluate(({ key, project, config }) => {
        window.electronAPI.storageWrite(key, project)
        if (config === null || config === undefined) window.electronAPI.storageRemove('wa_pipeline_step_config')
        else window.electronAPI.storageWrite('wa_pipeline_step_config', config)
        location.reload()
      }, { key: saved.key, project: saved.project, config: saved.config })
      await page.waitForTimeout(1200)
    }
    await browser.close()
  }
  if (!passed) process.exit(1)
}

main().catch(error => {
  console.error('ERROR | P8 volume save/delete verification | ' + error.stack)
  process.exit(1)
})
