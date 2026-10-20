import { describe, expect, it } from 'vitest'
import {
  buildSettingsProjectionTraceEvent,
  fnv1a32Hash,
  getLockedSettingsForLayer,
  settingsProjectionStatus
} from './settingsProjection'

const collection = {
  categories: ['人物', '场景'],
  items: {
    人物: [
      { id: 'p1', name: '王芳', category: '人物', content: '幽默，风趣，话痨', status: 'locked' },
      { id: 'p2', name: '林舟', category: '人物', content: '冷静，克制', status: 'draft' }
    ],
    场景: [
      { id: 's1', name: '旧宅', category: '场景', attrs: { desc: '雨夜', 氛围: '压抑' }, status: 'locked' },
      { id: 's2', name: '码头', category: '场景', attrs: { desc: '清晨' }, isBound: true, boundTo: ['pipeline'] }
    ]
  }
}

describe('settings projection', () => {
  it('projects only locked cards with a distinct semantic header for each layer', () => {
    const headers = {
      volume: '[设定规划约束]',
      chapter: '[章节规划约束]',
      body: '[正文执行约束]'
    } as const
    for (const layer of ['volume', 'chapter', 'body'] as const) {
      const projection = getLockedSettingsForLayer(layer, collection)
      expect(projection.text.startsWith(headers[layer])).toBe(true)
      expect(projection.blocks.length).toBeGreaterThan(0)
      expect(projection.categoryDistribution).toEqual({ character: 1, scene: 2 })
      expect(projection.text).toContain('人物 - 王芳 - 幽默，风趣，话痨')
      expect(projection.text).toContain('场景 - 旧宅 - desc: 雨夜; 氛围: 压抑')
      expect(projection.text).not.toContain('林舟')
      expect(projection.lockedCount).toBe(3)
      expect(projection.draftCount).toBe(1)
      expect(projection.characterCount).toBe(projection.text.length)
    }
  })

  it('keeps legacy isBound cards locked during the transition', () => {
    expect(settingsProjectionStatus({ id: 'x', name: 'x', category: 'x', content: '', attrs: {}, isBound: true })).toBe('locked')
    expect(settingsProjectionStatus({ id: 'x', name: 'x', category: 'x', content: '', attrs: {}, isBound: false })).toBe('draft')
    expect(settingsProjectionStatus({ id: 'x', name: 'x', category: 'x', content: '', attrs: {}, status: 'locked' })).toBe('locked')
    expect(settingsProjectionStatus({ id: 'x', name: 'x', category: 'x', content: '', attrs: {}, status: 'draft' })).toBe('draft')
  })

  it('produces a stable hash and trace metrics', () => {
    const projection = getLockedSettingsForLayer('volume', collection)
    expect(projection.contentHash).toBe(fnv1a32Hash(projection.text))
    expect(projection.contentHash).toHaveLength(8)
    const event = buildSettingsProjectionTraceEvent('volume', projection)
    expect(event.type).toBe('settings-projection-composed')
    expect(JSON.parse(event.detail)).toEqual({
      layer: 'volume',
      policyVersion: 2,
      lockedCount: 3,
      draftExcludedCount: 1,
      projectionChars: projection.characterCount,
      contentHash: projection.contentHash,
      categoryDistribution: { character: 1, scene: 2 },
      includedReasons: ['locked:王芳', 'locked:旧宅', 'locked:码头'],
      excludedReasons: [],
      trimmedReasons: [],
      warnings: []
    })
  })

  it('filters homepage context by query and falls back conservatively', () => {
    const matched = getLockedSettingsForLayer('home', collection, { query: '王芳这章怎么说话' })
    expect(matched.text.startsWith('[当前上下文设定]')).toBe(true)
    expect(matched.text).toContain('人物 - 王芳 - 幽默，风趣，话痨')
    expect(matched.text).not.toContain('旧宅')
    expect(matched.excludedReasons).toContain('query_no_match:旧宅')

    const fallback = getLockedSettingsForLayer('home', collection, { query: '完全无关的问题' })
    expect(fallback.text).toContain('人物 - 王芳 - 幽默，风趣，话痨')
    expect(fallback.text).toContain('场景 - 旧宅')
    expect(fallback.warnings).toContain('home_projection_no_query_match_fallback_all_locked')
  })

  it('rejects unknown layers and handles empty collections', () => {
    expect(() => getLockedSettingsForLayer('settings' as any, collection)).toThrow()
    const empty = getLockedSettingsForLayer('body', { categories: [], items: {} })
    expect(empty.text).toBe('')
    expect(empty.lockedCount).toBe(0)
    expect(empty.draftCount).toBe(0)
    expect(empty.contentHash).toBe(fnv1a32Hash(''))
  })
})
