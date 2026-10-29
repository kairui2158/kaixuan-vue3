import type { RunTrace } from '../stores/runTrace'

export const RUN_TRACE_EXPORT_SCHEMA_VERSION = 20

export type RunTraceExportRequest =
  | { type: 'export-json'; run: RunTrace; id: string }
  | { type: 'export-text'; run: RunTrace; id: string }

export type RunTraceExportResult =
  | { type: 'export-json-result'; ok: true; run: Record<string, unknown> }
  | { type: 'export-text-result'; ok: true; text: string }
  | { type: 'export-error'; ok: false; error: string }

export type RunTraceExportResponse = RunTraceExportResult & { id: string }

export function maskRunTraceSensitiveText(text: string) {
  return String(text || '')
    .replace(/(Authorization\s*[:=]\s*Bearer\s+)[^\s"'，。]+/gi, '$1***MASKED***')
    .replace(/(api[_-]?key\s*[:=]\s*)[^\s"'，。]+/gi, '$1***MASKED***')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '***MASKED***')
}

export function maskRunTraceSensitiveValue(value: unknown): unknown {
  if (typeof value === 'string') return maskRunTraceSensitiveText(value)
  if (Array.isArray(value)) return value.map(maskRunTraceSensitiveValue)
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      output[key] = maskRunTraceSensitiveValue(item)
    })
    return output
  }
  return value
}

export function createRunTraceExportSnapshot(run: RunTrace): RunTrace {
  if (run.sessionKind !== 'chat' || run.status !== 'running') return run
  if (run.currentTurnId || run.apiCalls.some(call => call.status === 'running')) return run
  const snapshot = JSON.parse(JSON.stringify(run)) as RunTrace
  snapshot.sessionSnapshot = true
  return snapshot
}

export function exportRunTraceToJson(run: RunTrace): Record<string, unknown> {
  const snapshot = createRunTraceExportSnapshot(run)
  const exportable = (run === snapshot ? JSON.parse(JSON.stringify(snapshot)) : snapshot) as Partial<RunTrace>
  delete exportable.currentTurnId
  delete exportable.dirName
  return {
    schemaVersion: RUN_TRACE_EXPORT_SCHEMA_VERSION,
    ...(maskRunTraceSensitiveValue(exportable) as Record<string, unknown>)
  }
}

function formatRunTraceTime(ts?: number) {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function exportRunTraceToText(run: RunTrace): string {
  const snapshot = createRunTraceExportSnapshot(run)
  const lines: string[] = [
    '===== 运行记录 =====',
    `来源：${snapshot.sourceName}`,
    `层级：${snapshot.stepName || '-'}`,
    `模式：${snapshot.mode}`,
    `状态：${snapshot.status}`,
    `开始：${formatRunTraceTime(snapshot.startedAt)}`,
    `结束：${formatRunTraceTime(snapshot.endedAt)}`,
    `耗时：${snapshot.durationMs ?? 0}ms`,
    `项目：${snapshot.projectName || snapshot.projectId || '-'}`,
    `供应商：${snapshot.providerName || snapshot.providerId || '-'}`,
    `模型：${snapshot.model || '-'}`,
    `技能：${snapshot.skillNames.join('、') || '-'}`,
    `技能模式：${snapshot.skillMode || '-'}`,
    snapshot.sessionSnapshot ? '会话快照：导出时会话仍在应用内继续' : '',
    `状态时间线：${(snapshot.stateHistory || []).map(item => `${item.fromStatus || 'initial'} -> ${item.toStatus}${item.reason ? `(${item.reason})` : ''}`).join('；') || '-'}`,
    `超时提示：${snapshot.timeoutHint ? JSON.stringify(snapshot.timeoutHint) : '-'}`,
    '',
    '===== 时间线 ====='
  ]
  snapshot.events.forEach(event => {
    lines.push(`[${formatRunTraceTime(event.ts)}] [${event.level}] ${event.label}`)
    if (event.detail) lines.push(maskRunTraceSensitiveText(event.detail))
  })
  lines.push('', '===== API 调用 =====')
  snapshot.apiCalls.forEach(call => {
    lines.push(
      `--- api-call-${call.seq} ---`,
      `状态：${call.status}`,
      `耗时：${call.durationMs ?? 0}ms`,
      `finish_reason：${call.finishReason || '-'}`,
      `convergence_reason：${call.convergenceReason || '-'}`,
      `技能：${call.skillName || call.skillId || '-'}`,
      `智能体：${call.agentName || call.agentId || '-'}`,
      `供应商：${call.providerName || call.providerId || '-'}`,
      `模型：${call.model || '-'}`,
      `temperature：${call.temperature ?? '-'}`,
      `max_tokens：${call.maxTokens ?? '-'}`,
      '请求消息：'
    )
    call.requestMessages.forEach(message => {
      lines.push(`[${message.role}]`, maskRunTraceSensitiveText(message.content))
    })
    lines.push('响应全文：', maskRunTraceSensitiveText(call.responseText || ''))
    if (call.streamText) lines.push('流式全文：', maskRunTraceSensitiveText(call.streamText))
    if (call.reasoningText) lines.push('思考过程全文：', maskRunTraceSensitiveText(call.reasoningText))
    if (call.usage) lines.push('usage：', JSON.stringify(call.usage, null, 2))
    if (call.physicalCalls?.length) {
      if (call.integrity?.physicalSkipped) {
        lines.push(`物理请求标记：跳过空载荷（${call.integrity.physicalSkipReason || '-'}）`)
      }
      lines.push('物理请求：')
      call.physicalCalls.forEach(physical => {
        lines.push(
          `--- physical-${physical.seq} (${physical.phase}) ---`,
          `状态：${physical.status}`,
          `耗时：${physical.durationMs ?? 0}ms`,
          `finish_reason：${physical.finishReason || '-'}`
        )
        physical.requestMessages.forEach(message => {
          lines.push(`[${message.role}]`, maskRunTraceSensitiveText(message.content))
        })
        lines.push('响应：', maskRunTraceSensitiveText(physical.responseText || ''))
      })
    }
    if (call.toolCalls?.length) {
      lines.push('工具调用：')
      call.toolCalls.forEach(tool => {
        lines.push(
          `--- ${tool.id} ${tool.name} ---`,
          `状态：${tool.status}`,
          `耗时：${tool.durationMs ?? 0}ms`,
          `协议能力：${tool.toolCapability || '-'}`,
          `拒绝分类：${tool.rejectionCategory || '-'}`,
          `错误码：${tool.errorCode || '-'}`,
          '输入：', JSON.stringify(tool.input, null, 2),
          '结果：', JSON.stringify(tool.result, null, 2)
        )
      })
    }
    if (call.error) lines.push('错误原文：', maskRunTraceSensitiveText(call.error))
    if (call.integrity?.physicalMissing) {
      lines.push(`物理请求标记：缺失（${call.integrity.physicalMissingReason || '-'}）`)
    }
  })
  if (snapshot.promptSnapshots?.length) {
    lines.push('', '===== 提示词快照 =====')
    snapshot.promptSnapshots.forEach(promptSnapshot => {
      lines.push(
        `--- ${promptSnapshot.id} ---`,
        `技能：${promptSnapshot.skillName || promptSnapshot.skillId || '-'}`,
        `模式：${promptSnapshot.mode || '-'}`,
        `构建时间：${formatRunTraceTime(promptSnapshot.builtAt)}`
      )
      promptSnapshot.finalMessages.forEach(message => {
        lines.push(`[${message.role}]`, maskRunTraceSensitiveText(message.content))
      })
    })
  }
  if (snapshot.processingReports?.length) {
    lines.push('', '===== 本地处理报告 =====')
    snapshot.processingReports.forEach(report => {
      lines.push(
        `--- ${report.id} ${report.processor} ${report.stage} ---`,
        `状态：${report.status}`,
        `耗时：${report.durationMs ?? 0}ms`
      )
      if (report.ruleHits?.length) {
        lines.push('规则命中：', JSON.stringify(report.ruleHits, null, 2))
      }
      if (report.issues?.length) {
        lines.push('问题：', JSON.stringify(report.issues, null, 2))
      }
    })
  }
  if (snapshot.folderDiagnostics?.length) {
    lines.push('', '===== folder SKILL 诊断 =====')
    snapshot.folderDiagnostics.forEach((item, index) => {
      lines.push(`--- diagnostic-${index + 1} ---`, JSON.stringify(item, null, 2))
    })
  }
  if (snapshot.error) lines.push('', '===== 运行错误 =====', maskRunTraceSensitiveText(snapshot.error))
  return lines.join('\n')
}

export function handleRunTraceExportWorkerMessage(
  event: MessageEvent<RunTraceExportRequest>,
): void {
  const request = event.data
  const respond = (response: RunTraceExportResult): void => {
    ;(self as unknown as Worker).postMessage({ ...response, id: request.id })
  }
  try {
    if (request.type === 'export-json') {
      respond({ type: 'export-json-result', ok: true, run: exportRunTraceToJson(request.run) })
      return
    }
    if (request.type === 'export-text') {
      respond({ type: 'export-text-result', ok: true, text: exportRunTraceToText(request.run) })
    }
  } catch (error) {
    respond({
      type: 'export-error',
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
