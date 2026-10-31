import type { RunTrace } from '../../stores/runTrace'
import { BODY_LAYER_STEP } from '../../services/skillDeaiContract'

export type DeaiSettingsObservationRun = Pick<RunTrace, 'id' | 'source' | 'events'>

interface DeaiInjectionPolicyDetail {
  step?: unknown
  policy?: {
    finalStepDetection?: unknown
  } | null
}

export interface DeaiSettingsObservations {
  lastChangeRate: number | null
  qualityGateDegraded: string
  finalStepDetection: 'on' | 'off' | null
}

/**
 * Manual DEAI observations and pipeline SKILL declarations use different trace
 * sources. Keeping the two reads in one function prevents either surface from
 * displaying the other side's events.
 */
export function collectDeaiSettingsObservations(
  runs: readonly DeaiSettingsObservationRun[],
): DeaiSettingsObservations {
  let lastChangeRate: number | null = null
  let qualityGateDegraded = ''
  let finalStepDetection: 'on' | 'off' | null = null

  const manualObservationsIncomplete = () =>
    lastChangeRate === null || !qualityGateDegraded
  const pipelineDeclarationIncomplete = () => finalStepDetection === null

  for (let runIndex = runs.length - 1; runIndex >= 0; runIndex -= 1) {
    const run = runs[runIndex]
    if (!run) continue
    const manualRun = run.source === 'home'
    const pipelineRun = run.source === 'pipeline'
    if (!manualRun && !pipelineRun) continue

    const events = run.events || []
    for (let eventIndex = events.length - 1; eventIndex >= 0; eventIndex -= 1) {
      const event = events[eventIndex]
      if (!event) continue

      if (manualRun && lastChangeRate === null && event.type === 'deai-change-rate') {
        try {
          const value = JSON.parse(String(event.detail || '{}')) as { changeRate?: unknown }
          if (typeof value.changeRate === 'number' && Number.isFinite(value.changeRate)) {
            lastChangeRate = value.changeRate
          }
        } catch {
          // Invalid manual detail stays invisible instead of breaking the settings page.
        }
      } else if (manualRun && !qualityGateDegraded && event.type === 'deai-quality-gate-degraded') {
        qualityGateDegraded = event.detail || '降AI门禁降级'
      } else if (
        pipelineRun &&
        finalStepDetection === null &&
        event.type === 'deai-injection-policy'
      ) {
        try {
          const detail = JSON.parse(String(event.detail || '{}')) as DeaiInjectionPolicyDetail
          if (detail.step === BODY_LAYER_STEP && detail.policy?.finalStepDetection === 'off') {
            finalStepDetection = 'off'
          }
        } catch {
          // A malformed pipeline detail must not hide the other observations.
        }
      }
    }

    if (manualObservationsIncomplete() || pipelineDeclarationIncomplete()) continue
    break
  }

  return { lastChangeRate, qualityGateDegraded, finalStepDetection }
}
