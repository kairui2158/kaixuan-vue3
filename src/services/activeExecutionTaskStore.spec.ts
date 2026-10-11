import { describe, expect, it } from 'vitest'
import { hashEditorContent } from './editorTarget'
import { buildLongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import {
  ActiveExecutionTaskStore,
  type ActiveExecutionTask,
} from './activeExecutionTaskStore'

function makeTask(overrides: Partial<ActiveExecutionTask> = {}): ActiveExecutionTask {
  const content = '# 大纲\n\n第一卷'
  return {
    taskId: 'task-1',
    workspace: 'outline',
    projectId: 'project-1',
    originalRequest: '按照Word文档格式重构整篇大纲',
    operation: 'restructure',
    documentVersion: 1,
    contentHash: hashEditorContent(content),
    createdAt: 1_000,
    updatedAt: 1_000,
    status: 'active',
    ...overrides,
  }
}

describe('ActiveExecutionTaskStore', () => {
  it('creates an active write task per workspace and project', () => {
    const store = new ActiveExecutionTaskStore()
    const task = makeTask()
    store.create(task)

    expect(store.get('outline', 'project-1')).toEqual(task)
    expect(store.get('outline', 'project-2')).toBeNull()
    expect(store.get('main', 'project-1')).toBeNull()
  })

  it('invalidates a task when the document version or content hash changes', () => {
    const store = new ActiveExecutionTaskStore()
    store.create(makeTask())

    expect(store.getValid('outline', 'project-1', 1, hashEditorContent('# 大纲\n\n第一卷'))).toEqual(makeTask())
    expect(store.getValid('outline', 'project-1', 2, hashEditorContent('# 大纲\n\n第一卷'))).toBeNull()
    expect(store.get('outline', 'project-1')).toBeNull()
    expect(store.getValid('outline', 'project-1', 1, hashEditorContent('# edited'))).toBeNull()
    expect(store.get('outline', 'project-1')).toBeNull()
  })

  it('clears the active task on reset', () => {
    const store = new ActiveExecutionTaskStore()
    store.create(makeTask())
    store.clear('outline', 'project-1')
    expect(store.get('outline', 'project-1')).toBeNull()
  })

  it('keeps a successfully completed task continuable until reset or invalidation', () => {
    const store = new ActiveExecutionTaskStore()
    const task = store.create(makeTask())

    const completed = store.complete(
      'outline',
      'project-1',
      2,
      hashEditorContent('# 大纲\n\n第一卷\n\nAPI 已写入'),
    )

    expect(completed?.taskId).toBe(task.taskId)
    expect(completed?.status).toBe('completed')
    expect(store.getValidSnapshot(
      'outline',
      'project-1',
      2,
      hashEditorContent('# 大纲\n\n第一卷\n\nAPI 已写入'),
    )).toEqual({
      taskId: task.taskId,
      operation: task.operation,
      originalRequest: task.originalRequest,
      status: 'completed',
      authorizedExcerpts: [],
    })
    expect(store.getValid(
      'outline',
      'project-1',
      1,
      hashEditorContent('# 大纲\n\n第一卷'),
    )).toBeNull()
  })

  it('keeps a task continuable after its own successful write refreshes the document fingerprint', () => {
    const store = new ActiveExecutionTaskStore()
    const task = store.create(makeTask())

    const refreshed = store.refresh(
      'outline',
      'project-1',
      2,
      hashEditorContent('# 大纲\n\n第一卷\n\nAPI 已写入'),
    )

    expect(refreshed?.taskId).toBe(task.taskId)
    expect(refreshed?.documentVersion).toBe(2)
    expect(refreshed?.contentHash).toBe(hashEditorContent('# 大纲\n\n第一卷\n\nAPI 已写入'))
    expect(store.getValidSnapshot(
      'outline',
      'project-1',
      2,
      hashEditorContent('# 大纲\n\n第一卷\n\nAPI 已写入'),
    )).toEqual({
      taskId: task.taskId,
      operation: task.operation,
      originalRequest: task.originalRequest,
      status: 'active',
      authorizedExcerpts: [],
    })
  })

  it('preserves the original compound request when a continuation updates the task fingerprint', () => {
    const store = new ActiveExecutionTaskStore()
    store.create(makeTask())

    store.refresh(
      'outline',
      'project-1',
      2,
      hashEditorContent('# 大纲\n\n第一卷\n\nAPI 已写入'),
    )

    expect(store.getValidSnapshot(
      'outline',
      'project-1',
      2,
      hashEditorContent('# 大纲\n\n第一卷\n\nAPI 已写入'),
    )).toEqual({
      taskId: 'task-1',
      operation: 'restructure',
      originalRequest: '按照Word文档格式重构整篇大纲',
      status: 'active',
      authorizedExcerpts: [],
    })
  })

  it('preserves an awaiting-user plan and exposes it in the valid snapshot', () => {
    const store = new ActiveExecutionTaskStore()
    const content = '# 大纲\n\n第一卷'
    const plan = buildLongDocumentExecutionPlan({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
    })
    const task = store.create(makeTask({ plan, authorizedExcerpts: [] }))

    const awaiting = store.markAwaitingUserPlan('outline', 'project-1')

    expect(awaiting?.status).toBe('awaiting_user_plan')
    expect(store.getValidSnapshot(
      'outline',
      'project-1',
      1,
      hashEditorContent(content),
    )).toMatchObject({
      taskId: task.taskId,
      status: 'awaiting_user_plan',
      plan,
      authorizedExcerpts: [],
    })
  })

  it('does not replace an awaiting-user plan with a discussion task', () => {
    const store = new ActiveExecutionTaskStore()
    const content = '# 大纲\n\n第一卷'
    const plan = buildLongDocumentExecutionPlan({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
    })
    store.create(makeTask({ plan, authorizedExcerpts: [] }))
    store.markAwaitingUserPlan('outline', 'project-1')

    const replacement = store.create(makeTask({
      taskId: 'discussion-task',
      originalRequest: '执行前先解释一下第二卷钩子怎么处理',
      operation: 'discussion',
    }))

    expect(replacement?.taskId).toBe('task-1')
    expect(store.getValidSnapshot(
      'outline',
      'project-1',
      1,
      hashEditorContent(content),
    )).toMatchObject({
      taskId: 'task-1',
      status: 'awaiting_user_plan',
      originalRequest: '按照Word文档格式重构整篇大纲',
    })
  })

  it('does not replace an active write task with a discussion task', () => {
    const store = new ActiveExecutionTaskStore()
    const task = store.create(makeTask())

    const replacement = store.create(makeTask({
      taskId: 'discussion-task',
      originalRequest: '执行前先解释一下第二卷钩子怎么处理',
      operation: 'discussion',
    }))

    expect(replacement?.taskId).toBe(task.taskId)
    expect(store.get('outline', 'project-1')).toMatchObject({
      taskId: task.taskId,
      status: 'active',
      operation: 'restructure',
    })
  })

  it('creates a new task after the previous awaiting plan is completed', () => {
    const store = new ActiveExecutionTaskStore()
    const content = '# 大纲\n\n第一卷'
    const plan = buildLongDocumentExecutionPlan({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
    })
    store.create(makeTask({ plan, authorizedExcerpts: [] }))
    store.markAwaitingUserPlan('outline', 'project-1')
    store.complete('outline', 'project-1', 1, hashEditorContent(content))

    const replacement = store.create(makeTask({
      taskId: 'new-edit-task',
      originalRequest: '请追加新的卷末钩子',
    }))

    expect(replacement?.taskId).toBe('new-edit-task')
    expect(store.get('outline', 'project-1')?.taskId).toBe('new-edit-task')
  })

  it('replaces an awaiting-user plan for a new edit request and records why', () => {
    const store = new ActiveExecutionTaskStore()
    const content = '# 大纲\n\n第一卷'
    const plan = buildLongDocumentExecutionPlan({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
      intent: 'edit',
    })
    store.create(makeTask({ plan, authorizedExcerpts: [] }))
    store.markAwaitingUserPlan('outline', 'project-1')

    store.supersedeAwaitingUserPlan('outline', 'project-1', 'new-edit-request')
    const superseded = store.consumeLastSupersededPlan()
    const replacement = store.create(makeTask({
      taskId: 'new-edit-task',
      originalRequest: '算了，只把第一卷标题改成风暴起点',
    }))

    expect(superseded).toMatchObject({
      taskId: 'task-1',
      planId: plan.planId,
      reason: 'new-edit-request',
    })
    expect(store.consumeLastSupersededPlan()).toBeNull()
    expect(replacement?.taskId).toBe('new-edit-task')
    expect(store.get('outline', 'project-1')?.status).toBe('active')
  })

  it('uses the replacement operation to decide whether an awaiting plan survives', () => {
    const store = new ActiveExecutionTaskStore()
    const content = '# 大纲\n\n第一卷'
    const plan = buildLongDocumentExecutionPlan({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
      intent: 'edit',
    })
    store.create(makeTask({ plan, authorizedExcerpts: [] }))
    store.markAwaitingUserPlan('outline', 'project-1')

    expect(store.isAwaitingPlanSupersededByPlan('outline', 'project-1', 'discussion')).toBe(false)
    expect(store.isAwaitingPlanSupersededByPlan('outline', 'project-1', 'targeted_edit')).toBe(true)
    expect(store.isAwaitingPlanSupersededByPlan('main', 'project-1', 'targeted_edit')).toBe(false)
  })

  it('caps authorized excerpts while preserving the most recent entries', () => {
    const store = new ActiveExecutionTaskStore()
    store.create(makeTask({ authorizedExcerpts: [] }))

    store.appendAuthorizedExcerpt('outline', 'project-1', '方案一')
    store.appendAuthorizedExcerpt('outline', 'project-1', '方案二')
    store.appendAuthorizedExcerpt('outline', 'project-1', '方案三')
    store.appendAuthorizedExcerpt('outline', 'project-1', '方案四')

    const snapshot = store.getValidSnapshot(
      'outline',
      'project-1',
      1,
      hashEditorContent('# 大纲\n\n第一卷'),
    )
    expect(snapshot?.authorizedExcerpts).toEqual(['方案二', '方案三', '方案四'])
  })

  it('caps the stored authorized excerpt payload size', () => {
    const store = new ActiveExecutionTaskStore()
    store.create(makeTask({ authorizedExcerpts: [], taskId: 'task-1' }))

    store.appendAuthorizedExcerpt('outline', 'project-1', 'a'.repeat(21_000))

    const task = store.get('outline', 'project-1')
    expect(task?.authorizedExcerpts).toEqual([])
    expect(store.consumeLastAuthorizedExcerptObservation()).toMatchObject({
      taskId: 'task-1',
      outcome: 'rejected-length',
      excerptChars: 21_000,
    })
    expect(store.consumeLastAuthorizedExcerptObservation()).toBeNull()
  })

  it('does not append authorized excerpts after a task reaches a terminal state', () => {
    const store = new ActiveExecutionTaskStore()
    const content = '# 大纲\n\n第一卷'
    const plan = buildLongDocumentExecutionPlan({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
    })
    store.create(makeTask({ plan, authorizedExcerpts: [] }))
    store.complete('outline', 'project-1', 1, hashEditorContent(content))

    const result = store.appendAuthorizedExcerpt('outline', 'project-1', '终态后的历史回复')

    expect(result).toBeNull()
    expect(store.get('outline', 'project-1')?.authorizedExcerpts).toEqual([])
  })

  it('completes an awaiting-user plan after its document fingerprint matches', () => {
    const store = new ActiveExecutionTaskStore()
    const content = '# 大纲\n\n第一卷'
    const plan = buildLongDocumentExecutionPlan({
      requestText: '把整篇大纲重新整理排序，统一标点和编号',
      content,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
    })
    store.create(makeTask({ plan, authorizedExcerpts: ['按方案写入'] }))
    store.markAwaitingUserPlan('outline', 'project-1')

    const completed = store.complete(
      'outline',
      'project-1',
      1,
      hashEditorContent(content),
    )

    expect(completed?.status).toBe('completed')
  })

})
