import type { FinalDraftStreamStatus } from './finalDraftTelemetry'

export interface FinalDraftProgressTelemetry {
  tenSecondCharsPerSecond: number
  sixtySecondCharsPerSecond: number
  throughputStatus: FinalDraftStreamStatus
  estimatedRemainingMs: number | null
}

export function formatFinalDraftProgress(input: {
  action: '生成' | '续生成' | '恢复' | '重试当前段'
  segmentIndex: number
  segments: number
  completedChars: number
  streamingChars: number
  telemetry?: FinalDraftProgressTelemetry
}): string {
  const base = `正在${input.action}终稿：分段 ${input.segmentIndex}/${input.segments} · 已输出 ${
    input.completedChars + input.streamingChars
  } 字 · 本段 ${input.streamingChars} 字`
  const telemetry = input.telemetry
  if (!telemetry) return base
  const parts = [base, `${formatCharsPerSecond(telemetry.tenSecondCharsPerSecond)}字/秒`]
  if (telemetry.throughputStatus === 'stalled') {
    parts.push('流式停滞')
  } else if (telemetry.throughputStatus === 'streaming_slow') {
    parts.push('低速流式')
  }
  if (telemetry.estimatedRemainingMs !== null) {
    parts.push(`预计剩余 ${formatDuration(telemetry.estimatedRemainingMs)}`)
  }
  return parts.join(' · ')
}

function formatCharsPerSecond(value: number): string {
  if (value >= 100) return String(Math.round(value))
  if (value >= 10) return value.toFixed(1)
  return value.toFixed(2).replace(/0$/, '')
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}秒`
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}小时${remainder}分钟` : `${hours}小时`
}
