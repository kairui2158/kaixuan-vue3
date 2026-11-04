// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import RunTracePanel from './RunTracePanel.vue'
import { useRunTraceStore } from '../../stores/runTrace'

describe('RunTracePanel physical call diagnostics', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders provider transport diagnostics in the physical call detail', async () => {
    const store = useRunTraceStore()
    const runId = store.startRun({ stepName: '正文层', mode: 'single' })
    const callId = store.startApiCall(runId, {
      providerSource: 'layer',
      requestMessages: [{ role: 'user', content: '生成正文' }]
    })
    store.appendPhysicalCall(runId, callId, {
      physicalCallId: 'physical-1',
      phase: 'normal',
      status: 'failed',
      requestMessages: [{ role: 'user', content: '生成正文' }],
      responseText: '',
      streamText: '',
      error: '供应商拒绝请求',
      durationMs: 120,
      statusCode: 401,
      providerSource: 'layer',
      providerErrorSummary: 'Invalid API key',
      finalUrl: 'https://api.example.test/v1/chat/completions',
      transport: 'renderer-fetch'
    })
    store.finishApiCall(runId, callId, { status: 'failed', error: '供应商拒绝请求' })
    store.finishRun(runId, 'failed')

    const wrapper = mount(RunTracePanel, {
      props: { visible: true },
      global: {
        stubs: {
          Teleport: true,
        },
      },
    })
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-run-id]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button').find(button => button.text() === 'API 调用')!.trigger('click')
    await wrapper.vm.$nextTick()

    const physicalDetail = wrapper.findAll('details')
      .find(details => details.text().includes('物理请求（1 次）'))
    expect(physicalDetail).toBeTruthy()
    expect(physicalDetail!.text()).toContain('HTTP状态：401')
    expect(physicalDetail!.text()).toContain('供应商来源：层绑定')
    expect(physicalDetail!.text()).toContain('供应商错误：Invalid API key')
    expect(physicalDetail!.text()).toContain('最终URL：https://api.example.test/v1/chat/completions')
    expect(physicalDetail!.text()).toContain('传输通道：renderer-fetch')
  })
})
