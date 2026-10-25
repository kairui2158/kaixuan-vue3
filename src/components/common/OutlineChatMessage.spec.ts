// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OutlineChatMessage from './OutlineChatMessage.vue'
import { PerformanceMonitor } from '../../services/performanceMonitor'
import { installResponsivenessProjection, setPerformanceMonitorForTests } from '../../services/responsivenessStore'
import {
  renderOutlineMarkdown,
  setOutlineMarkdownWorkerFactoryForTests,
} from '../../services/outlineMarkdownRenderService'

describe('OutlineChatMessage safe-mode rendering', () => {
  it('renders historical messages as plain text while safe mode is active', () => {
    setActivePinia(createPinia())
    const monitor = new PerformanceMonitor({ now: () => 0 })
    setPerformanceMonitorForTests(monitor)
    installResponsivenessProjection()
    monitor.requestSafeMode('test_freeze')

    const wrapper = mount(OutlineChatMessage, {
      props: {
        message: { messageId: 'msg-1', role: 'assistant', content: '# 标题\n\n**正文**' },
        busy: false,
        currentOutlineContent: '',
        batchDiff: null,
        stalledRetryProviders: [],
      },
    })

    const bubble = wrapper.get('.ow-msg-bubble')
    expect(bubble.text()).toContain('# 标题')
    expect(bubble.text()).toContain('**正文**')
    expect(bubble.element.querySelector('h1, strong')).toBeNull()

    monitor.exitSafeMode('user_exit')
    setPerformanceMonitorForTests(null)
  })

  it('renders markdown asynchronously and replaces stale streaming output', async () => {
    setActivePinia(createPinia())
    setPerformanceMonitorForTests(null)
    setOutlineMarkdownWorkerFactoryForTests(null)

    const wrapper = mount(OutlineChatMessage, {
      props: {
        message: { messageId: 'msg-stream', role: 'assistant', content: '**第一版**' },
        busy: false,
        currentOutlineContent: '',
        batchDiff: null,
        stalledRetryProviders: [],
      },
    })
    await vi.waitFor(() => expect(wrapper.get('.ow-msg-bubble').element.innerHTML).toContain('<strong>第一版</strong>'))

    await wrapper.setProps({
      message: { messageId: 'msg-stream', role: 'assistant', content: '**第二版**' },
    })
    await vi.waitFor(() => expect(wrapper.get('.ow-msg-bubble').element.innerHTML).toContain('<strong>第二版</strong>'))
    expect(wrapper.get('.ow-msg-bubble').element.innerHTML).not.toContain('第一版')
  })
})

describe('OutlineChatMessage fallback actions', () => {
  it('disables routing and budget actions while the workspace is generating', async () => {
    setActivePinia(createPinia())
    setPerformanceMonitorForTests(null)
    setOutlineMarkdownWorkerFactoryForTests(null)

    const wrapper = mount(OutlineChatMessage, {
      props: {
        message: {
          messageId: 'msg-fallback',
          role: 'assistant',
          content: '等待确认',
          routingFallback: {
            requestText: '继续这个方案',
            routing: { kind: 'no_match', confidence: 0, reason: 'low-confidence' },
          },
          budgetExhausted: {
            requestText: '继续这个方案',
            used: 4,
            limit: 4,
          },
        },
        busy: true,
        currentOutlineContent: '',
        batchDiff: null,
        stalledRetryProviders: [],
      },
    })

    const buttons = wrapper.findAll('button')
    const routingButton = buttons.find(button => button.text() === '按推荐技能继续')
    const budgetButton = buttons.find(button => button.text() === '追加 4 次并继续')

    expect(routingButton?.attributes('disabled')).toBeDefined()
    expect(budgetButton?.attributes('disabled')).toBeDefined()
    await routingButton?.trigger('click')
    await budgetButton?.trigger('click')
    expect(wrapper.emitted('routing-continue')).toBeUndefined()
    expect(wrapper.emitted('budget-extend')).toBeUndefined()
  })
})
