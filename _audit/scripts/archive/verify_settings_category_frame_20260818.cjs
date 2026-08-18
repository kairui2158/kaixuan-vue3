const { createRequire } = require('module')
const requireFromProject = createRequire(process.cwd() + '/package.json')
const { chromium } = requireFromProject('playwright')
const fs = require('fs')
const path = require('path')

const reportPath = path.join(process.cwd(), '_audit', 'screenshots', 'settings_category_frame_verify.json')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts()[0].pages().find((item) => item.url().startsWith('file:'))
  if (!page) throw new Error('没有发现 Electron 页面')

  const categoryInteraction = await page.evaluate(async () => {
    const visible = (el) => {
      if (!el) return false
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const buttons = Array.from(document.querySelectorAll('#pl-sc-categories > button')).filter(visible)
    const results = []
    for (const button of buttons) {
      button.click()
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const frame = document.querySelector('.pl-sc-content-frame')
      const heading = frame?.querySelector('h4')?.textContent?.trim() || null
      const navigation = document.querySelector('.pl-settings-navigation')
      results.push({
        button: button.textContent.trim(),
        active: button.classList.contains('active'),
        heading,
        frameContainsNavigation: Boolean(frame && navigation && frame.contains(navigation)),
        frameHeight: frame ? Math.round(frame.getBoundingClientRect().height) : 0,
      })
    }
    return results
  })

  const result = await page.evaluate((categoryInteraction) => {
    const visible = (el) => {
      if (!el) return false
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const firstVisible = (selector) => Array.from(document.querySelectorAll(selector)).find(visible) || null
    const read = (el) => {
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return {
        tag: el.tagName,
        className: typeof el.className === 'string' ? el.className : '',
        y: Math.round(rect.y),
        height: Math.round(rect.height),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        display: style.display,
        flexDirection: style.flexDirection,
        border: `${style.borderTopWidth} ${style.borderRightWidth} ${style.borderBottomWidth} ${style.borderLeftWidth}`,
        background: style.backgroundColor,
      }
    }
    const settings = firstVisible('#pl-step-2-content')
    const navigation = firstVisible('.pl-settings-navigation')
    const contentFrame = firstVisible('.pl-sc-content-frame')
    const editor = firstVisible('.pl-sc-editor')
    const categoryActions = firstVisible('.pl-sc-category-actions')
    const footer = firstVisible('.pl-settings-footer-actions')
    const skillBar = firstVisible('#pl-step-2-content .pl-skill-bar')
    const agentBar = firstVisible('#pl-step-2-content .pl-agent-mode-bar')
    const categories = firstVisible('#pl-sc-categories')
    const frameContainsNavigation = Boolean(contentFrame && contentFrame.contains(navigation))
    const navigationContainsFrame = Boolean(navigation && navigation.contains(contentFrame))
    const visibleChildren = settings ? Array.from(settings.children).filter(visible).map(read) : []
    const order = [agentBar, skillBar, navigation, contentFrame, categoryActions, footer]
      .filter(Boolean)
      .map((el) => Math.round(el.getBoundingClientRect().y))
    return {
      url: location.href,
      pipelineVisible: visible(document.querySelector('#pipeline-panel')),
      settingsVisible: visible(settings),
      navigation: read(navigation),
      categories: read(categories),
      contentFrame: read(contentFrame),
      editor: read(editor),
      categoryActions: read(categoryActions),
      footer: read(footer),
      visibleChildren,
      frameContainsNavigation,
      navigationContainsFrame,
      contentFrameContainsOnlyEditor: Boolean(contentFrame && editor && contentFrame.contains(editor) && !contentFrame.contains(navigation)),
      verticalOrder: order,
      verticalOrderNonDecreasing: order.every((value, index) => index === 0 || value >= order[index - 1]),
      oldLayoutNodes: document.querySelectorAll('.pl-sc-layout, .pl-sc-items-area').length,
      oldDescriptionText: Array.from(document.querySelectorAll('#pl-step-2-content .pl-desc')).map((el) => el.textContent.trim()),
      categoryLabels: Array.from(document.querySelectorAll('#pl-sc-categories > button')).filter(visible).map((el) => el.textContent.trim()),
      categoryInteraction,
    }
  }, categoryInteraction)

  await page.screenshot({ path: path.join(process.cwd(), '_audit', 'screenshots', 'settings_category_frame.png'), fullPage: false })
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exit(1)
})
