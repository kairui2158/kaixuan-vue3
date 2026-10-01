import { describe, expect, it } from 'vitest'
import {
  authorizeDialogueTools,
  appendDialogueToolSurfaceDeclaration,
  buildDialogueToolSurface,
  type DialogueToolSurfaceEntry,
} from './dialogueToolSurface'
import { createEditTask, type EditTask } from './editTaskService'
import type { AgentToolDefinition, ToolResult } from './editorTools'
import type { EditorTargetSnapshot } from './editorTarget'

const readTool: AgentToolDefinition = {
  name: 'editor.get_state',
  description: 'read',
  policy: 'read',
  inputSchema: { type: 'object', properties: {} },
  async execute(): Promise<ToolResult> {
    return { ok: true }
  },
}

const writeTool: AgentToolDefinition = {
  name: 'editor.write',
  description: 'write',
  policy: 'write',
  inputSchema: { type: 'object', properties: {} },
  async execute(): Promise<ToolResult> {
    return { ok: true }
  },
}

function activeTask(status: EditTask['status']): EditTask {
  const task = createEditTask({
    sessionId: 'session-1',
    source: 'outline',
    target: { workspace: 'outline', targetId: 'outline' },
    goal: '整理大纲',
    documentVersion: 1,
    contentHash: 'hash-1',
    now: 1000,
  })
  return { ...task, status }
}

function snapshot(): EditorTargetSnapshot {
  return {
    workspace: 'outline',
    targetId: 'outline',
    label: '大纲',
    content: '内容',
    contentVersion: 1,
    selectionStart: 0,
    selectionEnd: 0,
    selectedText: '',
    mode: 'outline',
  }
}

function entry(intent: DialogueToolSurfaceEntry['intent']): DialogueToolSurfaceEntry {
  return {
    workspace: 'outline',
    intent,
    getSnapshot: snapshot,
    writableTarget: 'outline',
    extraTools: [readTool, writeTool],
  }
}

describe('authorizeDialogueTools', () => {
  it('keeps discuss read-only when no active task exists', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'discuss')

    expect(result.actualToolSurface).toEqual([{ name: 'editor.get_state', policy: 'read' }])
    expect(result.permission.writeEditor).toBe(false)
  })

  it('keeps a long-document workflow turn write-capable when routing reads it as discussion', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'discuss', 'direct', {
      writeAuthorization: { source: 'long-document-workflow' },
    })

    expect(result.actualToolSurface).toEqual([
      { name: 'editor.get_state', policy: 'read' },
      { name: 'editor.write', policy: 'write' },
    ])
    expect(result.permission.writeEditor).toBe(true)
  })

  it('keeps editor.write available for edit without a task', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'edit')

    expect(result.actualToolSurface).toEqual([
      { name: 'editor.get_state', policy: 'read' },
      { name: 'editor.write', policy: 'write' },
    ])
  })

  it('exposes task controls instead of editor.write when discussing an active task', async () => {
    const calls: string[] = []
    const result = authorizeDialogueTools([readTool, writeTool], 'discuss', 'direct', {
      activeEditTask: activeTask('partially_applied'),
      onResumeEditTask: async taskId => {
        calls.push(`resume:${taskId}`)
        return { ok: true, data: { taskId } }
      },
      onCancelEditTask: async taskId => {
        calls.push(`cancel:${taskId}`)
        return { ok: true, data: { taskId } }
      },
    })

    const names = result.actualToolSurface.map(tool => tool.name)
    expect(names).toEqual(['editor.get_state', 'task.resume', 'task.cancel'])
    const resume = result.tools.find(tool => tool.name === 'task.resume')
    await resume?.execute(
      { taskId: result.actualToolSurface.length ? activeTask('partially_applied').id : '' },
      {
        projectId: 'p',
        workspace: 'outline',
        targetId: 'outline',
        sessionId: 'session-1',
        iteration: 0,
      },
    )
    expect(result.permission.writeEditor).toBe(false)
  })

  it('removes editor.write for edit while an active task is pending', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'edit', 'direct', {
      activeEditTask: activeTask('partially_applied'),
      onResumeEditTask: async (taskId: string) => ({ ok: true, data: { taskId } }),
      onCancelEditTask: async (taskId: string) => ({ ok: true, data: { taskId } }),
    })

    expect(result.actualToolSurface).toEqual([
      { name: 'editor.get_state', policy: 'read' },
      { name: 'task.resume', policy: 'read' },
      { name: 'task.cancel', policy: 'read' },
    ])
    expect(result.actualToolSurface.some(tool => tool.policy === 'write')).toBe(false)
  })

  it('does not expose task controls for finished tasks', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'discuss', 'direct', {
      activeEditTask: activeTask('completed'),
      onResumeEditTask: async () => ({ ok: true }),
      onCancelEditTask: async () => ({ ok: true }),
    })

    expect(result.actualToolSurface).toEqual([{ name: 'editor.get_state', policy: 'read' }])
  })

  it('restores the ordinary write surface for edit after a task finishes', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'edit', 'direct', {
      activeEditTask: activeTask('completed'),
      onResumeEditTask: async (taskId: string) => ({ ok: true, data: { taskId } }),
      onCancelEditTask: async (taskId: string) => ({ ok: true, data: { taskId } }),
    })

    expect(result.actualToolSurface).toEqual([
      { name: 'editor.get_state', policy: 'read' },
      { name: 'editor.write', policy: 'write' },
    ])
    expect(result.tools.some(tool => tool.name.startsWith('task.'))).toBe(false)
  })

  it('builds the same authorization contract through buildDialogueToolSurface', () => {
    const result = buildDialogueToolSurface({
      ...entry('discuss'),
      activeEditTask: activeTask('waiting_user'),
      onResumeEditTask: async taskId => ({ ok: true, data: { taskId } }),
    })

    const names = result.actualToolSurface.map(tool => tool.name)
    expect(names).toContain('task.resume')
    expect(names).not.toContain('task.cancel')
    expect(result.actualToolSurface.every(tool => tool.policy !== 'write')).toBe(true)
    expect(result.permission.writeEditor).toBe(false)
  })

  it('does not duplicate task controls when authorization runs twice', () => {
    const taskContext = {
      activeEditTask: activeTask('partially_applied'),
      onResumeEditTask: async (taskId: string) => ({ ok: true, data: { taskId } }),
      onCancelEditTask: async (taskId: string) => ({ ok: true, data: { taskId } }),
    }
    const first = buildDialogueToolSurface({ ...entry('discuss'), ...taskContext })
    const second = authorizeDialogueTools(first.tools, 'discuss', 'direct', taskContext)

    const names = second.actualToolSurface.map(tool => tool.name)
    expect(names).toContain('editor.get_state')
    expect(names.filter(name => name === 'task.resume')).toHaveLength(1)
    expect(names.filter(name => name === 'task.cancel')).toHaveLength(1)
  })

  it('restores editor.write only after an active task is awaiting retry', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'edit', 'direct', {
      activeEditTask: { ...activeTask('awaiting_batch'), pendingBatches: ['batch-1'] },
      onResumeEditTask: async taskId => ({ ok: true, data: { taskId } }),
      onCancelEditTask: async taskId => ({ ok: true, data: { taskId } }),
    })

    const names = result.actualToolSurface.map(tool => tool.name)
    expect(names).toContain('editor.write')
    expect(names).not.toContain('task.resume')
    expect(names).toContain('task.cancel')
  })

  it('keeps editor.write blocked for discuss even when a task is awaiting retry', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'discuss', 'direct', {
      activeEditTask: { ...activeTask('awaiting_batch'), pendingBatches: ['batch-1'] },
      onResumeEditTask: async taskId => ({ ok: true, data: { taskId } }),
      onCancelEditTask: async taskId => ({ ok: true, data: { taskId } }),
    })

    const names = result.actualToolSurface.map(tool => tool.name)
    expect(names).not.toContain('editor.write')
    expect(names).toContain('task.resume')
    expect(names).toContain('task.cancel')
  })
})

