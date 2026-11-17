// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ApiSettings from './ApiSettings.vue'
import { useProviderStore, type Provider } from '../../stores/provider'
import { getAiService } from '../../services/aiService'
import type { ThinkingProbeResult } from '../../services/providerThinkingProbe'

vi.mock('../../services/aiService', async () => {
  const actual = await vi.importActual<typeof import('../../services/aiService')>('../../services/aiService')
  return {
    ...actual,
    getAiService: vi.fn(),
  }
})

const storage = new Map<string, unknown>()
const storageRead = vi.fn(async (key: string) => storage.get(key) ?? null)
const storageWrite = vi.fn(async (key: string, value: unknown) => {
  storage.set(key, value)
  return true
})
const originalCreateElement = document.createElement.bind(document)

function providerFixture(id: string, purpose: Array<Provider['purpose'][number]>): Provider {
  return {
    id,
    name: id,
    baseUrl: `https://${id}.test/v1`,
    apiKey: `key-${id}`,
    models: [`${id}-model`],
    selectedModel: `${id}-model`,
    temperature: 0.7,
    maxTokens: 0,
    purpose,
    providerType: 'openai-compatible',
  }
}

function clickButton(wrapper: Awaited<ReturnType<typeof mountSettings>>, text: string) {
  const button = wrapper.findAll('button').find(item => item.text() === text)
  expect(button).toBeTruthy()
  return button!
}

