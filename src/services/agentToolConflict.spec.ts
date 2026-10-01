import { describe, expect, it, vi } from 'vitest'
import type { AgentOrchestratorTaskResult } from './agentOrchestrator'
import {
  createAgentSubAgentTools,
  createSequentialSubAgentManager,
  createToolConflictDiagnostic,
  findAgentToolNameConflicts,
  isAgentRuntimeToolName,
  removeConflictingExternalTools,
} from './agentToolConflict'
import type { AgentToolDefinition, ToolResult } from './editorTools'

function tool(name: string, origin?: 'built-in' | 'external'): AgentToolDefinition {
  return {
    name,
    description: name,
    policy: 'read',
    origin,
    inputSchema: { type: 'object', properties: {} },
    async execute(): Promise<ToolResult> {
      return { ok: true }
    },
  }
}

function completedTask(taskId: string): AgentOrchestratorTaskResult {
  return {
    taskId,
    status: 'completed',
    text: '完成',
    events: [],
    snapshot: {
      taskId,
      status: 'completed',
      goal: 'goal',
      stepIndex: 0,
      callCount: 1,
      successfulWriteCount: 0,
      noProgressRounds: 0,
      repeatedCallCount: 0,
      updatedAt: 1,
    },
  }
}

describe('agent tool conflict protection', () => {
  it('identifies built-in agent runtime tools without treating editor tools as runtime tools', () => {
    expect([
      'context.remaining',
      'agent.plan',
      'agent.spawn',
      'agent.wait',
      'agent.cancel',
    ].map(isAgentRuntimeToolName)).toEqual([true, true, true, true, true])
    expect(isAgentRuntimeToolName('editor.write')).toBe(false)
    expect(isAgentRuntimeToolName('custom.tool')).toBe(false)
    expect(isAgentRuntimeToolName(undefined)).toBe(false)
  })

  it('rejects an external tool that occupies a built-in name', () => {
    const conflicts = findAgentToolNameConflicts([
      tool('editor.write', 'external'),
      tool('editor.write', 'built-in'),
      tool('editor.reveal', 'external'),
    ])

    expect(conflicts).toHaveLength(2)
    expect(conflicts[0]).toMatchObject({
      toolName: 'editor.write',
      reason: 'built-in',
      offenders: [{ index: 0, source: 'external' }],
    })
    expect(conflicts[1]).toMatchObject({
      toolName: 'editor.reveal',
      reason: 'built-in',
      offenders: [{ index: 2, source: 'external' }],
    })
    const diagnostic = createToolConflictDiagnostic(conflicts[0])
    expect(diagnostic.type).toBe('tool_conflict')
    expect(diagnostic.label).toContain('内置工具名')
  })

  it('rejects duplicate external names without clearing unrelated tools', () => {
    const tools = [
      tool('editor.write', 'built-in'),
      tool('editor.write', 'external'),
      tool('custom.lookup', 'external'),
      tool('custom.lookup', 'external'),
      tool('custom.safe', 'external'),
    ]
    const conflicts = findAgentToolNameConflicts(tools)
    const safeTools = removeConflictingExternalTools(tools, conflicts)
    const names = safeTools.map(item => item.name)

    expect(conflicts.map(item => `${item.reason}:${item.toolName}`).sort()).toEqual([
      'built-in:editor.write',
      'duplicate:custom.lookup',
    ])
    expect(names.filter(name => name === 'editor.write')).toHaveLength(1)
    expect(names.filter(name => name === 'custom.lookup')).toHaveLength(1)
    expect(names).toContain('custom.safe')
    expect(safeTools.find(item => item.name === 'editor.write')?.origin).toBe('built-in')
  })
})

describe('sequential sub-agent manager', () => {
  it('runs spawned tasks one at a time in spawn order', async () => {
    let releaseFirst: (() => void) | undefined
    const started: string[] = []
    const manager = createSequentialSubAgentManager({
      runTask: input => new Promise(resolve => {
        started.push(input.taskId)
        if (input.taskId === 'a') {
          releaseFirst = () => resolve(completedTask(input.taskId))
          return
        }
        resolve(completedTask(input.taskId))
      }),
    })

    await manager.spawn({ taskId: 'a', goal: 'first' })
    await manager.spawn({ taskId: 'b', goal: 'second' })
    expect(started).toEqual(['a'])

    releaseFirst?.()
    const second = await manager.wait({ taskId: 'b' })
    expect(started).toEqual(['a', 'b'])
    expect(second).toEqual({ ok: true, status: 'completed' })
    expect(manager.getRecord('a')?.status).toBe('completed')
    expect(manager.getRecord('b')?.status).toBe('completed')
  })

  it('moves a timed-out sub-agent into a failed terminal state', async () => {
    let ticks = 0
    const manager = createSequentialSubAgentManager({
      runTask: () => new Promise(() => {}),
      now: () => ticks++ * 10,
      sleep: async () => {},
    })
    await manager.spawn({ taskId: 'slow', goal: 'never finishes' })

    const waited = await manager.wait({ taskId: 'slow', timeoutMs: 10 })
    const record = manager.getRecord('slow')

    expect(waited.ok).toBe(false)
    expect(waited.error?.code).toBe('sub_agent_timeout')
    expect(record?.status).toBe('failed')
    expect(record?.reason).toBe('sub_agent_timeout')
  })

  it('exposes spawn, wait, and cancel as read-only built-in tools', async () => {
    let releaseRunning: (() => void) | undefined
    const manager = createSequentialSubAgentManager({
      runTask: input => new Promise(resolve => {
        if (input.taskId === 'running') {
          releaseRunning = () => resolve(completedTask(input.taskId))
          return
        }
        resolve(completedTask(input.taskId))
      }),
    })
    const tools = createAgentSubAgentTools({ manager })
    const context = {} as Parameters<AgentToolDefinition['execute']>[1]

    expect(tools.map(item => item.name)).toEqual(['agent.spawn', 'agent.wait', 'agent.cancel'])
    expect(tools.every(item => item.policy === 'read')).toBe(true)

    const invalidSpawn = await tools[0].execute({ taskId: ' ', goal: 'x' }, context)
    expect(invalidSpawn.ok).toBe(false)
    expect((invalidSpawn.error as { code: string }).code).toBe('invalid_task_id')

    const spawned = await tools[0].execute({ taskId: 'child', goal: '整理一节' }, context)
    expect(spawned.ok).toBe(true)
    const waited = await tools[1].execute({ taskId: 'child' }, context)
    expect(waited).toMatchObject({ ok: true, data: { taskId: 'child', status: 'completed' } })

    const missing = await tools[1].execute({ taskId: 'missing' }, context)
    expect(missing.ok).toBe(false)
    expect((missing.error as { code: string }).code).toBe('sub_agent_not_found')

    await manager.spawn({ taskId: 'running', goal: 'waiting' })
    const canceled = await tools[2].execute({ taskId: 'running', reason: '用户取消' }, context)
    expect(canceled).toMatchObject({ ok: true, data: { taskId: 'running', status: 'canceled' } })
    expect(manager.getRecord('running')?.reason).toBe('用户取消')
    releaseRunning?.()
  })

  it('propagates conflicts through the optional conflict callback', () => {
    const onConflict = vi.fn()
    createAgentSubAgentTools({ manager: createSequentialSubAgentManager(), onConflict })
    expect(onConflict).not.toHaveBeenCalled()
  })
})
