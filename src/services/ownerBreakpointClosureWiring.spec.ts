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
    expect(source).toContain("type: 'body-generator-step-rejected'")
    expect(source).toContain('isBodyContractStep({')
    expect(source).toContain('bodyGeneratorContractSentence(')
  })

  it('keeps the no-skill compose call a first-class unique body generator step', () => {
    expect(source).toContain("declaredRole: 'generator'")
    expect(source).toContain('composeArtifactContext')
    expect(source).toContain('currentBodyGeneratorStepIndex.value = 0')
  })

  it('passes the orchestrator execution plan into every body API call', () => {
    expect(source).toContain('const generatorStep = resolveBodyGeneratorStepIndex()')
    expect(source).toContain('totalSteps: getStepSkillTemplates(4).length')
    expect(source).toContain('context.executionPlan')
  })

  it('keeps successful body step outputs alive for targeted repair attempts', () => {
    expect(source).toContain('let previousBodyStepOutputs: ChainBreakpointStepOutput[] = []')
    expect(source).toContain('const rememberBodyStepOutputs = (outputs: ChainBreakpointStepOutput[]) => {')
    expect(source).toContain('previousBodyStepOutputs = outputs')
    expect(source).toContain('upstreamStepOutputs: previousBodyStepOutputs')
    expect(source).toContain('onStepOutputs: rememberBodyStepOutputs')
    expect(source).toContain('executionPlan?.onStepOutputs?.(completedStepOutputs)')
  })

  it('prefers attempt-scoped upstream outputs over a cleared completed breakpoint', () => {
    expect(source).toContain('const upstreamSource = executionPlan.upstreamStepOutputs?.length')
    expect(source).toContain('? executionPlan.upstreamStepOutputs')
  })
})
