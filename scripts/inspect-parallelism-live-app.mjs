import { chromium } from 'playwright-core'

const CDP_PORT = Number(process.env.SHENYI_PARALLELISM_CDP_PORT || 9222)

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`)
const context = browser.contexts().find(Boolean)
const page = context.pages().find(Boolean)
if (!page) throw new Error('no page found')

const diagnostics = await page.evaluate(() => {
  const stores = window.__pinia?._s
  const pipeline = stores?.get('pipeline')
  const trace = stores?.get('runTrace')
  const project = stores?.get('project')
  const bodyRuns = (pipeline?.runs || []).filter(run => run.layer === 'body')
  const latestBodyRun = bodyRuns.at(-1) || null
  const traceRun = latestBodyRun
    ? (trace?.runs || []).find(run => run.pipelineRunId === latestBodyRun.runId) || null
    : null
  return {
    url: window.location.href,
    appVisible: Boolean(document.querySelector('#app')),
    activePanel: [...document.querySelectorAll('[id*="pipeline"], [id*="settings"]')]
      .filter(element => element.id && element.checkVisibility?.())
      .map(element => ({ id: element.id, tag: element.tagName })),
    pipelineRuns: (pipeline?.runs || []).map(run => ({
      runId: run.runId,
      layer: run.layer,
      target: run.target,
      status: run.status,
      progress: run.progress,
      error: run.error || null,
    })),
    latestBodyRun: latestBodyRun ? {
      runId: latestBodyRun.runId,
      status: latestBodyRun.status,
      statusText: latestBodyRun.statusText,
      error: latestBodyRun.error || null,
      result: latestBodyRun.result || null,
    } : null,
    traceRun: traceRun ? {
      id: traceRun.id,
      status: traceRun.status,
      step: traceRun.step,
      error: traceRun.error || null,
      eventTypes: (traceRun.events || []).map(event => event.type),
      apiCalls: (traceRun.apiCalls || []).map(call => ({
        id: call.id,
        status: call.status,
        skillName: call.skillName,
        error: call.error || null,
        physicalCalls: (call.physicalCalls || []).map(item => ({
          status: item.status,
          error: item.error || null,
        })),
      })),
    } : null,
    chapterBody: (() => {
      const chapter = Object.values(project?.chapters || {}).flat()
        .find(item => item?.id === latestBodyRun?.target)
      return chapter ? {
        id: chapter.id,
        bodyChars: String(chapter.body || '').length,
        status: chapter.status || null,
      } : null
    })(),
  }
})

console.log(JSON.stringify(diagnostics, null, 2))
await browser.close()
