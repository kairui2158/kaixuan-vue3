import { describe, expect, it } from 'vitest'
import {
  getSkillAgentId,
  getSkillAgentKey,
  migrateSkillAgentBindings,
  normalizeSkillAgentBindings,
} from './skillAgentBinding'

describe('skill agent bindings', () => {
  it('uses a stable key based on skill id', () => {
    expect(getSkillAgentKey(3, 'volume-fill')).toBe('3-volume-fill')
    expect(getSkillAgentId({ '3-volume-fill': 'agent-writer' }, 3, 'volume-fill')).toBe('agent-writer')
  })

  it('migrates legacy index keys to the matching skill id', () => {
    const migrated = migrateSkillAgentBindings(
      { '3-0': 'agent-parser', '3-1': 'agent-filler' },
      { 3: ['volume-parse', 'volume-fill'] },
    )
    expect(migrated).toEqual({
      '3-0': 'agent-parser',
      '3-1': 'agent-filler',
      '3-volume-parse': 'agent-parser',
      '3-volume-fill': 'agent-filler',
    })
  })

  it('prefers an existing stable key and ignores empty slots', () => {
    const migrated = migrateSkillAgentBindings(
      { '2-0': 'legacy', '2-character': 'stable', '2-1': 'ignored' },
      { 2: ['character', ''] },
    )
    expect(migrated['2-character']).toBe('stable')
    expect(migrated['2-']).toBeUndefined()
  })

  it('exports only canonical keys and gives stable keys priority', () => {
    expect(normalizeSkillAgentBindings(
      { '2-0': 'legacy', '2-character': 'stable', '2-1': 'unused' },
      { 2: ['character', ''] },
    )).toEqual({ '2-character': 'stable' })
  })
})
