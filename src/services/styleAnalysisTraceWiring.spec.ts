import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(
  fileURLToPath(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url)),
  'utf8'
)
const outlineSource = readFileSync(
  fileURLToPath(new URL('../components/common/OutlineWorkspace.vue', import.meta.url)),
  'utf8'
)

function callSlice(source: string, marker: string) {
  const start = source.indexOf(marker)
  expect(start).toBeGreaterThan(0)
  const end = source.indexOf('meta: { source:', start)
  const callEnd = source.indexOf('})', end)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, callEnd)
}

function handlerSlice(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  expect(start).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('style analysis trace wiring', () => {
  it('records the pipeline style-analysis model request in the run trace', () => {
    const handler = handlerSlice(
      pipelineSource,
      'async function handlePipelineStyleAnalysisRequest',
      'function getStepAgentConfig'
    )
    expect(handler).toContain('runTraceStore.startApiCall(')
    expect(handler).toContain('runTraceStore.appendPhysicalCall(')
    expect(handler).toContain('runTraceStore.finishApiCall(')
    expect(handler).toContain('requestMessages: messagesToCall')
    expect(handler).toContain('providerId: provider.id')
    expect(handler).toContain('model,')
    expect(handler).toContain('startStepTrace(0, "大纲风格分析", "style-analysis")')
  })

  it('records the outline style-analysis model request in the run trace', () => {
    const handler = handlerSlice(
      outlineSource,
      'async function handleStyleAnalysisRequest',
      'function recordOutlineFinalDraftStyleConstraints'
    )
    expect(handler).toContain('runTraceStore.startApiCall(')
    expect(handler).toContain('runTraceStore.appendPhysicalCall(')
    expect(handler).toContain('runTraceStore.finishApiCall(')
    expect(handler).toContain('requestMessages: messagesToCall')
    expect(handler).toContain('providerId: provider.id')
    expect(handler).toContain('model,')
  })

  it('closes both style-analysis calls on request failure', () => {
    const pipelineSlice = pipelineSource.slice(
      pipelineSource.indexOf('async function handlePipelineStyleAnalysisRequest'),
      pipelineSource.indexOf('function getStepAgentConfig')
    )
    const outlineSlice = outlineSource.slice(
      outlineSource.indexOf('async function handleStyleAnalysisRequest'),
      outlineSource.indexOf('function recordOutlineFinalDraftStyleConstraints')
    )
    expect(pipelineSlice.match(/runTraceStore\.finishApiCall\(/g)).toHaveLength(2)
    expect(outlineSlice.match(/runTraceStore\.finishApiCall\(/g)).toHaveLength(2)
  })
})
