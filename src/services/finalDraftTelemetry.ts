export type FinalDraftStreamStatus = 'streaming_active' | 'streaming_slow' | 'stalled'

export interface FinalDraftStreamSample {
  at: number
  chars: number
}

export interface FinalDraftThroughputSnapshot {
  tenSecondCharsPerSecond: number
  sixtySecondCharsPerSecond: number
  status: FinalDraftStreamStatus
  estimatedRemainingMs: number | null
}

export interface FinalDraftThroughputOptions {
  now?: () => number
  slowCharsPerSecond?: number
  stalledAfterMs?: number
  stalledAfterSlowMs?: number
}

function readTestStalledAfterMs(): number | undefined {
  if (typeof window === 'undefined') return undefined
  const overrides = (window as unknown as { __SHENYI_FINAL_DRAFT_TEST_OVERRIDES__?: { stalledAfterMs?: unknown } })
    .__SHENYI_FINAL_DRAFT_TEST_OVERRIDES__
  if (!overrides || typeof overrides !== 'object') return undefined
  const value = Number(overrides.stalledAfterMs)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function readTestStalledAfterSlowMs(): number | undefined {
  if (typeof window === 'undefined') return undefined
  const overrides = (window as unknown as { __SHENYI_FINAL_DRAFT_TEST_OVERRIDES__?: { stalledAfterSlowMs?: unknown } })
    .__SHENYI_FINAL_DRAFT_TEST_OVERRIDES__
  if (!overrides || typeof overrides !== 'object') return undefined
  const value = Number(overrides.stalledAfterSlowMs)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export function createFinalDraftThroughputTracker(options: FinalDraftThroughputOptions = {}) {
  const slowCharsPerSecond = options.slowCharsPerSecond ?? 1
  // Read test overrides at tracker creation, not module import: Electron
  // verification scripts install window overrides after the app has loaded.
  const stalledAfterMs = options.stalledAfterMs ?? readTestStalledAfterMs() ?? 10 * 60_000
  const stalledAfterSlowMs = options.stalledAfterSlowMs ?? readTestStalledAfterSlowMs() ?? 30 * 60_000
  let samples: FinalDraftStreamSample[] = []
  let lastSampleAt: number | null = null
  let slowSinceAt: number | null = null

  return {
    record(sample: FinalDraftStreamSample) {
      lastSampleAt = sample.at
      samples = [...samples, sample]
      const cutoff = sample.at - 60_000
      samples = samples.filter(item => item.at >= cutoff)
    },
    snapshot(input: { at: number; targetChars?: number }): FinalDraftThroughputSnapshot {
      const tenSecond = rollingCharsPerSecond(samples, input.at, 10_000)
      const sixtySecond = rollingCharsPerSecond(samples, input.at, 60_000)
      const idleMs = lastSampleAt === null ? Number.POSITIVE_INFINITY : input.at - lastSampleAt
      const isSlow = sixtySecond > 0 && sixtySecond < slowCharsPerSecond
      if (isSlow) {
        slowSinceAt ??= input.at
      } else {
        slowSinceAt = null
      }
      const slowForTooLong = isSlow
        && slowSinceAt !== null
        && input.at - slowSinceAt >= stalledAfterSlowMs
      const status: FinalDraftStreamStatus = idleMs >= stalledAfterMs || slowForTooLong
        ? 'stalled'
        : isSlow
          ? 'streaming_slow'
          : 'streaming_active'
      const throughputForEstimate = sixtySecond || tenSecond
      const currentChars = samples.at(-1)?.chars ?? 0
      const remainingChars = input.targetChars === undefined
        ? null
        : Math.max(0, input.targetChars - currentChars)
      const estimatedRemainingMs = throughputForEstimate > 0 && remainingChars !== null
        ? Math.round((remainingChars / throughputForEstimate) * 1000)
        : null
      return {
        tenSecondCharsPerSecond: tenSecond,
        sixtySecondCharsPerSecond: sixtySecond,
        status,
        estimatedRemainingMs,
      }
    },
    reset() {
      samples = []
      lastSampleAt = null
      slowSinceAt = null
    },
  }
}

function rollingCharsPerSecond(
  samples: FinalDraftStreamSample[],
  at: number,
  windowMs: number,
): number {
  const cutoff = at - windowMs
  const inWindow = samples.filter(sample => sample.at >= cutoff)
  const first = inWindow[0]
  const last = inWindow.at(-1)
  if (!first || !last || last.chars <= first.chars) return 0
  const elapsedMs = Math.max(1, last.at - first.at)
  return (last.chars - first.chars) / (elapsedMs / 1000)
}
