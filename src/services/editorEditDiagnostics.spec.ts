import { afterEach, describe, expect, it, vi } from 'vitest'
import { diagnoseEditorEditBatch, logEditorEdit, logEditorEditDiagnostics, logEditorPresentation } from './editorEditDiagnostics'

const content = [
  '第一卷 风暴起点',
  '男主在夜路中发现旧信。',
  '第1章 夜行',
  '男主穿过风暴，遇到持灯人。',
  '第2章 灯塔',
  '男主在灯塔下解读旧信。'
].join('\n')

const command = (overrides: Partial<Parameters<typeof diagnoseEditorEditBatch>[0]['commands'][number]> = {}) => ({
  type: 'editor_edit' as const,
  version: 1 as const,
  operation: 'replace_match' as const,
  content: '新内容',
  target: '男主穿过风暴',
  ...overrides
})

describe('diagnoseEditorEditBatch', () => {
  it('marks every command as valid when all targets are unique', () => {
    const result = diagnoseEditorEditBatch({
      commands: [
        command(),
        command({ operation: 'append', target: undefined, content: '结尾' })
      ],
      content
    })

    expect(result.ok).toBe(true)
    expect(result.succeededIndexes).toEqual([0, 1])
    expect(result.failedItems).toEqual([])
  })

  it('returns per-command diagnostics with retry guidance for partial failure', () => {
    const result = diagnoseEditorEditBatch({
      commands: [
        command(),
        command({ target: '旧信' }),
        command({ target: '不存在片段' })
      ],
      content
    })

    expect(result.ok).toBe(false)
    expect(result.succeededIndexes).toEqual([0])
    expect(result.failedItems).toHaveLength(2)
    expect(result.failedItems[0]).toMatchObject({
      index: 1,
      reason: 'ambiguous_target',
      suggestion: 'extend_fragment'
    })
    expect(result.failedItems[0].matches).toHaveLength(2)
    expect(result.failedItems[1]).toMatchObject({
      index: 2,
      reason: 'target_not_found',
      suggestion: 're_read_target'
    })
    expect(result.failedItems[1].candidates === undefined || result.failedItems[1].candidates?.length === 0).toBe(true)
    expect(result.retryCommand?.reason).toContain('只重提失败条目')
    expect(JSON.parse(result.retryCommand?.content || '{}')).toMatchObject({
      failedIndexes: [1, 2],
      keepIndexes: [0]
    })
  })

  it('reports selection and global failures without leaking false successes', () => {
    const selection = diagnoseEditorEditBatch({
      commands: [command({ operation: 'replace_selection', target: undefined })],
      content
    })
    expect(selection.failedItems[0]).toMatchObject({
      reason: 'selection_missing',
      suggestion: 'check_selection'
    })

    const stale = diagnoseEditorEditBatch({
      commands: [command(), command({ target: '旧信' })],
      content,
      failureReason: 'version_changed'
    })
    expect(stale.succeededIndexes).toEqual([])
    expect(stale.failedItems).toHaveLength(2)
    expect(stale.failedItems.every(item => item.reason === 'version_changed')).toBe(true)
  })
})

describe('editor diagnostics logging', () => {
  const originalWindow = (globalThis as any).window
  const log = vi.fn()

  afterEach(() => {
    vi.clearAllMocks()
    if (originalWindow === undefined) delete (globalThis as any).window
    else (globalThis as any).window = originalWindow
  })

  function installLogger() {
    ;(globalThis as any).window = { DiagLogger: { log } }
  }

  it('logs applied edits as info, rejected edits as error, and other results as warn', () => {
    installLogger()
    const base = {
      requestId: 'request-1',
      workspace: 'main' as const,
      tabId: 'tab-1',
      durationMs: 12,
    }

    logEditorEdit({ ...base, result: 'applied', operation: 'editor_write' })
    logEditorEdit({ ...base, result: 'rejected', operation: 'editor_write', failureReason: 'ambiguous_target' })
    logEditorEdit({ ...base, result: 'no_edit' })

    expect(log).toHaveBeenNthCalledWith(
      1,
      'info',
      'ai-service/editor-batch',
      expect.stringContaining('result=applied'),
      expect.objectContaining({ purpose: 'main-edit', result: 'applied' }),
    )
    expect(log).toHaveBeenNthCalledWith(
      2,
      'error',
      'ai-service/editor-batch',
      expect.stringContaining('failure=ambiguous_target'),
      expect.objectContaining({ purpose: 'main-edit', failureReason: 'ambiguous_target' }),
    )
    expect(log).toHaveBeenNthCalledWith(
      3,
      'warn',
      'ai-service/editor-batch',
      expect.stringContaining('result=no_edit'),
      expect.objectContaining({ purpose: 'main-edit', result: 'no_edit' }),
    )
  })

  it('logs batch diagnostics with the workspace purpose and full diagnostics payload', () => {
    installLogger()
    const diagnostics = diagnoseEditorEditBatch({ commands: [command()], content })

    logEditorEditDiagnostics({
      requestId: 'request-2',
      batchId: 'batch-2',
      workspace: 'outline',
      tabId: 'outline',
      diagnostics,
    })

    expect(log).toHaveBeenCalledWith(
      'info',
      'ai-service/editor-batch',
      expect.stringContaining('批次 1 条命令全部通过定位校验'),
      expect.objectContaining({ purpose: 'outline-edit', diagnostics }),
    )
  })

  it('logs editor presentation phases, including failures at error level', () => {
    installLogger()

    logEditorPresentation({
      phase: 'start',
      workspace: 'main',
      targetId: 'tab-1',
      mode: 'stream',
      commands: 2,
    })
    logEditorPresentation({
      phase: 'failed',
      workspace: 'outline',
      targetId: 'outline',
      mode: 'instant',
      commands: 1,
      reason: 'locked',
    })

    expect(log).toHaveBeenNthCalledWith(
      1,
      'info',
      'ai-service/editor-presentation',
      expect.stringContaining('phase=start target=tab-1 mode=stream commands=2'),
      expect.objectContaining({ purpose: 'main-edit', phase: 'start', mode: 'stream', commands: 2 }),
    )
    expect(log).toHaveBeenNthCalledWith(
      2,
      'error',
      'ai-service/editor-presentation',
      expect.stringContaining('phase=failed target=outline mode=instant commands=1 reason=locked'),
      expect.objectContaining({ purpose: 'outline-edit', phase: 'failed', reason: 'locked' }),
    )
  })

  it('keeps logging silent when DiagLogger is unavailable', () => {
    ;(globalThis as any).window = {}

    logEditorEdit({
      requestId: 'request-3',
      workspace: 'main',
      tabId: 'tab-1',
      result: 'applied',
      durationMs: 1,
    })
    logEditorPresentation({
      phase: 'failed',
      workspace: 'outline',
      targetId: 'outline',
      mode: 'stream',
      reason: 'version_changed',
    })

    expect(log).not.toHaveBeenCalled()
  })
})
