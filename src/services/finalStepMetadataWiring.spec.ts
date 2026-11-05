import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url)),
  'utf8'
)
const acceptanceSource = readFileSync(
  fileURLToPath(new URL('./stepArtifactAcceptance.ts', import.meta.url)),
  'utf8'
)

describe('final step metadata fidelity wiring', () => {
  it('resolves the final step from a single chain-level rule', () => {
    expect(source).toContain('import { bodyGeneratorContractSentence, isBodyContractStep, resolveAttemptStartGeneratorIndex, resolveBodyGeneratorStepIndex, resolveFinalStepEchoRole, resolveFinalStepRole }')
    expect(source).toContain('const finalStepRole = bodyStepContext')
    expect(source).toContain('resolveFinalStepRole({')
    expect(source).toContain("const finalStepMetadataMode = finalStepRole?.mode === 'final_step_ledger'")
    expect(source).toContain("const finalStepRetry = finalStepRole?.role === 'polish'")
    expect(source).toContain("if (finalStepRole?.reason === 'unresolved' && si === templates.length - 1)")
  })

  it('resolves final-step echo semantics without reverting to a hardcoded role', () => {
    expect(source).toContain("const finalStepEchoRole = resolveFinalStepEchoRole(finalStepRole) ?? 'polish'")
    expect(source.match(/finalStepRole: finalStepEchoRole/g)).toHaveLength(3)
    const repairEchoCall = source.indexOf('shouldRepairChainEcho(si, templates.length, echoDiagnostic.echoRatio')
    expect(repairEchoCall).toBeGreaterThan(0)
    const repairEchoOptions = source.slice(repairEchoCall, repairEchoCall + 260)
    expect(repairEchoOptions).toContain('finalStepRole: finalStepEchoRole')
    expect(repairEchoOptions).not.toContain("finalStepRole: 'polish'")
    expect(source).not.toContain('finalStepRole: finalStepEchoRole || undefined')
  })

  it('routes the final step ledger through both normal and escalation prompts', () => {
    expect(source).toContain('metadataMode: finalStepMetadataMode')
    const normalPrompt = source.indexOf('const nextPrompt = buildChainSkillPrompt')
    const escalationPrompt = source.indexOf('const fullRetryPrompt = buildChainSkillPrompt')
    expect(normalPrompt).toBeGreaterThan(0)
    expect(escalationPrompt).toBeGreaterThan(normalPrompt)
    expect(source.slice(escalationPrompt, source.indexOf('})', escalationPrompt)))
      .toContain('metadataMode: finalStepMetadataMode')
  })

  it('restores the authoritative generator ledger when an attempt resumes from a breakpoint', () => {
    expect(source).toContain('let authoritativeGeneratorMetadata: Record<string, unknown> | null = null')
    expect(source).toContain('authoritativeGeneratorMetadata = artifactFlow.metadata')
    expect(source).toContain('completedStepOutputs.find(output => output.skillIndex === persistedGeneratorIndex)?.metadata || null')
  })

  it('keeps the S2 ledger authoritative in the final persisted step output', () => {
    expect(source.match(/upstreamStepMetadata = authoritativeGeneratorMetadata \|\| upstreamStepMetadata/g))
      .toHaveLength(2)
    expect(source).toContain('resolveFinalStepMetadataFlow({')
    expect(source).toContain("type: 'body-final-step-metadata'")
    expect(acceptanceSource).toContain("code: 'body-final-step-metadata-repaired'")
    expect(source).toContain('metadata: bodyAttemptMetadataState.finalStepFlow?.metadata || bodyArtifact.metadata')
  })

  it('surfaces warning codes instead of silently replacing S3 output', () => {
    expect(source).toContain("type: warning.code")
    expect(acceptanceSource).toContain("code: 'body-final-step-fact-divergence'")
    expect(source).toContain('finalStepMetadata: bodyAttemptMetadataState.finalStepFlow')
  })

  it('wires the single-source final retry feedback through both channels', () => {
    expect(source).toContain('function buildFinalStepUpstreamAnchors')
    expect(source).toContain('function buildFinalStepEchoRetryFeedback')
    expect(source).toContain('buildFinalStepEchoRetryFeedback(')
    expect(source).toContain("finalStepRetry ?? { role: 'polish' as const, deaiDetection: 'on' as const }")
    expect(source).toContain("channel: 'non-folder'")
    expect(source).not.toContain('[修复反馈] 上一步输出与本步输出高度重复。请只输出本步骤定稿产物。')
    expect(source).not.toContain('let lastFinalStepCandidate')
  })

  it('keeps compose mode out of the final-step retry contract', () => {
    const composeCall = source.indexOf('composeStepResult = await callValidatedSkill')
    expect(composeCall).toBeGreaterThan(0)
    const composeSlice = source.slice(composeCall, source.indexOf(')', composeCall))
    expect(composeSlice).not.toContain('finalStepRetry')
    expect(source).toContain('composeArtifactContext')
    expect(source).toContain('result = composeStepResult.output')
  })
})
