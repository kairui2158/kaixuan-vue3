import { describe, expect, it } from 'vitest'
import {
  buildFolderSkillId,
  isSkillContextHistoryMode,
  normalizeContextPolicy,
  normalizeSkillId,
  parseFolderSkillId,
} from './skillIdentity'

describe('skillIdentity', () => {
  it('keeps one folder id namespace across store and import boundaries', () => {
    expect(parseFolderSkillId('folder:KAI-S1')).toBe('KAI-S1')
    expect(buildFolderSkillId('folder:KAI-S1')).toBe('folder:KAI-S1')
    expect(buildFolderSkillId('KAI-S2')).toBe('folder:KAI-S2')
    expect(normalizeSkillId('KAI-S1', 'folder')).toBe('folder:KAI-S1')
    expect(normalizeSkillId('KAI-S1', 'text')).toBe('KAI-S1')
    expect(normalizeSkillId('KAI-S1')).toBe('KAI-S1')
  })

  it('accepts only the current chat history contract', () => {
    for (const mode of ['none', 'recent', 'summary', 'full']) {
      expect(isSkillContextHistoryMode(mode)).toBe(true)
    }
    for (const mode of ['latest', 'all', 'sometimes', '']) {
      expect(isSkillContextHistoryMode(mode)).toBe(false)
    }
  })

  it('migrates persisted legacy policies and reports the source value', () => {
    expect(normalizeContextPolicy({ chatHistory: 'latest', includeOutline: true })).toEqual({
      policy: { chatHistory: 'recent', includeOutline: true },
      migratedFrom: 'latest',
    })
    expect(normalizeContextPolicy({ chatHistory: 'all' })).toEqual({
      policy: { chatHistory: 'full' },
      migratedFrom: 'all',
    })
  })

  it('keeps current policies untouched and ignores malformed input', () => {
    expect(normalizeContextPolicy({ chatHistory: 'summary' })).toEqual({ policy: { chatHistory: 'summary' } })
    expect(normalizeContextPolicy({ includeOutline: true })).toEqual({ policy: { includeOutline: true } })
    expect(normalizeContextPolicy('invalid')).toEqual({})
    expect(normalizeContextPolicy(null)).toEqual({})
    expect(normalizeContextPolicy(['invalid'])).toEqual({})
  })
})
