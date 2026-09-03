import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { normalizeCoCreationConfig, useCoCreationStore } from './coCreation'

describe('co creation config', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('window', {
      electronAPI: {
      storageRead: vi.fn().mockResolvedValue(null),
      storageWrite: vi.fn().mockResolvedValue(true),
      },
    })
  })

  it('normalizes empty and malformed storage payloads', () => {
    expect(normalizeCoCreationConfig(null)).toEqual({
      agentId: '',
    skillIds: [],
    mode: 'compose',
    skillAgents: {},
  })
    expect(normalizeCoCreationConfig({
      agentId: 42,
      skillIds: ['a', 'a', ' ', 12],
      mode: 'chain',
      skillAgents: [{ bad: true }] as any,
    } as any)).toEqual({
      agentId: '',
      skillIds: ['a'],
      mode: 'chain',
      skillAgents: {},
    })
  })

  it('keeps only unique non-empty skill agents', () => {
    expect(normalizeCoCreationConfig({
      skillAgents: { 'home-a': ' agent-1 ', 'home-b': '', '': 'x' },
    }).skillAgents).toEqual({ 'home-a': 'agent-1' })
  })

  it('loads an independent config without touching pipeline storage', async () => {
    window.electronAPI.storageRead = vi.fn().mockImplementation(async (key: string) => {
      expect(key).toContain('co_creation_config')
      return { agentId: 'agent-main', skillIds: ['s1', 's2'], mode: 'chain' }
    })
    const store = useCoCreationStore()
    await store.loadConfig()
    expect(store.config.agentId).toBe('agent-main')
    expect(store.config.skillIds).toEqual(['s1', 's2'])
    expect(store.config.mode).toBe('chain')
  })

  it('mutates skills and keeps skill-agent bindings consistent', () => {
    const store = useCoCreationStore()
    store.config.skillIds = ['s1', 's2', 's3']
    expect(store.addSkill('s2')).toBe(false)
    expect(store.setSkillAgent('s2', 'agent-2')).toBe(true)
    expect(store.config.skillAgents['home-s2']).toBe('agent-2')
    expect(store.moveSkill('s2', -1)).toBe(true)
    expect(store.config.skillIds).toEqual(['s2', 's1', 's3'])
    expect(store.removeSkill('s2')).toBe(true)
    expect(store.config.skillIds).toEqual(['s1', 's3'])
    expect(store.config.skillAgents['home-s2']).toBeUndefined()
  })

  it('saves a normalized config through the co-creation storage key', async () => {
    const store = useCoCreationStore()
    await store.saveConfig({
      agentId: ' agent-main ',
      skillIds: ['a', 'a', ''],
      mode: 'invalid' as any,
    skillAgents: { 'home-a': 'agent-a' },
  })
    // saveConfig only persists; it does NOT reassign config.value
    // (reassignment would trigger watch loops in consumers)
    expect(window.electronAPI.storageWrite).toHaveBeenCalledWith(
      expect.stringContaining('co_creation_config'),
      expect.objectContaining({ skillIds: ['a'], mode: 'compose' }),
    )
  })
})
