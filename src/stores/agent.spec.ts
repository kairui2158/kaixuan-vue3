import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAgentStore } from './agent'

const storageWrite = vi.fn().mockResolvedValue(true)
const storageRead = vi.fn().mockResolvedValue(null)

function makeAgent(id: string, name = id) {
  return {
    id,
    name,
    model: 'test-model',
    temperature: 0.4,
    maxTokens: 4096,
    systemPrompt: `prompt-${id}`,
  }
}

describe('agent store configuration exchange', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storageWrite.mockClear()
    storageRead.mockClear()
    vi.stubGlobal('window', {
      electronAPI: { storageWrite, storageRead },
    })
  })

  it('adds new agents and persists the complete agent list', async () => {
    const store = useAgentStore()

    const result = await store.importAgents([makeAgent('new-agent')], 'skip')

    expect(result).toEqual({ added: 1, updated: 0, skipped: 0 })
    expect(store.getAgent('new-agent')?.systemPrompt).toBe('prompt-new-agent')
    expect(storageWrite).toHaveBeenCalledTimes(1)
    expect(storageWrite).toHaveBeenCalledWith(
      expect.stringContaining('agents'),
      { agents: [expect.objectContaining({ id: 'new-agent' })] },
    )
  })

  it('skips duplicate agents without overwriting or writing storage', async () => {
    const store = useAgentStore()
    store.agents.push(makeAgent('same-agent', 'existing'))

    const result = await store.importAgents([makeAgent('same-agent', 'incoming')], 'skip')

    expect(result).toEqual({ added: 0, updated: 0, skipped: 1 })
    expect(store.getAgent('same-agent')?.name).toBe('existing')
    expect(storageWrite).not.toHaveBeenCalled()
  })

  it('overwrites duplicate agents and records updatedAt', async () => {
    const store = useAgentStore()
    store.agents.push(makeAgent('same-agent', 'existing'))

    const result = await store.importAgents([makeAgent('same-agent', 'incoming')], 'overwrite')

    expect(result).toEqual({ added: 0, updated: 1, skipped: 0 })
    expect(store.getAgent('same-agent')?.name).toBe('incoming')
    expect(store.getAgent('same-agent')?.updatedAt).toEqual(expect.any(String))
    expect(storageWrite).toHaveBeenCalledTimes(1)
  })

  it('exports the current agents using the versioned exchange envelope', () => {
    const store = useAgentStore()
    store.agents.push(makeAgent('export-agent'))

    const payload = JSON.parse(store.exportAllToJSON())

    expect(payload.schema).toBe('shenyi.agent')
    expect(payload.version).toBe(1)
    expect(payload.agents).toEqual([expect.objectContaining({ id: 'export-agent' })])
  })

  it('overwrite replaces optional fields and clears missing optional fields', async () => {
    const store = useAgentStore()
    store.agents.push({
      ...makeAgent('opt-agent', 'existing'),
      description: 'old description',
      provider: 'old-provider',
      tools: ['old-tool'],
    })

    const result = await store.importAgents([
      {
        id: 'opt-agent',
        name: 'incoming',
        model: 'incoming-model',
        temperature: 0.5,
        maxTokens: 8192,
        systemPrompt: 'incoming-prompt',
        description: undefined,
        provider: undefined,
        tools: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      },
    ], 'overwrite')

    expect(result).toEqual({ added: 0, updated: 1, skipped: 0 })
    expect(store.getAgent('opt-agent')?.systemPrompt).toBe('incoming-prompt')
    expect(store.getAgent('opt-agent')?.description).toBeUndefined()
    expect(store.getAgent('opt-agent')?.provider).toBeUndefined()
    expect(store.getAgent('opt-agent')?.tools).toBeUndefined()
  })

  it('overwrite preserves createdAt when incoming record omits it', async () => {
    const store = useAgentStore()
    store.agents.push({
      ...makeAgent('ts-agent', 'existing'),
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    await store.importAgents([
      {
        id: 'ts-agent',
        name: 'incoming',
        model: 'incoming-model',
        temperature: 0.5,
        maxTokens: 8192,
        systemPrompt: 'incoming-prompt',
        description: undefined,
        provider: undefined,
        tools: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      },
    ], 'overwrite')

    expect(store.getAgent('ts-agent')?.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('overwrite refreshes systemPrompt when incoming supplies it', async () => {
    const store = useAgentStore()
    store.agents.push(makeAgent('prompt-agent', 'existing'))

    await store.importAgents([
      {
        id: 'prompt-agent',
        name: 'incoming',
        model: 'incoming-model',
        temperature: 0.5,
        maxTokens: 8192,
        systemPrompt: 'incoming-prompt',
      },
    ], 'overwrite')

    expect(store.getAgent('prompt-agent')?.systemPrompt).toBe('incoming-prompt')
  })
})
