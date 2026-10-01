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
    supervisor.reportToolError('editor.reveal:invalid_target')
    expect(controller.signal.aborted).toBe(true)
    expect(onStuck).toHaveBeenCalledWith(expect.objectContaining({ reason: 'repeated_tool_error' }))
    supervisor.dispose()
    vi.useRealTimers()
  })

  it('counts parallel failures in one model iteration as a single error round', () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const onStuck = vi.fn()
    const supervisor = createToolRunSupervisor({
      controller,
      idleTimeoutMs: 500,
      hardDeadlineMs: 1_000,
      onStuck,
    })
    supervisor.reportToolError('editor.read_range:invalid_input', 3, 13)
    supervisor.reportToolError('editor.read_range:invalid_input', 3, 13)
    supervisor.reportToolError('editor.read_range:invalid_input', 3, 13)
    expect(controller.signal.aborted).toBe(false)
    expect(onStuck).not.toHaveBeenCalled()
    supervisor.reportToolError('editor.read_range:invalid_input', 3, 14)
    supervisor.reportToolError('editor.read_range:invalid_input', 3, 15)
    supervisor.reportToolError('editor.read_range:invalid_input', 3, 16)
    expect(controller.signal.aborted).toBe(true)
    expect(onStuck).toHaveBeenCalledWith(expect.objectContaining({ reason: 'repeated_tool_error' }))
    supervisor.dispose()
    vi.useRealTimers()
  })

  it('supports explicit long-document runs without the default hard deadline', () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const onStuck = vi.fn()
    const supervisor = createToolRunSupervisor({
      controller,
      idleTimeoutMs: 100,
      hardDeadlineMs: null,
      onStuck,
    })
    for (let elapsed = 0; elapsed < 1_000; elapsed += 80) {
      vi.advanceTimersByTime(80)
      supervisor.reportProgress()
    }
    expect(controller.signal.aborted).toBe(false)
    expect(onStuck).not.toHaveBeenCalledWith(expect.objectContaining({ reason: 'hard_deadline' }))
    supervisor.dispose()
    vi.useRealTimers()
  })

  it('keeps the long-document idle watchdog independent from the disabled hard deadline', () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const onStuck = vi.fn()
    const supervisor = createToolRunSupervisor({
      controller,
      idleTimeoutMs: 100,
      hardDeadlineMs: null,
      onStuck,
    })
    supervisor.reportProgress()
    vi.advanceTimersByTime(101)
    expect(controller.signal.aborted).toBe(true)
    expect(onStuck).toHaveBeenCalledWith(expect.objectContaining({ reason: 'stuck_timeout' }))
    supervisor.dispose()
    vi.useRealTimers()
  })
})
