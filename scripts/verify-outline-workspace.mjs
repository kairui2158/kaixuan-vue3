import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
const context = browser.contexts()[0]
if (!context) throw new Error('Electron context not found')
let page = context.pages().find(item => item.url().includes('index.html')) || context.pages()[0]
if (!page) throw new Error('Electron page not found')

const originalLastProjectId = await page.evaluate(async () => {
  return await window.electronAPI.storageRead('wa_lastProjectId')
})

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('[PASS] ' + message)
}

await page.evaluate(() => {
  const pipelineClose = document.querySelector('#btn-close-pl')
  if (pipelineClose) pipelineClose.click()
  const outlineClose = document.querySelector('#btn-close-outline-workspace')
  if (outlineClose) outlineClose.click()
  const confirm = document.querySelector('.project-transition-confirm')
  if (confirm && getComputedStyle(confirm).display !== 'none') {
    const cancel = [...confirm.querySelectorAll('button')].find(button => button.textContent.trim() === '取消')
    cancel?.click()
  }
})
await page.waitForTimeout(200)
await page.evaluate(() => {
  const modal = document.querySelector('.project-modal-content')
  const close = modal?.querySelector('.btn-close')
  if (modal && getComputedStyle(modal).display !== 'none' && close) close.click()
})
await page.waitForTimeout(300)

await page.locator('#btn-open-project').click()
await page.waitForTimeout(300)
const confirm = page.locator('.project-transition-confirm')
if (await confirm.isVisible().catch(() => false)) {
  await confirm.getByRole('button', { name: '取消' }).click()
  await page.waitForTimeout(200)
}
const projectToggle = page.locator('.new-project-btn')
if ((await projectToggle.innerText().catch(() => '')) === '取消') {
  await projectToggle.click()
  await page.waitForTimeout(200)
}
await page.getByRole('button', { name: '+ 新建项目' }).click()
await page.locator('.new-project-form input').fill('Codex-E2E Outline Temp')
await page.locator('.new-project-form textarea').fill('第一卷 起点\n主角进入北方边境小镇，遇到神秘商人，卷入失落矿脉传闻。\n第二卷 潮汐\n商队南下，女主在港口城识破伪装的走私网络，双方达成临时同盟。')
await page.getByRole('button', { name: '创建' }).click()
await page.waitForTimeout(500)
const createConfirm = page.locator('.project-transition-confirm')
if (await createConfirm.isVisible().catch(() => false)) {
  await createConfirm.getByRole('button', { name: '保存并继续' }).click()
  await page.waitForTimeout(500)
}
if (await page.locator('.project-modal-content').isVisible().catch(() => false)) {
  await page.locator('.project-modal-content .btn-close').click()
  await page.waitForTimeout(300)
}

await page.locator('#btn-outline-workspace').click()
await page.waitForSelector('#outline-editor')
const textarea = page.locator('#outline-editor')
assert(await textarea.isEnabled(), 'P5: outline editor accepts input when unlocked')

const baseline = await textarea.inputValue()
await textarea.focus()
await textarea.press('Control+End')
await textarea.pressSequentially('\nE2E-EDIT-MARK', { delay: 10 })
const afterEdit = await textarea.inputValue()
assert(afterEdit.includes('E2E-EDIT-MARK') && afterEdit.length > baseline.length, 'P5: manual typing updates editor content')

await page.locator('#btn-ow-undo').click()
await page.waitForTimeout(100)
const afterUndo = await textarea.inputValue()
console.log('[DEBUG] baseline=', JSON.stringify(baseline), 'afterUndo=', JSON.stringify(afterUndo))
assert(!afterUndo.includes('E2E-EDIT-MARK') && afterUndo === baseline, 'P5: undo removes manual editor change')

await page.locator('#btn-ow-redo').click()
await page.waitForTimeout(100)
const afterRedo = await textarea.inputValue()
assert(afterRedo === afterEdit, 'P5: redo restores manual editor change')

await page.locator('#btn-ow-undo').click()
await page.waitForTimeout(600)
assert(await textarea.inputValue() === baseline, 'P5: editor returns to baseline before lock test')

const lockButton = page.locator('#btn-lock-outline')
assert(await lockButton.isEnabled(), 'P6: outline lock button enabled for non-empty outline')
await lockButton.click()
await page.waitForSelector('#pipeline-panel')
assert((await page.locator('#outline-workspace').count()) === 0, 'P6: confirmation navigates to pipeline')
await page.locator('#btn-close-pl').click()
await page.waitForTimeout(300)

await page.locator('#btn-outline-workspace').click()
await page.waitForSelector('#btn-unlock-outline')
assert(await textarea.evaluate(el => el.readOnly), 'P6: outline becomes readonly after confirmation')
await page.locator('#btn-unlock-outline').click()
await page.waitForTimeout(200)
assert(await textarea.isEnabled(), 'P6: unlock restores editor editing')

await page.locator('#btn-close-outline-workspace').click()
await page.waitForTimeout(700)

const tempProjectId = await page.evaluate(async () => {
  const data = await window.electronAPI.storageRead('wa_lastProjectId')
  return data && data.value
})
await page.evaluate(async ({ id, originalId }) => {
  if (id) {
    await window.electronAPI.storageRemove('wa_project_' + id)
    await window.electronAPI.storageRemove('wa_project-' + id)
    await window.electronAPI.storageWrite('wa_lastProjectId', originalId)
  }
}, { id: tempProjectId, originalId: originalLastProjectId })

await browser.close()
console.log('[DONE] Outline workspace P5/P6 verification completed')
