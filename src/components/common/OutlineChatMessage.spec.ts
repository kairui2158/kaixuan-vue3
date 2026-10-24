// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OutlineChatMessage from './OutlineChatMessage.vue'
import { PerformanceMonitor } from '../../services/performanceMonitor'
import { installResponsivenessProjection, setPerformanceMonitorForTests } from '../../services/responsivenessStore'

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
})
