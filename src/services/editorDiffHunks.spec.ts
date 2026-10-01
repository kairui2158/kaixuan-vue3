import { describe, expect, it } from 'vitest'
import {
  buildEditHunks,
  rebaseHunksAfterReject,
  resolveEditorDiffHunkView,
} from './editorDiffHunks'
import { planEditorEditBatch } from './editorEditBatch'
import { createEditorTargetSnapshot } from './editorTarget'
import type { EditorEditBatchCommand, EditorEditCommand } from './editorEditProtocol'

const content = '第一段：男主出发。\n第二段：进入遗迹。\n第三段：拿到线索。'

function command(operation: EditorEditCommand['operation'], fields: Partial<EditorEditCommand> = {}): EditorEditCommand {
  return { type: 'editor_edit', version: 1, operation, ...fields } as EditorEditCommand
}

function plan(commands: EditorEditCommand[], source = content) {
  const target = createEditorTargetSnapshot({
    workspace: 'main',
    targetId: 'tab-1',
    label: '第一章',
    chapterId: 'chapter-1',
    mode: 'ch-body',
    content: source,
  })
  const batch: EditorEditBatchCommand = {
    type: 'editor_edit_batch',
    version: 1,
    commands,
    reason: '测试批次',
  }
  return planEditorEditBatch(batch, target, { content: source })
}

describe('buildEditHunks', () => {
  it('maps later hunks through earlier length changes', () => {
    const batch = plan([
      command('replace_match', { target: '遗迹', content: '禁忌之地' }),
      command('replace_match', { target: '线索', content: '钥匙' }),
    ])
    expect(batch.ok).toBe(true)

    const hunks = buildEditHunks(batch)
    expect(hunks).toHaveLength(2)
    expect(hunks[0]).toMatchObject({
      index: 0,
      operation: 'replace_match',
      kind: 'replace',
      beforeText: '遗迹',
      afterText: '禁忌之地',
    })
    expect(hunks[0].range).toEqual({ start: content.indexOf('遗迹'), end: content.indexOf('遗迹') + '禁忌之地'.length })

    const originalSecondStart = content.indexOf('线索')
    const delta = '禁忌之地'.length - '遗迹'.length
    expect(hunks[1].range).toEqual({ start: originalSecondStart + delta, end: originalSecondStart + delta + '钥匙'.length })
    expect(hunks[1].afterText).toBe('钥匙')
    expect(hunks[1].contextBefore).toContain('禁忌之地')
  })

  it('represents delete commands as zero-width ghost hunks', () => {
    const batch = plan([
      command('delete', { target: '第二段：进入遗迹。\n' }),
    ])
    expect(batch.ok).toBe(true)

    const hunks = buildEditHunks(batch)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({
      kind: 'remove',
      beforeText: '第二段：进入遗迹。\n',
      afterText: '',
    })
    expect(hunks[0].range.start).toBe(hunks[0].range.end)
  })

  it('returns no hunks for a failed batch plan', () => {
    const batch = plan([
      command('replace_match', { target: '不存在', content: '新文本' }),
    ])
    expect(batch.ok).toBe(false)
    expect(buildEditHunks(batch)).toEqual([])
  })
})

describe('rebaseHunksAfterReject', () => {
  it('rebuilds accepted hunks from the original snapshot instead of shifting old ranges', () => {
    const batch = plan([
      command('replace_match', { target: '遗迹', content: '禁忌之地' }),
      command('replace_match', { target: '线索', content: '钥匙' }),
    ])
    expect(batch.ok).toBe(true)

    const result = rebaseHunksAfterReject(batch, [0])
    expect(result.hunks).toHaveLength(1)
    expect(result.hunks[0]).toMatchObject({
      index: 1,
      status: 'active',
      beforeText: '线索',
      afterText: '钥匙',
    })
    expect(result.hunks[0].range.start).toBe(content.indexOf('线索'))
    expect(result.rebaseEvents).toEqual([
      expect.objectContaining({ type: 'rejected', index: 0 }),
      expect.objectContaining({ type: 'range_rebased', index: 1 }),
    ])
  })
})

describe('resolveEditorDiffHunkView', () => {
  it('consumes stored hunks instead of rebuilding them from an empty item list', () => {
    const batch = plan([
      command('replace_match', { target: '遗迹', content: '禁忌之地' }),
      command('replace_match', { target: '线索', content: '钥匙' }),
    ])
    expect(batch.ok).toBe(true)
    const storedHunks = buildEditHunks(batch)

    const view = resolveEditorDiffHunkView({
      ok: true,
      original: batch.original,
      next: batch.next,
      items: [],
    }, {
      currentContent: batch.next,
      storedHunks,
    })

    expect(view.hunks).toEqual(storedHunks)
    expect(view.stale).toBe(false)
    expect(view.canRollbackSingleCommand).toBe(true)
  })

  it('marks stored hunks stale when the editor no longer matches the stored next content', () => {
    const batch = plan([
      command('replace_match', { target: '遗迹', content: '禁忌之地' }),
    ])
    expect(batch.ok).toBe(true)
    const storedHunks = buildEditHunks(batch)

    const view = resolveEditorDiffHunkView({
      ok: true,
      original: batch.original,
      next: batch.next,
      items: [],
    }, {
      currentContent: `${batch.next}手动补充`,
      storedHunks,
    })

    expect(view.stale).toBe(true)
    expect(view.hunks.every(hunk => hunk.status === 'stale')).toBe(true)
    expect(view.canRollbackSingleCommand).toBe(false)
  })

  it('marks every hunk stale after a manual edit and blocks single-command rollback', () => {
    const batch = plan([
      command('replace_match', { target: '遗迹', content: '禁忌之地' }),
      command('replace_match', { target: '线索', content: '钥匙' }),
    ])
    expect(batch.ok).toBe(true)

    const view = resolveEditorDiffHunkView(batch, {
      currentContent: `${batch.next}\n用户手动补充。`,
    })
    expect(view.stale).toBe(true)
    expect(view.staleIndexes).toEqual([0, 1])
    expect(view.hunks.every(hunk => hunk.status === 'stale')).toBe(true)
    expect(view.canRollbackSingleCommand).toBe(false)
    expect(view.reason).toContain('版本已变化')
  })

  it('allows single-command rollback while the applied content still matches', () => {
    const batch = plan([
      command('replace_match', { target: '遗迹', content: '禁忌之地' }),
    ])
    expect(batch.ok).toBe(true)

    const view = resolveEditorDiffHunkView(batch, { currentContent: batch.next })
    expect(view.stale).toBe(false)
    expect(view.canRollbackSingleCommand).toBe(true)
    expect(view.hunks[0].status).toBe('active')
  })
})
