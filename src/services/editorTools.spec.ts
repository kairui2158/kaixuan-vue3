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
  })

  it('propose_edits never reports direct application', async () => {
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({ getSnapshot: () => snapshot }))
    const result = await gateway.execute('editor.propose_edits', {
      commands: [{ operation: 'append', content: '新结局' }],
    }, makeContext())
    expect(result.ok).toBe(true)
    expect((result.data as any).status).toBe('pending_user_confirmation')
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
