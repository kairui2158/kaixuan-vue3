import { AgentOrchestrator, type AgentOrchestratorTaskResult } from './agentOrchestrator'
import { createAgentTraceBridge } from './agentTraceBridge'
import type { CallAiParams, CallAiResult } from './aiService'
import type { RunTraceSource } from '../stores/runTrace'
import type { LongDocumentOperationType } from './longDocumentPolicy'
import type { LongDocumentExecutionPlan } from './longDocumentExecutionPlanner'
import type { AgentOrchestratorSnapshot } from './agentOrchestrator'
import type { AgentOrchestratorEvent } from './agentOrchestrator'

export interface AgentDialogueRuntimeEntry {
  source: RunTraceSource
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
  maxPhysicalRequests?: number
  getContextRemaining?: (input: { messages: CallAiParams['messages'] }) => {
    contextWindowTokens?: number | null
    maxOutputTokens?: number | null
  }
  persistState?: (snapshot: AgentOrchestratorSnapshot) => void | Promise<void>
  onEvent?: (event: AgentOrchestratorEvent, snapshot: AgentOrchestratorSnapshot) => void
  subAgentDepth?: number
  runSubAgent?: (input: {
    taskId: string
    goal: string
    tools?: AgentDialogueRunInput['tools']
  }) => Promise<AgentOrchestratorTaskResult>
}

interface AgentDialogueRunInput extends CallAiParams {
  callAi: (params: CallAiParams) => Promise<CallAiResult>
}

export function createAgentDialogueRuntime(entry: AgentDialogueRuntimeEntry) {
  const bridge = createAgentTraceBridge({ source: entry.source, pinia: entry.pinia })
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
        subAgentDepth: entry.subAgentDepth,
        plan: {
          goal: entry.goal,
          steps: [
            { id: 'dialogue', description: '完成本轮用户请求', requiredTools: undefined },
          ],
          completionCriteria: ['返回用户可见正文或进入明确终态'],
        },
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
          maxPhysicalRequests: entry.maxPhysicalRequests,
          runSubAgent: entry.runSubAgent,
        },
      })
      return await orchestrator.run(request)
    },
  }
}
