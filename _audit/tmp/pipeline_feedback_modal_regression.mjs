import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })

const result = await page.evaluate(async () => {
  const vue = await import('/node_modules/.vite/deps/vue.js?v=64c2b3d7')
  const { createPinia } = await import('/node_modules/.vite/deps/pinia.js?v=64c2b3d7')
  const { usePipelineStore } = await import('/src/stores/pipeline.ts')
  const PipelinePanel = (await import('/src/components/pipeline/PipelinePanel.vue')).default

  window.electronAPI = {
    storageRead: async () => null,
    storageWrite: async () => true,
    storageList: async () => [],
    storageDelete: async () => true
  }

  const host = document.createElement('div')
  document.body.appendChild(host)
  const pinia = createPinia()
  const app = vue.createApp({ render: () => vue.h(PipelinePanel) })
  app.use(pinia)
  app.mount(host)
  await vue.nextTick()

  const pipeline = usePipelineStore(pinia)
  const setupState = app._instance?.subTree?.component?.setupState || {}
  if (setupState.activeGenerationFeedbackStep === undefined) throw new Error(`active feedback step state missing: ${JSON.stringify(Object.keys(setupState))}`)

  const visibleOverlays = () => [
    'pl-settings-generation-overlay',
    'pl-volume-generation-overlay',
    'pl-chapter-generation-overlay'
  ].filter(id => document.getElementById(id))

  const cases = []
  const expected = {
    1: 'pl-settings-generation-overlay',
    2: 'pl-volume-generation-overlay',
    3: 'pl-chapter-generation-overlay'
  }

  for (const step of [1, 2, 3]) {
    pipeline.isGenerating = true
    setupState.activeGenerationFeedbackStep = step
    await vue.nextTick()
    const visible = visibleOverlays()
    cases.push({ step, visible, passed: visible.length === 1 && visible[0] === expected[step] })

    pipeline.isGenerating = false
    await vue.nextTick()
    const completedVisible = visibleOverlays()
    cases.push({
      step,
      phase: 'completed-no-logs',
      visible: completedVisible,
      passed: completedVisible.length === 0
    })
  }

  setupState.activeGenerationFeedbackStep = null
  pipeline.isGenerating = false
  await vue.nextTick()
  const idle = visibleOverlays()

  return {
    cases,
    idle,
    allPassed: [...cases, { passed: idle.length === 0 }].every(item => item.passed)
  }
})

if (!result.allPassed || pageErrors.length > 0) {
  throw new Error(`Pipeline feedback regression failed: ${JSON.stringify({ result, pageErrors })}`)
}

writeFileSync('_audit/tmp/pipeline_feedback_modal_result.json', JSON.stringify({ ...result, pageErrors }, null, 2))
console.log(JSON.stringify({ ...result, pageErrors }, null, 2))
await browser.close()
