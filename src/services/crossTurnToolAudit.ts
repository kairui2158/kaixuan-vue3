import { EDITOR_EDIT_PROTOCOL_VERSION } from './editorEditSemantics'

export interface CrossTurnToolAuditEntry {
  toolCallId: string
  toolName: string
  status: 'success' | 'failed'
  policy: 'read' | 'write' | 'unknown'
  inputSummary: string
  resultSummary: string
  errorCode?: string
  protocolVersion?: number
}

export interface CrossTurnToolAudit {
  version: 1
  protocolVersion: number
  entries: CrossTurnToolAuditEntry[]
  orphanToolCallIds: string[]
  truncated: boolean
}

export interface CrossTurnToolAuditInput {
  toolCalls?: Array<{ id?: string; name: string }>
  toolResults?: Array<{
    call: { id?: string; name: string; input?: unknown }
    result: { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } }
  }>
  actualToolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
}

const MAX_ENTRIES = 20
const MAX_SUMMARY_CHARS = 240

function clip(value: unknown, limit: number): string {
  const text = String(value ?? '').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function stableJson(value: unknown): string {
  if (value === undefined) return ''
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? ''
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${
    Object.keys(value as Record<string, unknown>)
      .filter(key => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')
  }}`
}

function summarizeInput(input: unknown): string {
  const text = stableJson(input)
  return clip(text || '(empty input)', MAX_SUMMARY_CHARS)
}

function summarizeResult(result: NonNullable<CrossTurnToolAuditInput['toolResults']>[number]['result']): string {
  if (result?.error) {
    const code = result.error.code ? `${result.error.code}: ` : ''
    return clip(`${code}${result.error.message || '工具执行失败'}`, MAX_SUMMARY_CHARS)
  }
  if (result && typeof result === 'object' && 'data' in result) {
    return clip(result.data === undefined ? 'success' : stableJson(result.data), MAX_SUMMARY_CHARS)
  }
  return 'success'
}

export function buildCrossTurnToolAudit(input: CrossTurnToolAuditInput): CrossTurnToolAudit {
  const results = input.toolResults || []
  const calls = input.toolCalls || []
  const policyByName = new Map((input.actualToolSurface || []).map(item => [item.name, item.policy]))

  const latest = new Map<string, CrossTurnToolAuditEntry>()
  for (const item of results) {
    const callId = item.call.id || `${item.call.name}:${latest.size}`
    const entry: CrossTurnToolAuditEntry = {
      toolCallId: callId,
      toolName: item.call.name,
      status: item.result?.ok === false ? 'failed' : 'success',
      policy: policyByName.get(item.call.name) || 'unknown',
      inputSummary: summarizeInput(item.call.input),
      resultSummary: summarizeResult(item.result),
      ...(item.result?.error?.code ? { errorCode: item.result.error.code } : {}),
      ...(item.call.name === 'editor.write' ? { protocolVersion: EDITOR_EDIT_PROTOCOL_VERSION } : {}),
    }
    latest.set(callId, entry)
  }

  const resultCallIds = new Set(results.map(item => item.call.id).filter(Boolean))
  const orphanToolCallIds = calls
    .filter(call => call.id && !resultCallIds.has(call.id))
    .map(call => call.id as string)

  const entries = [...latest.values()].slice(-MAX_ENTRIES)
  return {
    version: 1,
    protocolVersion: EDITOR_EDIT_PROTOCOL_VERSION,
    entries,
    orphanToolCallIds,
    truncated: latest.size > entries.length,
  }
}

export function hasCrossTurnToolAudit(value: unknown): value is CrossTurnToolAudit {
  if (!value || typeof value !== 'object') return false
  const audit = value as CrossTurnToolAudit
  return audit.version === 1
    && Array.isArray(audit.entries)
    && Array.isArray(audit.orphanToolCallIds)
    && typeof audit.truncated === 'boolean'
    && Number.isFinite(audit.protocolVersion)
}

export function formatCrossTurnToolAudit(audit: CrossTurnToolAudit): string {
  if (!audit.entries.length && !audit.orphanToolCallIds.length) return ''
  const lines = [
    '[上一轮工具审计]',
    `protocolVersion=${audit.protocolVersion}; entries=${audit.entries.length}${audit.truncated ? '(已截断，完整现场见运行记录)' : ''}`,
  ]
  for (const entry of audit.entries) {
    lines.push(
      `${entry.toolCallId} ${entry.toolName} ${entry.status}${entry.errorCode ? `(${entry.errorCode})` : ''}: input=${entry.inputSummary}; result=${entry.resultSummary}`,
    )
  }
  if (audit.orphanToolCallIds.length) {
    lines.push(`orphan_tool_calls=${audit.orphanToolCallIds.join(', ')}（这些调用没有工具结果，不得当作已执行）`)
  }
  lines.push('写入事实以上述终态为准；不要重复提交已成功的 editor.write 批次。')
  return lines.join('\n')
}