describe('appendDialogueToolSurfaceDeclaration', () => {
  it('explains active task semantics and forbids false no-permission claims', () => {
    const task = activeTask('partially_applied')
    const prompt = appendDialogueToolSurfaceDeclaration(
      '系统提示',
      [{ name: 'editor.get_state', policy: 'read' }, { name: 'task.resume', policy: 'read' }],
      { activeEditTask: task },
    )

    expect(prompt).toContain(task.id)
    expect(prompt).toContain(task.status)
    expect(prompt).toContain('task.resume')
    expect(prompt).toContain('禁止声称“没有写入权限”')
  })

  it('keeps the ordinary write declaration when no task is active', () => {
    const prompt = appendDialogueToolSurfaceDeclaration('系统提示', [
      { name: 'editor.write', policy: 'write' },
    ])

    expect(prompt).toContain('你已获得编辑器写入权限')
    expect(prompt).not.toContain('task.resume')
  })

  it('declares restored write permission for an awaiting retry task', () => {
    const task = { ...activeTask('awaiting_batch'), pendingBatches: ['batch-1'] }
    const prompt = appendDialogueToolSurfaceDeclaration(
      '系统提示',
      [
        { name: 'editor.get_state', policy: 'read' },
        { name: 'editor.write', policy: 'write' },
        { name: 'task.cancel', policy: 'read' },
      ],
      { activeEditTask: task },
    )

    expect(prompt).toContain('写入权限已恢复')
    expect(prompt).toContain('editor.write')
    expect(prompt).not.toContain('本轮未开放 editor.write')
  })
})

describe('tool conflict surface diagnostics', () => {
  it('reports conflicts and keeps conflicting external tools out of the tool surface', () => {
    const externalBuiltInName: AgentToolDefinition = {
      ...readTool,
      name: 'editor.get_state',
      origin: 'external',
    }
    const duplicateExternalTool: AgentToolDefinition = {
      ...readTool,
      name: 'custom.lookup',
      origin: 'external',
    }
    const result = buildDialogueToolSurface({
      ...entry('discuss'),
      extraTools: [externalBuiltInName, duplicateExternalTool, duplicateExternalTool],
    })

    expect(result.toolConflicts?.map(conflict => conflict.label)).toEqual([
      '外部工具占用内置工具名：editor.get_state',
      '外部工具重名：custom.lookup',
    ])
    expect(result.toolConflicts?.every(conflict =>
      conflict.type === 'tool_conflict' && conflict.level === 'warning')).toBe(true)
    expect(result.tools.filter(item => item.name === 'editor.get_state')).toHaveLength(1)
    expect(result.tools.filter(item => item.name === 'custom.lookup')).toHaveLength(1)
    expect(result.actualToolSurface.map(item => item.name)).toContain('editor.get_state')
  })
})
