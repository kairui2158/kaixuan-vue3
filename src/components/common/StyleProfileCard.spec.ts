// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StyleProfileCard from './StyleProfileCard.vue'
import { useProjectStore } from '../../stores/project'

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
    global: {},
  })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('StyleProfileCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storageWrite.mockClear()
    storageRead.mockClear()
    vi.stubGlobal('window', {
      electronAPI: { storageWrite, storageRead, storageRemove, storageList },
    })
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
})
