import { describe, expect, it } from 'vitest'
import { mapAgentResultToRunTrace, mergeEditTaskTerminal } from './agentTerminalMapping'
import type { AgentOrchestratorTaskResult } from './agentOrchestrator'
import { buildLongDocumentExecutionPlan } from './longDocumentExecutionPlanner'

function agentResult(
  status: AgentOrchestratorTaskResult['status'],
  reason?: string,
): Pick<AgentOrchestratorTaskResult, 'status' | 'reason' | 'text' | 'snapshot'> {
  return {
    status,
    reason,
    text: '回复正文',
    snapshot: {
      taskId: 'task-test',
      status,
      reason,
      goal: '整理文档',
      stepIndex: 0,
      callCount: 1,
      successfulWriteCount: 0,
      trustedCoverageCount: 0,
      planComplete: false,
      noProgressRounds: 0,
      repeatedCallCount: 0,
      maxPhysicalRequests: 8,
      executionPhase: 'settling',
      updatedAt: 1,
    },
  }
}

describe('agent terminal mapping', () => {
  it('maps completed discussion to the plain dialogue terminal', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '解释一下这一章的作用',
      content: '# 第一章\n\n正文',
      intent: 'discuss',
    })

    const mapping = mapAgentResultToRunTrace({
      agentResult: agentResult('completed'),
      executionPlan: plan,
    })

    expect(mapping).toMatchObject({
      status: 'success',
      reason: 'plain_dialogue_complete',
    })
  })

  it('maps a completed write plan to success with a write-specific reason', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，删除重复项，统一标题层级、编号和标点',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })

    const mapping = mapAgentResultToRunTrace({
      agentResult: agentResult('completed'),
      executionPlan: plan,
    })

    expect(mapping).toMatchObject({
      status: 'success',
      reason: 'write_task_complete',
    })
  })

  it('maps partial writes to a non-success terminal', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，删除重复项，统一标题层级、编号和标点',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })

    const mapping = mapAgentResultToRunTrace({
      agentResult: agentResult('stalled', 'partially_applied'),
      executionPlan: plan,
    })

    expect(mapping).toMatchObject({
      status: 'partially_applied',
      reason: 'partially_applied',
    })
  })

  it('maps preview-only text to write_not_executed', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，删除重复项，统一标题层级、编号和标点',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })

    const mapping = mapAgentResultToRunTrace({
      agentResult: agentResult('stalled', 'legacy_preview_response'),
      executionPlan: plan,
    })

    expect(mapping).toMatchObject({
      status: 'failed',
      reason: 'write_not_executed',
    })
  })

  it('maps the physical request limit to a stalled terminal', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，删除重复项，统一标题层级、编号和标点',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })

    const mapping = mapAgentResultToRunTrace({
      agentResult: agentResult('stalled', 'physical_request_limit'),
      executionPlan: plan,
    })

    expect(mapping).toMatchObject({
      status: 'degraded',
      reason: 'stalled/physical_request_limit',
    })
  })

  it('maps a write task that needs user input to blocked', () => {
    const plan = buildLongDocumentExecutionPlan({
      requestText: '按照Word文档的形式重构大纲，删除重复项，统一标题层级、编号和标点',
      content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
      contextWindowTokens: 120_000,
      maxOutputTokens: 8_000,
      intent: 'edit',
    })

    const mapping = mapAgentResultToRunTrace({
      agentResult: agentResult('needs_user', '缺少目标段落'),
      executionPlan: plan,
    })

    expect(mapping).toMatchObject({
      status: 'blocked',
      reason: 'agent_needs_user',
    })
  })
})

