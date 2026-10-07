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

  it('derives the agent plan from a supplied long-document execution plan', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，删除重复项，统一标题层级、编号和标点',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
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
      messages: [{ role: 'user', content: '整理全篇' }],
      callAi,
    })

    const planEvent = result.events.find(event => event.type === 'plan')
    expect(planEvent?.payload).toMatchObject({
      goal: entry.goal,
      steps: [
        { id: 'read-structure' },
        { id: 'execute-restructure' },
        { id: 'confirm-duplicates' },
        { id: 'delete-duplicates' },
        { id: 'normalize-segments' },
        { id: 'verify-plan' },
      ],
      completionCriteria: expect.arrayContaining([
        '执行计划中的全部写入批次成功或明确进入终态',
        '完成不变量校验：planned-deletion-only, normalize-changes-punctuation-whitespace-format-only',
      ]),
    })
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

  it('retires sub-agent control tools on dialogue runs', async () => {
    const callAi = vi.fn(async (): Promise<CallAiResult> => successResult())

    const runtime = createAgentDialogueRuntime({ ...entry })
    const result = await runtime.run({
      purpose: 'generate',
      messages: [{ role: 'user', content: '整理当前段落' }],
      callAi,
    })
    const toolNames = result.toolSurface?.map(tool => tool.name) || []
    expect(toolNames).toContain('agent.plan')
    expect(toolNames).not.toContain('agent.spawn')
    expect(toolNames).not.toContain('agent.wait')
    expect(toolNames).not.toContain('agent.cancel')
  })
})
