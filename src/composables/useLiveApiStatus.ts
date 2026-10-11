import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef } from 'vue'

export type LiveApiStatusKind = 'connecting' | 'streaming' | 'retrying' | 'terminal' | 'silent'

export interface LiveApiStatusLine {
  kind: LiveApiStatusKind
  text: string
}

import type { RunTraceStatus } from '../stores/runTrace'

export interface LiveApiExecutionSettlement {
  phase: 'locating' | 'planning' | 'writing' | 'settling'
  readToolCalls: number
  maxReadToolCalls: number
  writeToolCalls: number
  reservedWriteToolCalls: number
  successfulWriteCount: number
  trustedCoverageCount: number
  planComplete: boolean
}

export interface LiveApiStatusInput {
  active: boolean
  message: string
  latestCall?: {
    status: RunTraceStatus
    streamLength: number
    lastStreamActivityAt?: number
    lastExecutionActivityAt?: number
    lastToolArgumentProgressAt?: number
    lastToolArgumentProgress?: { toolCallCount: number; argumentCharacters: number } | null
    retrying: boolean
    executionSettlement?: LiveApiExecutionSettlement | null
  } | null
}

const STREAM_MIN_LENGTH = 1
const STREAM_ACTIVE_WINDOW_MS = 8000

const PHASE_TEXT: Record<LiveApiExecutionSettlement['phase'], string> = {
  locating: '定位阶段',
  planning: '规划阶段',
  writing: '写入阶段',
  settling: '结算阶段',
}

function buildExecutionStatusLine(settlement: LiveApiExecutionSettlement): string {
  const phase = PHASE_TEXT[settlement.phase] || settlement.phase
  const read = `读取 ${settlement.readToolCalls}/${settlement.maxReadToolCalls}`
  const write = `写入容量 ${settlement.writeToolCalls}/${settlement.reservedWriteToolCalls}`
  const writes = `已成功写入 ${settlement.successfulWriteCount} 次`
  const coverage = settlement.planComplete
    ? '计划已完成'
    : `已确认覆盖 ${settlement.trustedCoverageCount} 项`
  return `执行状态 · ${phase} · ${read} · ${write} · ${writes} · ${coverage}`
}

/**
 * UI-only live status view. Tool identities and tool events intentionally
 * stay out of this surface; the run trace panel owns that information.
 */
export function buildLiveApiStatusLines(input: LiveApiStatusInput, now = Date.now()): LiveApiStatusLine[] {
  if (!input.active) {
    return input.message ? [{ kind: 'terminal', text: input.message }] : []
  }

  const lines: LiveApiStatusLine[] = []
  const call = input.latestCall
  if (input.message) lines.push({ kind: call?.retrying ? 'retrying' : 'connecting', text: input.message })
  else lines.push({ kind: 'connecting', text: '正在连接 API...' })

  if (call?.status === 'running'
    && call.lastToolArgumentProgress
    && call.lastToolArgumentProgressAt !== undefined
    && now - call.lastToolArgumentProgressAt <= STREAM_ACTIVE_WINDOW_MS) {
    const progress = call.lastToolArgumentProgress
    lines.push({
      kind: 'streaming',
      text: `正在生成工具调用 · ${progress.toolCallCount} 个调用 · 已生成 ${progress.argumentCharacters} 字`,
    })
  }
  if (call?.status === 'running' && call.streamLength >= STREAM_MIN_LENGTH) {
    const streamActive = call.lastStreamActivityAt === undefined
      || now - call.lastStreamActivityAt <= STREAM_ACTIVE_WINDOW_MS
    if (streamActive) {
      lines.push({ kind: 'streaming', text: `流式接收中 · 已接收 ${call.streamLength} 字` })
    } else if (call.lastExecutionActivityAt !== undefined) {
      lines.push({ kind: 'connecting', text: '正在执行编辑任务，等待正文输出…' })
    } else {
      lines.push({ kind: 'connecting', text: '等待模型输出正文…' })
    }
  }
  if (call?.status === 'running' && call.executionSettlement) {
    lines.push({ kind: 'connecting', text: buildExecutionStatusLine(call.executionSettlement) })
  }
  return lines
}

export function useLiveApiStatus(source: ComputedRef<LiveApiStatusInput>): ComputedRef<LiveApiStatusLine[]> {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null
  if (getCurrentScope()) {
    timer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
    onScopeDispose(() => {
      if (timer) clearInterval(timer)
    })
  }
  return computed(() => buildLiveApiStatusLines(source.value, now.value))
}
