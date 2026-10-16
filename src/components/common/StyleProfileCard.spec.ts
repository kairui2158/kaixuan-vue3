// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StyleProfileCard from './StyleProfileCard.vue'
import { useProjectStore } from '../../stores/project'
import { useRunTraceStore } from '../../stores/runTrace'

async function fireDomEvent(element: Element, type: string) {
  element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
  await new Promise(resolve => setTimeout(resolve, 0))
}

async function fireEnter(element: Element) {
  const ctor = (element.ownerDocument?.defaultView?.KeyboardEvent ||
    window.KeyboardEvent) as typeof KeyboardEvent | undefined
  if (!ctor) {
    await fireDomEvent(element, 'keydown')
    return
  }
  element.dispatchEvent(new ctor('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await new Promise(resolve => setTimeout(resolve, 0))
}

const storageWrite = vi.fn().mockResolvedValue(true)
const storageRead = vi.fn().mockResolvedValue(null)
const storageRemove = vi.fn().mockResolvedValue(true)
const storageList = vi.fn().mockResolvedValue([])

async function mountCard() {
  const wrapper = mount(StyleProfileCard, {
    global: {
      stubs: {
        Teleport: true,
      },
    },
  })
  await wrapper.vm.$nextTick()
  return wrapper
}

function analysisResult(sourceId: string, host: 'outline' | 'pipeline', ok = false) {
  return new CustomEvent('style-analysis-result', {
    detail: {
      sourceId,
      host,
      report: {
        ok,
        errors: ok ? [] : ['测试失败'],
        insufficientEvidenceFields: [],
        ignoredFields: [],
        draft: ok
          ? {
            profileVersion: 2,
            styleTags: '冷峻',
            pacingParams: '快节奏',
            positioning: {
              coreTemperament: ['冷硬'],
              genreTags: ['科幻'],
              oneLinePositioning: '冷硬升级流',
            },
            positiveRules: [],
          }
          : null,
      },
    },
  })
}

async function requestAnalysis(wrapper: Awaited<ReturnType<typeof mountCard>>) {
  await wrapper.get('#btn-style-ai-analysis').trigger('click')
  await wrapper.vm.$nextTick()
}

describe('StyleProfileCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storageWrite.mockClear()
    storageRead.mockClear()
    vi.stubGlobal('electronAPI', { storageWrite, storageRead, storageRemove, storageList })
  })

  it('renders store-backed style and pacing values', async () => {
    const store = useProjectStore()
    store.updateStyleProfileDraft({
      styleTags: '快节奏, 冷峻',
      pacingParams: '速度:快节奏, 紧张度:4',
    })

    const wrapper = await mountCard()

    expect(wrapper.text()).toContain('快节奏, 冷峻 | 速度:快节奏, 紧张度:4')
    expect(store.styleProfile.styleTags).toBe('快节奏, 冷峻')
  })

  it('renders the same store source when mounted twice', async () => {
    const store = useProjectStore()
    store.updateStyleProfileDraft({ styleTags: '同源风格' })

    const first = await mountCard()
    const second = await mountCard()

    expect(first.text()).toContain('同源风格')
    expect(second.text()).toContain('同源风格')
    expect(store.styleProfile.styleTags).toBe('同源风格')
  })

  it('toggles style tags through the store while unlocked', async () => {
    const store = useProjectStore()
    store.updateStyleProfileDraft({ styleTags: '快节奏' })

    const wrapper = await mountCard()
    const chip = wrapper.findAll('.pl-style-tag-chip').find(c => c.text().includes('快节奏'))
    expect(chip).toBeTruthy()
    const input = chip!.get('input[type="checkbox"]').element as HTMLInputElement
    input.checked = false
    await fireDomEvent(input, 'change')

    expect(store.styleProfile.styleTags).toBe('')
  })

  it('disables editing controls and shows lock state when locked', async () => {
    const store = useProjectStore()
    store.updateStyleProfileDraft({ styleTags: '锁定制' })
    store.lockStyleProfile()

    const wrapper = await mountCard()

    expect(wrapper.text()).toContain('已锁定')
    expect(wrapper.get('input[placeholder="添加自定义标签"]').attributes('disabled')).toBeDefined()
    wrapper.findAll('.pl-style-tag-chip input[type="checkbox"]').forEach(input => {
      expect(input.attributes('disabled')).toBeDefined()
    })
    wrapper.findAll('.pl-pacing-item select').forEach(select => {
      expect(select.attributes('disabled')).toBeDefined()
    })
    expect(wrapper.get('input[type="range"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.pl-pacing-restore').attributes('disabled')).toBeDefined()
  })

  it('expands and collapses advanced settings locally', async () => {
    const wrapper = await mountCard()

    const card = wrapper.findComponent(StyleProfileCard)
    expect((card.vm as unknown as { styleCardExpanded: boolean }).styleCardExpanded).toBe(false)
    await fireEnter(wrapper.get('.pl-style-card-header').element)
    expect((card.vm as unknown as { styleCardExpanded: boolean }).styleCardExpanded).toBe(true)
    await fireEnter(wrapper.get('.pl-style-card-header').element)
    expect((card.vm as unknown as { styleCardExpanded: boolean }).styleCardExpanded).toBe(false)
  })

  it('publishes host-scoped AI analysis requests and stores the active source id', async () => {
    const requestListener = vi.fn()
    window.addEventListener('style-analysis-request', requestListener)
    const wrapper = await mountCard()

    await requestAnalysis(wrapper)

    const detail = requestListener.mock.calls[0]?.[0]?.detail as { sourceId: string; host: string }
    expect(detail.host).toBe('outline')
    expect(detail.sourceId).toMatch(/^style-card-1-\d+$/)
    const exposed = wrapper.vm as unknown as { activeAnalysisSourceId: string | null }
    expect(exposed.activeAnalysisSourceId).toBe(detail.sourceId)
    window.removeEventListener('style-analysis-request', requestListener)
  })

  it('ignores AI analysis results from another host', async () => {
    const wrapper = await mountCard()
    await requestAnalysis(wrapper)

    window.dispatchEvent(analysisResult('style-card-1-1', 'pipeline'))
    await wrapper.vm.$nextTick()

    const exposed = wrapper.vm as unknown as { analysisRunning: boolean }
    expect(exposed.analysisRunning).toBe(true)
  })

  it('ignores stale AI analysis results from the same host', async () => {
    const wrapper = await mountCard()
    await requestAnalysis(wrapper)

    window.dispatchEvent(analysisResult('style-card-stale', 'outline'))
    await wrapper.vm.$nextTick()

    const exposed = wrapper.vm as unknown as { analysisRunning: boolean }
    expect(exposed.analysisRunning).toBe(true)
  })

  it('accepts the matching AI analysis result and clears the running state', async () => {
    const wrapper = await mountCard()
    await requestAnalysis(wrapper)
    const exposed = wrapper.vm as unknown as { activeAnalysisSourceId: string | null }
    const sourceId = exposed.activeAnalysisSourceId

    window.dispatchEvent(analysisResult(sourceId!, 'outline', true))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('AI 分析结果预览')
    expect((wrapper.vm as unknown as { analysisRunning: boolean }).analysisRunning).toBe(false)
  })

  it('records style card events without stealing the active run', async () => {
    const runTraceStore = useRunTraceStore()
    const runningId = runTraceStore.startRun({
      source: 'outline',
      step: 0,
      stepName: '大纲对话',
      mode: 'chat',
      sessionKind: 'chat',
    })
    const wrapper = await mountCard()
    const exposed = wrapper.vm as unknown as { recordStyleCardTraceEvent: (event: unknown) => void }

    exposed.recordStyleCardTraceEvent({
      type: 'style-benchmark-import',
      label: '测试事件',
      detail: { action: 'test' },
    })

    expect(runTraceStore.currentRunIdBySource.outline).toBe(runningId)
    const run = runTraceStore.getRun(runningId)
    expect(run?.status).toBe('running')
    const event = run?.events.find(item => item.type === 'style-benchmark-import')
    expect(event?.label).toBe('测试事件')
  })

  it('creates an isolated import trace run when no outline run is active', async () => {
    const runTraceStore = useRunTraceStore()
    const wrapper = await mountCard()
    const exposed = wrapper.vm as unknown as { recordStyleCardTraceEvent: (event: unknown) => void }

    exposed.recordStyleCardTraceEvent({
      type: 'style-benchmark-import',
      label: '独立事件',
      detail: { action: 'test' },
    })

    const importRuns = runTraceStore.runs.filter(run => run.mode === 'style-benchmark-import')
    expect(importRuns).toHaveLength(1)
    expect(importRuns[0].sessionKind).toBe('task')
    expect(importRuns[0].events.some(event => event.type === 'style-benchmark-import')).toBe(true)
    expect(importRuns[0].status).toBe('success')
  })
})
