const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  page.setDefaultTimeout(15000)
  const tempId = 'p6_verify_' + Date.now()
  await page.evaluate(({ tempId }) => {
    const api = window.electronAPI
    api.storageWrite('wa_project_' + tempId, {
      projectName: 'P6回归项目',
      outlineText: '# P6回归卷\n\n## P6回归章\n\n端到端回归大纲。',
      outlineLocked: false,
      volumes: [],
      chapters: {},
      settings: [],
      settingsCollection: { categories: [], items: {} },
      memories: { categories: ['情节', '人物', '世界观', '伏笔'], items: [] }
    })
    api.storageWrite('wa_lastProjectId', tempId)
  }, { tempId })
  await page.reload()
  await page.waitForTimeout(900)
  const transition = page.locator('.project-transition-confirm')
  if (await transition.isVisible().catch(() => false)) {
    await transition.locator('.project-transition-confirm__actions .btn-primary').click()
    await page.waitForTimeout(300)
  }
  const openButton = page.locator('#btn-open-outline, #btn-outline-workspace, [data-action="outline"]')
  if (await openButton.count()) await openButton.first().click()
  else await page.locator('#btn-tree-outline, #btn-open-outline-workspace').first().click()
  await page.locator('#outline-workspace').waitFor({ state: 'visible' })
  await page.locator('#btn-lock-outline').click()
  await page.waitForTimeout(800)
  const state = await page.evaluate(() => {
    const project = window.__pinia?.state?.value?.project
    return { id: project?.currentProjectId, locked: !!project?.outlineLocked, length: (project?.outlineText || '').length }
  })
  if (state.id !== tempId || !state.locked) throw new Error('临时大纲未通过真实锁定操作: ' + JSON.stringify(state))
  console.log('PASS | 临时大纲已通过界面锁定 | ' + JSON.stringify(state))
  await browser.close()
}

main().catch(error => {
  console.error('ERROR | prepare P6 locked outline | ' + error.stack)
  process.exit(1)
})
