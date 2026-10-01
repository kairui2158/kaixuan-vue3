import { describe, expect, it } from 'vitest'
import { describeRoutingDiagEvent } from './routingDiagBridge'

describe('describeRoutingDiagEvent', () => {
  it('describes routing start with request text payload', () => {
    expect(describeRoutingDiagEvent({ type: 'routing_started', requestText: '帮我改第三段' })).toEqual({
      level: 'info',
      category: 'routing/started',
      message: '开始意图路由',
      payload: { requestText: '帮我改第三段' },
    })
  })

  it('describes matched routing result as info with decision fields', () => {
    const event = describeRoutingDiagEvent({
      type: 'routing_result',
      result: { kind: 'matched', intent: 'edit', confidence: 0.92, reason: 'edit-phrase' } as any,
    })
    expect(event.level).toBe('info')
    expect(event.category).toBe('routing/result')
    expect(event.message).toBe('意图路由结果：matched')
    expect(event.payload).toMatchObject({ kind: 'matched', intent: 'edit', confidence: 0.92, reason: 'edit-phrase' })
  })

  it('describes unmatched routing result as warn with fallback mode', () => {
    const event = describeRoutingDiagEvent({
      type: 'routing_result',
      result: { kind: 'no_match', confidence: 0.2, reason: 'low-confidence', fallbackMode: 'await-user' } as any,
    })
    expect(event.level).toBe('warn')
    expect(event.payload).toMatchObject({ kind: 'no_match', fallbackMode: 'await-user' })
  })

  it('describes routing diagnostics with decision layer', () => {
    const event = describeRoutingDiagEvent({
      type: 'routing_diagnostics',
      diagnostics: { router: { decisionLayer: 'semantic' } } as any,
    })
    expect(event.category).toBe('routing/diagnostics')
    expect(event.message).toBe('意图路由诊断：semantic')
    expect(event.payload).toEqual({ router: { decisionLayer: 'semantic' } })
  })

  it('describes fallback request as warn', () => {
    const event = describeRoutingDiagEvent({
      type: 'fallback_requested',
      result: { kind: 'ambiguous', fallbackMode: 'await-user' } as any,
    })
    expect(event.level).toBe('warn')
    expect(event.category).toBe('routing/fallback-requested')
    expect(event.payload).toMatchObject({ kind: 'ambiguous' })
  })

  it('marks repeated chain handoff payloads as warn', () => {
    const artifact = { sourceSkillId: 'S2', repeatedHashCount: 2 } as any
    expect(describeRoutingDiagEvent({ type: 'chain_handoff', artifact }).level).toBe('warn')
    expect(describeRoutingDiagEvent({ type: 'chain_handoff', artifact: { sourceSkillId: 'S3', repeatedHashCount: 0 } as any }).level).toBe('info')
  })

  it('describes skipped skill and exhausted budget', () => {
    expect(describeRoutingDiagEvent({ type: 'skill_skipped', skillIndex: 1, skillId: 'S1', reason: 'intent-filter' }).category).toBe('routing/skill-skipped')
    expect(describeRoutingDiagEvent({ type: 'budget_exhausted', step: 'S2', budget: { used: 8, limit: 8 } })).toEqual({
      level: 'warn',
      category: 'routing/budget-exhausted',
      message: 'API 调用预算已用尽',
      payload: { step: 'S2', used: 8, limit: 8 },
    })
  })

  it('marks non-completed run states as warn', () => {
    expect(describeRoutingDiagEvent({ type: 'run_completed', state: 'completed' }).level).toBe('info')
    expect(describeRoutingDiagEvent({ type: 'run_completed', state: 'failed' }).level).toBe('warn')
  })
})
