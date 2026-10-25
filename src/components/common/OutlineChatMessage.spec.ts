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
