const { createRequire } = require('module')
const requireFromProject = createRequire(process.cwd() + '/package.json')
const { chromium } = requireFromProject('playwright')
const fs = require('fs')
const path = require('path')

const reportPath = path.join(process.cwd(), '_audit', 'screenshots', 'settings_layout_horizontal_verify.json')

function rect(el) {
  if (!el) return null
  const r = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
    display: style.display,
    flexDirection: style.flexDirection,
    gridTemplateColumns: style.gridTemplateColumns,
  }
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages().find((item) => item.url().startsWith('file:'))
  if (!page) throw new Error('没有发现 Electron 页面')

  const result = await page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'
    }
    const getRect = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
        display: s.display,
        flexDirection: s.flexDirection,
        flexWrap: s.flexWrap,
        gridTemplateColumns: s.gridTemplateColumns,
      }
    }
    const node = (selector) => document.querySelector(selector)
    const workspace = node('#pl-settings-workspace')
    const navigation = node('.pl-settings-navigation')
    const categories = node('#pl-sc-categories')
    const addCategory = node('.pl-sc-add-cat')
    const editor = node('.pl-sc-editor')
    const footer = node('.pl-settings-footer-actions')
    const visibleNode = (selector) => Array.from(document.querySelectorAll(selector)).find(visible)
    const y = (selector) => {
      const el = visibleNode(selector)
      return el ? Math.round(el.getBoundingClientRect().y) : null
    }
    const categoryRects = Array.from(document.querySelectorAll('#pl-sc-categories > button')).filter(visible).map((el) => {
      const r = el.getBoundingClientRect()
      return { text: el.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
    })
    const rows = [y('#pl-step-2-content > .pl-step-tools'), y('#pl-step-2-content > .pl-desc'), y('.pl-settings-navigation'), y('.pl-sc-editor'), y('.pl-settings-footer-actions')].filter((value) => value !== null)
    const visibleChildren = Array.from(document.querySelectorAll('#pl-step-2-content > *')).filter(visible).map((el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return { className: el.className, y: Math.round(r.y), height: Math.round(r.height), bottom: Math.round(r.bottom), display: s.display, flex: s.flex, marginBottom: s.marginBottom }
    })
    return {
      url: location.href,
      pipelineVisible: visible(node('#pipeline-panel')),
      settingsVisible: visible(node('#pl-step-2-content')),
      workspace: getRect(workspace),
      navigation: getRect(navigation),
      categories: getRect(categories),
      addCategory: getRect(addCategory),
      editor: getRect(editor),
      footer: getRect(footer),
      categoryRects,
      rowYs: rows,
      rowsNonDecreasing: rows.every((value, index) => index === 0 || value >= rows[index - 1]),
      visibleChildren,
      oldLayoutNodes: document.querySelectorAll('.pl-sc-layout, .pl-sc-items-area').length,
      workspaceGridColumns: workspace ? getComputedStyle(workspace).gridTemplateColumns : null,
      workspaceFlexDirection: workspace ? getComputedStyle(workspace).flexDirection : null,
      categoriesFlexDirection: categories ? getComputedStyle(categories).flexDirection : null,
      categoriesFlexWrap: categories ? getComputedStyle(categories).flexWrap : null,
    }
  })

  await page.screenshot({ path: path.join(process.cwd(), '_audit', 'screenshots', 'settings_layout_horizontal.png'), fullPage: false })
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exit(1)
})
