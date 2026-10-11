import { describe, expect, it } from 'vitest'
import {
  normalizeSettingsCategory,
  validateSettingsArtifact
} from './settingsArtifactContract'

describe('normalizeSettingsCategory', () => {
  it('keeps a valid category and normalizes whitespace', () => {
    expect(normalizeSettingsCategory(' 角色 ')).toBe('角色')
  })

  it('falls back to the default category for missing values', () => {
    expect(normalizeSettingsCategory(undefined)).toBe('设定类')
    expect(normalizeSettingsCategory('')).toBe('设定类')
    expect(normalizeSettingsCategory('   ')).toBe('设定类')
  })
})

describe('validateSettingsArtifact', () => {
  it('accepts valid items and preserves their category', () => {
    const result = validateSettingsArtifact([
      { name: '林舟', category: '角色', attrsText: '冷静的剑客' },
      { name: '青岚城', attrs: { location: '北方' } },
      { name: '无分类设定', content: '只有内容' }
    ], [])

    expect(result.valid).toBe(true)
    expect(result.accepted.map(item => item.name)).toEqual(['林舟', '青岚城', '无分类设定'])
    expect(result.accepted.map(item => item.category)).toEqual(['角色', '设定类', '设定类'])
    expect(result.rejected).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('rejects names that are empty or punctuation-only', () => {
    const result = validateSettingsArtifact([
      { name: '', attrsText: '内容' },
      { name: '   ', attrsText: '内容' },
      { name: '《》', attrsText: '内容' }
    ], [])

    expect(result.valid).toBe(false)
    expect(result.accepted).toEqual([])
    expect(result.rejected.map(item => item.reason)).toEqual([
      '名称为空',
      '名称为空',
      '名称不能是纯符号'
    ])
  })

  it('rejects items without usable content', () => {
    const result = validateSettingsArtifact([
      { name: '空壳', attrsText: '' },
      { name: '空白', attrsText: '   ' },
      { name: '无属性', attrs: {} }
    ], [])

    expect(result.valid).toBe(false)
    expect(result.accepted).toEqual([])
    expect(result.rejected.map(item => item.reason)).toEqual([
      '内容为空',
      '内容为空',
      '内容为空'
    ])
  })

  it('rejects duplicates in the same category but allows cross-category duplicates with a warning', () => {
    const result = validateSettingsArtifact([
      { name: '林舟', category: '角色', attrsText: '角色设定' },
      { name: '林舟', category: '地点', attrsText: '地点设定' }
    ], [{ category: '角色', name: '林舟' }])

    expect(result.valid).toBe(false)
    expect(result.accepted.map(item => item.category)).toEqual(['地点'])
    expect(result.rejected.map(item => item.reason)).toEqual(['分类「角色」内名称重复：「林舟」'])
    expect(result.errors).toContain('跨分类同名：「林舟」出现在地点、角色')
  })

  it('keeps valid items when other items are rejected', () => {
    const result = validateSettingsArtifact([
      { name: '有效', attrsText: '内容' },
      { name: '', attrsText: '内容' }
    ], [])

    expect(result.valid).toBe(true)
    expect(result.accepted.map(item => item.name)).toEqual(['有效'])
    expect(result.rejected).toHaveLength(1)
  })
})
