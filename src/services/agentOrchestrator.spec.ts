import { describe, expect, it, vi } from 'vitest'
import {
  AgentOrchestrator,
  createContextRemainingTool,
  createAgentPlanTool,
  type AgentOrchestratorPlan,
  type AgentOrchestratorRuntime,
} from './agentOrchestrator'
import type { CallAiParams, CallAiResult } from './aiService'
import { buildLongDocumentExecutionPlan } from './longDocumentExecutionPlanner'

const plan: AgentOrchestratorPlan = {
  goal: '整理长文档',
  steps: [
    { id: 'read', description: '读取文档', requiredTools: ['editor.read_range'] },
    { id: 'write', description: '写入修改', requiredTools: ['editor.write'] },
  ],
  completionCriteria: ['返回用户可见正文'],
}

function successResult(text = '已完成整理') {
  return {
    text,
    reasoning: '',
    toolResults: [],
    toolCalls: [],
    toolRequestDeltas: [],
  }
}

describe('AgentOrchestrator state machine', () => {
  const runInput = {
    purpose: 'generate' as const,
    messages: [{ role: 'user' as const, content: '整理' }],
  }

  it('completes when round verdict says complete', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult() as CallAiResult),
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('completed')
    expect(result.text).toBe('已完成整理')
    expect(agent.getEvents().some(event => event.type === 'state' && event.label.includes('completed'))).toBe(true)
  })

  it('rejects invalid plans before execution', async () => {
    const runtime: AgentOrchestratorRuntime = { callAi: vi.fn(async () => successResult()) }
    const emptyGoal = new AgentOrchestrator({
      plan: { ...plan, goal: ' ' },
      runtime,
    })
    const result = await emptyGoal.run(runInput)
    expect(result.status).toBe('failed')
    expect(result.reason).toBe('invalid_plan_goal')
    expect(runtime.callAi).not.toHaveBeenCalled()
  })

  it('stalls on consecutive identical tool calls', async () => {
    const observation = {
      toolName: 'editor.write',
      policy: 'write' as const,
      iteration: 1,
      input: { text: 'same' },
      result: { ok: true, data: { written: true } },
      durationMs: 1,
    }
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (params: CallAiParams): Promise<CallAiResult> => {
        params.toolPolicy?.onToolCall?.(observation)
        return {
          ...successResult(''),
          toolResults: [{ call: { name: observation.toolName }, result: observation.result }],
        }
      }),
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(runtime.callAi).toHaveBeenCalledTimes(2)
    expect(agent.getEvents().filter(event => event.type === 'repeated_call')).toHaveLength(1)
    expect(result.status).toBe('stalled')
    expect(result.reason).toBe('repeated_tool_call')
    expect(result.snapshot.repeatedCallCount).toBe(1)
  })

  it('stalls after consecutive no-progress rounds', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => ({ ...successResult(''), toolResults: [] }) as CallAiResult),
      maxNoProgressRounds: 3,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('stalled')
    expect(result.reason).toBe('no_progress')
    expect(result.snapshot.noProgressRounds).toBe(3)
    expect(runtime.callAi).toHaveBeenCalledTimes(3)
  })

  it('stalls at the physical request limit even when every round reports progress', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => ({
        ...successResult(''),
        toolResults: [{
          call: { name: 'editor.write' },
          result: { ok: true, data: { written: true } },
        }],
      }) as CallAiResult),
      maxPhysicalRequests: 3,
    }
    const events: unknown[] = []
    runtime.onEvent = event => {
      if ((event as { type?: string }).type === 'physical_request_limit') events.push(event)
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('stalled')
    expect(result.reason).toBe('physical_request_limit')
    expect(runtime.callAi).toHaveBeenCalledTimes(3)
    expect(result.snapshot.callCount).toBe(3)
    expect((result.snapshot as any).maxPhysicalRequests).toBe(3)
    expect(events).toHaveLength(1)
  })

  it('enters needs_user when a tool result asks for user input', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async () => ({
        ...successResult('需要用户确认'),
        toolResults: [{
          call: { name: 'editor.write' },
          result: { ok: false, error: { code: 'needs_user', message: '缺少目标段落' } },
        }],
      })),
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('needs_user')
    expect(result.reason).toBe('缺少目标段落')
  })

  it('supports visible cancellation before terminal completion', async () => {
    let release: (() => void) | undefined
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn((): Promise<CallAiResult> => new Promise(resolve => {
        release = () => resolve(successResult() as CallAiResult)
      })),
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const running = agent.run(runInput)
    await Promise.resolve()
    expect(agent.cancel('user_cancel')).toBe(true)
    if (!release) throw new Error('test release missing')
    release()
    const result = await running
    expect(result.status).toBe('canceled')
    expect(result.reason).toBe('user_cancel')
    expect(agent.cancel()).toBe(false)
  })

  it('fails visibly on idle timeout', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn((): Promise<CallAiResult> => new Promise(resolve =>
        setTimeout(() => resolve(successResult() as CallAiResult), 20))),
      idleTimeoutMs: 1,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('failed')
    expect(result.reason).toBe('idle_timeout')
    expect(agent.getEvents().some(event => event.type === 'idle_timeout')).toBe(true)
  })

  it('exposes context and plan through read-only tools', async () => {
    const remaining = createContextRemainingTool(() => ({
      taskId: 'task',
      status: 'running',
      reason: undefined,
      goal: 'goal',
      stepIndex: 0,
      callCount: 0,
      successfulWriteCount: 0,
      noProgressRounds: 0,
      repeatedCallCount: 0,
      maxPhysicalRequests: 8,
      updatedAt: 0,
    }), () => ({ contextWindowTokens: null, estimatedInputTokens: 120 }))
    const remainingResult = await remaining.execute({}, {
      projectId: 'p',
      workspace: 'main',
      targetId: 't',
      writableTarget: 't',
      sessionId: 's',
      iteration: 1,
    } as any)
    expect(remainingResult.ok).toBe(true)
    expect((remainingResult.data as any).contextWindowKnown).toBe(false)

    const planTool = createAgentPlanTool(() => plan)
    const planResult = await planTool.execute({}, {} as any)
    expect(planResult.ok).toBe(true)
    expect((planResult.data as any).goal).toBe('整理长文档')
  })

  it('returns the final CallAiResult for downstream callers', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult('最终返回') as CallAiResult),
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('completed')
    expect(result.result?.text).toBe('最终返回')
  })

  it('forwards caller onToolCall events and reports the effective tool surface', async () => {
    const observation = {
      toolName: 'editor.write',
      policy: 'write' as const,
      iteration: 1,
      input: { commands: [] },
      result: { ok: true, data: { written: true } },
      durationMs: 1,
    }
    const callerEvents: unknown[] = []
    const observedEvents: unknown[] = []
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (params: CallAiParams): Promise<CallAiResult> => {
        params.toolPolicy?.onToolCall?.(observation)
        return {
          ...successResult(),
          toolResults: [{ call: { name: observation.toolName }, result: observation.result }],
        }
      }),
      observeToolCall: event => {
        observedEvents.push(event)
      },
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run({
      ...runInput,
      toolPolicy: {
        scenario: 'direct',
        onToolCall: event => {
          callerEvents.push(event)
        },
      } as CallAiParams['toolPolicy'],
    })
    expect(result.status).toBe('completed')
    expect(callerEvents).toHaveLength(1)
    expect((callerEvents[0] as { toolName: string }).toolName).toBe('editor.write')
    expect(observedEvents).toHaveLength(1)
    expect(result.toolSurface?.map(tool => tool.name)).toEqual(
      expect.arrayContaining(['context.remaining', 'agent.plan']),
    )
    expect(result.toolSurface?.every(tool => tool.policy === 'read')).toBe(true)
  })

  it('keeps agent fallback readonly when the production execution plan is missing', async () => {
    const runtime: AgentOrchestratorRuntime = {
      goal: '统一大纲时间线并整理排序',
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult() as CallAiResult),
      document: {
        content: '段'.repeat(12_000),
        operationType: 'whole-document-restructure',
      },
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('completed')
    expect(runtime.callAi).toHaveBeenCalled()
    expect(result.reason).not.toContain('edit_task_required')
    expect(result.reason).not.toContain('final_draft_required')
    const fallback = agent.getEvents().find(
      event => event.type === 'plan-origin'
        && (event.payload as { source?: string } | undefined)?.source === 'agent-fallback',
    )
    expect(Boolean(fallback)).toBe(true)
    expect(fallback?.payload).toMatchObject({
      source: 'agent-fallback',
      mode: 'readonly-fallback',
    })
  })

  it('routes whole-document restructure to EditTask only from the supplied execution plan', async () => {
    const runtime: AgentOrchestratorRuntime = {
      goal: '统一大纲时间线并整理排序',
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult() as CallAiResult),
      document: {
        content: '段'.repeat(12_000),
        operationType: 'whole-document-restructure',
        executionPlan: buildLongDocumentExecutionPlan({
          requestText: '统一大纲时间线并整理排序',
          content: '段'.repeat(12_000),
          contextWindowTokens: 120_000,
          maxOutputTokens: 8_000,
        }),
      },
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('needs_user')
    expect(result.reason).toContain('edit_task_required')
    expect(runtime.callAi).not.toHaveBeenCalled()
    expect(agent.getEvents().some(event => event.label === '长文档任务自动路由 EditTask')).toBe(true)
    expect(agent.getEvents().some(
      event => event.type === 'plan-origin'
        && (event.payload as { source?: string } | undefined)?.source === 'agent-fallback',
    )).toBe(false)
  })

  it('routes whole-document replacement to final draft from a supplied execution plan', async () => {
    const runtime: AgentOrchestratorRuntime = {
      goal: '全文重写为更精炼的大纲',
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult() as CallAiResult),
      document: {
        content: '段'.repeat(12_000),
        operationType: 'whole-document-replacement',
        executionPlan: {
          ...buildLongDocumentExecutionPlan({
            requestText: '全文重写为更精炼的大纲',
            content: '段'.repeat(12_000),
            contextWindowTokens: 120_000,
            maxOutputTokens: 8_000,
          }),
        },
      },
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('needs_user')
    expect(result.reason).toContain('final_draft_required')
    expect(runtime.callAi).not.toHaveBeenCalled()
    expect(agent.getEvents().some(event => event.label === '长文档任务自动进入终稿生成')).toBe(true)
  })

  it('uses the supplied execution plan as the single planning source', async () => {
    const suppliedPlan = buildLongDocumentExecutionPlan({
      requestText: '短目标',
      content: '短文',
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
    })
    const runtime: AgentOrchestratorRuntime = {
      goal: '明确的小修改',
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult() as CallAiResult),
      document: {
        content: '段'.repeat(12_000),
        operationType: 'whole-document-restructure',
        executionPlan: suppliedPlan,
      },
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('completed')
    expect(runtime.callAi).toHaveBeenCalled()
    const forwarded = (runtime.callAi as unknown as { mock: { calls: Array<[CallAiParams]> } }).mock.calls[0]?.[0]
    expect(forwarded?.toolPolicy?.executionPlan).toBe(suppliedPlan)
  })

  it('keeps the physical tool loop when the EditTask workflow is already active', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult() as CallAiResult),
      document: {
        content: '段'.repeat(12_000),
        operationType: 'whole-document-restructure',
      },
      editTaskWorkflow: true,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('completed')
    expect(result.text).toBe('已完成整理')
    expect(runtime.callAi).toHaveBeenCalled()
  })

  it('exposes sequential sub-agent tools only when a real sub-agent runner is provided', async () => {
    const subAgentGoals: string[] = []
    const runtimeWithRunner: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult() as CallAiResult),
      runSubAgent: vi.fn(async ({ goal }: { goal: string }) => {
        subAgentGoals.push(goal)
        return {
          taskId: 'sub-agent',
          status: 'completed' as const,
          text: '子任务完成',
          events: [],
          snapshot: {
            taskId: 'sub-agent',
            status: 'completed' as const,
            goal,
            stepIndex: 0,
            callCount: 1,
            successfulWriteCount: 0,
            noProgressRounds: 0,
            repeatedCallCount: 0,
            maxPhysicalRequests: 8,
            updatedAt: Date.now(),
          },
        }
      }),
    }
    const agent = new AgentOrchestrator({ plan, runtime: runtimeWithRunner })
    const result = await agent.run(runInput)
    expect(result.status).toBe('completed')
    expect(result.toolSurface?.map(tool => tool.name)).toEqual(
      expect.arrayContaining(['agent.spawn', 'agent.wait', 'agent.cancel']),
    )
    expect(result.toolSurface?.every(tool => tool.policy === 'read')).toBe(true)
    expect(subAgentGoals).toHaveLength(0)

    const runtimeWithoutRunner: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult() as CallAiResult),
    }
    const agentWithoutRunner = new AgentOrchestrator({ plan, runtime: runtimeWithoutRunner })
    const resultWithoutRunner = await agentWithoutRunner.run(runInput)
    expect(resultWithoutRunner.toolSurface?.map(tool => tool.name)).not.toContain('agent.spawn')
  })

  it('never exposes sub-agent tools at the first nesting depth', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult() as CallAiResult),
      runSubAgent: vi.fn(),
    }
    const agent = new AgentOrchestrator({ plan, runtime, subAgentDepth: 1 })
    const result = await agent.run(runInput)
    expect(result.status).toBe('completed')
    const toolNames = result.toolSurface?.map(tool => tool.name) || []
    expect(toolNames).not.toContain('agent.spawn')
    expect(toolNames).not.toContain('agent.wait')
    expect(toolNames).not.toContain('agent.cancel')
    expect(runtime.runSubAgent).not.toHaveBeenCalled()
  })

  it('emits a pseudo-tool event when convergence text is a protocol fragment', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => ({
        ...successResult('{"name":"editor.write","arguments":{"commands":[]}}'),
      }) as CallAiResult),
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('completed')
    expect(agent.getEvents().some(event => event.type === 'pseudo_tool')).toBe(true)
  })

  it('persists every state transition through the runtime hook', async () => {
    const persisted: any[] = []
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult() as CallAiResult),
      persistState: async snapshot => {
        persisted.push(snapshot)
      },
    }
    const agent = new AgentOrchestrator({ taskId: 'persisted-agent', plan, runtime })
    const result = await agent.run(runInput)
    expect(result.status).toBe('completed')
    expect(persisted.map(item => item.status)).toEqual(['planning', 'running', 'waiting_tool', 'running', 'completed'])
    expect(persisted.every(item => item.taskId === 'persisted-agent')).toBe(true)
    expect(persisted.every(item => typeof item.updatedAt === 'number')).toBe(true)
  })
})
