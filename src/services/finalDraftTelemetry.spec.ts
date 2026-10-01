import { describe, expect, it } from 'vitest'
import {
  createFinalDraftThroughputTracker,
  type FinalDraftStreamSample,
} from './finalDraftTelemetry'

describe('finalDraftTelemetry', () => {
  it('computes rolling throughput over the active and one-minute windows', () => {
    const tracker = createFinalDraftThroughputTracker({ now: () => 0 })
    const samples: FinalDraftStreamSample[] = [
      { at: 0, chars: 0 },
      { at: 5_000, chars: 500 },
      { at: 9_000, chars: 900 },
      { at: 60_000, chars: 1_200 },
    ]
    for (const sample of samples) tracker.record(sample)

    const telemetry = tracker.snapshot({ at: 60_000, targetChars: 10_000 })
    expect(telemetry.tenSecondCharsPerSecond).toBeCloseTo(0, 5)
    expect(telemetry.sixtySecondCharsPerSecond).toBeCloseTo(20, 5)
    expect(telemetry.status).toBe('streaming_active')
  })

  it('classifies slow streaming and stalled streams', () => {
    const tracker = createFinalDraftThroughputTracker({
      now: () => 0,
      slowCharsPerSecond: 2,
      stalledAfterMs: 10 * 60_000,
    })
    tracker.record({ at: 0, chars: 0 })
    tracker.record({ at: 1_000, chars: 1 })
    expect(tracker.snapshot({ at: 10_000 }).status).toBe('streaming_slow')

    expect(tracker.snapshot({ at: 11 * 60_000 }).status).toBe('stalled')
  })

  it('promotes a persistently slow stream to stalled so the recovery actions become available', () => {
    const tracker = createFinalDraftThroughputTracker({
      now: () => 0,
      slowCharsPerSecond: 2,
      stalledAfterMs: 10 * 60_000,
      stalledAfterSlowMs: 30 * 60_000,
    })
    for (let second = 0; second <= 35 * 60; second += 30) {
      tracker.record({ at: second * 1_000, chars: Math.floor(second / 2) })
      tracker.snapshot({ at: second * 1_000 })
    }
    expect(tracker.snapshot({ at: 29 * 60_000 }).status).toBe('streaming_slow')
    expect(tracker.snapshot({ at: 30 * 60_000 + 31_000 }).status).toBe('stalled')
  })

  it('resets the slow-stream promotion window when throughput recovers', () => {
    const tracker = createFinalDraftThroughputTracker({
      now: () => 0,
      slowCharsPerSecond: 2,
      stalledAfterMs: 10 * 60_000,
      stalledAfterSlowMs: 30 * 60_000,
    })
    for (let second = 0; second <= 20 * 60; second += 30) {
      tracker.record({ at: second * 1_000, chars: Math.floor(second / 2) })
    }
    tracker.record({ at: 20 * 60_000 + 1_000, chars: 20 * 60 / 2 + 5_000 })
    expect(tracker.snapshot({ at: 20 * 60_000 + 1_000 }).status).toBe('streaming_active')

    for (let second = 20 * 61; second <= 45 * 60; second += 30) {
      tracker.record({ at: second * 1_000, chars: 20 * 60 / 2 + 5_000 + Math.floor((second - 20 * 61) / 2) })
    }
    expect(tracker.snapshot({ at: 45 * 60_000 }).status).toBe('streaming_slow')
  })

  it('does not promote a slow stream while it stays under the slow-stall threshold', () => {
    const tracker = createFinalDraftThroughputTracker({
      now: () => 0,
      slowCharsPerSecond: 2,
      stalledAfterMs: 10 * 60_000,
      stalledAfterSlowMs: 30 * 60_000,
    })
    for (let second = 0; second < 29 * 60; second += 30) {
      tracker.record({ at: second * 1_000, chars: Math.floor(second / 2) })
      tracker.snapshot({ at: second * 1_000 })
    }
    expect(tracker.snapshot({ at: 29 * 60_000 - 1_000 }).status).toBe('streaming_slow')
  })

  it('keeps the active status when chunks keep arriving', () => {
    const tracker = createFinalDraftThroughputTracker({ now: () => 0 })
    tracker.record({ at: 0, chars: 0 })
    tracker.record({ at: 10_000, chars: 5_000 })
    const telemetry = tracker.snapshot({ at: 10_000, targetChars: 20_000 })
    expect(telemetry.tenSecondCharsPerSecond).toBeCloseTo(500, 5)
    expect(telemetry.status).toBe('streaming_active')
    expect(telemetry.estimatedRemainingMs).toBeCloseTo(30_000, 5)
  })

  it('drops samples older than the one-minute window', () => {
    const tracker = createFinalDraftThroughputTracker({ now: () => 0 })
    tracker.record({ at: 0, chars: 0 })
    tracker.record({ at: 60_000, chars: 6_000 })
    tracker.record({ at: 61_000, chars: 6_000 })

    const telemetry = tracker.snapshot({ at: 61_000 })
    expect(telemetry.sixtySecondCharsPerSecond).toBeCloseTo(0, 5)
  })

  it('reports an unavailable estimate without a positive throughput or target', () => {
    const tracker = createFinalDraftThroughputTracker({ now: () => 0 })
    tracker.record({ at: 0, chars: 0 })
    const noThroughput = tracker.snapshot({ at: 5_000, targetChars: 10_000 })
    expect(noThroughput.estimatedRemainingMs).toBeNull()

    const noTarget = tracker.snapshot({ at: 5_000 })
    expect(noTarget.estimatedRemainingMs).toBeNull()
  })
})
