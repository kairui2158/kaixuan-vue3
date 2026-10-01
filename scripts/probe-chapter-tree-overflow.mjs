import { chromium } from 'playwright'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const URL = 'http://127.0.0.1:5174/'
const widths = [1024, 1280, 1440, 1920]
const densities = ['default', 'comfortable', 'compact']
const treeWidths = [100, 140, 200, 300, 'default']

async function injectStress(page, theme, density) {
  await page.evaluate(({ theme, density }) => {
    document.body.classList.toggle('light-theme', theme === 'light')
    document.documentElement.dataset.density = density

    const pinia = globalThis.__pinia
    assert(Boolean(pinia), 'Pinia debug bridge not found')
    const state = pinia.state.value.project
    assert(Boolean(state), 'Project store state not found')

    const longText = '这是一个超长的卷名与章节名，用于验证章节树在极窄宽度下的文字裁切与边界表现。'
    state.projectName = '超长项目名称压力验证' + longText
    state.volumes = [
      { id: 'probe-vol', name: longText, outline: '' },
      { id: 'probe-vol-2', name: '短卷', outline: '' }
    ]
    state.chapters = {
      'probe-vol': [
        { id: 'probe-ch-1', title: longText, body: '', plot: '' },
        { id: 'probe-ch-2', title: '短章', body: '', plot: '' }
      ],
      'probe-vol-2': [
        { id: 'probe-ch-3', title: longText, body: '', plot: '' }
      ]
    }

    function assert(value, message) {
      if (!value) throw new Error(message)
    }
  }, { theme, density })
  await page.waitForTimeout(100)
}

async function scan(page, label) {
  const result = await page.evaluate(() => {
    const failures = []
    const tree = document.querySelector('.chapter-tree')
    assert(Boolean(tree), 'chapter tree not found')

    function assert(value, message) {
      if (!value) throw new Error(message)
    }

    function hasEllipsis(style) {
      return style.overflowX === 'hidden' && style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap'
    }

    function textRect(element) {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getBoundingClientRect()
    }

    for (const row of tree.querySelectorAll('.volume-item, .chapter-item')) {
      const rowRect = row.getBoundingClientRect()
      const rowStyle = getComputedStyle(row)
      const rowLabel = row.classList.contains('volume-item') ? 'volume-item' : 'chapter-item'
      if (row.scrollHeight > row.clientHeight + 1) {
        failures.push(`${rowLabel}: row scrollHeight ${row.scrollHeight} > clientHeight ${row.clientHeight}`)
      }
      if (rowStyle.whiteSpace !== 'nowrap' || rowStyle.overflowX !== 'hidden') {
        failures.push(`${rowLabel}: expected nowrap/hidden clipping, got ${rowStyle.whiteSpace}/${rowStyle.overflowX}`)
      }

      for (const child of row.children) {
        const rect = child.getBoundingClientRect()
        const style = getComputedStyle(child)
        const label = `${rowLabel} > ${child.tagName.toLowerCase()}.${String(child.className)}`
        if (rect.right > rowRect.right + 1 || rect.left < rowRect.left - 1) {
          failures.push(`${label}: rect ${rect.left.toFixed(1)}..${rect.right.toFixed(1)} outside row ${rowRect.left.toFixed(1)}..${rowRect.right.toFixed(1)}`)
        }

        if (child.tagName === 'INPUT') {
          if (style.minWidth === 'auto' || style.boxSizing !== 'border-box') {
            failures.push(`${label}: input needs min-width:0 and border-box, got ${style.minWidth}/${style.boxSizing}`)
          }
          if (rect.right > rowRect.right - Number.parseFloat(rowStyle.paddingRight) + 1) {
            failures.push(`${label}: input right ${rect.right.toFixed(1)} exceeds row content right ${(rowRect.right - Number.parseFloat(rowStyle.paddingRight)).toFixed(1)}`)
          }
          continue
        }

        const hasText = [...child.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())
        if (!hasText) continue
        const measuredText = textRect(child)
        if (measuredText.bottom > rowRect.bottom + 1 || measuredText.top < rowRect.top - 1) {
          failures.push(`${label}: text vertical ${measuredText.top.toFixed(1)}..${measuredText.bottom.toFixed(1)} outside row ${rowRect.top.toFixed(1)}..${rowRect.bottom.toFixed(1)}`)
        }
        if (!hasEllipsis(style) && measuredText.width > child.clientWidth + 1) {
          failures.push(`${label}: text width ${measuredText.width.toFixed(1)} > clientWidth ${child.clientWidth} without ellipsis`)
        }
      }
    }

    const project = tree.querySelector('.project-name')
    if (project && project.scrollWidth > project.clientWidth + 1 && !hasEllipsis(getComputedStyle(project))) {
      failures.push('project-name: text overflow without ellipsis')
    }

    const header = tree.querySelector('.tree-header')
    const headerRect = header?.getBoundingClientRect()
    for (const button of tree.querySelectorAll('.tree-header-actions .btn-sm')) {
      const rect = button.getBoundingClientRect()
      const style = getComputedStyle(button)
      const label = `tree-header-actions > ${button.id || button.className}`
      if (!headerRect) {
        failures.push(`${label}: header rect unavailable`)
        continue
      }
      if (rect.left < headerRect.left - 1 || rect.right > headerRect.right + 1) {
        failures.push(`${label}: rect ${rect.left.toFixed(1)}..${rect.right.toFixed(1)} outside header ${headerRect.left.toFixed(1)}..${headerRect.right.toFixed(1)}`)
      }
      if (style.whiteSpace !== 'nowrap') {
        failures.push(`${label}: expected nowrap, got ${style.whiteSpace}`)
      }
      if (button.scrollHeight > button.clientHeight + 1) {
        failures.push(`${label}: scrollHeight ${button.scrollHeight} > clientHeight ${button.clientHeight}`)
      }
      const measuredText = textRect(button)
      if (measuredText.height > button.clientHeight + 1) {
        failures.push(`${label}: text height ${measuredText.height.toFixed(1)} > clientHeight ${button.clientHeight}`)
      }
    }

    return {
      failures,
      treeWidth: tree.getBoundingClientRect().width,
      rows: tree.querySelectorAll('.volume-item, .chapter-item').length,
      firstRowHeight: tree.querySelector('.volume-item, .chapter-item')?.getBoundingClientRect().height ?? 0
    }
  })
  return { label, ...result }
}

