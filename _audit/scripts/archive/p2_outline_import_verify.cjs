const { chromium } = require('playwright')
const fs = require('fs')
const reportPath = 'D:/codex/novel-workshop-vue3/_audit/P2_outline_import_verify.json'

const samples = [
  { label: 'TXT', path: 'D:/codex/novel-workshop-vue3/测试样本.txt', marker: '《绿潮》大纲总纲' },
  { label: 'MD', path: 'D:/codex/novel-workshop-vue3/docs/PIPELINE_FLOW.md', marker: '生成流水线结构导向图' }
]

function result(name, pass, detail) {
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + name + ' | ' + detail)
  results.push({ name, pass: !!pass, detail: detail || '' })
  return pass
}

const results = []

function normalize(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function makeStoredDocx() {
  const fileName = Buffer.from('word/document.xml', 'utf8')
  const xml = Buffer.from('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>P2 DOCX 大纲测试</w:t></w:r></w:p><w:p><w:r><w:t>第二行</w:t></w:r></w:p></w:body></w:document>', 'utf8')
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0, 6)
  local.writeUInt16LE(0, 8)
  local.writeUInt32LE(xml.length, 18)
  local.writeUInt32LE(xml.length, 22)
  local.writeUInt16LE(fileName.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(0, 10)
  central.writeUInt32LE(xml.length, 20)
  central.writeUInt32LE(xml.length, 24)
  central.writeUInt16LE(fileName.length, 28)
  central.writeUInt32LE(0, 42)
  const localEntry = Buffer.concat([local, fileName, xml])
  const centralEntry = Buffer.concat([central, fileName])
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(centralEntry.length, 12)
  eocd.writeUInt32LE(localEntry.length, 16)
  return Buffer.concat([localEntry, centralEntry, eocd])
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages()[0]
  let passed = true
  let original = null
  let cleanupDone = false
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
    original = await page.evaluate(() => ({
      storage: window.electronAPI.storageList().reduce((acc, key) => { acc[key] = window.electronAPI.storageRead(key); return acc }, {}),
      last: window.electronAPI.storageRead('wa_lastProjectId')
    }))

    await page.locator('#btn-outline-workspace').click()
    await page.waitForTimeout(250)
    const workspace = page.locator('#outline-workspace')
    passed = result('大纲工作台可打开', await workspace.count() === 1, String(await workspace.count())) && passed

    const importButtonState = await page.locator('#btn-import-outline').evaluate((el) => {
      const style = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        disabled: el.disabled,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        width: rect.width,
        height: rect.height,
        color: style.color,
        backgroundColor: style.backgroundColor
      }
    })
    passed = result('导入按钮真实可见可用', !importButtonState.disabled && importButtonState.display !== 'none' && importButtonState.visibility !== 'hidden' && importButtonState.opacity !== '0' && importButtonState.width > 0 && importButtonState.height > 0, JSON.stringify(importButtonState)) && passed

    const accept = await page.locator('#outline-workspace input[type="file"]').getAttribute('accept')
    passed = result('文件选择器接受 TXT/MD/RTF/DOCX', accept === '.txt,.md,.text,.rtf,.docx', JSON.stringify(accept)) && passed

    const importLabel = (await page.locator('#btn-import-outline').innerText()).trim()
    passed = result('导入按钮文案支持 .rtf', importLabel.includes('.rtf'), JSON.stringify(importLabel)) && passed
    passed = result('导入按钮文案不再显示旧式 .doc', !/\.doc\b/.test(importLabel), JSON.stringify(importLabel)) && passed

    for (const sample of samples) {
      const editor = page.locator('#outline-editor')
      const before = await editor.inputValue()
      await editor.fill('')
      await page.waitForTimeout(500)
      await page.locator('#btn-import-outline').click()
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

    const inlineSamples = [
      { label: 'RTF', name: 'p2-inline.rtf', mime: 'application/rtf', buffer: Buffer.from('{\\rtf1\\ansi P2 RTF 大纲测试\\par 第二行}', 'utf8'), marker: 'P2 RTF 大纲测试' }
    ]
    for (const sample of inlineSamples) {
      const editor = page.locator('#outline-editor')
      await editor.fill('')
      await page.locator('#btn-import-outline').click()
      await page.locator('#outline-workspace input[type="file"]').setInputFiles({
        name: sample.name,
        mimeType: sample.mime,
        buffer: sample.buffer
      })
      await page.waitForTimeout(700)
      const after = await editor.inputValue()
      passed = result(sample.label + ' 点击导入后内容可解析', after.includes(sample.marker), JSON.stringify(after)) && passed
    }

    const docxEditor = page.locator('#outline-editor')
    await docxEditor.fill('')
    await page.locator('#btn-import-outline').click()
    await page.locator('#outline-workspace input[type="file"]').setInputFiles({
      name: 'p2-inline.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: makeStoredDocx()
    })
    await page.waitForTimeout(700)
    const docxAfter = await docxEditor.inputValue()
    passed = result('DOCX 点击导入后内容可解析', docxAfter.includes('P2 DOCX 大纲测试') && docxAfter.includes('第二行'), JSON.stringify(docxAfter)) && passed

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
    cleanupDone = true

    await page.reload()
    await page.waitForTimeout(700)
    const reloadState = await page.evaluate(() => ({
      last: window.electronAPI.storageRead('wa_lastProjectId'),
      projects: (window.electronAPI.storageList() || []).filter((key) => /^wa_project[-_]/.test(key)).length
    }))
    passed = result('导入验证清理后重载不残留临时数据', reloadState.last === original.last && reloadState.projects === Object.keys(original.storage).filter((key) => /^wa_project[-_]/.test(key)).length, JSON.stringify(reloadState)) && passed
  } finally {
    if (original && !cleanupDone) {
      await page.evaluate(({ original }) => {
        const currentKeys = window.electronAPI.storageList()
        for (const key of currentKeys) {
          if (!(key in original.storage)) window.electronAPI.storageRemove(key)
        }
        for (const key of Object.keys(original.storage)) window.electronAPI.storageWrite(key, original.storage[key])
        if (original.last === null || original.last === undefined) window.electronAPI.storageRemove('wa_lastProjectId')
        else window.electronAPI.storageWrite('wa_lastProjectId', original.last)
      }, { original }).catch((cleanupError) => console.error('WARN | P2 cleanup | ' + cleanupError.message))
    }
    await browser.close()
  }
  fs.writeFileSync(reportPath, JSON.stringify({ name: 'P2 大纲文件导入闭环', generatedAt: new Date().toISOString(), passed, results }, null, 2), 'utf8')
  if (!passed) process.exit(1)
}

main().catch((error) => {
  console.error('ERROR | P2 outline import verification | ' + error.stack)
  process.exit(1)
})
