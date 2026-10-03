import { describe, expect, it } from 'vitest'
import {
  analyzeLongDocumentRequest,
  classifyLongDocumentOperation,
  isFinalDraftOperation,
  shouldAutoRouteToEditTask,
} from './longDocumentPolicy'

describe('analyzeLongDocumentRequest', () => {
  it('classifies a CJK manuscript by UTF-8 bytes even when its character count is below the character threshold', () => {
    const decision = analyzeLongDocumentRequest('修改第 3 节的一句话', '雨'.repeat(7_602))
    expect(decision.longDocument).toBe(true)
    expect(decision.reason).toBe('byte-threshold')
    expect(decision.outlineChars).toBe(7_602)
    expect(decision.outlineBytes).toBe(7_602 * 3)
  })

  it('recognizes moving a section as a long-document structural operation', () => {
    const decision = analyzeLongDocumentRequest(
      '把第 15 节移动到第 5 节前面，保持两节内容完整。',
      '第一节\n短文',
    )
    expect(decision.longDocument).toBe(true)
    expect(decision.reason).toBe('structural-move-request')
  })

  it('keeps whole-document wording as the highest-priority trigger', () => {
    const decision = analyzeLongDocumentRequest('整理整篇文章，统一编号', '')
    expect(decision.longDocument).toBe(true)
    expect(decision.reason).toBe('whole-document-request')
  })

  it('does not classify ordinary short-document edits as long-document work', () => {
    const decision = analyzeLongDocumentRequest('删除第 11 节里的一句话', '第一节\n短文')
    expect(decision.longDocument).toBe(false)
    expect(decision.reason).toBe('short-document')
  })

  it('handles environments without TextEncoder without inventing a byte count', () => {
    const decision = analyzeLongDocumentRequest('修改一句话', '雨'.repeat(7_602), () => null)
    expect(decision.longDocument).toBe(false)
    expect(decision.outlineBytes).toBeNull()
  })

  it('keeps whole-document work on the final-draft path regardless of document length', () => {
    const decision = analyzeLongDocumentRequest(
      '全文重写这篇文章，统一编号',
      '雨'.repeat(90_000),
    )
    expect(decision.longDocument).toBe(true)
    expect(decision.editTaskExecution).toBe(false)
    expect(decision.finalDraftCandidate).toBe(true)
    expect(decision.executionModeReason).toBe('whole-document-replacement-final-draft')
  })

  it('does not mark ordinary long-document edits as final-draft candidates', () => {
    const decision = analyzeLongDocumentRequest(
      '修改第 3 节的一句话',
      '雨'.repeat(90_000),
    )
    expect(decision.longDocument).toBe(true)
    expect(decision.reason).toBe('char-threshold')
    expect(decision.editTaskExecution).toBe(false)
    expect(decision.finalDraftCandidate).toBe(false)
    expect(decision.executionModeReason).toBe('char-threshold-no-whole-document-request')
  })

  it('keeps a short whole-document request as a final-draft candidate', () => {
    const decision = analyzeLongDocumentRequest('全文重写这篇文章', '第一节\n短文')
    expect(decision.longDocument).toBe(true)
    expect(decision.editTaskExecution).toBe(false)
    expect(decision.finalDraftCandidate).toBe(true)
    expect(decision.executionModeReason).toBe('whole-document-replacement-final-draft')
  })

  it('routes whole-document cleanup and restructure requests to EditTask', () => {
    const decision = analyzeLongDocumentRequest('整理整篇文章，统一编号', '第一节\n短文')
    expect(decision.longDocument).toBe(true)
    expect(decision.editTaskExecution).toBe(false)
    expect(decision.finalDraftCandidate).toBe(false)
    expect(decision.executionModeReason).toBe('whole-document-request-edit-task')
  })

  it('keeps structural moves on targeted commands without forcing batch execution', () => {
    const decision = analyzeLongDocumentRequest(
      '把第 15 节移动到第 5 节前面，保持两节内容完整。',
      '雨'.repeat(90_000),
    )
    expect(decision.longDocument).toBe(true)
    expect(decision.editTaskExecution).toBe(false)
    expect(decision.finalDraftCandidate).toBe(false)
    expect(decision.executionModeReason).toBe('structural-move-targeted-commands')
  })

  it('auto-routes structural restructure and large-scope cleanup operations to EditTask', () => {
    expect(shouldAutoRouteToEditTask({
      length: 10_001,
      operationType: 'whole-document-restructure',
    })).toEqual({
      editTask: true,
      finalDraft: false,
      reason: 'whole-document-restructure-edit-task',
    })

    expect(shouldAutoRouteToEditTask({
      length: 9_999,
      operationType: 'whole-document-restructure',
    })).toEqual({
      editTask: true,
      finalDraft: false,
      reason: 'whole-document-restructure-edit-task',
    })

    expect(shouldAutoRouteToEditTask({
      length: 100_000,
      operationType: 'targeted-edit',
    })).toEqual({
      editTask: false,
      finalDraft: false,
      reason: 'targeted-edit-direct-tool-loop',
    })
  })

  it('keeps whole-document replacement on final draft while other long operations use EditTask', () => {
    expect(shouldAutoRouteToEditTask({
      length: 9_000,
      operationType: 'whole-document-replacement',
      availableContextTokens: 1_000,
      estimatedDocumentTokens: 5_000,
    })).toEqual({
      editTask: false,
      finalDraft: true,
      reason: 'whole-document-replacement-final-draft',
    })

    expect(shouldAutoRouteToEditTask({
      length: 9_000,
      operationType: 'whole-document-restructure',
      availableContextTokens: 1_000,
      estimatedDocumentTokens: 5_000,
    })).toEqual({
      editTask: true,
      finalDraft: false,
      reason: 'whole-document-restructure-edit-task',
    })

    expect(shouldAutoRouteToEditTask({
      length: 9_000,
      operationType: 'large-scope-edit',
      availableContextTokens: 1_000,
      estimatedDocumentTokens: 5_000,
    })).toEqual({
      editTask: true,
      finalDraft: false,
      reason: 'large-scope-edit-edit-task',
    })

    expect(shouldAutoRouteToEditTask({
      length: 9_000,
      operationType: 'targeted-edit',
      availableContextTokens: 1_000,
      estimatedDocumentTokens: 5_000,
    })).toEqual({
      editTask: false,
      finalDraft: false,
      reason: 'targeted-edit-window-gap-packed-tools',
    })
  })
})

describe('classifyLongDocumentOperation', () => {
  it('separates whole-document replacement, restructure, targeted edits, and discussion', () => {
    expect(classifyLongDocumentOperation('全文替换成新的设定')).toBe('whole-document-replacement')
    expect(classifyLongDocumentOperation('把整篇大纲重新整理排序，统一编号')).toBe('whole-document-restructure')
    expect(classifyLongDocumentOperation('把第 15 节移动到第 5 节前面')).toBe('targeted-edit')
    expect(classifyLongDocumentOperation('修改第 3 节的一句话')).toBe('targeted-edit')
    expect(classifyLongDocumentOperation('先聊聊第一卷的钩子设计')).toBe('discussion')
  })
})

describe('isFinalDraftOperation', () => {
  it('limits final-draft candidacy to explicit whole-document replacement', () => {
    expect(isFinalDraftOperation('whole-document-replacement')).toBe(true)
    expect(isFinalDraftOperation('whole-document-restructure')).toBe(false)
    expect(isFinalDraftOperation('large-scope-edit')).toBe(false)
    expect(isFinalDraftOperation('targeted-edit')).toBe(false)
    expect(isFinalDraftOperation('discussion')).toBe(false)
  })
})
