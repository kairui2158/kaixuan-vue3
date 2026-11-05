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

  it('routes the body contract through the protected executor contract at every body entry point', () => {
    expect(source).toContain('resolveProtectedBodySkillContract(')
    expect(source).toContain('protectedBodyContract')
    expect(source).toContain('protectedContract: protectedBodyContract')
    expect(source).not.toContain('generatorPromptSuffix ? `${nextPrompt}\\n\\n${generatorPromptSuffix}` : nextPrompt')
    expect(source).not.toContain('composePrompt += bodyGeneratorContractSentence(')
  })

  it('keeps the no-skill compose call a first-class unique body generator step', () => {
    expect(source).toContain("declaredRole: 'generator'")
    expect(source).toContain('composeArtifactContext')
    expect(source).toContain('setBodyGeneratorStepIndexForRun(pipelineRunId, 0)')
  })

  it('passes the orchestrator execution plan into every body API call', () => {
    expect(source).toContain('const generatorStep = resolveBodyGeneratorStepIndex(getStepSkillTemplates(4))')
    expect(source).toContain('totalSteps: getStepSkillTemplates(4).length')
    expect(source).toContain('context.executionPlan')
  })

  it('restores the generator index at every attempt start instead of clearing it to null', () => {
    expect(source).toContain('resolveAttemptStartGeneratorIndex({')
    expect(source).toContain('chainTotalSteps: bodyChainTotalSteps')
    expect(source).not.toContain('acceptanceState.bodyGeneratorStepIndex = null')
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

  it('emits breakpoint resume observability for failed checkpoints, not only saved handoffs', () => {
    expect(source).toContain('if (!executionPlan?.disableBreakpointReplay && resumePoint.resumed) {')
    expect(source).toContain("type: 'chain-handoff-resume'")
  })

  it('revalidates post-processed body output against the same contract gate', () => {
    expect(source).toContain('postProcessContractValidation')
    expect(source).toContain("type: 'body-post-process-contract-rejected'")
  })

  it('treats missing body contracts and multi-step generator ledgers as terminal configuration errors', () => {
    expect(source).toContain("type: 'body-chain-contract-missing' | 'body-generator-ledger-missing'")
    expect(source).toContain('if (step === 4 && !bodyChainContractForRun(pipelineRunId) && templates.length > 1)')
    expect(source).toContain('const bodyChainTotalSteps = getStepSkillTemplates(4).length')
    expect(source).toContain('if (bodyChainTotalSteps > 1 && !bodyChainContract)')
    expect(source).toContain('if (!authoritativeGeneratorMetadata && templates.length > 1)')
  })

  it('blocks a non-generator body terminal step before dispatch when the ledger is missing', () => {
    expect(source).toContain('const requiresGeneratorLedgerBeforeDispatch = Boolean(isFinalBodyStep && !isGeneratorStep && templates.length > 1)')
    expect(source.indexOf('const requiresGeneratorLedgerBeforeDispatch'))
      .toBeGreaterThan(source.indexOf('const generatorPromptSuffix ='))
    expect(source.indexOf('const resolvedTemplate = resolveSkillTemplate'))
      .toBeGreaterThan(source.indexOf('const requiresGeneratorLedgerBeforeDispatch'))
  })
})
