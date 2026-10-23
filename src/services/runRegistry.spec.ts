import { describe, expect, it } from 'vitest'
import { PipelineRunRegistry, PIPELINE_RUN_STATUSES } from './runRegistry'

describe('PipelineRunRegistry', () => {
  it('exposes an explicit terminal-capable status set', () => {
    expect(PIPELINE_RUN_STATUSES).toEqual([
      'queued',
      'running',
      'succeeded',
      'failed',
      'canceled',
    ])
  })

  it('keeps concurrent runs isolated and cancelable independently', () => {
    const registry = new PipelineRunRegistry()
    const volumes = registry.createRun({ layer: 'volumes', target: 'volume-4' })
    const chapters = registry.createRun({ layer: 'chapters', target: 'volume-1' })
    const body = registry.createRun({ layer: 'body', target: 'chapter-1' })

    registry.updateProgress(volumes.runId, 20, '卷纲生成中')
    registry.updateProgress(chapters.runId, 40, '章节生成中')

    expect(registry.cancel(chapters.runId)).toBe(true)
    expect(registry.getRun(chapters.runId)?.status).toBe('canceled')
    expect(registry.getRun(volumes.runId)?.status).toBe('running')
    expect(registry.getRun(body.runId)?.status).toBe('running')
    expect(registry.getRun(volumes.runId)?.progress).toBe(20)
    expect(registry.getRun(volumes.runId)?.controller.signal.aborted).toBe(false)
    expect(registry.getRun(chapters.runId)?.controller.signal.aborted).toBe(true)
  })

  it('rejects progress and terminal transitions after a terminal state', () => {
    const registry = new PipelineRunRegistry()
    const run = registry.createRun()

    expect(registry.succeed(run.runId)).toBe(true)
    expect(registry.updateProgress(run.runId, 80, 'must not revive')).toBe(false)
    expect(registry.fail(run.runId, 'late failure')).toBe(false)
    expect(registry.cancel(run.runId)).toBe(false)
    expect(registry.succeed(run.runId)).toBe(false)

    const stored = registry.getRun(run.runId)
    expect(stored?.status).toBe('succeeded')
    expect(stored?.progress).toBe(100)
    expect(stored?.error).toBeUndefined()
  })

  it('rejects post-cancel progress and terminal events', () => {
    const registry = new PipelineRunRegistry()
    const run = registry.createRun()

    expect(registry.cancel(run.runId)).toBe(true)
    expect(registry.updateProgress(run.runId, 30)).toBe(false)
    expect(registry.fail(run.runId, 'save failed after cancel')).toBe(false)

    const stored = registry.getRun(run.runId)
    expect(stored?.status).toBe('canceled')
    expect(stored?.progress).toBe(0)
    expect(stored?.error).toBeUndefined()
  })

  it('cancels queued runs and prevents late activation', () => {
    const registry = new PipelineRunRegistry()
    const running = registry.createRun({ layer: 'chapters', target: 'volume-1' })
    const queued = registry.createRun({
      layer: 'chapters',
      target: 'volume-1',
      status: 'queued',
      queuedReason: '同一目标已有正在运行的章节任务',
    })

    expect(registry.cancel(queued.runId)).toBe(true)

    const stored = registry.getRun(queued.runId)
    expect(stored?.status).toBe('canceled')
    expect(stored?.progressPhase).toBe('terminal')
    expect(stored?.endedAt).toBeDefined()
    expect(stored?.controller.signal.aborted).toBe(true)

    expect(registry.activateQueuedRuns('chapters', 'volume-1')).toEqual([])
    expect(registry.getRun(running.runId)?.status).toBe('running')
  })

  it('rejects unknown run ids without throwing', () => {
    const registry = new PipelineRunRegistry()

    expect(registry.getRun('missing')).toBeUndefined()
    expect(registry.updateProgress('missing', 10)).toBe(false)
    expect(registry.succeed('missing')).toBe(false)
    expect(registry.fail('missing', 'error')).toBe(false)
    expect(registry.cancel('missing')).toBe(false)
  })

  it('freezes config snapshots at run creation', () => {
    const registry = new PipelineRunRegistry()
    const config = { agents: { 2: 'volume-agent' } }
    const run = registry.createRun({ configSnapshot: config })
    config.agents[2] = 'mutated-after-start'

    expect(run.configSnapshot).toEqual({ agents: { 2: 'volume-agent' } })
  })
})
