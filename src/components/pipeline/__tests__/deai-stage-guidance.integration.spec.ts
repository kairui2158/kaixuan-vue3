import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildDeaiStageDiagnosis, formatDeaiStageGuidance } from '../../../services/deaiStageDiagnosis'

const pipelineSource = readFileSync(
  new URL('../PipelinePanel.vue', import.meta.url),
  'utf8'
)
const runTraceSource = readFileSync(
  new URL('../../../../src/stores/runTrace.ts', import.meta.url),
  'utf8'
)
const diagnosisSource = readFileSync(
  new URL('../../../../src/services/deaiStageDiagnosis.ts', import.meta.url),
  'utf8'
)
const liveScriptSource = readFileSync(
  new URL('../../../../scripts/verify-deai-stage-guidance-live.mjs', import.meta.url),
  'utf8'
)
const electronScriptSource = readFileSync(
  new URL('../../../../scripts/verify-deai-stage-guidance-electron.mjs', import.meta.url),
  'utf8'
)

describe('DEAI stage guidance integration contract', () => {
  it('runs S2 diagnosis after generator acceptance and injects it into the next step prompt', () => {
    expect(pipelineSource).toContain('const stageDiagnosis = buildDeaiStageDiagnosis(stepOutput)')
    expect(pipelineSource).toContain('const stageGuidancePrompt = pendingStageDiagnosisGuidance')
    expect(pipelineSource).toContain('promptWithModelProfile,')
    expect(pipelineSource).toContain('`${modelProfilePrompt}\\n\\n${stageGuidancePrompt}`')

    const diagnosisIndex = pipelineSource.indexOf('const stageDiagnosis = buildDeaiStageDiagnosis(stepOutput)')
    const acceptanceIndex = pipelineSource.indexOf('current = stepOutput')
    const promptIndex = pipelineSource.indexOf('const stageGuidancePrompt = pendingStageDiagnosisGuidance')
    const stageGuidanceUsageIndex = pipelineSource.indexOf('promptWithModelProfile,')
    expect(acceptanceIndex).toBeGreaterThan(-1)
    expect(diagnosisIndex).toBeGreaterThan(acceptanceIndex)
    expect(promptIndex).toBeGreaterThan(-1)
    expect(stageGuidanceUsageIndex).toBeGreaterThan(promptIndex)
  })

  it('keeps stage guidance out of acceptance and retry decisions', () => {
    const acceptanceBlockStart = pipelineSource.indexOf('if (\n          isGeneratorStep &&')
    const acceptanceBlockEnd = pipelineSource.indexOf('current = stepOutput')
    const acceptanceBlock = pipelineSource.slice(acceptanceBlockStart, acceptanceBlockEnd)
    expect(acceptanceBlock).not.toContain('buildDeaiStageDiagnosis')
    expect(acceptanceBlock).not.toContain('stageGuidance')
  })

  it('keeps the new audit event in the retained trace whitelist', () => {
    expect(runTraceSource).toContain("'deai-stage-guidance'")
  })

  it('keeps the guidance payload bounded when composed for the next step user prompt', () => {
    const body = '他突然抬头。他非常突然地转身。她突然停下。'
    const diagnosis = buildDeaiStageDiagnosis(body, {
      detect: () => ({
        findings: [
          { id: 'deai-banned-vocab', severity: 'advisory', type: '高频禁用词', samples: ['突然(3)'] }
        ]
      })
    })
    const guidance = formatDeaiStageGuidance(diagnosis)
    const nextPrompt = '下一步正文提示'
    const composedPrompt = guidance ? `${nextPrompt}\n\n${guidance}` : nextPrompt

    expect(composedPrompt).toContain(nextPrompt)
    expect(composedPrompt).toContain('【S2诊断情报（有界，不改稿）】')
    expect(composedPrompt).toContain('位置 ')
    expect(guidance.length).toBeLessThanOrEqual(1200)
    expect(composedPrompt).not.toContain(body)
  })

  it('does not carry candidate prose in the trace event', () => {
    const eventStart = diagnosisSource.indexOf('export function buildDeaiStageGuidanceTraceEvent')
    const eventEnd = diagnosisSource.indexOf('\n}', eventStart) + 2
    const eventSource = diagnosisSource.slice(eventStart, eventEnd)
    expect(eventSource).toContain('findingCount')
    expect(eventSource).toContain('guidanceChars')
    expect(eventSource).toContain('hash')
    expect(eventSource).not.toContain('diagnosis.findings.map')
    expect(eventSource).not.toContain('JSON.stringify(diagnosis.findings)')
  })

  it('keeps takeover-state variants observable instead of tying them to prompt length', () => {
    expect(pipelineSource.match(
      /deaiPromptVariant: deaiVariant !== 'off' \? deaiVariant : undefined/g,
    )).toHaveLength(2)

    expect(pipelineSource).toContain('if (traceRunId && deaiVariant !== \'off\')')
    expect(pipelineSource).toContain('if (runId && deaiVariant !== \'off\')')
    expect(pipelineSource).not.toContain('deaiPromptVariant: systemPromptSuffix ? deaiVariant : undefined')
    expect(pipelineSource).not.toContain('deaiPromptVariant: deaiPrompt ? deaiVariant : undefined')
  })

  it('wires model facts, calibration, and report export into the body layer', () => {
    expect(pipelineSource).toContain('resolveDeaiModelProfileGuidanceForRun')
    expect(pipelineSource).toContain('buildDeaiModelProfileTraceEvent')
    expect(pipelineSource).toContain('recordDeaiCalibrationFindings')
    expect(pipelineSource).toContain('buildDeaiCalibrationTraceEvent')
    expect(pipelineSource).toContain('exportDeaiSkillReport')
    expect(pipelineSource).toContain('id="btn-pl-deai-skill-report"')
  })

  it('keeps report state and its exporting state outside the panel instance', () => {
    const stateSource = readFileSync(
      new URL('../../../../src/services/pipelinePerRunUiState.ts', import.meta.url),
      'utf8'
    )

    expect(pipelineSource).toContain('const perRunGenerationUi = pipelinePerRunGenerationUi')
    expect(pipelineSource).not.toContain('const perRunGenerationUi = reactive(new Map')
    expect(pipelineSource).toContain(':disabled="!displayedBodyDeaiSkillReportAvailable || displayedBodyDeaiSkillReportExporting"')
    expect(pipelineSource).toContain('deaiSkillReportExporting = true')
    expect(pipelineSource).toContain('deaiSkillReportExporting = false')
    expect(stateSource).toContain('deaiSkillReportExporting?: boolean')
  })

  it('keeps false-positive registration run-scoped and outside calibration decisions', () => {
    expect(pipelineSource).toContain('id="btn-pl-deai-false-positive"')
    expect(pipelineSource).toContain('registerDisplayedBodyDeaiFalsePositive')
    expect(pipelineSource).toContain('report.falsePositives = [...report.falsePositives, value]')
    expect(pipelineSource).not.toContain('falsePositives: []')
    const reportBlock = pipelineSource.slice(
      pipelineSource.indexOf('const reportInput: DeaiSkillReportInput = {'),
      pipelineSource.indexOf('const runUi = perRunUi(bodyRunId)', pipelineSource.indexOf('const reportInput: DeaiSkillReportInput = {'))
    )
    expect(reportBlock).toContain('falsePositives: falsePositiveFeedback')
    expect(reportBlock).not.toContain('recordDeaiCalibrationFindings')
  })

  it('keeps upstream stage diagnosis alive for the final report', () => {
    const diagnosisBlockStart = pipelineSource.indexOf('if (\r\n          isBodyLayer &&')
    const diagnosisBlockEnd = pipelineSource.indexOf('if (si < templates.length - 1 && runId)', diagnosisBlockStart)
    const diagnosisBlock = pipelineSource.slice(diagnosisBlockStart, diagnosisBlockEnd)
    const elseBlock = diagnosisBlock.slice(diagnosisBlock.indexOf('} else {'))

    expect(pipelineSource).toContain('if (runUi) runUi.deaiStageDiagnosis = stageDiagnosis')
    expect(elseBlock).not.toContain('deaiStageDiagnosis')
    expect(pipelineSource).toContain('acceptanceState.deaiStageDiagnosis = null')
    expect(pipelineSource).toContain('const PER_RUN_UI_TERMINAL_RETENTION_LIMIT = 40')
    expect(pipelineSource).toContain('function trimTerminalPerRunUiState()')
  })

  it('derives report variants from persisted API-call variants', () => {
    expect(pipelineSource).toContain('variants: collectDeaiPromptVariants(trace.runId)')
    expect(pipelineSource).toContain('function collectDeaiPromptVariants(runId: string | null | undefined): string[]')
    expect(pipelineSource).toContain('if (variant && variant !== \'off\') variants.add(variant)')
    expect(pipelineSource).not.toContain('variants: []')
  })

  it('keeps emitted collaboration events in the retained trace whitelist and drops report-only dead types', () => {
    for (const eventType of ['deai-model-profile', 'deai-calibration']) {
      expect(runTraceSource).toContain(`'${eventType}'`)
    }
    expect(runTraceSource).not.toContain("'deai-skill-report'")
  })

  it('binds model-profile guidance to the body-layer flag instead of a literal step number', () => {
    const callSiteStart = pipelineSource.indexOf('let modelProfilePrompt = \'\'')
    const callSiteEnd = pipelineSource.indexOf('modelProfilePrompt = modelProfile.guidance', callSiteStart)
    const callSite = pipelineSource.slice(callSiteStart, callSiteEnd)
    expect(callSite).toContain("const isBodyLayer = pipelineLayerForStep(step) === 'body'")
    expect(callSite).toContain('if (isBodyLayer) {')
    expect(callSite).toContain('resolveDeaiModelProfileGuidanceForRun(')
    expect(callSite).not.toContain('step === 4')
    expect(callSite).not.toContain('true,')
    expect(pipelineSource).toContain('if (\r\n          isBodyLayer &&\r\n          si < templates.length - 1 &&')
    expect(pipelineSource).not.toContain('if (\n          step === 4 &&\n          si < templates.length - 1 &&')
    expect(pipelineSource).not.toContain('if (step !== 4) return { guidance: \'\', traceEvent: null, warning: null }')
  })

  it('keeps model-profile injection frozen until calibration release', () => {
    const modelProfileSource = readFileSync(
      new URL('../../../../src/services/deaiModelProfile.ts', import.meta.url),
      'utf8',
    )

    expect(modelProfileSource).toContain('DEAI_MODEL_PROFILE_RELEASED = false')
    expect(modelProfileSource).toContain("DEAI_MODEL_PROFILE_RELEASE_GATE = 'calibration-not-ready'")
    expect(modelProfileSource).toContain('if (!DEAI_MODEL_PROFILE_RELEASED) return \'\'')
    expect(modelProfileSource).toContain('const frozen = !DEAI_MODEL_PROFILE_RELEASED')
    expect(modelProfileSource).toContain('releaseGate: frozen ? DEAI_MODEL_PROFILE_RELEASE_GATE : null')
    expect(modelProfileSource).toContain('模型事实画像已冻结，未注入')
  })

  it('keeps live stall detection independent of heartbeat timestamps', () => {
    for (const source of [liveScriptSource, electronScriptSource]) {
      const snapshotStart = source.indexOf('function currentRunSnapshot(page)')
      const snapshotEnd = source.indexOf('\n}', snapshotStart) + 2
      const snapshotSource = source.slice(snapshotStart, snapshotEnd)
      const waitStart = source.indexOf('async function waitForBodyCompletion(page)')
      const waitEnd = source.indexOf('\n}', waitStart) + 2
      const waitSource = source.slice(waitStart, waitEnd)

      expect(snapshotStart).toBeGreaterThan(-1)
      expect(waitStart).toBeGreaterThan(-1)
      expect(snapshotSource).not.toContain('at:')
      expect(waitSource).toContain('const signature = JSON.stringify(snapshot)')
    }
  })

  it('keeps live observations assertive instead of only collecting fields', () => {
    const assertionsStart = liveScriptSource.indexOf('function assertObservations(observations)')
    const assertionsEnd = liveScriptSource.indexOf('\n}', assertionsStart) + 2
    const assertionsSource = liveScriptSource.slice(assertionsStart, assertionsEnd)

    expect(assertionsStart).toBeGreaterThan(-1)
    for (const anchor of [
      'observation.stageGuidance.length > 0',
      'guidance.degraded, false',
      'guidance.budgetExceeded, false',
      'guidance.injected, true',
      'guidance.guidanceChars <= 1200',
      '诊断 · \\d+条\\/\\d+字符',
      "profile.releaseGate, 'calibration-not-ready'",
    ]) {
      expect(assertionsSource).toContain(anchor)
    }
  })

  it('keeps stage diagnosis guidance and report state isolated per pipeline run', () => {
    const stateSource = readFileSync(
      new URL('../../../../src/services/pipelinePerRunUiState.ts', import.meta.url),
      'utf8'
    )

    expect(pipelineSource).toContain('function perRunUi(runId: string | null | undefined): PerRunGenerationUiState | null')
    expect(pipelineSource).toContain('perRunGenerationUi.get(runId)')
    expect(pipelineSource).toContain('perRunGenerationUi.set(runId, state)')
    expect(pipelineSource).toContain('let pendingStageDiagnosisGuidance = \'\'')
    expect(pipelineSource.match(/if \(runUi\) runUi\.deaiStageDiagnosis = stageDiagnosis/g)).toHaveLength(1)
    expect(pipelineSource).toContain('acceptanceState.deaiStageDiagnosis = null')
    expect(stateSource).toContain('deaiStageDiagnosis?: DeaiStageDiagnosis | null')
    expect(stateSource).toContain('deaiSkillReport?: DeaiSkillReportInput | null')
  })

  it('builds the completed-run report from bodyRunId instead of the displayed run', () => {
    expect(pipelineSource).toContain('const collaboration = resolveDeaiCollaborationDisplayForPipelineRun({')
    expect(pipelineSource).toContain('pipelineRunId: bodyRunId,')
    expect(pipelineSource).not.toContain('const collaboration = displayedBodyDeaiCollaboration.value')
  })
})
