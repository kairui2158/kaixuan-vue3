import { describe, expect, it } from 'vitest'
import { normalizeSemanticCategory } from './settingsLayerSemantics'
import { getLockedSettingsForLayer } from './settingsProjection'

function largeCollection(count: number) {
  const items = Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    name: `物品${index}`,
    category: '物品',
    content: `物品${index}的完整状态说明，包括来源、归属、使用限制和历史事件记录。`,
    status: 'locked'
  }))
  return {
    categories: ['物品', '人物'],
    items: {
      物品: items,
      人物: [{ id: 'p1', name: '王芳', category: '人物', content: '幽默，风趣，话痨', status: 'locked' }]
    }
  }
}

describe('settings projection layer budgets', () => {
  it('trims low-priority lines before character lines and records reasons', () => {
    const collection = largeCollection(60)
    const projection = getLockedSettingsForLayer('volume', collection)
    expect(projection.text.length).toBeLessThanOrEqual(1200)
    expect(projection.text).toContain('人物 - 王芳 - 幽默，风趣，话痨')
    expect(projection.trimmedReasons.length).toBeGreaterThan(0)
    expect(projection.trimmedReasons[0]).toContain('layer_budget_trim:item:')
    expect(projection.blocks.some(block => block.semanticCategory === 'character')).toBe(true)
  })

  it('uses distinct budgets for chapter and body layers', () => {
    const collection = largeCollection(80)
    const chapter = getLockedSettingsForLayer('chapter', collection)
    const body = getLockedSettingsForLayer('body', collection)
    expect(chapter.text.length).toBeLessThanOrEqual(1500)
    expect(body.text.length).toBeLessThanOrEqual(1800)
    expect(chapter.trimmedReasons.length).toBeGreaterThan(0)
    expect(body.trimmedReasons.length).toBeGreaterThan(0)
  })

  it('reports category distribution from the post-trim blocks', () => {
    const collection = largeCollection(60)
    const projection = getLockedSettingsForLayer('volume', collection)
    const blockDistribution = projection.blocks.reduce<Record<string, number>>((acc, block) => {
      acc[block.semanticCategory] = (acc[block.semanticCategory] || 0) + block.lines.length
      return acc
    }, {})
    expect(projection.categoryDistribution).toEqual(blockDistribution)
    expect(projection.categoryDistribution.item).toBeLessThan(60)
    expect(projection.categoryDistribution.character).toBe(1)
  })

  it('does not apply budgets to the home layer', () => {
    const collection = largeCollection(80)
    const projection = getLockedSettingsForLayer('home', collection)
    expect(projection.text.length).toBeGreaterThan(1800)
    expect(projection.trimmedReasons).toEqual([])
  })
})

describe('semantic category priority', () => {
  it('keeps an explicit style category even when the card name mentions characters', () => {
    expect(normalizeSemanticCategory('风格', '人物基调', '幽默，话痨')).toBe('style')
  })

  it('keeps an explicit character category even when the card name mentions style', () => {
    expect(normalizeSemanticCategory('人物', '幽默风格', '话痨，节奏快')).toBe('character')
  })

  it('falls back to name and text keywords only when the category is unrecognized', () => {
    expect(normalizeSemanticCategory('自定义分类', '角色王芳', '冷静寡言')).toBe('character')
    expect(normalizeSemanticCategory('自定义分类', '叙事节奏', '快节奏，密集')).toBe('style')
    expect(normalizeSemanticCategory('自定义分类', '普通备注', '无语义内容')).toBe('other')
  })

  it('projects a style card named 人物基调 into the style block', () => {
    const collection = {
      categories: ['风格'],
      items: {
        风格: [{ id: 's1', name: '人物基调', category: '风格', content: '幽默，话痨', status: 'locked' }]
      }
    }
    const projection = getLockedSettingsForLayer('volume', collection)
    expect(projection.categoryDistribution).toEqual({ style: 1 })
    expect(projection.blocks.map(block => block.semanticCategory)).toEqual(['style'])
  })
})
