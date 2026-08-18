const { chromium } = require('playwright')
const fs = require('fs')

const samples = [
  { label: 'TXT', path: 'D:/codex/novel-workshop-vue3/测试样本.txt', marker: '《绿潮》大纲总纲' },
  { label: 'MD', path: 'D:/codex/novel-workshop-vue3/docs/PIPELINE_FLOW.md', marker: '生成流水线结构导向图' }
]

function result(name, pass, detail) {
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + detail)
  return pass
}

function normalize(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  let passed = true
  try {
    await page.keyboard.press('Escape')
    await page.evaluate(() => {
      const overlay = Array.from(document.querySelectorAll('.modal-overlay')).find((el) => {
        const style = getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden' && el.querySelector('.project-modal-content')
      })
      overlay?.querySelector('.btn-close')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await page.waitForTimeout(150)
    const original = await page.evaluate(() => ({
      storage: window.electronAPI.storageList().reduce((acc, key) => { acc[key] = window.electronAPI.storageRead(key); return acc }, {}),
      last: window.electronAPI.storageRead('wa_lastProjectId')
    }))

    await page.locator('#btn-outline-workspace').click()
    await page.waitForTimeout(250)
    const workspace = page.locator('#outline-workspace')
    passed = result('大纲工作台可打开', await workspace.count() === 1, String(await workspace.count())) && passed

    const importLabel = (await page.locator('#btn-import-outline').innerText()).trim()
    passed = result('导入按钮文案支持 .rtf', importLabel.includes('.rtf'), JSON.stringify(importLabel)) && passed
    passed = result('导入按钮文案不再显示旧式 .doc', !/\.doc\b/.test(importLabel), JSON.stringify(importLabel)) && passed

    for (const sample of samples) {
      const editor = page.locator('#outline-editor')
      const before = await editor.inputValue()
      await editor.fill('')
      await page.waitForTimeout(500)
      await page.locator('#outline-workspace input[type="file"]').setInputFiles(sample.path)
      await page.waitForTimeout(700)
      const after = await editor.inputValue()

      passed = result(sample.label + ' 导入内容包含文件特征', after.includes(sample.marker), JSON.stringify(after.slice(0, 80))) && passed
      passed = result(sample.label + ' 导入后编辑器内容更新', after.length > 0 && after !== '', 'before=' + before.length + ' after=' + after.length) && passed

      await page.waitForTimeout(500)
      const storageSnapshot = await page.evaluate((expected) => {
        const normalize = (text) => String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        const keys = window.electronAPI.storageList().filter((key) => /^wa_project[-_]/.test(key))
        return keys.map((key) => ({ key, data: window.electronAPI.storageRead(key) })).map((item) => ({
          key: item.key,
          length: item.data?.outlineText?.length || 0,
          same: normalize(item.data?.outlineText) === normalize(expected)
        }))
      }, after)
      const stored = storageSnapshot.find((item) => item.same)
      console.log('INFO | ' + sample.label + ' storage | ' + JSON.stringify(storageSnapshot))
      passed = result(sample.label + ' 导入内容写入项目存储', !!stored, stored ? 'key=' + stored.key + ', length=' + stored.length : 'none') && passed
    }

    const client = await page.context().newCDPSession(page)
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    fs.writeFileSync('D:/codex/novel-workshop-vue3/_audit/P2_outline_import_verify.png', Buffer.from(screenshot.data, 'base64'))

    await page.evaluate(({ original }) => {
      const currentKeys = window.electronAPI.storageList()
      for (const key of currentKeys) {
        if (!(key in original.storage)) window.electronAPI.storageRemove(key)
      }
      for (const key of Object.keys(original.storage)) window.electronAPI.storageWrite(key, original.storage[key])
      if (original.last === null || original.last === undefined) window.electronAPI.storageRemove('wa_lastProjectId')
      else window.electronAPI.storageWrite('wa_lastProjectId', original.last)
    }, { original })
  } finally {
    await browser.close()
  }
  if (!passed) process.exit(1)
}

main().catch((error) => {
  console.error('ERROR | P2 outline import verification | ' + error.stack)
  process.exit(1)
})
