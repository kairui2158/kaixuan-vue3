import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pipelineSource = readFileSync(new URL('../components/pipeline/PipelinePanel.vue', import.meta.url), 'utf8')

describe('prose hard signal wiring', () => {
  it('runs the hard signal net before persistence and independently of DEAI switches', () => {
    const hardSignalCall = pipelineSource.indexOf('runProseHardSignalNet(')
    const bodyPersistenceCall = pipelineSource.indexOf("await trace.measurePhase('persistence', () => projectStore.saveProject())", pipelineSource.indexOf('async function genBody('))

    expect(hardSignalCall).toBeGreaterThan(-1)
    expect(hardSignalCall).toBeLessThan(bodyPersistenceCall)
    expect(pipelineSource).not.toContain('deAiStore.hardruleEnabled')
  })

  it('uses a bounded local repair window instead of resending the full body', () => {
    expect(pipelineSource).toContain('buildHardSignalRepairWindow')
    expect(pipelineSource).toContain('runHardSignalRepair(current, scan, traceRunId, attempt, bodyRunId)')
    expect(pipelineSource).not.toContain('runHardSignalRepair(finalBody, scan, traceRunId, attempt)')
  })

  it('writes hard signal scans into runTrace and keeps the unresolved terminal explicit', () => {
    expect(pipelineSource).toContain("type: 'hard_signal_scan'")
    expect(pipelineSource).toContain("hard_signal_unresolved")
    expect(pipelineSource).toContain('hardSignalUnresolvedRuns.add(traceRunId)')
  })

  it('degrades the final run outcome when hard signals remain unresolved', () => {
    expect(pipelineSource).toContain('hardSignalUnresolved: hardSignalUnresolvedRuns.has(runId)')
  })

  it('feeds the latest successful body finish reason into the first hard signal scan', () => {
    const scanCall = pipelineSource.indexOf('runProseHardSignalNet(finalBody, trace.runId!, bodyRunId,')
    const finishReasonSource = pipelineSource.indexOf('latestBodyFinishReason(trace.runId!)')

    expect(scanCall).toBeGreaterThan(-1)
    expect(finishReasonSource).toBeGreaterThan(scanCall)
    expect(pipelineSource).toContain('function latestBodyFinishReason(traceRunId: string)')
    expect(pipelineSource).toContain("call.step === 4 &&")
    expect(pipelineSource).toContain("(call.status === 'success' || call.status === 'degraded') &&")
    expect(pipelineSource).toContain('call.finishReason')
  })

  it('never repairs provider-level truncation locally and lets it reach the unresolved terminal', () => {
    const repairFunction = pipelineSource.indexOf('async function runHardSignalRepair(')
    const providerGuard = pipelineSource.indexOf("if (finding.origin === 'provider')", repairFunction)
    const unresolvedTerminal = pipelineSource.indexOf('hard_signal_unresolved')
    const repairCall = pipelineSource.indexOf('runHardSignalRepair(current, scan, traceRunId, attempt, bodyRunId)')

    expect(repairFunction).toBeGreaterThan(-1)
    expect(providerGuard).toBeGreaterThan(repairFunction)
    expect(providerGuard).toBeLessThan(repairCall)
    expect(unresolvedTerminal).toBeGreaterThan(-1)
  })
})
