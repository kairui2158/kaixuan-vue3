// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ApiChatInput from './ApiChatInput.vue'

describe('ApiChatInput autosize', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('merges repeated input layout work into one animation frame', async () => {
    const frameCallbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    const wrapper = mount(ApiChatInput, { props: { modelValue: 'a' } })
    await wrapper.vm.$nextTick()
    expect(frameCallbacks).toHaveLength(1)
    frameCallbacks[0](0)
    const textarea = wrapper.find('textarea')
    textarea.element.value = 'ab'
    await textarea.trigger('input')
    textarea.element.value = 'abc'
    await textarea.trigger('input')

    expect(frameCallbacks).toHaveLength(2)
    frameCallbacks[1](0)
    await wrapper.vm.$nextTick()
    expect(textarea.element.style.height).toBe('60px')
  })
})
