import { AgentOrchestrator, type AgentOrchestratorTaskResult } from './agentOrchestrator'
import { createAgentTraceBridge } from './agentTraceBridge'
import type { CallAiParams, CallAiResult } from './aiService'
import type { RunTraceSource } from '../stores/runTrace'
import type { LongDocumentOperationType } from './longDocumentPolicy'
import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import type { AgentOrchestratorSnapshot } from './agentOrchestrator'
import type { AgentOrchestratorEvent } from './agentOrchestrator'
import type { AgentOrchestratorPlan } from './agentOrchestrator'
import type { ToolRunBudgetSnapshot } from './toolRunBudget'
import type { ToolRunBudget } from './toolRunBudget'

export interface AgentDialogueRuntimeEntry {
  source: RunTraceSource
  runId?: string | null
  pinia?: Parameters<typeof createAgentTraceBridge>[0]['pinia']
  taskId: string
  goal: string
  document?: {
    content: string
    operationType?: LongDocumentOperationType
    executionPlan?: LongDocumentExecutionPlan
  }
  editTaskWorkflow?: boolean
  skillGuidance?: string
  skillIds?: string[]
  promptSource?: string
  idleTimeoutMs?: number
  maxPhysicalRequests?: number
  toolRunBudget?: ToolRunBudgetSnapshot
  toolRunBudgetInstance?: ToolRunBudget
  getContextRemaining?: (input: { messages: CallAiParams['messages'] }) => {
    contextWindowTokens?: number | null
    maxOutputTokens?: number | null
  }
  persistState?: (snapshot: AgentOrchestratorSnapshot) => void | Promise<void>
  onEvent?: (event: AgentOrchestratorEvent, snapshot: AgentOrchestratorSnapshot) => void
}

interface AgentDialogueRunInput extends CallAiParams {
  callAi: (params: CallAiParams) => Promise<CallAiResult>
}

function deriveAgentPlan(input: {
  goal: string
  executionPlan?: LongDocumentExecutionPlan
}): AgentOrchestratorPlan {
  const plan = input.executionPlan
  if (!plan) {
    return {
      goal: input.goal,
      steps: [{ id: 'dialogue', description: '完成本轮用户请求' }],
      completionCriteria: ['返回用户可见正文或进入明确终态'],
    }
  }
  if (plan.operation === 'discussion') {
    return {
      goal: input.goal,
      steps: [{ id: 'discuss', description: '回答本轮讨论请求' }],
      completionCriteria: ['返回用户可见正文或进入明确终态'],
    }
  }

  const steps: AgentOrchestratorPlan['steps'] = []
  const completionCriteria: string[] = []
  const operation = plan.operation
  if (plan.mode === 'single-pass') {
    steps.push({
      id: 'single-pass-prose',
      description: '基于已注入全文直接流式输出整理后的完整全文',
    })
  } else if (operation === 'restructure' || operation === 'restructure_and_cleanup') {
    steps.push({
      id: 'read-structure',
      description: '读取文档结构并确认目标层级',
      requiredTools: ['editor.document_map'],
    })
    steps.push({
      id: 'execute-restructure',
      description: '执行标题层级修复或章节重排',
      requiredTools: ['editor.write'],
    })
  }
  else if (operation === 'deduplicate' || operation === 'deduplicate_and_normalize') {
    steps.push({
      id: 'confirm-duplicates',
      description: '用只读工具确认重复项',
      requiredTools: ['editor.locate'],
    })
    steps.push({
      id: 'delete-duplicates',
      description: '只删除已确认的重复项',
      requiredTools: ['editor.write'],
    })
  }
  else if (operation === 'normalize') {
    steps.push({
      id: 'normalize-segments',
      description: '按计划批次整理格式',
      requiredTools: ['editor.write'],
    })
  }
  if (operation === 'targeted_edit') {
    steps.push({
      id: 'locate-target',
      description: '定位用户指定目标',
      requiredTools: ['editor.locate'],
    })
    steps.push({
      id: 'write-target',
      description: '写入局部修改',
      requiredTools: ['editor.write'],
    })
  }
  if (operation === 'rewrite_segments') {
    steps.push({
      id: 'generate-final-draft',
      description: '按终稿计划生成内容',
    })
  }
  steps.push({ id: 'verify-plan', description: '核对写入覆盖与不变量' })
  completionCriteria.push(plan.mode === 'single-pass'
    ? '完整正文输出成功或明确进入终态'
    : '执行计划中的全部写入批次成功或明确进入终态')
  if (plan.invariants.length) {
    completionCriteria.push(`完成不变量校验：${plan.invariants.join(', ')}`)
  }
  return {
    goal: input.goal,
    steps,
    completionCriteria,
    failureCriteria: [
      '未发生成功写入却输出修改预览或完成说明',
      '写入操作被执行计划拒绝',
    ],
  }
}

export function createAgentDialogueRuntime(entry: AgentDialogueRuntimeEntry) {
  const bridge = createAgentTraceBridge({ source: entry.source, pinia: entry.pinia, runId: entry.runId ?? null })
  const persistState = async (snapshot: AgentOrchestratorSnapshot) => {
    if (entry.persistState) {
      try {
        await entry.persistState(snapshot)
      } catch (error) {
        console.warn('[agent-dialogue] state persistence failed:', error)
      }
      return
    }
    try {
      await window.electronAPI?.agentStateSave?.(snapshot)
    } catch (error) {
      console.warn('[agent-dialogue] state persistence failed:', error)
    }
  }

  return {
    async run(input: AgentDialogueRunInput): Promise<AgentOrchestratorTaskResult> {
      const { callAi, ...request } = input
      const orchestrator = new AgentOrchestrator({
        taskId: entry.taskId,
        plan: deriveAgentPlan({
          goal: entry.goal,
          executionPlan: entry.document?.executionPlan,
        }),
        runtime: {
          callAi,
          goal: entry.goal,
          persistState,
          onEvent: (event, snapshot) => {
            bridge.attach()(event, snapshot)
            entry.onEvent?.(event, snapshot)
          },
          getContextRemaining: entry.getContextRemaining,
          document: entry.document,
          editTaskWorkflow: entry.editTaskWorkflow,
          skillGuidance: entry.skillGuidance,
          skillIds: entry.skillIds,
          promptSource: entry.promptSource,
          idleTimeoutMs: entry.idleTimeoutMs,
          maxPhysicalRequests: entry.maxPhysicalRequests,
          toolRunBudget: entry.toolRunBudget,
          toolRunBudgetInstance: entry.toolRunBudgetInstance,
        },
      })
      return await orchestrator.run(request)
    },
  }
}