const browser = await chromium.launch()
const results = []
try {
  for (const width of widths) {
    for (let i = 0; i < densities.length; i += 1) {
      const theme = i === 0 ? 'dark' : 'light'
      const density = densities[i]
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      await page.goto(URL, { waitUntil: 'networkidle' })
      await injectStress(page, theme, density)
      for (const treeWidth of treeWidths) {
        await page.evaluate(treeWidth => {
          const tree = document.querySelector('.chapter-tree')
          if (treeWidth === 'default') {
            tree.style.width = ''
            tree.style.minWidth = ''
            tree.style.maxWidth = ''
          } else {
            tree.style.width = `${treeWidth}px`
            tree.style.minWidth = `${treeWidth}px`
            tree.style.maxWidth = `${treeWidth}px`
          }
        }, treeWidth)
        await page.waitForTimeout(80)

        results.push(await scan(page, `${width}-${theme}-${density}-${treeWidth}px-rest`))
        if (width === 1440 && density === 'default' && treeWidth === 'default') {
          await page.screenshot({ path: '_audit/probe-chapter-tree-default.png', clip: { x: 0, y: 0, width: 260, height: 900 } })
        }

        await page.hover('.volume-item')
        await page.waitForTimeout(50)
        results.push(await scan(page, `${width}-${theme}-${density}-${treeWidth}px-volume-hover`))

        await page.dblclick('.volume-item')
        await page.waitForTimeout(80)
        results.push(await scan(page, `${width}-${theme}-${density}-${treeWidth}px-volume-rename`))
        await page.keyboard.press('Escape')
        await page.waitForTimeout(50)

        await page.hover('.chapter-item')
        await page.waitForTimeout(50)
        results.push(await scan(page, `${width}-${theme}-${density}-${treeWidth}px-chapter-hover`))

        await page.dblclick('.chapter-item')
        await page.waitForTimeout(80)
        results.push(await scan(page, `${width}-${theme}-${density}-${treeWidth}px-chapter-rename`))
        await page.keyboard.press('Escape')
        await page.waitForTimeout(50)
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
}

for (const result of results) {
  console.log(`${result.failures.length === 0 ? 'PASS' : 'FAIL'} ${result.label} tree=${result.treeWidth.toFixed(1)}px rows=${result.rows}`)
  for (const failure of result.failures) console.log(`  ${failure}`)
}

const failed = results.filter(result => result.failures.length > 0)
if (failed.length > 0) {
  console.error(`FAIL: ${failed.length}/${results.length} cases have overflow`)
  process.exit(1)
}
console.log(`PASS: ${results.length} chapter-tree stress cases verified`)
