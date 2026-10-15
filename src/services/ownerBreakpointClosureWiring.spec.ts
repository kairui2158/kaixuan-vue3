import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url)),
  'utf8'
)

describe('owner breakpoint lifecycle closure wiring', () => {
  it('clears the chain owner slot symmetrically and surfaces clear failures', () => {
    expect(source).toContain('await pipelineStore.clearBreakpoint(checkpointOwnerKey)')
    expect(source).toContain("type: 'chain-breakpoint-clear-failed'")
  })

  it('rejects completed chain checkpoints before entering the skill loop', () => {
    expect(source).toContain('resumePoint.completedChain')
    expect(source).toContain("type: 'chain-completed-checkpoint-rejected'")
  })

  it('does not return folder degraded output without a usable artifact', () => {
    expect(source).toContain('folder SKILL 降级且无有效输出')
    expect(source).toContain("type: 'folder-skill-degraded-with-error'")
  })

  it('keeps body length contracts at the generation step', () => {
    expect(source).toContain("type: 'body-chain-contract-failed'")
    expect(source).toContain('isBodyContractStep({')
  })
})
