import { describe, expect, it } from 'vitest'
import { getLockedSettingsForLayer } from './settingsProjection'
import {
  appendPriorityNote,
  applyLockedSettingsPriority,
  buildContextConflictTraceEvent,
  contextConflictScopeForLayer,
  detectContextConflicts
} from './contextConflictDetector'

const collection = {
  categories: ['人物', '物品', '世界'],
  items: {
    人物: [{ id: 'p1', name: '王芳', category: '人物', content: '幽默，风趣，话痨', status: 'locked' }],
    物品: [{ id: 'i1', name: '密钥', category: '物品', content: '只有王芳知道它的用途', status: 'locked' }],
    世界: [{ id: 'w1', name: '北境', category: '世界', content: '常年被冰雪覆盖', status: 'locked' }]
  }
}

const memory = {
  version: 1,
  entities: [{
    id: 'e1',
    name: '王芳',
    type: 'character' as const,
    aliases: ['芳姐'],
    firstAppearance: '',
    lastAppearance: '',
    appearances: [],
    description: '冷静寡言',
    personality: '',
    appearance: '',
    background: '',
    status: '重伤',
    possessions: [],
    skills: [],
    relationships: [],
    notes: '',
    lockedFields: [],
    evidence: [],
    createdAt: '',
    updatedAt: ''
  }],
  relations: [],
  events: [],
  world: [{
    id: 'world1',
    name: '北境',
    type: 'location' as const,
    description: '温暖的热带海岛',
    evidence: [],
    createdAt: '',
    updatedAt: ''
  } as any],
  foreshadowing: [],
  meta: { version: 1, lastChapterIndex: 0, updatedAt: '' },
  categories: [],
  items: []
}

describe('contextConflictDetector', () => {
  it('matches locked settings against memory entity names and aliases', () => {
    const projection = getLockedSettingsForLayer('body', collection)
    const conflicts = detectContextConflicts(projection, memory as any)
    const entityConflicts = conflicts.filter(conflict => conflict.conflictKind === 'entity')
    expect(entityConflicts).toHaveLength(1)
    expect(entityConflicts[0]).toMatchObject({
      entityName: '王芳',
      conflictKind: 'entity',
      settingLine: '人物 - 王芳 - 幽默，风趣，话痨'
    })
  })

  it('does not treat an item card mentioning a character as an entity conflict', () => {
    const projection = getLockedSettingsForLayer('body', collection)
    const conflicts = detectContextConflicts(projection, memory as any)
    const wangFangConflicts = conflicts.filter(conflict => conflict.entityName === '王芳')
    expect(wangFangConflicts).toHaveLength(1)
    expect(wangFangConflicts[0].settingLine).toBe('人物 - 王芳 - 幽默，风趣，话痨')
  })

  it('keeps world conflicts scoped to world-category settings', () => {
    const projection = getLockedSettingsForLayer('body', collection)
    const conflicts = detectContextConflicts(projection, memory as any)
    const worldConflicts = conflicts.filter(conflict => conflict.conflictKind === 'world')
    expect(worldConflicts).toHaveLength(1)
    expect(worldConflicts[0]).toMatchObject({
      entityName: '北境',
      settingLine: '世界 - 北境 - 常年被冰雪覆盖'
    })
  })

  it('scopes conflict arbitration to the layer that injects memory', () => {
    expect(contextConflictScopeForLayer('body')).toEqual({
      enabled: true,
      reason: 'body_layer_injects_memory'
    })
    expect(contextConflictScopeForLayer('volume').enabled).toBe(false)
    expect(contextConflictScopeForLayer('chapter').enabled).toBe(false)
  })

  it('keeps conflicting memory but marks it overridden and adds priority semantics', () => {
    const conflicts = detectContextConflicts(getLockedSettingsForLayer('body', collection), memory as any)
    const memoryLine = '- 王芳（别名：芳姐）；状态：重伤；冷静寡言'
    const result = applyLockedSettingsPriority(memoryLine, conflicts)
    expect(result.memoryText).toContain('已被锁定设定覆盖：' + memoryLine)
    expect(result.priorityNote).toContain('锁定设定优先于相关记忆')
    expect(appendPriorityNote('PROMPT', result.priorityNote)).toContain('[上下文优先级]')
  })

  it('reports a warn trace when conflicts exist and omits the event when clean', () => {
    const warn = buildContextConflictTraceEvent(detectContextConflicts(getLockedSettingsForLayer('body', collection), memory as any))
    expect(warn).not.toBeNull()
    expect(warn?.type).toBe('context-conflict-detected')
    expect(warn?.level).toBe('warn')
    expect(warn ? JSON.parse(warn.detail).conflictCount : null).toBe(2)
    const info = buildContextConflictTraceEvent([])
    expect(info).toBeNull()
  })

  it('omits the conflict trace when there is no memory context to arbitrate', () => {
    const conflicts = detectContextConflicts(getLockedSettingsForLayer('body', collection), {
      ...memory,
      entities: [],
      world: []
    } as any)
    expect(conflicts).toEqual([])
    expect(buildContextConflictTraceEvent(conflicts)).toBeNull()
  })
})
