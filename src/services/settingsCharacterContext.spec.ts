import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { characterContextForStep, characterLinesForLayer } from './settingsCharacterContext'
import { getLockedSettingsForLayer } from './settingsProjection'

const collection = {
  categories: ['人物'],
  items: {
    人物: [
      { id: 'p1', name: '王芳', category: '人物', content: '幽默，风趣，话痨', status: 'locked', triggerKeywords: ['王芳'] },
      { id: 'p2', name: '林舟', category: '人物', content: '冷静，克制', status: 'locked', triggerKeywords: ['林舟'] }
    ]
  }
}

describe('settings character context', () => {
  it('routes pipeline template characters by step', () => {
    expect(characterContextForStep(1, collection)).toBe('王芳（幽默，风趣，话痨）；林舟（冷静，克制）')
    expect(characterContextForStep(2, collection)).toBe('王芳（幽默，风趣，话痨）；林舟（冷静，克制）')
    expect(characterContextForStep(3, collection)).toBe('王芳（幽默，风趣，话痨）；林舟（冷静，克制）')
    expect(characterContextForStep(4, collection)).toBe('王芳（幽默，风趣，话痨）；林舟（冷静，克制）')
  })

  it('supports query-aware homepage characters without changing the chat body baseline', () => {
    const query = { query: '王芳这章怎么说话' }
    const homeProjection = getLockedSettingsForLayer('home', collection, query)
    expect(homeProjection.blocks.flatMap(block => block.lines)).toEqual(['人物 - 王芳 - 幽默，风趣，话痨'])
    expect(homeProjection.items.map(item => item.name)).toEqual(['王芳', '林舟'])
    expect(characterLinesForLayer('body', collection)).toEqual([
      '王芳（幽默，风趣，话痨）',
      '林舟（冷静，克制）'
    ])
    expect(characterLinesForLayer('home', collection, query)).toEqual(['王芳（幽默，风趣，话痨）'])
  })

  it('keeps both consumers wired to the shared router', () => {
    const pipeline = readFileSync(join(process.cwd(), 'src/components/pipeline/PipelinePanel.vue'), 'utf8')
    const chat = readFileSync(join(process.cwd(), 'src/components/chat/ChatPanel.vue'), 'utf8')
    expect(pipeline).toContain('characterContextForStep(step, __sc)')
    expect(pipeline).not.toContain("getLockedSettingsForLayer('body', __sc)")
    expect(chat).toContain("characterLinesForLayer('body', sc3)")
  })
})
