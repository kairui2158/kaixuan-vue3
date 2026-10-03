import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createAgentDialogueRuntime, type AgentDialogueRuntimeEntry } from './agentDialogueRuntime'
import type { CallAiParams, CallAiResult } from './aiService'
import { buildLongDocumentExecutionPlan } from './longDocumentExecutionPlanner'

describe('createAgentDialogueRuntime', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const entry: AgentDialogueRuntimeEntry = {
    source: 'outline',
    taskId: 'dialogue-agent',
    goal: '完成本轮大纲对话',
    document: {
      content: '第一卷\n第二卷',
      operationType: 'targeted-edit',
    },
    getContextRemaining: () => ({ contextWindowTokens: 120_000, maxOutputTokens: 8_000 }),
  }

  function successResult(text = '已完成') {
    return {
      text,
      reasoning: '',
      toolCalls: [],
      toolResults: [],
      toolRequestDeltas: [],
    } as CallAiResult
  }

  it('returns the final physical result and persists terminal state', async () => {
    const persisted: any[] = []
    const callAi = vi.fn(async (): Promise<CallAiResult> => successResult())
    const runtime = createAgentDialogueRuntime({
      ...entry,
      persistState: async snapshot => {
        persisted.push(snapshot)
      },
      onEvent: undefined,
    })
    const result = await runtime.run({
      purpose: 'generate',
      messages: [{ role: 'user', content: '修改第二卷' }],
      callAi,
    })
    expect(result.status).toBe('completed')
    expect(result.result?.text).toBe('已完成')
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(persisted.at(-1)?.status).toBe('completed')
    expect(persisted.at(-1)?.taskId).toBe('dialogue-agent')
  })

  it('passes the entry execution plan through to the physical request policy', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '重新整理全文',
      content: '第一卷\n第二卷',
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
    })
    const callAi = vi.fn(async (): Promise<CallAiResult> => successResult())
    const runtime = createAgentDialogueRuntime({
      ...entry,
      document: {
        content: entry.document!.content,
        operationType: entry.document!.operationType,
        executionPlan,
      },
    })
    const result = await runtime.run({
      purpose: 'generate',
      messages: [{ role: 'user', content: '重新整理全文' }],
      callAi,
    })

    expect(result.status).toBe('completed')
    const forwarded = (callAi as unknown as { mock: { calls: Array<[CallAiParams]> } }).mock.calls[0]?.[0]
    expect(forwarded?.toolPolicy?.executionPlan).toBe(executionPlan)
  })

  it('passes editTaskWorkflow through so edit-task runs keep their write workflow', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '重新整理全文',
      content: '第一卷\n第二卷',
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
    })
    const callAi = vi.fn(async (): Promise<CallAiResult> => successResult())
    const runtime = createAgentDialogueRuntime({
      ...entry,
      document: {
        content: entry.document!.content,
        operationType: entry.document!.operationType,
        executionPlan,
      },
      editTaskWorkflow: true,
    })
    await runtime.run({
      purpose: 'generate',
      messages: [{ role: 'user', content: '重新整理全文' }],
      callAi,
    })

    const forwarded = (callAi as unknown as { mock: { calls: Array<[CallAiParams]> } }).mock.calls[0]?.[0]
    expect(forwarded?.toolPolicy?.executionPlan).toBe(executionPlan)
    expect(forwarded?.toolPolicy?.editTaskWorkflow).toBe(true)
  })

  it('injects SKILL guidance into the first system message before each physical request', async () => {
    const callAi = vi.fn(async (): Promise<CallAiResult> => successResult())
    const runtime = createAgentDialogueRuntime({
      ...entry,
      skillGuidance: '领域能力提示',
      skillIds: ['outline-editor'],
      promptSource: 'template-system-prefix',
    })
    const result = await runtime.run({
      purpose: 'generate',
      messages: [{ role: 'user', content: '修改第二卷' }],
      callAi,
    })

    expect(result.status).toBe('completed')
    expect(callAi).toHaveBeenCalledTimes(1)
    const forwarded = (callAi as unknown as { mock: { calls: Array<[CallAiParams]> } }).mock.calls[0]?.[0]
    expect(forwarded?.model).toBeUndefined()
    const systemMessage = forwarded?.messages.find(message => message.role === 'system')
    expect(String(systemMessage?.content || '')).toContain('领域能力提示')
    expect(forwarded?.tools?.map(tool => tool.name)).toEqual([
      'context.remaining',
      'agent.plan',
    ])
    expect(
      result.events.some(event =>
        event.type === 'skill-guidance-injected'
        && (event.payload as {
          skillIds?: string[]
          promptSource?: string
          skillGuidancePresent?: boolean
        })?.skillIds?.[0] === 'outline-editor'),
    ).toBe(true)
  })

  it('marks empty guidance as absent for SKILL-neutral evidence', async () => {
    const callAi = vi.fn(async (): Promise<CallAiResult> => successResult())
    const runtime = createAgentDialogueRuntime({
      ...entry,
      skillGuidance: '',
      skillIds: [],
      promptSource: 'none',
    })
    const result = await runtime.run({
      purpose: 'generate',
      messages: [{ role: 'user', content: '继续讨论' }],
      callAi,
    })

    const event = result.events.find(event => event.type === 'skill-guidance-injected')
    expect(event?.payload).toMatchObject({
      skillIds: [],
      promptSource: 'none',
      guidanceChars: 0,
      skillGuidancePresent: false,
    })
  })

  it('still runs the orchestrator when agent IPC is unavailable', async () => {
    const persisted: any[] = []
    const callAi = vi.fn(async (): Promise<CallAiResult> => successResult('浏览器回退'))
    const runtime = createAgentDialogueRuntime({ ...entry, persistState: undefined })
    const result = await runtime.run({
      purpose: 'generate',
      messages: [{ role: 'user', content: '继续' }],
      callAi,
    })
    expect(result.status).toBe('completed')
    expect(result.text).toBe('浏览器回退')
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(persisted).toHaveLength(0)
    expect(result.snapshot.taskId).toBe('dialogue-agent')
  })

  it('passes the original request parameters and tools through unchanged', async () => {
    const callAi = vi.fn(async (): Promise<CallAiResult> => successResult())
    const runtime = createAgentDialogueRuntime(entry)
    const request: CallAiParams = {
      purpose: 'generate',
      messages: [{ role: 'user', content: '读取并修改' }],
      model: 'test-model',
      stream: true,
      tools: [{
        name: 'editor.read_range',
        description: 'read',
        policy: 'read',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true, data: {} }),
      }],
    }
    await runtime.run({ ...request, callAi })
    expect(callAi).toHaveBeenCalledTimes(1)
    const forwarded = (callAi as unknown as { mock: { calls: Array<[CallAiParams]> } }).mock.calls[0]?.[0]
    expect(forwarded).toBeDefined()
    if (!forwarded) return
    expect(forwarded.model).toBe('test-model')
    expect(forwarded.stream).toBe(true)
    expect(forwarded.tools?.map(tool => tool.name)).toContain('editor.read_range')
    expect(forwarded.tools?.map(tool => tool.name)).toContain('context.remaining')
    expect(forwarded.tools?.map(tool => tool.name)).toContain('agent.plan')
  })

  it('exposes sub-agent tools only to the outer dialogue agent', async () => {
    const callAi = vi.fn(async (): Promise<CallAiResult> => successResult())
    const runSubAgent = vi.fn(async ({ taskId, goal }: { taskId: string; goal: string }) => ({
      taskId,
      status: 'completed' as const,
      text: '子任务完成',
      events: [],
      snapshot: {
        taskId,
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
    }))

    const outerRuntime = createAgentDialogueRuntime({ ...entry, runSubAgent })
    const outerResult = await outerRuntime.run({
      purpose: 'generate',
      messages: [{ role: 'user', content: '外层任务' }],
      callAi,
    })
    expect(outerResult.toolSurface?.map(tool => tool.name)).toContain('agent.spawn')
    expect(outerResult.toolSurface?.map(tool => tool.name)).toContain('agent.wait')
    expect(runSubAgent).not.toHaveBeenCalled()

    const childRuntime = createAgentDialogueRuntime({ ...entry, taskId: 'dialogue-sub-agent', subAgentDepth: 1, runSubAgent })
    const childResult = await childRuntime.run({
      purpose: 'generate',
      messages: [{ role: 'user', content: '子层任务' }],
      callAi,
    })
    const childToolNames = childResult.toolSurface?.map(tool => tool.name) || []
    expect(childToolNames).not.toContain('agent.spawn')
    expect(childToolNames).not.toContain('agent.wait')
    expect(childToolNames).not.toContain('agent.cancel')
  })
})
