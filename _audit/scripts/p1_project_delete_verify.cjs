const { chromium } = require('playwright')

const prefix = 'p1_verify_'
const projectKeys = ['wa_project_' + prefix + 'dual', 'wa_project-' + prefix + 'dual', 'wa_project_' + prefix + 'last']
const lastKey = 'wa_lastProjectId'
const reportPath = 'D:/codex/novel-workshop-vue3/_audit/P1_project_delete_verify.json'

function result(name, pass, detail) {
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + detail)
  results.push({ name, pass: !!pass, detail: detail || '' })
  return pass
}

const results = []

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  const original = await page.evaluate(({ projectKeys, lastKey }) => {
    const saved = {}
    for (const key of [...projectKeys, lastKey]) saved[key] = window.electronAPI.storageRead(key)
    return saved
  }, { projectKeys, lastKey })
  let passed = true
  try {
    await page.evaluate(({ projectKeys, lastKey }) => {
      window.electronAPI.storageWrite('wa_project_' + 'p1_verify_dual', { projectName: 'P1 双键项目', outlineText: '临时双键项目' })
      window.electronAPI.storageWrite('wa_project-' + 'p1_verify_dual', { projectName: 'P1 双键项目旧键', outlineText: '临时双键项目旧键' })
      window.electronAPI.storageWrite('wa_project_' + 'p1_verify_last', { projectName: 'P1 最后项目', outlineText: '临时最后项目' })
      window.electronAPI.storageWrite(lastKey, 'p1_verify_dual')
    }, { projectKeys, lastKey })
    await page.reload()
    await page.waitForTimeout(900)
    await page.locator('#btn-open-project').click()
    await page.waitForTimeout(300)

    const names = await page.locator('.project-item-name').allTextContents()
    const dualCount = names.filter((n) => n.includes('P1 双键项目')).length
    passed = result('同一项目双键只显示一条', dualCount === 1, JSON.stringify(names)) && passed

    const dualItem = page.locator('.project-item').filter({ hasText: 'P1 双键项目' }).first()
    page.once('dialog', (dialog) => dialog.accept())
    await dualItem.locator('.btn-danger').click()
    await page.waitForTimeout(250)
    const dualKeysAfterDelete = await page.evaluate(() => ({
      newKey: window.electronAPI.storageRead('wa_project_p1_verify_dual'),
      oldKey: window.electronAPI.storageRead('wa_project-p1_verify_dual')
    }))
    passed = result('删除项目同时清除新旧存储键', !dualKeysAfterDelete.newKey && !dualKeysAfterDelete.oldKey, JSON.stringify(dualKeysAfterDelete)) && passed

    const dualItemsAfterDelete = await page.locator('.project-item').filter({ hasText: 'P1 双键项目' }).count()
    passed = result('删除后项目列表立即移除项目', dualItemsAfterDelete === 0, String(dualItemsAfterDelete)) && passed

    const lastItem = page.locator('.project-item').filter({ hasText: 'P1 最后项目' }).first()
    page.once('dialog', (dialog) => dialog.accept())
    await lastItem.locator('.btn-danger').click()
    await page.waitForTimeout(250)
    const finalState = await page.evaluate(() => ({
      projectKey: window.electronAPI.storageRead('wa_project_p1_verify_last'),
      lastProjectId: window.electronAPI.storageRead('wa_lastProjectId'),
      visible: document.querySelectorAll('.project-item').length
    }))
    passed = result('删除最后临时项目后清理项目指针', !finalState.projectKey && !finalState.lastProjectId, JSON.stringify(finalState)) && passed

    const clearedUi = await page.evaluate(() => ({
      currentProjectId: window.__pinia?.state?.value?.project?.currentProjectId || null,
      projectName: window.__pinia?.state?.value?.project?.projectName || '',
      outlineText: window.__pinia?.state?.value?.project?.outlineText || '',
      chapterItems: document.querySelectorAll('#chapter-tree .chapter-item, #chapter-tree [data-chapter-id]').length,
      pipelineVisible: !!document.querySelector('#pipeline-panel:not(.modal-hidden)')
    }))
    passed = result('删除当前临时项目后内存项目状态清空', !clearedUi.currentProjectId && !clearedUi.projectName && !clearedUi.outlineText, JSON.stringify(clearedUi)) && passed
    passed = result('删除当前临时项目后章节树没有残留章节', clearedUi.chapterItems === 0, JSON.stringify(clearedUi)) && passed

    await page.reload()
    await page.waitForTimeout(900)
    const afterReload = await page.evaluate(() => ({
      lastProjectId: window.electronAPI.storageRead('wa_lastProjectId'),
      projectKeys: (window.electronAPI.storageList() || []).filter(key => /^wa_project[-_]/.test(key)),
      currentProjectId: window.__pinia?.state?.value?.project?.currentProjectId || null,
      projectName: window.__pinia?.state?.value?.project?.projectName || '',
      outlineText: window.__pinia?.state?.value?.project?.outlineText || ''
    }))
    passed = result('重载后已删除项目不复活', !afterReload.lastProjectId && !afterReload.currentProjectId && !afterReload.projectName && !afterReload.outlineText, JSON.stringify(afterReload)) && passed

    await page.locator('#btn-open-project').click()
    await page.waitForTimeout(250)
    const listAfterReload = await page.locator('.project-item-name').allTextContents()
    passed = result('重载后项目管理列表不显示已删除临时项目', !listAfterReload.some(name => name.includes('P1')), JSON.stringify(listAfterReload)) && passed

    await page.screenshot({ path: 'D:/codex/novel-workshop-vue3/_audit/P1_project_delete_verify.png', fullPage: false })
  } finally {
    await page.evaluate(({ original, projectKeys, lastKey }) => {
      for (const key of projectKeys) {
        if (original[key] === null || original[key] === undefined) window.electronAPI.storageRemove(key)
        else window.electronAPI.storageWrite(key, original[key])
      }
      if (original[lastKey] === null || original[lastKey] === undefined) window.electronAPI.storageRemove(lastKey)
      else window.electronAPI.storageWrite(lastKey, original[lastKey])
    }, { original, projectKeys, lastKey })
    await browser.close()
  }
  require('fs').writeFileSync(reportPath, JSON.stringify({
    name: 'P1 项目管理彻底删除闭环',
    generatedAt: new Date().toISOString(),
    passed,
    results
  }, null, 2), 'utf8')
  if (!passed) process.exit(1)
}

main().catch((error) => {
  console.error('ERROR | P1 project verification | ' + error.stack)
  process.exit(1)
})
