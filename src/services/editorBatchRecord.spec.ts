import { describe, expect, it } from 'vitest'
import type { EditorEditBatchCommand } from './editorEditProtocol'
import { hashEditorContent } from './editorTarget'
import { normalizeDialogueBatchEvent } from './dialogueFoundation'
import {
  canRollbackEditorBatch,
  createEditorBatchRecord,
  findEditorBatchUndoContent,
  normalizeEditorBatchRecord,
  transitionEditorBatchRecord,
  toDialogueBatchEvent,
  updateEditorBatchRecord
} from './editorBatchRecord'

const batch: EditorEditBatchCommand = {
  type: 'editor_edit_batch',
  version: 1,
  commands: [
    { type: 'editor_edit', version: 1, operation: 'append', content: '新段落', reason: '补充结尾' }
  ],
  reason: '测试批次'
}

describe('editorBatchRecord', () => {
  it('创建带源内容 hash 的待确认记录', () => {
    const source = '原始内容'
    const record = createEditorBatchRecord({ workspace: 'main', targetId: 'tab-1', batch, sourceContent: source })
    expect(record.status).toBe('pending')
    expect(record.commandCount).toBe(1)
    expect(record.sourceContentHash).toBe(hashEditorContent(source))
  })

  it('更新记录时保留不可变身份字段', () => {
    const record = createEditorBatchRecord({ workspace: 'outline', targetId: 'outline', batch, sourceContent: '大纲' })
    const updated = updateEditorBatchRecord(record, {
      status: 'applied',
      appliedContentHash: hashEditorContent('大纲新'),
      appliedAt: 123,
      undoAvailable: true
    })
    expect(updated.batchId).toBe(record.batchId)
    expect(updated.status).toBe('applied')
    expect(updated.undoAvailable).toBe(true)
    expect(normalizeEditorBatchRecord(updated)).toEqual(updated)
  })

  it('拒绝非法持久化记录并校验回滚条件', () => {
    expect(normalizeEditorBatchRecord({ version: 2 })).toBeNull()
    const source = '旧内容'
    const applied = '旧内容新内容'
    const record = updateEditorBatchRecord(
      createEditorBatchRecord({ workspace: 'main', targetId: 'tab-1', batch, sourceContent: source }),
      {
        status: 'applied',
        appliedContentHash: hashEditorContent(applied),
        undoAvailable: true
      }
    )
    expect(canRollbackEditorBatch(record, '用户又改了')).toBe(false)
    expect(canRollbackEditorBatch(record, applied)).toBe(true)
    expect(findEditorBatchUndoContent(['无关内容', source], record)).toEqual({ content: source, consumed: 1 })
    expect(findEditorBatchUndoContent([], record)).toBeNull()
  })

  it('批次确认状态机首答不可变', () => {
    const record = createEditorBatchRecord({ workspace: 'outline', targetId: 'outline', batch, sourceContent: '大纲' })
    const applied = transitionEditorBatchRecord(record, 'applied')
    expect(applied.status).toBe('applied')
    expect(transitionEditorBatchRecord(applied, 'expired').status).toBe('applied')
    expect(transitionEditorBatchRecord(applied, 'rejected').status).toBe('applied')

    const second = createEditorBatchRecord({ workspace: 'outline', targetId: 'outline', batch, sourceContent: '大纲' })
    expect(transitionEditorBatchRecord(transitionEditorBatchRecord(second, 'expired'), 'applied').status).toBe('expired')
  })

  it('转换为统一对话批次事件时保留身份与命令数', () => {
    const record = createEditorBatchRecord({ workspace: 'main', targetId: 'tab-1', batch, sourceContent: '原文' })
    const event = toDialogueBatchEvent(record, 'applied', '用户确认')

    expect(event).toEqual({
      version: 1,
      batchId: record.batchId,
      workspace: 'main',
      targetId: 'tab-1',
      status: 'applied',
      commandCount: 1,
      reason: '用户确认',
      occurredAt: event.occurredAt
    })
    expect(normalizeDialogueBatchEvent(event)?.status).toBe('applied')
  })
})