async function mountSettings() {
  const wrapper = mount(ApiSettings)
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('ApiSettings pipeline provider channels', () => {
  const mockedGetAiService = vi.mocked(getAiService)
  beforeEach(() => {
    storage.clear()
    setActivePinia(createPinia())
    storageRead.mockClear()
    storageWrite.mockClear()
    vi.stubGlobal('electronAPI', {
      storageRead,
      storageWrite,
      decrypt: vi.fn(async (value: string) => value),
      encrypt: vi.fn(async (value: string) => value),
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:api-settings-test'),
      revokeObjectURL: vi.fn(),
    })
    mockedGetAiService.mockReset()
  })

  it('binds each pipeline layer through the provider purpose row and blocks non-generate providers', async () => {
    const store = useProviderStore()
    store.addProvider(providerFixture('provider-generate', ['generate']))
    store.addProvider(providerFixture('provider-detect', ['detect']))

    const wrapper = await mountSettings()
    const generateCard = wrapper.findAll('.provider-card')
      .find(card => card.find('.provider-card-name').text() === 'provider-generate')!
    const detectCard = wrapper.findAll('.provider-card')
      .find(card => card.find('.provider-card-name').text() === 'provider-detect')!
    const generateToggle = generateCard.findAll('button').find(item => item.text() === '生成流水线')!
    expect(detectCard.findAll('button').some(item => item.text() === '生成流水线')).toBe(false)

    expect(generateCard.find('[data-test="pipeline-layer-select"]').exists()).toBe(false)
    await generateToggle.trigger('click')
    await wrapper.vm.$nextTick()
    const layerPanel = generateCard.get('[data-test="pipeline-layer-select"]')
    expect(store.pipelineLayerProviders.settings ?? null).toBeNull()
    expect(layerPanel.findAll('button').map(item => item.attributes('data-layer'))).toEqual(['settings', 'volumes', 'chapters', 'body'])

    await layerPanel.find('[data-layer="body"]').trigger('click')
    expect(store.pipelineLayerProviders.settings ?? null).toBeNull()
    expect(store.pipelineLayerProviders.body).toBe('provider-generate')
    expect(generateCard.find('[data-test="pipeline-layer-select"]').exists()).toBe(true)

    await layerPanel.find('[data-layer="volumes"]').trigger('click')
    expect(store.pipelineLayerProviders.body).toBe('provider-generate')
    expect(store.pipelineLayerProviders.volumes).toBe('provider-generate')
    expect(layerPanel.find('[data-layer="body"]').classes()).toContain('is-on')
    expect(layerPanel.find('[data-layer="volumes"]').classes()).toContain('is-on')

    await layerPanel.find('[data-layer="body"]').trigger('click')
    expect(store.pipelineLayerProviders.body ?? null).toBeNull()
    expect(store.pipelineLayerProviders.volumes).toBe('provider-generate')

    await generateToggle.trigger('click')
    await wrapper.vm.$nextTick()
    expect(store.pipelineLayerProviders.body ?? null).toBeNull()
    expect(generateCard.find('[data-test="pipeline-layer-select"]').exists()).toBe(true)

    await generateToggle.trigger('click')
    await wrapper.vm.$nextTick()
    expect(generateCard.find('[data-test="pipeline-layer-select"]').exists()).toBe(false)
    expect(wrapper.find('#pipeline-provider-channel-settings').exists()).toBe(false)
  })

  it('clears layer bindings when an imported provider no longer supports generation', async () => {
    const store = useProviderStore()
    const payload = {
      providers: [
        providerFixture('provider-imported', ['detect']),
      ],
      generateProvider: null,
      pipelineLayerProviders: {
        volumes: 'provider-imported',
      },
    }
    const fileText = JSON.stringify(payload)
    const file = new File([fileText], 'api-config.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => fileText })
    const inputElement = {
      type: 'file',
      accept: '.json',
      files: [file],
      click: vi.fn(),
      onchange: null as null | ((event: Event) => void),
    }
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'input') return inputElement as unknown as HTMLElement
      return originalCreateElement.call(document, tagName)
    })

    const wrapper = await mountSettings()
    await clickButton(wrapper, '导入配置').trigger('click')
    inputElement.onchange?.({ target: inputElement } as unknown as Event)
    await new Promise(resolve => setTimeout(resolve, 0))
    await store.loadProviders()

    expect(store.pipelineLayerProviders).toEqual({})
    expect(wrapper.text()).toContain('卷纲层绑定的供应商不支持生成用途，已自动解绑')
    createElement.mockRestore()
  })

  it('exports providers together with generate and layer bindings', async () => {
    const store = useProviderStore()
    store.addProvider(providerFixture('provider-volumes', ['generate']))
    store.addProvider(providerFixture('provider-detect', ['detect']))
    store.setGenerateProvider('provider-volumes')
    store.setPipelineLayerProvider('volumes', 'provider-volumes')
    store.setPipelineLayerProvider('body', 'provider-deleted')
    storageWrite.mockClear()

    const wrapper = await mountSettings()
    await clickButton(wrapper, '导出配置').trigger('click')
    await Promise.resolve()

    const download = URL.createObjectURL as ReturnType<typeof vi.fn>
    expect(download).toHaveBeenCalledTimes(1)
    const blob = (download.mock.calls[0] as Array<Blob>)[0]
    const parsed = JSON.parse(await blob.text())
    expect(parsed).toMatchObject({
      generateProvider: 'provider-volumes',
      pipelineLayerProviders: {
        volumes: 'provider-volumes',
        body: 'provider-deleted',
      },
    })
    expect(parsed.providers.map((item: Provider) => item.id)).toEqual([
      'provider-volumes',
      'provider-detect',
    ])
  })

  it('imports full exports back and warns about layer bindings that reference missing providers', async () => {
    const store = useProviderStore()
    store.addProvider(providerFixture('provider-existing', ['generate']))
    const payload = {
      providers: [
        providerFixture('provider-imported', ['generate']),
        providerFixture('provider-imported-detect', ['detect']),
      ],
      generateProvider: 'provider-imported',
      pipelineLayerProviders: {
        volumes: 'provider-imported',
        body: 'provider-missing',
      },
    }
    const fileText = JSON.stringify(payload)
    const file = new File([fileText], 'api-config.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => fileText })
    const inputElement = {
      type: 'file',
      accept: '.json',
      files: [file],
      click: vi.fn(),
      onchange: null as null | ((event: Event) => void),
    }
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'input') return inputElement as unknown as HTMLElement
      return originalCreateElement.call(document, tagName)
    })

    const wrapper = await mountSettings()
    await clickButton(wrapper, '导入配置').trigger('click')
    inputElement.onchange?.({ target: inputElement } as unknown as Event)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(store.providers.map(item => item.id)).toEqual([
      'provider-existing',
      'provider-imported',
      'provider-imported-detect',
    ])
    expect(store.generateProvider).toBe('provider-imported')
    expect(store.pipelineLayerProviders).toEqual({
      volumes: 'provider-imported',
      body: 'provider-missing',
    })
    expect(wrapper.text()).toContain('正文层绑定 provider-missing 未导入到现有供应商')
    expect(wrapper.text()).not.toContain('卷纲层绑定 provider-imported 未导入到现有供应商')
    createElement.mockRestore()
  })

  it('saves the openai-compatible thinking-disable declaration when editing a provider', async () => {
    const store = useProviderStore()
    store.addProvider(providerFixture('provider-thinking', ['generate']))
    const wrapper = await mountSettings()

    await wrapper.findAll('.provider-card')
      .find(card => card.find('.provider-card-name').text() === 'provider-thinking')!
      .findAll('button')
      .find(item => item.text() === '编辑')!
      .trigger('click')
    await wrapper.vm.$nextTick()

    const details = wrapper.find('.provider-advanced')
    await details.find('summary').trigger('click')
    await details.find('#cfg-thinking-disable-param').setValue('thinking')
    await details.find('#cfg-thinking-disable-value').setValue('{"type":"disabled"}')
    await clickButton(wrapper, '保存').trigger('click')
    await wrapper.vm.$nextTick()

    expect(store.providers[0]).toMatchObject({
      id: 'provider-thinking',
      thinkingDisableParam: 'thinking',
      thinkingDisableValue: '{"type":"disabled"}',
    })
  })

  it('runs the thinking-disable probe and persists the effective declaration with verdict', async () => {
    const store = useProviderStore()
    store.addProvider(providerFixture('provider-thinking-probe', ['generate']))
    const probeResult: ThinkingProbeResult = {
      verdict: 'effective',
      param: 'thinking',
      value: '{"type":"disabled"}',
      baselineReasoningChars: 100,
      baselineVisiblePlanningChars: 0,
      baselineTextChars: 2,
      requestsUsed: 2,
      attempts: [],
    }
    mockedGetAiService.mockResolvedValue({
      testThinkingDisableProbe: vi.fn(async () => probeResult),
    } as any)

    const wrapper = await mountSettings()
    await wrapper.findAll('.provider-card')
      .find(card => card.find('.provider-card-name').text() === 'provider-thinking-probe')!
      .findAll('button')
      .find(item => item.text() === '编辑')!
      .trigger('click')
    await wrapper.vm.$nextTick()

    await clickButton(wrapper, '探测禁思考').trigger('click')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('禁思考已生效 · 参数: thinking · 共 2 次请求')
    expect(store.providers[0].thinkingProbe?.verdict).toBe('effective')
    expect(store.providers[0].thinkingProbe?.param).toBe('thinking')
    expect(store.providers[0].thinkingDisableParam).toBe('thinking')
    expect(store.providers[0].thinkingDisableValue).toBe('{"type":"disabled"}')
  })

  it('shows the last probe verdict when reopening a probed provider for editing', async () => {
    const store = useProviderStore()
    store.addProvider({
      ...providerFixture('provider-probe-history', ['generate']),
      thinkingProbe: {
        verdict: 'no_effect',
        baselineReasoningChars: 100,
        baselineVisiblePlanningChars: 0,
        baselineTextChars: 2,
        requestsUsed: 5,
        attempts: [],
        probedAt: '2026-11-17T00:00:00.000Z',
      },
    })

    const wrapper = await mountSettings()
    await wrapper.findAll('.provider-card')
      .find(card => card.find('.provider-card-name').text() === 'provider-probe-history')!
      .findAll('button')
      .find(item => item.text() === '编辑')!
      .trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('上次探测:')
    expect(wrapper.text()).toContain('禁思考参数未生效')
  })

  it('marks undecidable probe runs as failed in trace while retaining the verdict', async () => {
    const store = useProviderStore()
    store.addProvider(providerFixture('provider-thinking-probe', ['generate']))
    const probeResult: ThinkingProbeResult = {
      verdict: 'undecidable',
      baselineReasoningChars: 100,
      baselineVisiblePlanningChars: 0,
      baselineTextChars: 2,
      requestsUsed: 2,
      attempts: [],
    }
    mockedGetAiService.mockResolvedValue({
      testThinkingDisableProbe: vi.fn(async () => probeResult),
    } as any)

    const wrapper = await mountSettings()
    await wrapper.findAll('.provider-card')
      .find(card => card.find('.provider-card-name').text() === 'provider-thinking-probe')!
      .findAll('button')
      .find(item => item.text() === '编辑')!
      .trigger('click')
    await wrapper.vm.$nextTick()

    await clickButton(wrapper, '探测禁思考').trigger('click')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('无法判定，需手动声明 · 共 2 次请求')
    expect(store.providers[0].thinkingProbe?.verdict).toBe('undecidable')
  })
})