describe('EditTask terminal evidence', () => {
  const writePlan = buildLongDocumentExecutionPlan({
    requestText: '按照Word文档的形式重构大纲，删除重复项，统一标题层级、编号和标点',
    content: `# 根标题\n\n## 二级标题\n\n${'段'.repeat(74_841)}`,
    contextWindowTokens: 120_000,
    maxOutputTokens: 8_000,
    intent: 'edit',
  })
  const agentTerminal = mapAgentResultToRunTrace({
    agentResult: agentResult('stalled', 'partially_applied'),
    executionPlan: writePlan,
  })

  it('lets a content-verified completed EditTask supersede a non-coverage agent verdict', () => {
    const merged = mergeEditTaskTerminal({
      agentTerminal: { ...agentTerminal, status: 'degraded', reason: 'stalled/physical_request_limit' },
      editTask: {
        status: 'completed',
        executedBatches: [
          'ai-edit-muwto8a0-9',
          'ai-edit-muwtu0uu-a',
          'ai-edit-muwu3vpb-b',
          'ai-edit-muwu8l7y-c',
        ],
        pendingBatches: [],
        failedBatchIds: [],
      },
      completionReport: { verified: true, violations: [] },
    })

    expect(merged.terminal).toMatchObject({
      status: 'success',
      reason: 'edit_task_completed',
    })
    expect(merged.override).toBe(true)
    expect(merged.evidenceReason).toBe('dynamic_batches_completed:4')
  })

  it('keeps the agent verdict when EditTask is not a verified completed task', () => {
    const merged = mergeEditTaskTerminal({
      agentTerminal: { ...agentTerminal, status: 'degraded', reason: 'stalled/physical_request_limit' },
      editTask: {
        status: 'partially_applied',
        executedBatches: ['batch-1'],
        pendingBatches: [],
        failedBatchIds: ['batch-2'],
      },
      completionReport: { verified: false, violations: [] },
    })

    expect(merged.terminal).toMatchObject({
      status: 'degraded',
      reason: 'stalled/physical_request_limit',
    })
    expect(merged.override).toBe(false)
    expect(merged.evidenceReason).toBe('edit_task_not_authoritative:partially_applied')
  })

  it('does not upgrade incomplete plan coverage to EditTask completion', () => {
    const merged = mergeEditTaskTerminal({
      agentTerminal,
      editTask: {
        status: 'completed',
        executedBatches: ['batch-1'],
        pendingBatches: [],
        failedBatchIds: [],
      },
      completionReport: { verified: true, violations: [] },
    })

    expect(merged.terminal).toMatchObject({
      status: 'partially_applied',
      reason: 'partially_applied',
    })
    expect(merged.override).toBe(false)
    expect(merged.evidenceReason).toBe('plan_coverage_incomplete')
  })

  it('does not override a failed original plan with a completed dynamic EditTask', () => {
    const failedOriginalPlanTerminal = mapAgentResultToRunTrace({
      agentResult: agentResult('stalled', 'partially_applied'),
      executionPlan: writePlan,
    })
    const merged = mergeEditTaskTerminal({
      agentTerminal: failedOriginalPlanTerminal,
      originalExecutionPlan: writePlan,
      editTask: {
        status: 'completed',
        executedBatches: ['dynamic-batch-1'],
        pendingBatches: [],
        failedBatchIds: [],
      },
      completionReport: { verified: true, violations: [] },
    })

    expect(merged.terminal).toMatchObject({
      status: 'partially_applied',
      reason: 'partially_applied',
    })
    expect(merged.override).toBe(false)
    expect(merged.evidenceReason).toBe('original_plan_not_complete')
  })

  it('keeps the agent verdict when all batches are written but completion is unverified', () => {
    const merged = mergeEditTaskTerminal({
      agentTerminal,
      editTask: {
        status: 'completed',
        executedBatches: ['batch-1', 'batch-2'],
        pendingBatches: [],
        failedBatchIds: [],
      },
      completionReport: { verified: false, violations: [] },
    })

    expect(merged.terminal.status).toBe('partially_applied')
    expect(merged.override).toBe(false)
  })

  it('keeps the agent verdict when no EditTask exists', () => {
    const merged = mergeEditTaskTerminal({
      agentTerminal,
      editTask: null,
    })

    expect(merged.terminal).toEqual(agentTerminal)
    expect(merged.evidenceReason).toBe('edit_task_missing')
  })
})
