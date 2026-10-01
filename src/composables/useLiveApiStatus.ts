import { computed, type ComputedRef } from 'vue'

export type LiveApiStatusKind = 'connecting' | 'streaming' | 'retrying' | 'terminal' | 'silent'

export interface LiveApiStatusLine {
  kind: LiveApiStatusKind
  text: string
}

import type { RunTraceStatus } from '../stores/runTrace'

export interface LiveApiStatusInput {
  active: boolean
  message: string
  latestCall?: {
    status: RunTraceStatus
    streamLength: number
    retrying: boolean
  } | null
}

const STREAM_MIN_LENGTH = 1

/**
 * UI-only live status view. Tool identities and tool events intentionally
 * stay out of this surface; the run trace panel owns that information.
 */
export function buildLiveApiStatusLines(input: LiveApiStatusInput): LiveApiStatusLine[] {
  if (!input.active) {
    return input.message ? [{ kind: 'terminal', text: input.message }] : []
  }

  const lines: LiveApiStatusLine[] = []
  const call = input.latestCall
  if (input.message) lines.push({ kind: call?.retrying ? 'retrying' : 'connecting', text: input.message })
  else lines.push({ kind: 'connecting', text: '正在连接 API...' })

  if (call?.status === 'running' && call.streamLength >= STREAM_MIN_LENGTH) {
    lines.push({ kind: 'streaming', text: `流式接收中 · 已接收 ${call.streamLength} 字` })
  }
  return lines
}

export function useLiveApiStatus(source: ComputedRef<LiveApiStatusInput>): ComputedRef<LiveApiStatusLine[]> {
  return computed(() => buildLiveApiStatusLines(source.value))
}
