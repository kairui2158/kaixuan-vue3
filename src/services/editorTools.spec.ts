import { describe, expect, it } from 'vitest'
import { createEditorTools, ToolGateway, type ToolCallEvent } from './editorTools'
import { createEditorTargetSnapshot } from './editorTarget'

const snapshot = createEditorTargetSnapshot({
  workspace: 'main',
  targetId: 'chapter-1',
  label: '第一章',
  content: '第一段落提到主角。第二段落提到主角。第三段提到伏笔。',
  selectionStart: 0,
  selectionEnd: 3,
})

function makeContext(abortSignal?: AbortSignal) {
  return {
    projectId: 'p1',
    workspace: 'main' as const,
    targetId: 'chapter-1',
    sessionId: 's1',
    iteration: 1,
    abortSignal,
  }
}

describe('editorTools', () => {
  it('get_state returns a summary instead of full content', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => snapshot }))
    const result = await gateway.execute('editor.get_state', {}, makeContext())
    expect(result.ok).toBe(true)
    expect((result.data as any).contentLength).toBe(snapshot.content.length)
    expect((result.data as any).contentPreview.length).toBeLessThanOrEqual(240)
  })

  it('search caps results and returns context windows', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => snapshot }))
    const result = await gateway.execute('editor.search', { query: '主角' }, makeContext())
    expect(result.ok).toBe(true)
    expect((result.data as any).total).toBe(2)
    expect((result.data as any).matches[0].context.length).toBeLessThanOrEqual(300)
  })

  it('locate rejects ambiguous fragments with a structured error', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => snapshot }))
    const result = await gateway.execute('editor.locate', { fragment: '主角' }, makeContext())
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('ambiguous_target')

    expect(gateway.has('editor.propose_edits')).toBe(false)
  })

  it('direct mode exposes the unified direct write tool', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))
    expect(gateway.has('editor.write')).toBe(true)
    expect(gateway.has('editor.propose_edits')).toBe(false)
  })

  it('editor.write applies a validated batch immediately', async () => {
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))
    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_match', content: '新主角', target: '第一段落提到主角。' }],
      reveal: { mode: 'instant', firstChange: false },
    }, makeContext())

    expect(result.ok).toBe(true)
    expect((result.data as any)).toMatchObject({
      status: 'written',
      commandCount: 1,
      rollbackAvailable: true,
      reveal: { mode: 'instant', firstChange: false },
    })
    expect(appliedBatches).toHaveLength(1)
    expect(appliedBatches[0].next).toBe('新主角第二段落提到主角。第三段提到伏笔。')
    expect(appliedBatches[0].original).toBe(snapshot.content)
  })

  it('editor.write rejects validation failures without calling applyWrite', async () => {
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))
    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_match', content: '新主角', target: '主角' }],
    }, makeContext())

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('ambiguous_target')
    expect(result.error?.retryable).toBe(true)
    expect(appliedBatches).toHaveLength(0)
  })

  it('editor.write retries a partial-failure batch while keeping validated commands', async () => {
    let failedBatch: any = null
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
      onFailedBatch: batch => { failedBatch = batch },
      takeFailedBatch: () => failedBatch,
    }))

    const failed = await gateway.execute('editor.write', {
      commands: [
        { operation: 'replace_match', content: '新主角', target: '第一段落提到主角。' },
        { operation: 'replace_match', content: '新伏笔', target: '主角' },
      ],
    }, makeContext())
    expect(failed.ok).toBe(false)
    expect(failedBatch?.succeededIndexes).toEqual([0])

    const retried = await gateway.execute('editor.write', {
      commands: [{ operation: 'replace_match', content: '新伏笔', target: '第三段提到伏笔。' }],
      reason: '只重提失败条目',
    }, makeContext())

    expect(retried.ok).toBe(true)
    expect((retried.data as any).commandCount).toBe(2)
    expect(appliedBatches).toHaveLength(1)
    expect(appliedBatches[0].next).toBe('新主角第二段落提到主角。新伏笔')
    expect(failedBatch).toBeNull()
  })

  it('editor.write allows insert and append on an empty editor', async () => {
    const emptySnapshot = createEditorTargetSnapshot({
      workspace: 'main',
      targetId: 'empty-tab',
      label: '新章节',
      content: '',
    })
    const appliedBatches: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => emptySnapshot,
      mode: 'direct',
      applyWrite: async input => {
        appliedBatches.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    }))
    const result = await gateway.execute('editor.write', {
      commands: [{ operation: 'insert', content: '新开篇' }],
    }, { ...makeContext(), targetId: 'empty-tab' })

    expect(result.ok).toBe(true)
    expect(appliedBatches[0].next).toBe('新开篇')
  })

  it('editor.write rejects more than ten commands', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))
    const result = await gateway.execute('editor.write', {
      commands: Array.from({ length: 11 }, () => ({ operation: 'append', content: 'x' })),
    }, makeContext())
    expect(result.error?.code).toBe('too_many_commands')
  })

  it('editor.reveal highlights a unique fragment without modifying content', async () => {
    const revealed: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      revealTarget: async request => { revealed.push(request) },
    }))
    const result = await gateway.execute('editor.reveal', {
      target: { fragment: '第三段提到伏笔。' },
      focus: 'center',
    }, makeContext())

    expect(result.ok).toBe(true)
    expect((result.data as any)).toMatchObject({ status: 'revealed', degraded: true })
    expect(revealed).toHaveLength(1)
    expect(revealed[0]).toMatchObject({
      targetId: 'chapter-1',
      focus: 'center',
      highlightMs: 3000,
    })
  })

  it('editor.reveal rejects ambiguous fragments', async () => {
    const revealed: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      revealTarget: async request => { revealed.push(request) },
    }))
    const result = await gateway.execute('editor.reveal', {
      target: { fragment: '主角' },
    }, makeContext())

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('ambiguous_target')
    expect(revealed).toHaveLength(0)
  })

  it('editor.reveal supports paragraph index', async () => {
    const revealed: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      revealTarget: async request => { revealed.push(request) },
    }))
    const result = await gateway.execute('editor.reveal', {
      target: { paragraphIndex: 0 },
    }, makeContext())

    expect(result.ok).toBe(true)
    expect((result.data as any).start).toBe(0)
    expect((result.data as any).degraded).toBe(true)
    expect(revealed[0].end).toBe(snapshot.content.length)
  })

  it('editor.reveal supports structure anchors', async () => {
    const content = '第一卷 北境\n少年出发。\n第二章 灯塔\n风暴逼近。'
    const anchorSnapshot = createEditorTargetSnapshot({
      workspace: 'outline',
      targetId: 'outline',
      label: '大纲',
      content,
    })
    const revealed: any[] = []
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => anchorSnapshot,
      revealTarget: async request => { revealed.push(request) },
      workspace: 'outline',
    }))
    const result = await gateway.execute('editor.reveal', {
      target: { anchor: { chapterTitle: '第二章 灯塔' } },
    }, { ...makeContext(), workspace: 'outline' as const, targetId: 'outline' })

    expect(result.ok).toBe(true)
    expect((result.data as any).structurePath).toContain('第二章 灯塔')
    expect(revealed[0].start).toBe(content.indexOf('第二章 灯塔'))
  })

  it('returns structured errors for missing tools and invalid inputs', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => snapshot }))
    const missing = await gateway.execute('not.exists', {}, makeContext())
    expect(missing.error?.code).toBe('tool_not_found')

    const invalid = await gateway.execute('editor.search', { caseSensitive: true }, makeContext())
    expect(invalid.error?.code).toBe('missing_field')
  })

  it('supports abort before execution and emits every call event', async () => {
    const events: ToolCallEvent[] = []
    const controller = new AbortController()
    controller.abort()
    const gateway = new ToolGateway()
    gateway.onEvent(event => events.push(event))
    gateway.registerAll(createEditorTools({ getSnapshot: () => snapshot }))
    const result = await gateway.execute('editor.get_state', {}, makeContext(controller.signal))
    expect(result.error?.code).toBe('canceled')
    expect(events).toHaveLength(1)
    expect(events[0].toolName).toBe('editor.get_state')
  })

  it('update_plan updates UI state without touching content', async () => {
    let plan: { stage: string; steps: string[] } | null = null
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      onPlanUpdate: value => { plan = value },
    }))
    const result = await gateway.execute('task.update_plan', {
      stage: '定位伏笔',
      steps: ['搜索伏笔', '提出修改'],
    }, makeContext())
    expect(result.ok).toBe(true)
    expect(plan).toEqual({ stage: '定位伏笔', steps: ['搜索伏笔', '提出修改'] })
  })
})
