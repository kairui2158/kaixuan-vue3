import assert from 'node:assert'
import { describe, expect, it } from 'vitest'
import {
  authorizeDialogueTools,
  appendDialogueToolSurfaceDeclaration,
  buildDialogueToolSurfaceDeclarationAudit,
  buildDialogueToolSurface,
  buildWorkflowWriteAuthorizationFromPlan,
  type DialogueToolSurfaceEntry,
} from './dialogueToolSurface'
import { createEditTask, type EditTask } from './editTaskService'
import type { AgentToolDefinition, ToolResult } from './editorTools'
import type { EditorTargetSnapshot } from './editorTarget'

const readTool: AgentToolDefinition = {
  name: 'editor.get_state',
  description: 'read',
  policy: 'read',
  defaultToolPolicy: 'allowedWithoutPermission',
  riskLevel: 'low',
  inputSchema: { type: 'object', properties: {} },
  async execute(): Promise<ToolResult> {
    return { ok: true }
  },
}

const writeTool: AgentToolDefinition = {
  name: 'editor.write',
  description: 'write',
  policy: 'write',
  defaultToolPolicy: 'allowedWithPermission',
  riskLevel: 'medium',
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
  it('uses an empty model tool surface for single-pass prose output', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'edit', 'direct', {
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: 'restructure_and_cleanup',
        mode: 'single-pass',
        reason: 'test',
      },
      executionPlan: {
        planId: 'plan-test',
        operation: 'restructure_and_cleanup',
        operationResolution: { source: 'intent', intent: 'edit', matched: 'restructure_and_cleanup' },
        mode: 'single-pass',
        localTransformOperations: null,
        segments: [],
        invariants: ['planned-deletion-only'],
        estimatedPhysicalRequests: 1,
        progressLabel: '一次成型整理',
        finalDraft: false,
        finalDraftPlan: null,
        totalChars: 100,
        estimatedDocumentTokens: 100,
        contextWindow: { status: 'provider-declared', contextWindowTokens: 1000000, maxOutputTokens: null, effectiveInputTokens: 100 },
        decision: 'fits',
      },
    })

    expect(result.actualToolSurface).toEqual([])
    expect(result.permission.writeEditor).toBe(false)
    expect(result.permissionDecision).toMatchObject({
      source: 'long-document-workflow',
      decision: 'read-only',
      mode: 'single-pass',
      reason: 'single-pass writes are app-owned after model prose output',
    })
  })

  it('disables external tools that do not declare a static tool policy', () => {
    const result = authorizeDialogueTools([
      readTool,
      {
        ...readTool,
        name: 'external.unverified',
        origin: 'external',
        defaultToolPolicy: undefined,
      },
      writeTool,
    ], 'edit')

    expect(result.actualToolSurface.map(tool => tool.name))
      .toEqual(['editor.get_state', 'editor.write'])
    expect(result.toolPolicyDiagnostics?.map(item => item.label)).toEqual([
      '外部工具未声明默认策略：external.unverified',
    ])
  })

  it('removes tools whose static policy contradicts their runtime policy', () => {
    const result = authorizeDialogueTools([
      readTool,
      {
        ...writeTool,
        name: 'external.fake-write',
        origin: 'external',
        defaultToolPolicy: 'allowedWithoutPermission',
      },
    ], 'edit')

    expect(result.actualToolSurface.map(tool => tool.name)).toEqual(['editor.get_state'])
    expect(result.toolPolicyDiagnostics?.map(item => item.type)).toEqual(['tool_policy_mismatch'])
  })

  it('keeps discuss read-only when no active task exists', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'discuss')

    expect(result.actualToolSurface).toEqual([{ name: 'editor.get_state', policy: 'read' }])
    expect(result.permission.writeEditor).toBe(false)
  })

  it('never exposes control-capable legacy tools in read-only dialogue rounds', () => {
    const legacyControlTool: AgentToolDefinition = {
      name: 'agent.spawn',
      description: 'legacy sub-agent control tool',
      policy: 'read',
      origin: 'external',
      defaultToolPolicy: 'allowedWithoutPermission',
      inputSchema: { type: 'object', properties: {} },
      async execute(): Promise<ToolResult> {
        return { ok: true }
      },
    }
    const result = authorizeDialogueTools([readTool, writeTool, legacyControlTool], 'discuss')
    const exposedNames = result.actualToolSurface.map(tool => tool.name)
    expect(exposedNames).toContain('editor.get_state')
    expect(exposedNames).not.toContain('agent.spawn')
    expect(exposedNames).not.toContain('editor.write')
  })

  it('keeps discuss read-only even when a legacy workflow authorization is present', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'discuss', 'direct', {
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: 'targeted_edit',
        mode: 'direct',
      },
    })

    expect(result.actualToolSurface).toEqual([{ name: 'editor.get_state', policy: 'read' }])
    expect(result.permission.writeEditor).toBe(false)
    expect(result.permissionDecision).toEqual({
      source: 'dialogue-intent',
      decision: 'read-only',
      intent: 'discuss',
      operation: 'discussion',
      mode: 'direct',
      reason: 'discuss/analyze intents are always read-only',
    })
  })

  it('does not authorize workflow writes without a matching structured authorization triple', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'discuss', 'direct', {
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: 'discussion',
        mode: 'edit-task',
      },
    })

    expect(result.actualToolSurface).toEqual([{ name: 'editor.get_state', policy: 'read' }])
    expect(result.permission.writeEditor).toBe(false)
  })

  it('authorizes a workflow write only for a matching intent, operation, and plan mode', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'edit', 'direct', {
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: 'targeted_edit',
        mode: 'direct',
      },
    })

    expect(result.actualToolSurface).toEqual([
      { name: 'editor.get_state', policy: 'read' },
      { name: 'editor.write', policy: 'write' },
    ])
    expect(result.permission.writeEditor).toBe(true)
    expect(result.permissionDecision).toEqual({
      source: 'long-document-workflow',
      decision: 'write-authorized',
      intent: 'edit',
      operation: 'targeted_edit',
      mode: 'direct',
      reason: 'workflow authorization triple matched',
    })
  })

  it('carries lockOverride through the permission decision', () => {
    const result = authorizeDialogueTools([readTool, writeTool], 'edit', 'direct', {
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: 'targeted_edit',
        mode: 'direct',
        lockOverride: true,
      },
    })

    expect(result.permissionDecision).toMatchObject({
      decision: 'write-authorized',
      lockOverride: true,
    })
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

  it('does not pass a read-only workflow authorization into editor writes', async () => {
    const appliedWrites: Array<{ writeAuthorization?: unknown }> = []
    const result = buildDialogueToolSurface({
      ...entry('discuss'),
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: 'targeted_edit',
        mode: 'direct',
      },
      applyWrite: async input => {
        appliedWrites.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    })
    const writeTool = result.tools.find(tool => tool.name === 'editor.write')
    expect(writeTool).toBeUndefined()
    expect(appliedWrites).toEqual([])
  })

  it('passes a matching workflow authorization into editor writes', async () => {
    const appliedWrites: Array<{ writeAuthorization?: unknown }> = []
    const result = buildDialogueToolSurface({
      ...entry('edit'),
      writeAuthorization: {
        source: 'long-document-workflow',
        intent: 'edit',
        operation: 'targeted_edit',
        mode: 'direct',
      },
      applyWrite: async input => {
        appliedWrites.push(input)
        return { ok: true, rollbackAvailable: true }
      },
    })
    const writeTool = result.tools.find(tool => tool.name === 'editor.write')
    assert(writeTool, 'editor.write is present')
    const executed = await writeTool.execute({
      commands: [{ operation: 'append', content: '新增' }],
    }, { projectId: 'p1', workspace: 'outline', targetId: 'outline', sessionId: 's1', iteration: 1 })

    expect(executed.ok).toBe(true)
    expect(appliedWrites).toHaveLength(1)
    expect(appliedWrites[0].writeAuthorization).toEqual({
      source: 'long-document-workflow',
      intent: 'edit',
      operation: 'targeted_edit',
      mode: 'direct',
    })
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

describe('buildWorkflowWriteAuthorizationFromPlan', () => {
  const plan = {
    planId: 'plan-lock-override',
    operation: 'restructure_and_cleanup',
    operationResolution: { source: 'intent', matched: 'restructure_and_cleanup' },
    mode: 'edit-task',
    segments: [],
    invariants: [],
    estimatedPhysicalRequests: 1,
    finalDraft: false,
    localTransformOperations: null,
    finalDraftPlan: null,
    progressLabel: '结构重排与整理',
    decision: 'needs_segmentation',
    contextWindow: {
      status: 'provider-declared',
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_192,
      effectiveInputTokens: 100_000,
    },
    estimatedDocumentTokens: 60_000,
    totalChars: 74_841,
  } as Parameters<typeof buildWorkflowWriteAuthorizationFromPlan>[0]['plan']

  it('marks outline API writes with lockOverride when the outline is locked', () => {
    const authorization = buildWorkflowWriteAuthorizationFromPlan({
      workspace: 'outline',
      intent: 'edit',
      plan,
      locked: true,
    })
    expect(authorization).toEqual({
      source: 'long-document-workflow',
      intent: 'edit',
      operation: 'restructure_and_cleanup',
      mode: 'edit-task',
      reason: 'outline-execution-plan',
      lockOverride: true,
    })
  })

  it('never marks home writes as lock overrides', () => {
    const authorization = buildWorkflowWriteAuthorizationFromPlan({
      workspace: 'main',
      intent: 'edit',
      plan,
      locked: true,
    })
    expect(authorization?.lockOverride).toBeUndefined()
  })

  it('authorizes a single-pass whole-document plan as a direct write workflow', () => {
    const authorization = buildWorkflowWriteAuthorizationFromPlan({
      workspace: 'outline',
      intent: 'edit',
      plan: {
        ...plan,
        mode: 'single-pass',
        decision: 'fits',
        segments: [],
      },
      locked: true,
    })

    expect(authorization).toMatchObject({
      source: 'long-document-workflow',
      intent: 'edit',
      operation: 'restructure_and_cleanup',
      mode: 'single-pass',
      lockOverride: true,
    })
  })
})

describe('appendDialogueToolSurfaceDeclaration', () => {
  it('explains active task semantics as facts without behavior bans', () => {
    const task = activeTask('partially_applied')
    const prompt = appendDialogueToolSurfaceDeclaration(
      '系统提示',
      [{ name: 'editor.get_state', policy: 'read' }, { name: 'task.resume', policy: 'read' }],
      { activeEditTask: task },
    )

    expect(prompt).toContain(task.id)
    expect(prompt).toContain(task.status)
    expect(prompt).toContain('task.resume')
    expect(prompt).toContain('本轮工具面未包含 editor.write')
    expect(prompt).toContain('当前存在编辑任务')
    expect(prompt).toContain('当前不是权限缺失')
    expect(prompt).toContain('新的直写请求需要先恢复或取消当前任务')
    expect(prompt).not.toContain('禁止')
    expect(prompt).not.toContain('必须')
  })

  it('states the ordinary write surface when no task is active', () => {
    const prompt = appendDialogueToolSurfaceDeclaration('系统提示', [
      { name: 'editor.write', policy: 'write' },
    ])

    expect(prompt).toContain('本轮工具面包含 editor.write(write)')
    expect(prompt).not.toContain('你已获得编辑器写入权限')
    expect(prompt).not.toContain('不要声称')
    expect(prompt).not.toContain('task.resume')
  })

  it('states direct-write authorization for an active edit task', () => {
    const prompt = appendDialogueToolSurfaceDeclaration(
      '你是小说大纲创作助手。用户正在编辑大纲，请给出建议和修改意见。',
      [
        { name: 'editor.get_state', policy: 'read' as const },
        { name: 'editor.write', policy: 'write' as const },
      ],
      {
        activeEditTask: activeTask('partially_applied'),
        executionPlan: {
          planId: 'plan-declaration',
          operation: 'restructure_and_cleanup',
          operationResolution: { source: 'intent', matched: 'restructure_and_cleanup' },
          mode: 'edit-task',
          localTransformOperations: null,
          segments: [],
          invariants: [],
          estimatedPhysicalRequests: 1,
          progressLabel: '重构并整理',
          finalDraft: false,
          finalDraftPlan: null,
          totalChars: 100,
          estimatedDocumentTokens: 100,
          contextWindow: { status: 'provider-declared', contextWindowTokens: 128000, maxOutputTokens: null, effectiveInputTokens: 100 },
          decision: 'fits',
        },
      },
    )

    expect(prompt).toContain('应用已授权本轮通过 editor.write 直接写入编辑器')
    expect(prompt).not.toContain('请给出建议和修改意见')
    expect(prompt).toContain('本轮工具面包含 editor.write(write)')
  })

  it('declares single-pass prose protocol without exposing model tools', () => {
    const prompt = appendDialogueToolSurfaceDeclaration(
      '你是小说大纲创作助手。用户正在编辑大纲，请给出建议和修改意见。',
      [{ name: 'editor.write', policy: 'write' as const }],
      {
        executionPlan: {
          planId: 'plan-single-pass-declaration',
          operation: 'restructure_and_cleanup',
          operationResolution: { source: 'intent', matched: 'restructure_and_cleanup' },
          mode: 'single-pass',
          localTransformOperations: null,
          segments: [],
          invariants: ['planned-deletion-only'],
          estimatedPhysicalRequests: 1,
          progressLabel: '一次成型整理',
          finalDraft: false,
          finalDraftPlan: {
            sourceChars: 100,
            instruction: '整理全文',
            continuationEnabled: true,
            segmented: false,
            segments: [{ segmentId: 'whole-document', start: 0, end: 100 }],
          },
          totalChars: 100,
          estimatedDocumentTokens: 100,
          contextWindow: { status: 'provider-declared', contextWindowTokens: 128000, maxOutputTokens: null, effectiveInputTokens: 100 },
          decision: 'fits',
        },
      },
    )

    expect(prompt).toContain('一次成型整篇正文输出协议')
    expect(prompt).toContain('全文已在当前上下文中')
    expect(prompt).toContain('直接流式输出整理后的完整全文')
    expect(prompt).toContain('禁止提交编辑命令或调用写入工具')
    expect(prompt).toContain('应用会在正文完成后一次性整文写入编辑器')
    expect(prompt).not.toContain('唯一一条 replace_document')
    expect(prompt).not.toContain('请给出建议和修改意见')
    expect(prompt).not.toContain('读取')
  })

  it('states restored write capability for an awaiting retry task', () => {
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

    expect(prompt).toContain('本轮工具面包含 editor.write(write)')
    expect(prompt).toContain('editor.write')
    expect(prompt).not.toContain('本轮工具面未包含 editor.write')
  })

  it('declares single-pass prose protocol when the model tool surface is empty', () => {
    const prompt = appendDialogueToolSurfaceDeclaration(
      '系统提示',
      [],
      {
        executionPlan: {
          planId: 'plan-single-pass-empty',
          operation: 'restructure_and_cleanup',
          operationResolution: { source: 'intent', matched: 'restructure_and_cleanup' },
          mode: 'single-pass',
          localTransformOperations: null,
          segments: [],
          invariants: ['planned-deletion-only'],
          estimatedPhysicalRequests: 1,
          progressLabel: '一次成型整理',
          finalDraft: false,
          finalDraftPlan: null,
          totalChars: 100,
          estimatedDocumentTokens: 100,
          contextWindow: { status: 'provider-declared', contextWindowTokens: 128000, maxOutputTokens: null, effectiveInputTokens: 100 },
          decision: 'fits',
        },
      },
    )

    expect(prompt).toContain('一次成型整篇正文输出协议')
    expect(prompt).toContain('全文已在当前上下文中')
    expect(prompt).toContain('本轮工具面为空')
    expect(prompt).toContain('禁止提交编辑命令或调用写入工具')
  })

  it('exposes the declaration as an auditable prompt injection record', () => {
    const toolSurface = [{ name: 'editor.get_state', policy: 'read' as const }]
    const active = activeTask('partially_applied')
    const record = buildDialogueToolSurfaceDeclarationAudit({
      source: 'home',
      toolSurface,
      activeEditTask: active,
    })

    expect(record.type).toBe('dialogue-tool-surface-declaration')
    expect(record.source).toBe('home')
    expect(record.trigger).toBe('request-built')
    expect(record.visibleToModel).toBe(true)
    expect(record.toolSurface).toEqual(toolSurface)
    expect(record.text).toBe(appendDialogueToolSurfaceDeclaration('系统提示', toolSurface, {
      activeEditTask: active,
    }))
    expect(record.origin).toBe('application')
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
