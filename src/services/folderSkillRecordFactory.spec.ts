import { describe, expect, it } from 'vitest'
import { buildFolderSkillId, buildFolderSkillRecord, parseFolderSkillId } from './folderSkillRecordFactory'

const loaded = {
  folderPath: 'D:/skills/kaixuan-s1',
  skill: {
    id: 'KAI-S1',
    name: '骨架师',
    description: '负责正文骨架',
    template: '生成骨架：{{outline}}',
    manifest: { version: '1.2.0' },
    meta: {
      intents: ['generate', 'discuss'],
      contextPolicy: { chatHistory: 'latest', includeOutline: true },
      deai: { generation: 'suffix-only' },
    },
    resources: [{ path: 'assets/a.bin' }, { path: 'assets/b.bin' }],
    warnings: [{ code: 'manifest-id-conflict', message: 'id 冲突' }],
  },
}

describe('folderSkillRecordFactory', () => {
  it('normalizes the folder namespace ids', () => {
    expect(parseFolderSkillId('folder:KAI-S1')).toBe('KAI-S1')
    expect(buildFolderSkillId('folder:KAI-S1')).toBe('folder:KAI-S1')
    expect(buildFolderSkillId('KAI-S2')).toBe('folder:KAI-S2')
  })

  it('builds one canonical record for every import entry', () => {
    const record = buildFolderSkillRecord({
      loaded,
      source: 'external',
      packageHash: 'sha256:abc',
      now: '2026-10-31T08:00:00.000Z',
    })

    expect(record).toMatchObject({
      id: 'folder:KAI-S1',
      sourceId: 'KAI-S1',
      name: '骨架师',
      version: '1.2.0',
      format: 'folder',
      folderPath: 'D:/skills/kaixuan-s1',
      source: 'external',
      packageHash: 'sha256:abc',
      template: '生成骨架：{{outline}}',
      category: 'folder',
      description: '负责正文骨架',
      resourceSummary: { resourceCount: 2, warningCount: 1 },
      executionMode: 'chain',
      outputFormat: 'text',
      intents: ['generate', 'discuss'],
      contextPolicy: { chatHistory: 'latest', includeOutline: true },
      createdAt: '2026-10-31T08:00:00.000Z',
      updatedAt: '2026-10-31T08:00:00.000Z',
    })
    expect(record.meta).toMatchObject({ deai: { generation: 'suffix-only' } })
  })

  it('falls back to the requested path when Electron does not resolve one', () => {
    const record = buildFolderSkillRecord({
      loaded: { skill: { id: 'fallback', name: 'Fallback', template: '模板' } },
      folderPath: 'D:/skills/fallback',
    })

    expect(record.folderPath).toBe('D:/skills/fallback')
    expect(record.id).toBe('folder:fallback')
  })

  it('ignores malformed metadata instead of crashing imports', () => {
    const record = buildFolderSkillRecord({
      loaded: {
        folderPath: 'D:/skills/bad-meta',
        skill: {
          id: 'bad-meta',
          name: 'Bad Meta',
          template: '模板',
          meta: { intents: ['generate', 42], contextPolicy: 'invalid' },
          resources: 'bad',
          warnings: 'bad',
        },
      },
    })

    expect(record.intents).toEqual(['generate'])
    expect(record.contextPolicy).toBeUndefined()
    expect(record.resourceSummary).toEqual({ resourceCount: 0, warningCount: 0 })
  })
})
