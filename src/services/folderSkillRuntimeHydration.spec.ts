import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateRuntimeFolderTemplates } from './folderSkillRuntimeHydration'
import type { WorkspaceSkillTemplate } from './workspaceSkillEngine'

vi.mock('./realSkillLoader', () => ({
  loadRuntimeFolderSkillMetadata: vi.fn(),
}))

import { loadRuntimeFolderSkillMetadata } from './realSkillLoader'

const loadMock = vi.mocked(loadRuntimeFolderSkillMetadata)

function template(overrides: Partial<WorkspaceSkillTemplate> = {}): WorkspaceSkillTemplate {
  return {
    id: 'folder:KAI-S1',
    name: '骨架师',
    template: 'store 模板',
    ...overrides,
  } as WorkspaceSkillTemplate
}

describe('folderSkillRuntimeHydration', () => {
  beforeEach(() => {
    loadMock.mockReset()
  })

  it('refreshes template, meta, intents, and context policy from disk', async () => {
    loadMock.mockResolvedValueOnce({
      package: null,
      error: null,
      meta: { deai: { generation: 'suffix-only' } },
      intents: ['generate'],
      contextPolicy: { chatHistory: 'none', includeOutline: false },
      template: 'disk 模板',
      fingerprint: [{ file: 'template.md', hash: 'abc', mtime: 0, bytes: 10 }],
      warnings: [],
    })
    const item = template({
      skill: {
        format: 'folder',
        folderPath: 'D:/skills/kaixuan-s1',
        meta: {},
        intents: [],
        contextPolicy: {},
      } as any,
    })

    await hydrateRuntimeFolderTemplates([item])

    expect(item.template).toBe('disk 模板')
    expect(item.meta).toEqual({ deai: { generation: 'suffix-only' } })
    expect(item.intents).toEqual(['generate'])
    expect(item.contextPolicy).toEqual({ chatHistory: 'none', includeOutline: false })
    expect((item.skill as any).meta).toEqual({ deai: { generation: 'suffix-only' } })
    expect((item.skill as any).intents).toEqual(['generate'])
    expect((item.skill as any).contextPolicy).toEqual({ chatHistory: 'none', includeOutline: false })
  })

  it('keeps the store snapshot when disk loading fails', async () => {
    loadMock.mockResolvedValueOnce({
      package: null,
      error: 'skill-not-found',
      meta: {},
      intents: undefined,
      contextPolicy: undefined,
      template: '',
      fingerprint: undefined,
      warnings: [],
    })
    const item = template({
      template: 'store 模板',
      skill: { format: 'folder', folderPath: 'D:/skills/missing' } as any,
    })

    await hydrateRuntimeFolderTemplates([item])

    expect(item.template).toBe('store 模板')
    expect(item.meta).toBeUndefined()
  })

  it('does not touch text templates or folder records without a path', async () => {
    const text = template({ id: 'KAI-S1' })
    const missingPath = template({ skill: { format: 'folder' } as any })

    await hydrateRuntimeFolderTemplates([text, missingPath])

    expect(loadMock).not.toHaveBeenCalled()
  })
})
