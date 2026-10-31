// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DeAiSettings from './DeAiSettings.vue'
import {
  collectDeaiSettingsObservations,
  type DeaiSettingsObservationRun,
} from './DeAiSettingsObservations'
import { useRunTraceStore, type RunTrace } from '../../stores/runTrace'

function runFixture(id: string, source: RunTrace['source']): RunTrace {
  return {
    id,
    source,
    sourceName: source,
    mode: 'test',
    skillNames: [],
    status: 'success',
    startedAt: Number(id.replace(/\D/g, '')) || 1,
    stateHistory: [],
    events: [],
    apiCalls: [],
    promptSnapshots: [],
    processingReports: [],
    payloads: [],
  } as RunTrace
}

describe('DeAI settings source isolation', () => {
  it('keeps manual observations from reading pipeline runs', () => {
    const manualRun = runFixture('run-1', 'home')
    manualRun.events.push({
      id: 'event-manual',
      ts: 1,
      level: 'info',
      type: 'deai-change-rate',
      label: '手动降AI深度修复变更率',
      detail: JSON.stringify({ changeRate: 0.2 }),
    })
    const pipelineRun = runFixture('run-2', 'pipeline')
    pipelineRun.events.push({
      id: 'event-pipeline',
      ts: 2,
      level: 'warn',
      type: 'deai-quality-gate-degraded',
      label: '流水线降AI门禁降级',
      detail: 'pipeline-only',
    })

    const observations = collectDeaiSettingsObservations([pipelineRun, manualRun])

    expect(observations.lastChangeRate).toBe(0.2)
    expect(observations.qualityGateDegraded).toBe('')
    expect(observations.finalStepDetection).toBeNull()
  })

  it('reads the SKILL final-step declaration only from pipeline runs', () => {
    const homeRun = runFixture('run-1', 'home')
    homeRun.events.push({
      id: 'event-home',
      ts: 1,
      level: 'info',
      type: 'deai-injection-policy',
      label: 'home伪装声明',
      detail: JSON.stringify({
        step: 4,
        policy: { finalStepDetection: 'off' },
      }),
    })
    const pipelineRun = runFixture('run-2', 'pipeline')
    pipelineRun.events.push({
      id: 'event-pipeline',
      ts: 2,
      level: 'info',
      type: 'deai-injection-policy',
      label: '真实SKILL声明',
      detail: JSON.stringify({
        step: 4,
        policy: { finalStepDetection: 'off' },
      }),
    })

    const observations = collectDeaiSettingsObservations([pipelineRun, homeRun])

    expect(observations.finalStepDetection).toBe('off')
  })

  it('keeps the settings component wired to the isolated collector', async () => {
    setActivePinia(createPinia())
    const store = useRunTraceStore()
    const homeRunId = store.startRun({
      source: 'home',
      stepName: '去AI味',
      mode: 'de-ai-test',
    })
    store.addEvent(homeRunId, {
      type: 'deai-change-rate',
      level: 'info',
      label: '手动降AI深度修复变更率',
      detail: JSON.stringify({ changeRate: 0.3 }),
    })
    const pipelineRunId = store.startRun({
      source: 'pipeline',
      stepName: '正文层',
      mode: 'chain',
    })
    store.addEvent(pipelineRunId, {
      type: 'deai-quality-gate-degraded',
      level: 'warn',
      label: '流水线降AI门禁降级',
      detail: 'pipeline-only',
    })

    const wrapper = mount(DeAiSettings)
    await wrapper.vm.$nextTick()
    const exposed = wrapper.vm as unknown as {
      __deaiSettingsObservations?: (runs: DeaiSettingsObservationRun[]) => unknown
    }

    expect(exposed.__deaiSettingsObservations).toBeTruthy()
    expect((exposed.__deaiSettingsObservations!(store.runs) as {
      lastChangeRate: number | null
      qualityGateDegraded: string
    }).lastChangeRate).toBe(0.3)
    expect((exposed.__deaiSettingsObservations!(store.runs) as {
      qualityGateDegraded: string
    }).qualityGateDegraded).toBe('')
  })
})
