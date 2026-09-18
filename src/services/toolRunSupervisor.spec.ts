import { describe, expect, it, vi } from 'vitest'
import { createToolRunSupervisor } from './toolRunSupervisor'

describe('createToolRunSupervisor', () => {
  it('aborts the controller when the idle timeout expires', () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const onStuck = vi.fn()
    createToolRunSupervisor({
      controller,
      idleTimeoutMs: 100,
      hardDeadlineMs: 1_000,
      onStuck,
    })
    vi.advanceTimersByTime(101)
    expect(controller.signal.aborted).toBe(true)
    expect(onStuck).toHaveBeenCalledWith(expect.objectContaining({ reason: 'stuck_timeout' }))
    vi.useRealTimers()
  })

  it('keeps waiting while progress resets the idle clock', () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const onStuck = vi.fn()
    const supervisor = createToolRunSupervisor({
      controller,
      idleTimeoutMs: 100,
      hardDeadlineMs: 500,
      onStuck,
    })
    vi.advanceTimersByTime(80)
    supervisor.reportProgress()
    vi.advanceTimersByTime(80)
    expect(controller.signal.aborted).toBe(false)
    expect(onStuck).not.toHaveBeenCalled()
    supervisor.dispose()
    vi.useRealTimers()
  })

  it('enforces the hard deadline even when progress continues', () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const onStuck = vi.fn()
    const supervisor = createToolRunSupervisor({
      controller,
      idleTimeoutMs: 50,
      hardDeadlineMs: 200,
      onStuck,
    })
    for (let elapsed = 0; elapsed < 200; elapsed += 40) {
      vi.advanceTimersByTime(40)
      supervisor.reportProgress()
    }
    expect(controller.signal.aborted).toBe(true)
    expect(onStuck).toHaveBeenCalledWith(expect.objectContaining({ reason: 'hard_deadline' }))
    supervisor.dispose()
    vi.useRealTimers()
  })

  it('stops repeated same-key tool errors', () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const onStuck = vi.fn()
    const supervisor = createToolRunSupervisor({
      controller,
      idleTimeoutMs: 500,
      hardDeadlineMs: 1_000,
      onStuck,
    })
    supervisor.reportToolError('editor.reveal:invalid_target')
    supervisor.reportToolError('editor.reveal:invalid_target')
    supervisor.reportToolError('editor.reveal:invalid_target')
    expect(controller.signal.aborted).toBe(true)
    expect(onStuck).toHaveBeenCalledWith(expect.objectContaining({ reason: 'repeated_tool_error' }))
    supervisor.dispose()
    vi.useRealTimers()
  })
})
