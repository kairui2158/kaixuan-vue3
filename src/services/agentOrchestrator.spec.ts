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
import { createEditorTools, ToolGateway } from './editorTools'
import { createEditorTargetSnapshot } from './editorTarget'

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

  it('completes a discussion plan after one text answer without dispatching another request', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '这段设定应该写在哪里？请帮我定位',
      content: '# 第一卷\n\n第一章大纲。\n\n# 第二卷\n\n第二章大纲。',
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'discuss',
    })
    expect(executionPlan.operation).toBe('discussion')
    expect(executionPlan.mode).toBe('direct')
    const callAi = vi.fn(async (): Promise<CallAiResult> => successResult(
      '这段设定建议放在第三章之后的补充节点，用来承接旧信出处。',
    ) as CallAiResult)
    const runtime: AgentOrchestratorRuntime = {
      callAi,
      document: {
        content: '# 第一卷\n\n第一章大纲。\n\n# 第二卷\n\n第二章大纲。',
        operationType: 'discussion',
        executionPlan,
      },
      maxPhysicalRequests: 12,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('completed')
    expect(result.text).toContain('第三章之后')
    expect(callAi).toHaveBeenCalledTimes(1)
    expect(agent.getSnapshot().callCount).toBe(1)
  })

  it('does not complete an authorized write task from preview-only text', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，不要缩减内容',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => ({
        ...successResult('【修改预览】\n本轮先给出重构预览，等待确认。'),
      }) as CallAiResult),
      document: {
        content: '段'.repeat(74_841),
        operationType: 'whole-document-restructure',
        executionPlan,
      },
      editTaskWorkflow: true,
      maxPhysicalRequests: 1,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('stalled')
    expect(result.reason).toBe('legacy_preview_response')
    expect(agent.getEvents().some(event =>
      event.type === 'no_progress'
      && (event.payload as { reason?: string } | undefined)?.reason === 'legacy_preview_response',
    )).toBe(true)
  })

  it('completes a direct append write after one physical request', async () => {
    const content = '第一段：旧句。\n第二段：验证正文。'
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '在文末追加一段总结',
      content,
      contextWindowTokens: 128_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })
    expect(executionPlan.mode).toBe('direct')
    expect(executionPlan.segments).toHaveLength(1)

    const snapshot = createEditorTargetSnapshot({
      workspace: 'main',
      targetId: 'chapter-1',
      label: '主页直写',
      content,
      selectionStart: 0,
      selectionEnd: 0,
    })
    const gateway = new ToolGateway()
    gateway.registerAll(createEditorTools({
      getSnapshot: () => snapshot,
      mode: 'direct',
      executionPlan,
      applyWrite: async () => ({ ok: true, rollbackAvailable: true }),
    }))
    const writeResult = await gateway.execute('editor.write', {
      commands: [{ operation: 'append', content: '第三段：追加总结。' }],
    }, {
      projectId: 'p1',
      workspace: 'main',
      targetId: 'chapter-1',
      sessionId: 's1',
      iteration: 1,
    })
    expect(writeResult.ok).toBe(true)

    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (params: CallAiParams): Promise<CallAiResult> => {
        params.toolPolicy?.onToolCall?.({
          toolName: 'editor.write',
          policy: 'write',
          iteration: 1,
          input: { commands: [{ operation: 'append', content: '第三段：追加总结。' }] },
          result: writeResult,
          durationMs: 1,
        })
        return {
          ...successResult('已在文末追加总结。'),
          toolResults: [{
            call: { name: 'editor.write' },
            result: writeResult,
          }],
        } as CallAiResult
      }),
      document: {
        content,
        operationType: 'targeted-edit',
        executionPlan,
      },
      editTaskWorkflow: true,
      maxPhysicalRequests: 3,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('completed')
    expect(result.reason).toBe('completion criteria satisfied')
    expect(runtime.callAi).toHaveBeenCalledTimes(1)
  })

  it('does not complete a write task when only part of the planned writes succeed', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，删除重复项，统一标题层级、编号和标点',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (params: CallAiParams): Promise<CallAiResult> => {
        params.toolPolicy?.onToolCall?.({
          toolName: 'editor.write',
          policy: 'write',
          iteration: 1,
          input: { commands: [{ operation: 'delete' }] },
          result: { ok: true, data: { written: true } },
          durationMs: 1,
        })
        return {
          ...successResult('部分写入完成，仍有批次未执行'),
          toolResults: [{
            call: { name: 'editor.write' },
            result: { ok: true, data: { written: true } },
          }],
        }
      }),
      document: {
        content: '段'.repeat(74_841),
        operationType: 'whole-document-restructure',
        executionPlan,
      },
      editTaskWorkflow: true,
      maxPhysicalRequests: 1,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('stalled')
    expect(result.reason).toBe('partially_applied')
    expect(agent.getEvents().some(event =>
      event.type === 'tool'
      && (event.payload as { reason?: string } | undefined)?.reason === 'partially_applied',
    )).toBe(true)
  })

  it('keeps partial-write state when later rounds return text without a new write', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，删除重复项，统一标题层级、编号和标点',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })
    let physicalRequests = 0
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (params: CallAiParams): Promise<CallAiResult> => {
        physicalRequests += 1
        if (physicalRequests === 1) {
          params.toolPolicy?.onToolCall?.({
            toolName: 'editor.write',
            policy: 'write',
            iteration: 1,
            input: { commands: [{ operation: 'delete' }] },
            result: { ok: true, data: { written: true } },
            durationMs: 1,
          })
          return {
            ...successResult('部分写入完成，仍有批次未执行'),
            toolResults: [{
              call: { name: 'editor.write' },
              result: { ok: true, data: { written: true } },
            }],
          } as CallAiResult
        }
        return {
          ...successResult('写入尚未覆盖全部计划批次。'),
          toolResults: [],
        } as CallAiResult
      }),
      document: {
        content: '段'.repeat(74_841),
        operationType: 'whole-document-restructure',
        executionPlan,
      },
      editTaskWorkflow: true,
      maxPhysicalRequests: 2,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('stalled')
    expect(result.reason).toBe('partially_applied')
    expect(result.snapshot.successfulWriteCount).toBe(1)
  })

  it('does not complete a multi-segment write task from unbound successful calls', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '请整理全文标点符号',
      content: `# 根标题\n\n${Array.from({ length: 800 }, (_, index) =>
        `第${index + 1}节：长文档部分写入终态抽测。男主沿着灯塔石阶检查灯芯，潮水在礁石外反复退去。`).join('\n\n')}`,
      contextWindowTokens: 12_000,
      maxOutputTokens: 2_048,
      intent: 'edit',
    })
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (params: CallAiParams): Promise<CallAiResult> => {
        params.toolPolicy?.onToolCall?.({
          toolName: 'editor.write',
          policy: 'write',
          iteration: 1,
          input: { commands: [{ operation: 'replace_match' }] },
          result: { ok: true, data: { coverageTrusted: true, commands: [{ operation: 'replace_match', start: 0, end: 10 }] } },
          durationMs: 1,
        })
        return {
          ...successResult('已经完成整理'),
          toolResults: [{
            call: { name: 'editor.write' },
            result: { ok: true, data: { coverageTrusted: true, commands: [{ operation: 'replace_match', start: 0, end: 10 }] } },
          }],
        } as CallAiResult
      }),
      document: {
        content: '长文档',
        operationType: 'whole-document-restructure',
        executionPlan,
      },
      editTaskWorkflow: true,
      maxPhysicalRequests: 1,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('stalled')
    expect(result.reason).toBe('partially_applied')
    expect(result.snapshot.successfulWriteCount).toBe(1)
  })

  it('completes a multi-segment write task when structure repair coverage is operation-inferred', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，统一标题层级并删除重复内容',
      content: `# 根标题\n\n## 权威章节\n\n### 六大势力总览\n\n${'潮'.repeat(74_841)}`,
      contextWindowTokens: 64_000,
      maxOutputTokens: 8_192,
      intent: 'edit',
    })
    expect(executionPlan.segments.map(segment => segment.segmentId)).toContain('structure-repair')
    expect(executionPlan.segments.map(segment => segment.segmentId)).toContain('structure-plan')
    expect(executionPlan.segments.map(segment => segment.segmentId)).toContain('normalize-segment-1')

    const coverageRecords = [{
      coverageTrusted: true,
      reason: 'declared_segment' as const,
      segmentId: 'structure-repair',
      writeStrategy: 'structure_repair',
      commands: [{
        operation: 'replace_match',
        segmentId: 'structure-repair',
        start: 0,
        end: 40_000,
      }],
    }, {
      coverageTrusted: true,
      reason: 'declared_segment' as const,
      segmentId: 'structure-plan',
      writeStrategy: 'delete',
      commands: [{
        operation: 'delete_duplicates',
        segmentId: 'structure-plan',
        start: 0,
        end: 74_800,
      }],
    }, {
      coverageTrusted: true,
      reason: 'declared_segment' as const,
      segmentId: 'normalize-segment-1',
      writeStrategy: 'replace_match',
      commands: [{
        operation: 'replace_match',
        segmentId: 'normalize-segment-1',
        start: 70_000,
        end: 74_800,
      }],
    }]
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (params: CallAiParams): Promise<CallAiResult> => {
        const toolResults = coverageRecords.map(coverage => ({
          call: { name: 'editor.write' },
          result: { ok: true, data: { coverage } },
        }))
        for (const [index, item] of toolResults.entries()) {
          params.toolPolicy?.onToolCall?.({
            toolName: 'editor.write',
            policy: 'write',
            iteration: index + 1,
            input: { batch: index + 1 },
            result: item.result,
            durationMs: 1,
          })
        }
        return {
          ...successResult('结构修复批次已写入。'),
          toolResults,
        } as CallAiResult
      }),
      document: {
        content: `# 根标题\n\n## 权威章节\n\n### 六大势力总览\n\n${'潮'.repeat(74_841)}`,
        operationType: 'whole-document-restructure',
        executionPlan,
      },
      editTaskWorkflow: true,
      maxPhysicalRequests: 2,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('completed')
    expect(result.reason).toBe('completion criteria satisfied')
    expect(runtime.callAi).toHaveBeenCalledTimes(1)
  })

  it('stops immediately after a terminal write convergence', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，不要缩减内容',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => ({
        ...successResult('本轮未写入：整篇替换已被应用拒绝。'),
        finishReason: 'tool_converged',
        convergenceReason: 'terminal write failure: document_too_large_for_whole_replacement',
        toolResults: [{
          call: { name: 'editor.write' },
          result: {
            ok: false,
            error: {
              code: 'document_too_large_for_whole_replacement',
              message: '整篇替换在 1M 档必须被拒绝',
            },
          },
        }],
      }) as CallAiResult),
      document: {
        content: '段'.repeat(74_841),
        operationType: 'whole-document-restructure',
        executionPlan,
      },
      editTaskWorkflow: true,
      maxPhysicalRequests: 8,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('stalled')
    expect(result.reason).toBe('write_not_executed')
    expect(runtime.callAi).toHaveBeenCalledTimes(1)
    expect(result.text).toContain('本轮未写入')
  })

  it('maps terminal write convergence after successful writes to partially applied', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，不要缩减内容',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (params: CallAiParams) => {
        const toolResults = [
          {
            call: { name: 'editor.write', input: { commands: [{ operation: 'rewrite', target: 'section-15', content: '第十五节' }] } },
            result: { ok: true, data: { coverageTrusted: true } },
          },
          {
            call: { name: 'editor.write', input: { commands: [{ operation: 'replace_document' }] } },
            result: {
              ok: false,
              error: {
                code: 'document_too_large_for_whole_replacement',
                message: '整篇替换在 1M 档必须被拒绝',
              },
            },
          },
        ]
        toolResults.forEach((item) => {
          params.toolPolicy?.onToolCall?.({
            toolName: item.call.name,
            policy: 'write',
            input: item.call.input,
            result: item.result,
            iteration: 1,
            durationMs: 0,
          })
        })
        return {
          ...successResult('已完成第 15 节重排；后续整篇替换被拒绝，剩余批次未执行。'),
          finishReason: 'tool_converged',
          convergenceReason: 'terminal write failure: document_too_large_for_whole_replacement',
          toolResults,
        } as CallAiResult
      }),
      document: {
        content: '段'.repeat(74_841),
        operationType: 'whole-document-restructure',
        executionPlan,
      },
      editTaskWorkflow: true,
      maxPhysicalRequests: 8,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('stalled')
    expect(result.reason).toBe('partially_applied')
    expect(result.snapshot.successfulWriteCount).toBe(1)
    expect(runtime.callAi).toHaveBeenCalledTimes(1)
    expect(agent.getEvents().some(event =>
      event.type === 'tool'
      && (event.payload as { reason?: string } | undefined)?.reason === 'partially_applied',
    )).toBe(true)
  })

  it('consumes the incomplete-write checkpoint without dispatching another request', async () => {
    const executionPlan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，删除重复项并统一标点',
      content: `# 第一卷\n\n${'雨'.repeat(20_000)}\n\n# 第二卷\n\n${'潮'.repeat(20_000)}`,
      contextWindowTokens: 64_000,
      maxOutputTokens: 8_192,
      intent: 'edit',
    })
    expect(executionPlan.segments.length).toBeGreaterThan(1)
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => ({
        ...successResult('本轮未完整执行写入计划。未覆盖批次：segment-2。'),
        textOrigin: 'application' as const,
        finishReason: 'incomplete_write_coverage_checkpoint',
        convergenceReason: 'model emitted a final summary before long-document coverage was complete',
        toolResults: [{
          call: { name: 'editor.write' },
          result: { ok: true, data: { coverageTrusted: true } },
        }],
      }) as CallAiResult),
      document: {
        content: `# 第一卷\n\n${'雨'.repeat(20_000)}\n\n# 第二卷\n\n${'潮'.repeat(20_000)}`,
        operationType: 'whole-document-restructure',
        executionPlan,
      },
      editTaskWorkflow: true,
      maxPhysicalRequests: 8,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('stalled')
    expect(result.reason).toBe('partially_applied')
    expect(runtime.callAi).toHaveBeenCalledTimes(1)
    expect(result.text).toContain('本轮未完整执行写入计划')
    expect(agent.getEvents().some(event =>
      event.type === 'tool'
      && (event.payload as { reason?: string } | undefined)?.reason === 'partially_applied',
    )).toBe(true)
  })

  it('does not treat ordinary tool convergence as a failed write task', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => ({
        ...successResult('已根据地图读取结果完成分析。'),
        finishReason: 'tool_converged',
        convergenceReason: 'final answer after tool execution looked like a tool-call protocol',
        toolResults: [{
          call: { name: 'editor.document_map' },
          result: { ok: true, data: { sections: [] } },
        }],
      }) as CallAiResult),
      document: {
        content: '段'.repeat(74_841),
        operationType: 'whole-document-restructure',
        executionPlan: buildLongDocumentExecutionPlan({
          requestText: '请先读取第20000节附近的地图，再读取首尾两节',
          content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
          contextWindowTokens: 120_000,
          maxOutputTokens: 8_000,
          intent: 'discuss',
        }),
      },
      editTaskWorkflow: true,
      maxPhysicalRequests: 1,
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('completed')
    expect(result.reason).not.toBe('write_not_executed')
    expect(runtime.callAi).toHaveBeenCalledTimes(1)
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

  it('passes the shared physical-request budget to in-call tool iterations', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (params: any): Promise<CallAiResult> => ({
        ...successResult(''),
        toolResults: [{
          call: { name: 'editor.write' },
          result: { ok: true, data: { written: true } },
        }],
      }) as CallAiResult),
      maxPhysicalRequests: 2,
    }
    const sharedBudgets: Array<(() => boolean) | undefined> = []
    const originalCallAi = runtime.callAi
    runtime.callAi = async (params: any) => {
      sharedBudgets.push(params.toolPolicy?.consumePhysicalRequestBudget)
      return originalCallAi(params)
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    await agent.run(runInput)

    expect(sharedBudgets).toHaveLength(2)
    expect(sharedBudgets[0]).toBeTypeOf('function')
    expect(sharedBudgets[1]).toBeTypeOf('function')
    // Budget callbacks are alive after the run; the second dispatch leaves
    // no remaining capacity for another in-call iteration.
    expect(sharedBudgets[0]!()).toBe(false)
    expect(sharedBudgets[1]!()).toBe(false)
  })

  it('consumes extra in-call physical requests from the shared budget without double-charging the round', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => ({
        ...successResult(''),
        toolResults: [{
          call: { name: 'editor.write' },
          result: { ok: true, data: { written: true } },
        }],
      }) as CallAiResult),
      maxPhysicalRequests: 2,
    }
    const calls: Array<(input?: { inCall?: boolean }) => boolean> = []
    const originalCallAi = runtime.callAi
    runtime.callAi = async (params: any) => {
      const budget = params.toolPolicy?.consumePhysicalRequestBudget
      calls.push(budget)
      // Round 1 already prepaid one request. The first extra in-call request
      // must consume the next slot; after that, the shared budget is dry.
      expect(budget?.({ inCall: true })).toBe(true)
      expect(budget?.({ inCall: true })).toBe(false)
      return originalCallAi(params)
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    await agent.run(runInput)

    expect(calls).toHaveLength(1)
    expect(calls[0]!({ inCall: true })).toBe(false)
    expect(calls[0]!()).toBe(true)
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

  it('retires sub-agent control tools even when a legacy runner is supplied', async () => {
    const runtimeWithRunner: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult() as CallAiResult),
    }
    const agent = new AgentOrchestrator({ plan, runtime: runtimeWithRunner })
    const result = await agent.run(runInput)
    expect(result.status).toBe('completed')
    const toolNames = result.toolSurface?.map(tool => tool.name) || []
    expect(toolNames).toContain('agent.plan')
    expect(toolNames).not.toContain('agent.spawn')
    expect(toolNames).not.toContain('agent.wait')
    expect(toolNames).not.toContain('agent.cancel')
    expect(result.toolSurface?.every(tool => tool.policy === 'read')).toBe(true)
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

  it('emits an interactive response only for real answer text', async () => {
    const events: string[] = []
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult(
        '这段设定建议放在第三章之后，用于承接旧信出处。',
      ) as CallAiResult),
      onEvent: event => events.push(event.type),
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('completed')
    expect(events).toContain('interactive_response')
    const interactive = agent.getEvents().find(event => event.type === 'interactive_response')
    expect(interactive?.payload).toMatchObject({
      textPreview: '这段设定建议放在第三章之后，用于承接旧信出处。',
      hasSuccessfulWrite: false,
      callCount: 1,
    })
  })

  it('does not emit an interactive response for pseudo tool text', async () => {
    const runtime: AgentOrchestratorRuntime = {
      callAi: vi.fn(async (): Promise<CallAiResult> => successResult(
        '{"name":"editor.write","arguments":{"commands":[]}}',
      ) as CallAiResult),
    }
    const agent = new AgentOrchestrator({ plan, runtime })
    const result = await agent.run(runInput)

    expect(result.status).toBe('completed')
    expect(agent.getEvents().some(event => event.type === 'interactive_response')).toBe(false)
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
