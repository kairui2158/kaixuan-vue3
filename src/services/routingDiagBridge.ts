import type { ChainRoutingEvent } from './workspaceSkillEngine'

export type DiagLevel = 'info' | 'warn' | 'error'

export interface RoutingDiagEvent {
  level: DiagLevel
  category: string
  message: string
  payload?: unknown
}

/**
 * Mirrors routing run-trace events into DiagLogger. The trace keeps the
 * user-facing timeline; this bridge gives the diagnostic panel the same
 * decision path so the two log sides can be reconciled.
 */
export function describeRoutingDiagEvent(event: ChainRoutingEvent): RoutingDiagEvent {
  switch (event.type) {
    case 'routing_started':
      return {
        level: 'info',
        category: 'routing/started',
        message: '开始意图路由',
        payload: { requestText: event.requestText },
      }
    case 'routing_result': {
      const routing = event.result
      return {
        level: routing.kind === 'matched' ? 'info' : 'warn',
        category: 'routing/result',
        message: `意图路由结果：${routing.kind}`,
        payload: {
          kind: routing.kind,
          reason: routing.reason,
          ...('intent' in routing ? { intent: routing.intent } : {}),
          ...('confidence' in routing ? { confidence: routing.confidence } : {}),
          ...('fallbackMode' in routing ? { fallbackMode: routing.fallbackMode } : {}),
        },
      }
    }
    case 'routing_diagnostics':
      return {
        level: 'info',
        category: 'routing/diagnostics',
        message: `意图路由诊断：${event.diagnostics.router.decisionLayer}`,
        payload: event.diagnostics,
      }
    case 'fallback_requested':
      return {
        level: 'warn',
        category: 'routing/fallback-requested',
        message: '意图路由进入用户确认',
        payload: event.result,
      }
    case 'chain_handoff':
      return {
        level: event.artifact.repeatedHashCount ? 'warn' : 'info',
        category: 'routing/chain-handoff',
        message: `链式步骤 Handoff：${event.artifact.sourceSkillId}`,
        payload: event.artifact,
      }
    case 'skill_skipped':
      return {
        level: 'info',
        category: 'routing/skill-skipped',
        message: `跳过技能：${event.skillId}`,
        payload: { skillIndex: event.skillIndex, skillId: event.skillId, reason: event.reason },
      }
    case 'budget_exhausted':
      return {
        level: 'warn',
        category: 'routing/budget-exhausted',
        message: 'API 调用预算已用尽',
        payload: { step: event.step, used: event.budget.used, limit: event.budget.limit },
      }
    case 'run_completed':
      return {
        level: event.state === 'completed' ? 'info' : 'warn',
        category: 'routing/run-completed',
        message: `链式技能执行完成：${event.state}`,
        payload: { state: event.state },
      }
  }
}
