import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(
  new URL('../PipelinePanel.vue', import.meta.url),
  'utf8',
)

describe('body layer failed folder-step routing', () => {
  it('converts a body-chain folder failure into a structured result instead of discarding it', () => {
    const catchStart = pipelineSource.indexOf('} catch (error) {', pipelineSource.indexOf('onProviderQueue:'))
    const structuredFailedCheck = pipelineSource.indexOf("if (stepArtifactContext && folderResult?.status === 'failed')", catchStart)
    const throwEnd = pipelineSource.indexOf('throw error', structuredFailedCheck)
    const catchBlock = pipelineSource.slice(catchStart, throwEnd)

    expect(catchBlock).toContain('if (stepArtifactContext && folderResult?.status === \'failed\')')
    expect(catchBlock).toContain("output: folderResult.output,")
    expect(catchBlock).toContain("callerStatus: 'failed',")
    expect(catchBlock).toContain('blockingGateFailed: folderResult.blockingGateFailed === true,')
    expect(catchBlock).toContain('errors: folderResult.errors,')
    expect(catchBlock).toContain('stepCandidateAudit: stepArtifactCandidateAudit(folderResult.apiMeta)')
    expect(catchBlock.indexOf("if (stepArtifactContext && folderResult?.status === 'failed')"))
      .toBeGreaterThan(catchBlock.indexOf("blockingGateFailed ="))
  })

  it('keeps blocked handoff routing ahead of the structured-failed fallback', () => {
    const catchStart = pipelineSource.indexOf('} catch (error) {', pipelineSource.indexOf('onProviderQueue:'))
    const structuredFailedCheck = pipelineSource.indexOf("if (stepArtifactContext && folderResult?.status === 'failed')", catchStart)
    const throwEnd = pipelineSource.indexOf('throw error', structuredFailedCheck)
    const catchBlock = pipelineSource.slice(catchStart, throwEnd)

    expect(catchBlock).toContain("callerStatus: 'blocked'")
    expect(catchBlock.indexOf("callerStatus: 'blocked'"))
      .toBeLessThan(catchBlock.indexOf("callerStatus: 'failed'"))
  })
})
