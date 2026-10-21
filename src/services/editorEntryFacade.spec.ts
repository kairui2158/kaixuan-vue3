import { describe, expect, it } from 'vitest'
import {
  buildContextPack,
  buildMainSnapshot,
  buildSnapshot,
  getReadCapChars,
} from './editorEntryFacade'
import { EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS } from './editorContextPolicy'
import type { EditorTargetSnapshot } from './editorTarget'

describe('getReadCapChars', () => {
  it('uses the shared provider/model read-cap policy', () => {
    expect(getReadCapChars({ contextWindowTokens: 1_000_000 }, 'unknown-model')).toBe(20_000)
    expect(getReadCapChars({ contextWindowTokens: 'not-a-number' }, 'unknown-model')).toBe(20_000)
    expect(getReadCapChars(undefined, 'unknown-model')).toBe(20_000)
  })
})

describe('buildSnapshot', () => {
  it('builds outline snapshots and clamps stale selections', () => {
    const snapshot = buildSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲编辑器',
      content: '第一卷\n第一卷内',
      selectionStart: 999,
      selectionEnd: 1_000,
    })

    expect(snapshot?.workspace).toBe('outline')
    expect(snapshot?.selectionStart).toBe(8)
    expect(snapshot?.selectionEnd).toBe(8)
    expect(snapshot?.selectedText).toBe('')
  })

  it('returns null without a target', () => {
    expect(buildSnapshot(null)).toBeNull()
  })
})

describe('buildMainSnapshot', () => {
  it('falls back to an empty project-level main target', () => {
    const snapshot = buildMainSnapshot(null, 'project-1')

    expect(snapshot.workspace).toBe('main')
    expect(snapshot.targetId).toBe('project-1')
    expect(snapshot.label).toBe('主页编辑器')
    expect(snapshot.content).toBe('')
  })

  it('preserves tab identity and selection semantics', () => {
    const snapshot = buildMainSnapshot({
      workspace: 'main',
      targetId: 'tab-1',
      label: '第一章',
      chapterId: 'chapter-1',
      mode: 'ch-body',
      content: '正文内容',
      selectionStart: 0,
      selectionEnd: 2,
    }, 'project-1', { selectionStart: 0, selectionEnd: 2 })

    expect(snapshot.targetId).toBe('tab-1')
    expect(snapshot.chapterId).toBe('chapter-1')
    expect(snapshot.mode).toBe('ch-body')
    expect(snapshot.selectedText).toBe('正文')
  })
})

describe('buildContextPack', () => {
  it('can force full injection for callers with an explicit full-content contract', () => {
    const target = buildSnapshot({
      workspace: 'main',
      targetId: 'tab-long',
      label: '长文',
      content: `${'长'.repeat(20_000)}`,
      selectionStart: 0,
      selectionEnd: 0,
    }) as EditorTargetSnapshot

    const pack = buildContextPack(target, 'full')
    expect(pack?.mode).toBe('full')
    expect(pack?.content).toBe(target.content)
  })
  it('returns the outline structure pack', () => {
    const target = buildSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲编辑器',
      content: '第一卷 起势\n少年离开旧城。',
      selectionStart: 0,
      selectionEnd: 2,
    }) as EditorTargetSnapshot
    const pack = buildContextPack(target)

    expect(pack?.workspace).toBe('outline')
    expect(pack?.mode).toBe('full')
    expect(pack?.pipeline.windowDeclared).toBe(false)
    expect(pack?.pipeline.availableContextTokens).toBeNull()
    expect(pack?.content).toContain('第一卷 起势')
  })

  it('keeps short main documents full and packs long ones', () => {
    const short = buildContextPack(buildMainSnapshot({
      workspace: 'main',
      targetId: 'tab-1',
      label: '第一章',
      content: '完整短文',
      selectionStart: 0,
      selectionEnd: 0,
    }, 'project-1'))
    const long = buildContextPack(buildMainSnapshot({
      workspace: 'main',
      targetId: 'tab-2',
      label: '第二章',
      content: `${'头'.repeat(7_000)}中段${'尾'.repeat(7_000)}`,
      selectionStart: 0,
      selectionEnd: 0,
    }, 'project-1'))

    expect(short?.mode).toBe('full')
    expect(short?.content).toBe('完整短文')
    expect(long?.mode).toBe('packed')
    expect(long?.content).toContain('editor.document_map')
    expect(long?.content).toContain('editor.read_range')
    expect(long?.content.length).toBeLessThan(EDITOR_CONTEXT_FULL_CONTENT_MAX_CHARS + 2_000)
  })
})
