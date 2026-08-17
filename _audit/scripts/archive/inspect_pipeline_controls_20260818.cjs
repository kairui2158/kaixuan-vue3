const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('dist-renderer/index.html'))
  if (!page) throw new Error('Electron page not found')
  const data = await page.evaluate(() => ({
    selects: [...document.querySelectorAll('#pipeline-panel select')].map((el) => ({
      id: el.id,
      name: el.getAttribute('name'),
      cls: el.className,
      value: el.value,
      options: [...el.options].map((o) => ({ value: o.value, text: o.textContent.trim() })).slice(0, 20)
    })),
    buttons: [...document.querySelectorAll('#pipeline-panel button')].map((el) => ({
      id: el.id,
      cls: el.className,
      text: (el.textContent || '').trim()
    })),
    inputs: [...document.querySelectorAll('#pipeline-panel input, #pipeline-panel textarea')].map((el) => ({
      id: el.id,
      name: el.getAttribute('name'),
      cls: el.className,
      value: el.value || ''
    }))
  }))
  console.log(JSON.stringify(data, null, 2))
  await browser.close()
}

main().catch((err) => { console.error(err.stack || err); process.exitCode = 1 })
.finally(() => setTimeout(() => process.exit(process.exitCode || 0), 50))
