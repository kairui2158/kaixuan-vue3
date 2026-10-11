import { describe, expect, it } from 'vitest'
import {
  createToolRunBudget,
  classifyToolBudgetClass,
  type ToolRunBudgetClass,
} from './toolRunBudget'

describe('toolRunBudget', () => {
  it('classifies read, write, and control tools without falling back to a shared pool', () => {
    expect(classifyToolBudgetClass({ name: 'editor.read_range', policy: 'read' })).toBe('read')
    expect(classifyToolBudgetClass({ name: 'editor.write', policy: 'write' })).toBe('write')
    expect(classifyToolBudgetClass({ name: 'agent.plan', policy: 'read' })).toBe('control')
    expect(classifyToolBudgetClass({ name: 'context.remaining', policy: 'read' })).toBe('control')
    expect(classifyToolBudgetClass({ name: 'unknown.tool', policy: 'read' })).toBe('read')
  })

  it('keeps reserved write capacity executable after read amplification exhausts reads', () => {
    const budget = createToolRunBudget({
      maxPhysicalRequests: 8,
      maxReadToolCalls: 3,
      reservedWriteToolCalls: 2,
      plannedWriteCount: 2,
    })

    for (let index = 0; index < 3; index += 1) {
      expect(budget.canStartToolCall('read')).toBe(true)
      expect(budget.recordToolCall('read')).toBe(true)
    }
    expect(budget.canStartToolCall('read')).toBe(false)

    expect(budget.canStartToolCall('write')).toBe(true)
    expect(budget.recordToolCall('write')).toBe(true)
    expect(budget.canStartToolCall('write')).toBe(true)
    expect(budget.recordToolCall('write')).toBe(true)

    expect(budget.snapshot()).toMatchObject({
      physicalRequests: 0,
      readToolCalls: 3,
      writeToolCalls: 2,
      exhaustedClasses: ['read', 'write'],
    })
  })

  it('keeps discussion and analyze runs entirely out of write capacity', () => {
    const budget = createToolRunBudget({
      maxPhysicalRequests: 8,
      maxReadToolCalls: 8,
      plannedWriteCount: 0,
      operation: 'discussion',
    })

    for (let index = 0; index < 8; index += 1) {
      expect(budget.recordToolCall('read')).toBe(true)
    }
    expect(budget.snapshot()).toMatchObject({
      writeToolCalls: 0,
      reservedWriteToolCalls: 0,
      plannedWriteCount: 0,
      exhaustedClasses: ['read'],
    })
  })

  it('never reports write exhaustion when no write capacity was reserved', () => {
    const budget = createToolRunBudget({
      maxPhysicalRequests: 8,
      maxReadToolCalls: 8,
      plannedWriteCount: 0,
      operation: 'discussion',
    })

    expect(budget.canStartToolCall('write')).toBe(false)
    expect(budget.recordToolCall('write')).toBe(false)
    expect(budget.snapshot().exhaustedClasses).toEqual([])
  })

  it('reports exhausted classes without letting control calls consume write capacity', () => {
    const budget = createToolRunBudget({
      maxPhysicalRequests: 2,
      maxReadToolCalls: 1,
      reservedWriteToolCalls: 1,
      plannedWriteCount: 1,
    })
    budget.recordPhysicalRequest()
    budget.recordToolCall('control')
    budget.recordToolCall('read')
    budget.recordToolCall('write')

    expect(budget.snapshot().exhaustedClasses).toEqual(['read', 'write'])
    expect(budget.snapshot().controlToolCalls).toBe(1)
  })

  it('keeps single-pass prose output outside the model tool budget', () => {
    const budget = createToolRunBudget({
      plan: {
        mode: 'single-pass' as const,
        operation: 'restructure' as const,
        segments: [],
      },
    })
    const snapshot = budget.snapshot()

    expect(snapshot.plannedWriteCount).toBe(0)
    expect(snapshot.reservedWriteToolCalls).toBe(0)
    expect(snapshot.maxReadToolCalls).toBe(0)
    expect(snapshot.maxPhysicalRequests).toBe(4)
    expect(budget.canStartToolCall('read')).toBe(false)
    expect(budget.canStartToolCall('write')).toBe(false)
    expect(budget.canStartToolCall('read')).toBe(false)
    expect(snapshot.maxPhysicalRequests).toBeLessThanOrEqual(4)
    expect(snapshot.exhaustedClasses).toEqual([])
  })

  it('derives a class-separated safety net from an EditTask plan without read amplification', () => {
    const plan = {
      mode: 'edit-task' as const,
      operation: 'normalize' as const,
      segments: Array.from({ length: 12 }, (_, index) => ({
        segmentId: `segment-${index + 1}`,
        range: { startLine: 0, endLine: 100 },
        readStrategy: 'slice' as const,
        writeStrategy: 'replace_match' as const,
        expectedChange: 'normalize' as const,
        commandLimit: 10,
      })),
    }
    const budget = createToolRunBudget({ plan })
    const snapshot = budget.snapshot()

    expect(snapshot.plannedWriteCount).toBe(12)
    expect(snapshot.reservedWriteToolCalls).toBeGreaterThanOrEqual(12)
    expect(snapshot.maxReadToolCalls).toBe(24)
    expect(snapshot.maxPhysicalRequests).toBe(36)
    expect(snapshot.exhaustedClasses).toEqual([])
  })

  it('uses legacy scenario defaults only for plans that have no classified execution contract', () => {
    const budget = createToolRunBudget({
      maxPhysicalRequests: 12,
      maxReadToolCalls: 12,
      reservedWriteToolCalls: 12,
      plannedWriteCount: 0,
      operation: 'targeted_edit',
    })

    expect(budget.canStartToolCall('write')).toBe(true)
    expect(budget.recordToolCall('write')).toBe(true)
    expect(budget.snapshot().plannedWriteCount).toBe(0)
  })

  it('allows direct read requests to start while reserved write tool calls remain untouched', () => {
    const budget = createToolRunBudget({
      maxPhysicalRequests: 12,
      maxReadToolCalls: 12,
      reservedWriteToolCalls: 12,
      plannedWriteCount: 0,
      operation: 'targeted_edit',
    })

    for (let index = 0; index < 11; index += 1) {
      expect(budget.canStartPhysicalRequest('read')).toBe(true)
      budget.recordPhysicalRequest()
    }

    expect(budget.canStartPhysicalRequest('read')).toBe(true)
    budget.recordPhysicalRequest()
    expect(budget.canStartPhysicalRequest('read')).toBe(false)
    expect(budget.snapshot()).toMatchObject({
      physicalRequests: 12,
      writeToolCalls: 0,
      reservedWriteToolCalls: 12,
    })
  })
})
