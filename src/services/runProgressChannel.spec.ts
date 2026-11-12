import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PipelineRunRegistry } from './runRegistry'
import { RunProgressChannel } from './runProgressChannel'

describe('RunProgressChannel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects events without runId and records a migration error', () => {
    const registry = new PipelineRunRegistry()
    const onMigrationError = vi.fn()
    const channel = new RunProgressChannel(registry, { onMigrationError })

    const result = channel.emit({ percent: 30, detail: '章节生成中' })

    expect(result).toMatchObject({ status: 'rejected', reason: 'missing_run_id' })
    expect(onMigrationError).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'missing_run_id',
      event: expect.objectContaining({ percent: 30 }),
    }))
  })

  it('writes the first event immediately and merges following events in the window', () => {
    const registry = new PipelineRunRegistry()
    const run = registry.createRun({ layer: 'volumes', target: 'volume-4' })
    const channel = new RunProgressChannel(registry)

    channel.emit({ runId: run.runId, percent: 10, phase: 'requesting', detail: '开始生成' })
    expect(registry.getRun(run.runId)?.progress).toBe(10)

    channel.emit({ runId: run.runId, percent: 20, phase: 'requesting', detail: '流式接收' })
    channel.emit({ runId: run.runId, percent: 30, phase: 'requesting', detail: '契约验收' })
    expect(registry.getRun(run.runId)?.progress).toBe(10)

    vi.advanceTimersByTime(250)
    const stored = registry.getRun(run.runId)
    expect(stored?.progress).toBe(30)
    expect(stored?.progressPhase).toBe('requesting')
    expect(stored?.statusText).toBe('契约验收')
  })

  it('keeps retry attempts and queued reasons visible', () => {
    const registry = new PipelineRunRegistry()
    const run = registry.createRun({ layer: 'body', target: 'chapter-1' })
    const channel = new RunProgressChannel(registry)

    channel.emit({
      runId: run.runId,
      percent: 88,
      phase: 'requesting',
      detail: '修复中（第 2 次）',
      attempt: 2,
    })
    expect(registry.getRun(run.runId)?.progressAttempt).toBe(2)

    const queued = registry.createRun({ layer: 'chapters', target: 'volume-1', status: 'queued' })
    channel.emit({
      runId: queued.runId,
      percent: 0,
      phase: 'queued',
      detail: '等待供应商槽位',
      queuedReason: 'provider-quota',
    })
    expect(registry.getRun(queued.runId)?.queuedReason).toBe('provider-quota')
  })

  it('rejects unknown and terminal runs without reviving progress', () => {
    const registry = new PipelineRunRegistry()
    const run = registry.createRun({ layer: 'volumes', target: 'volume-4' })
    registry.succeed(run.runId)
    const channel = new RunProgressChannel(registry)

    const terminalResult = channel.emit({ runId: run.runId, percent: 40, detail: '迟到进度' })
    const unknownResult = channel.emit({ runId: 'missing', percent: 40, detail: '未知运行' })

    expect(terminalResult).toMatchObject({ status: 'rejected', reason: 'terminal_run' })
    expect(unknownResult).toMatchObject({ status: 'rejected', reason: 'unknown_run' })
    expect(registry.getRun(run.runId)?.progress).toBe(100)
    expect(registry.getRun(run.runId)?.rejectedEvents?.[0]).toMatchObject({
      kind: 'progress',
      reason: 'terminal_run',
    })
  })

  it('does not let one run merge window affect another run', () => {
    const registry = new PipelineRunRegistry()
    const volumes = registry.createRun({ layer: 'volumes', target: 'volume-4' })
    const chapters = registry.createRun({ layer: 'chapters', target: 'volume-1' })
    const channel = new RunProgressChannel(registry)

    channel.emit({ runId: volumes.runId, percent: 10, detail: '卷纲' })
    channel.emit({ runId: chapters.runId, percent: 50, detail: '章节' })
    channel.emit({ runId: volumes.runId, percent: 20, detail: '卷纲继续' })

    expect(registry.getRun(chapters.runId)?.progress).toBe(50)
    vi.advanceTimersByTime(250)
    expect(registry.getRun(volumes.runId)?.progress).toBe(20)
    expect(registry.getRun(chapters.runId)?.progress).toBe(50)
  })

  it('keeps three parallel high-frequency streams bounded and independently merged', () => {
    const registry = new PipelineRunRegistry()
    const runs = [
      registry.createRun({ layer: 'volumes', target: 'volume-1' }),
      registry.createRun({ layer: 'chapters', target: 'volume-2' }),
      registry.createRun({ layer: 'body', target: 'chapter-3' }),
    ]
    const channel = new RunProgressChannel(registry)
    let appliedWrites = 0
    const originalApply = registry.applyProgressEvent.bind(registry)
    vi.spyOn(registry, 'applyProgressEvent').mockImplementation(event => {
      const result = originalApply(event)
      appliedWrites += 1
      return result
    })

    for (let index = 0; index < 300; index += 1) {
      runs.forEach((run, runIndex) => {
        channel.emit({
          runId: run.runId,
          percent: Math.min(100, Math.floor((index + 1) / 3)),
          phase: 'requesting',
          detail: `run-${runIndex + 1}-${index}`
        })
      })
    }
    vi.advanceTimersByTime(250)

    expect(appliedWrites).toBeLessThanOrEqual(runs.length * 2)
    runs.forEach(run => {
      const stored = registry.getRun(run.runId)
      expect(stored?.progress).toBe(100)
      expect(stored?.progressPhase).toBe('requesting')
    })
  })
})
