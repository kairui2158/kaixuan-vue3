export interface ApiBudgetEntry {
  step: string
  at: string
  used: number
  limit: number | null
}

export interface ApiPhysicalBudgetConsumeResult {
  status: 'allowed' | 'blocked'
  used: number
  limit: number
  reason?: string
  step?: string
}

export interface ApiBudgetDecision {
  status: 'allowed' | 'blocked'
  used: number
  limit: number
  reason?: string
  step?: string
}

export interface ApiCallBudget {
  tryConsume(step: string, skillLimit?: number | null): ApiBudgetDecision
  consumePhysicalRetry(step: string, skillLimit?: number | null): ApiPhysicalBudgetConsumeResult
  extend(additional: number): { used: number; limit: number; extensions: number }
  snapshot(): { used: number; limit: number; entries: ApiBudgetEntry[] }
}

export function createApiCallBudget(totalLimit = 8): ApiCallBudget {
  const normalizedTotal = Number.isFinite(totalLimit) ? Math.floor(totalLimit) : 8
  if (normalizedTotal <= 0) {
    return {
      tryConsume: () => ({
        status: 'blocked' as const,
        used: 0,
        limit: 0,
        reason: 'API 调用预算已耗尽（已用 0/0），阻断位置：测试专用预算',
        step: 'test-budget-zero'
      }),
      consumePhysicalRetry: () => ({
        status: 'blocked' as const,
        used: 0,
        limit: 0,
        reason: 'API 物理重试预算已耗尽（已用 0/0），阻断位置：测试专用预算',
        step: 'test-budget-zero'
      }),
      extend: () => ({ used: 0, limit: 0, extensions: 0 }),
      snapshot: () => ({ used: 0, limit: 0, entries: [] })
    }
  }
  let limit = normalizedTotal || 8
  let used = 0
  let extensions = 0
  const entries: ApiBudgetEntry[] = []

  function extendBudget(additional: number): { used: number; limit: number; extensions: number } {
    const normalizedAdditional = Number.isFinite(additional) ? Math.floor(additional) : 0
    if (normalizedAdditional <= 0) {
      return { used, limit, extensions }
    }
    limit += normalizedAdditional
    extensions += 1
    return { used, limit, extensions }
  }

  function tryConsume(step: string, skillLimit?: number | null): ApiBudgetDecision {
    const effectiveLimit = Math.min(
      limit,
      typeof skillLimit === 'number' && Number.isFinite(skillLimit) && skillLimit > 0
        ? Math.floor(skillLimit)
        : limit
    )

    if (used >= effectiveLimit) {
      const reason = `API 调用预算已耗尽（已用 ${used}/${effectiveLimit}），阻断位置：${step}`
      entries.push({ step, at: new Date().toISOString(), used, limit: effectiveLimit })
      return { status: 'blocked', used, limit: effectiveLimit, reason, step }
    }

    used += 1
    entries.push({ step, at: new Date().toISOString(), used, limit: effectiveLimit })
    return { status: 'allowed', used, limit: effectiveLimit, step }
  }

  function consumePhysicalRetry(step: string, skillLimit?: number | null): ApiPhysicalBudgetConsumeResult {
    const effectiveLimit = Math.min(
      limit,
      typeof skillLimit === 'number' && Number.isFinite(skillLimit) && skillLimit > 0
        ? Math.floor(skillLimit)
        : limit
    )
    if (used >= effectiveLimit) {
      const reason = `API 物理重试预算已耗尽（已用 ${used}/${effectiveLimit}），阻断位置：${step}`
      entries.push({ step, at: new Date().toISOString(), used, limit: effectiveLimit })
      return { status: 'blocked', used, limit: effectiveLimit, reason, step }
    }

    used += 1
    entries.push({ step, at: new Date().toISOString(), used, limit: effectiveLimit })
    return { status: 'allowed', used, limit: effectiveLimit, step }
  }

  return {
    tryConsume,
    consumePhysicalRetry,
    extend: extendBudget,
    snapshot: () => ({ used, limit, entries: entries.slice() })
  }
}
