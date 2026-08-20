const { createRequire } = require('module')
const req = createRequire('D:/codex/novel-workshop-vue3/package.json')
const { chromium } = req('playwright')

;(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9227')
  const page = browser.contexts().flatMap(context => context.pages())[0]
  if (!page) throw new Error('NO_PAGE')
  const state = await page.evaluate(() => {
    const pinia = globalThis.__pinia
    const project = pinia && pinia._s && pinia._s.get('project')
    const memory = project && project.memories
    return {
      currentProjectId: project && project.currentProjectId,
      projectName: project && project.projectName,
      counts: memory ? {
        entities: memory.entities?.length || 0,
        relations: memory.relations?.length || 0,
        events: memory.events?.length || 0,
        world: memory.world?.length || 0,
        foreshadowing: memory.foreshadowing?.length || 0
      } : null,
      entityNames: memory?.entities?.map(item => item.name).slice(0, 5) || []
    }
  })
  console.log('STATE=' + JSON.stringify(state))
  const requests = []
  const listener = request => {
    if (request.method() === 'POST' && /chat\/completions/i.test(request.url())) {
      const body = request.postData() || ''
      requests.push(body)
      console.log('REQUEST_BODY=' + body)
    }
  }
  page.on('request', listener)
  const input = page.locator('#user-input')
  const send = page.locator('#btn-send')
  if (!await input.count() || !await send.count()) throw new Error('CHAT_CONTROLS_MISSING')
  await input.fill('请仅回复：已读取相关记忆')
  await send.click()
  console.log('REAL_CHAT_CLICKED=true')
  await page.waitForTimeout(5000)
  const bodies = requests.join('\n')
  console.log('CAPTURED_REQUESTS=' + requests.length)
  console.log('HAS_MEMORY_LABEL=' + bodies.includes('相关记忆'))
  console.log('HAS_ENTITY_NAME=' + state.entityNames.some(name => name && bodies.includes(name)))
  await browser.close()
})().catch(error => {
  console.error(error.stack || error)
  process.exitCode = 1
})
