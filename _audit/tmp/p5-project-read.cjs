const { createRequire } = require('module')
const req = createRequire('D:/codex/novel-workshop-vue3/package.json')
const { chromium } = req('playwright')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts().flatMap(context => context.pages())[0]
  if (!page) throw new Error('NO_PAGE')
  const result = await page.evaluate(() => {
    const api = window.electronAPI
    const keys = api.storageList() || []
    const projects = keys.filter(key => /project[_-]/i.test(key)).map(key => {
      const value = api.storageRead(key)
      const memories = value && value.memories
      return {
        key,
        projectName: value && value.projectName,
        memoryTotals: memories && memories.meta && memories.meta.totals,
        counts: memories ? {
          entities: Array.isArray(memories.entities) ? memories.entities.length : 0,
          relations: Array.isArray(memories.relations) ? memories.relations.length : 0,
          events: Array.isArray(memories.events) ? memories.events.length : 0,
          world: Array.isArray(memories.world) ? memories.world.length : 0,
          foreshadowing: Array.isArray(memories.foreshadowing) ? memories.foreshadowing.length : 0,
          items: Array.isArray(memories.items) ? memories.items.length : 0
        } : null
      }
    })
    return { keys: keys.filter(key => /project|lastProject/i.test(key)), projects }
  })
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
})().catch(error => {
  console.error(error.stack || error)
  process.exitCode = 1
})
