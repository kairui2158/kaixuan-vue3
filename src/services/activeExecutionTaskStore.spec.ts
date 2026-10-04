import { describe, expect, it } from 'vitest'
import { hashEditorContent } from './editorTarget'
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

  it('clears the active task on reset, replacement, or terminal status', () => {
    const store = new ActiveExecutionTaskStore()
    store.create(makeTask())
    store.clear('outline', 'project-1')
    expect(store.get('outline', 'project-1')).toBeNull()

    store.create(makeTask({ taskId: 'task-2' }))
    store.markStatus('outline', 'project-1', 'completed')
    expect(store.get('outline', 'project-1')).toBeNull()
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
    })
  })

})
