import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type RunTraceStatus = 'running' | 'success' | 'failed' | 'canceled'
export type RunTraceEventLevel = 'info' | 'warn' | 'error'

export interface RunTraceEvent {
  id: string
  ts: number
  level: RunTraceEventLevel
  type: string
  label: string
  detail?: string
}

export interface RunTraceMessage {
  role: string
  content: string
}

export interface RunTraceApiCall {
  id: string
  seq: number
  step: number
  skillId?: string
  skillName?: string
  agentId?: string
  agentName?: string
  providerId?: string
  providerName?: string
  model?: string
  temperature?: number
  maxTokens?: number
  requestMessages: RunTraceMessage[]
  responseText: string
  streamText: string
  finishReason?: string
  usage?: unknown
  durationMs?: number
  status: RunTraceStatus
  error?: string
  startedAt: number
  endedAt?: number
}

export interface RunTrace {
  id: string
  step: number
  stepName: string
  mode: string
  projectId?: string
  projectName?: string
  providerId?: string
  providerName?: string
  model?: string
  skillNames: string[]
  skillMode?: string
  status: RunTraceStatus
  startedAt: number
  endedAt?: number
  durationMs?: number
  events: RunTraceEvent[]
  apiCalls: RunTraceApiCall[]
  folderDiagnostics?: unknown[]
  resultPreview?: string
  error?: string
}

export interface StartRunInput {
  step: number
  stepName: string
  mode: string
  projectId?: string
  projectName?: string
  providerId?: string
  providerName?: string
  model?: string
  skillNames?: string[]
  skillMode?: string
}

export interface StartApiCallInput {
  step: number
  skillId?: string
  skillName?: string
  agentId?: string
  agentName?: string
  providerId?: string
  providerName?: string
  model?: string
  temperature?: number
  maxTokens?: number
  requestMessages: RunTraceMessage[]
}

export interface FinishApiCallInput {
  status: RunTraceStatus
  responseText?: string
  finishReason?: string
  usage?: unknown
  durationMs?: number
  error?: string
}

export interface RunMetadataInput {
  providerId?: string
  providerName?: string
  model?: string
}

let idSeed = 0
function nextId(prefix: string) {
  idSeed += 1
  return `${prefix}-${Date.now()}-${idSeed}`
}

function formatTime(ts?: number) {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const useRunTraceStore = defineStore('runTrace', () => {
  const runs = ref<RunTrace[]>([])
  const currentRunId = ref<string | null>(null)
  const currentApiCallId = ref<string | null>(null)
  const maxRuns = 20

  const currentRun = computed(() => runs.value.find(run => run.id === currentRunId.value) || null)
  const sortedRuns = computed(() => [...runs.value].sort((a, b) => b.startedAt - a.startedAt))

  function getRun(id: string) {
    return runs.value.find(run => run.id === id) || null
  }

  function abandonRunningRun() {
    if (!currentRunId.value) return
    const run = getRun(currentRunId.value)
    if (!run || run.status !== 'running') return
    run.status = 'failed'
    run.endedAt = Date.now()
    run.durationMs = run.endedAt - run.startedAt
    run.error = '上次运行未正常结束，已自动标记为失败'
    run.events.push({
      id: nextId('event'),
      ts: Date.now(),
      level: 'error',
      type: 'abandoned',
      label: '运行未正常结束',
      detail: run.error
    })
    run.apiCalls.forEach(call => {
      if (call.status === 'running') {
        call.status = 'failed'
        call.endedAt = Date.now()
        call.error = call.error || 'API 调用随运行中断而结束'
      }
    })
  }

  function trimRuns() {
    if (runs.value.length <= maxRuns) return
    const ordered = [...runs.value].sort((a, b) => a.startedAt - b.startedAt)
    const removeCount = runs.value.length - maxRuns
    const removedIds = new Set(ordered.slice(0, removeCount).map(run => run.id))
    runs.value = runs.value.filter(run => !removedIds.has(run.id))
  }

  function startRun(input: StartRunInput) {
    abandonRunningRun()
    const run: RunTrace = {
      id: nextId('run'),
      step: input.step,
      stepName: input.stepName,
      mode: input.mode,
      projectId: input.projectId,
      projectName: input.projectName,
      providerId: input.providerId,
      providerName: input.providerName,
      model: input.model,
      skillNames: input.skillNames?.slice() || [],
      skillMode: input.skillMode,
      status: 'running',
      startedAt: Date.now(),
      events: [],
      apiCalls: []
    }
    runs.value.unshift(run)
    currentRunId.value = run.id
    currentApiCallId.value = null
    addEvent(run.id, {
      type: 'started',
      level: 'info',
      label: `开始${input.stepName}生成`
    })
    trimRuns()
    return run.id
  }

  function addEvent(runId: string, event: Omit<RunTraceEvent, 'id' | 'ts'>) {
    const run = getRun(runId)
    if (!run) return
    run.events.push({ id: nextId('event'), ts: Date.now(), ...event })
  }

  function startApiCall(runId: string, input: StartApiCallInput) {
    const run = getRun(runId)
    if (!run) return ''
    backfillRunMetadata(runId, input)
    const call: RunTraceApiCall = {
      id: nextId('api'),
      seq: run.apiCalls.length + 1,
      step: input.step,
      skillId: input.skillId,
      skillName: input.skillName,
      agentId: input.agentId,
      agentName: input.agentName,
      providerId: input.providerId,
      providerName: input.providerName,
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      requestMessages: input.requestMessages.map(m => ({ role: m.role, content: m.content })),
      responseText: '',
      streamText: '',
      status: 'running',
      startedAt: Date.now()
    }
    run.apiCalls.push(call)
    currentApiCallId.value = call.id
    addEvent(runId, {
      type: 'api-start',
      level: 'info',
      label: `第 ${call.seq} 次 API 调用开始`,
      detail: [input.skillName, input.model].filter(Boolean).join(' / ')
    })
    return call.id
  }

  function backfillRunMetadata(runId: string, input: RunMetadataInput) {
    const run = getRun(runId)
    if (!run) return
    if (input.providerId && !run.providerId) run.providerId = input.providerId
    if (input.providerName && !run.providerName) run.providerName = input.providerName
    if (input.model && !run.model) run.model = input.model
  }

  function appendStream(runId: string, callId: string, text: string) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return
    call.streamText += text
    currentApiCallId.value = call.id
  }

  function setApiCallRequest(runId: string, callId: string, messages: RunTraceMessage[]) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return
    call.requestMessages = messages.map(m => ({ role: m.role, content: m.content }))
  }

  function finishApiCall(runId: string, callId: string, patch: FinishApiCallInput) {
    const call = getRun(runId)?.apiCalls.find(item => item.id === callId)
    if (!call) return
    call.status = patch.status
    call.responseText = patch.responseText ?? call.responseText
    call.finishReason = patch.finishReason ?? call.finishReason
    call.usage = patch.usage ?? call.usage
    call.durationMs = patch.durationMs ?? (Date.now() - call.startedAt)
    call.error = patch.error
    call.endedAt = Date.now()
    if (currentApiCallId.value === call.id) currentApiCallId.value = null
    addEvent(runId, {
      type: `api-${patch.status}`,
      level: patch.status === 'success' ? 'info' : 'error',
      label: `第 ${call.seq} 次 API 调用${patch.status === 'success' ? '完成' : patch.status === 'canceled' ? '取消' : '失败'}`,
      detail: [call.skillName, call.model, patch.error].filter(Boolean).join(' / ')
    })
  }

  function finishRun(runId: string, status: RunTraceStatus, error?: string) {
    const run = getRun(runId)
    if (!run || run.status !== 'running') return
    run.status = status
    run.endedAt = Date.now()
    run.durationMs = run.endedAt - run.startedAt
    run.error = error
    addEvent(runId, {
      type: status === 'success' ? 'finished' : status === 'canceled' ? 'canceled' : 'failed',
      level: status === 'success' ? 'info' : 'error',
      label: status === 'success' ? '运行完成' : status === 'canceled' ? '运行取消' : '运行失败',
      detail: error
    })
    if (currentRunId.value === runId) {
      currentRunId.value = null
      currentApiCallId.value = null
    }
  }

  function setFolderDiagnostics(runId: string, diagnostics: unknown) {
    const run = getRun(runId)
    if (!run) return
    run.folderDiagnostics = Array.isArray(diagnostics) ? diagnostics : [diagnostics]
    addEvent(runId, {
      type: 'folder-diagnostics',
      level: 'info',
      label: '记录 folder SKILL 诊断'
    })
  }

  function appendFolderDiagnostics(runId: string, diagnostics: unknown) {
    const run = getRun(runId)
    if (!run) return
    run.folderDiagnostics = [
      ...(run.folderDiagnostics || []),
      ...(Array.isArray(diagnostics) ? diagnostics : [diagnostics])
    ]
    addEvent(runId, {
      type: 'folder-diagnostics',
      level: 'info',
      label: '记录 folder SKILL 诊断'
    })
  }

  function removeRun(id: string) {
    const index = runs.value.findIndex(run => run.id === id)
    if (index >= 0) runs.value.splice(index, 1)
    if (currentRunId.value === id) {
      currentRunId.value = null
      currentApiCallId.value = null
    }
  }

  function clearRuns() {
    runs.value = []
    currentRunId.value = null
    currentApiCallId.value = null
  }

  function maskSensitive(text: string) {
    return String(text || '')
      .replace(/(Authorization\s*[:=]\s*Bearer\s+)[^\s"'，。]+/gi, '$1***MASKED***')
      .replace(/(api[_-]?key\s*[:=]\s*)[^\s"'，。]+/gi, '$1***MASKED***')
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '***MASKED***')
  }

  function exportRunToText(run: RunTrace) {
    const lines: string[] = [
      '===== 运行记录 =====',
      `层级：${run.stepName}`,
      `模式：${run.mode}`,
      `状态：${run.status}`,
      `开始：${formatTime(run.startedAt)}`,
      `结束：${formatTime(run.endedAt)}`,
      `耗时：${run.durationMs ?? 0}ms`,
      `项目：${run.projectName || run.projectId || '-'}`,
      `供应商：${run.providerName || run.providerId || '-'}`,
      `模型：${run.model || '-'}`,
      `技能：${run.skillNames.join('、') || '-'}`,
      `技能模式：${run.skillMode || '-'}`,
      '',
      '===== 时间线 ====='
    ]
    run.events.forEach(event => {
      lines.push(`[${formatTime(event.ts)}] [${event.level}] ${event.label}`)
      if (event.detail) lines.push(maskSensitive(event.detail))
    })
    lines.push('', '===== API 调用 =====')
    run.apiCalls.forEach(call => {
      lines.push(
        `--- api-call-${call.seq} ---`,
        `状态：${call.status}`,
        `耗时：${call.durationMs ?? 0}ms`,
        `finish_reason：${call.finishReason || '-'}`,
        `技能：${call.skillName || call.skillId || '-'}`,
        `智能体：${call.agentName || call.agentId || '-'}`,
        `供应商：${call.providerName || call.providerId || '-'}`,
        `模型：${call.model || '-'}`,
        `temperature：${call.temperature ?? '-'}`,
        `max_tokens：${call.maxTokens ?? '-'}`,
        '请求消息：'
      )
      call.requestMessages.forEach(message => {
        lines.push(`[${message.role}]`, maskSensitive(message.content))
      })
      lines.push('响应全文：', maskSensitive(call.responseText || ''))
      if (call.streamText) lines.push('流式全文：', maskSensitive(call.streamText))
      if (call.usage) lines.push('usage：', JSON.stringify(call.usage, null, 2))
      if (call.error) lines.push('错误原文：', maskSensitive(call.error))
    })
    if (run.folderDiagnostics?.length) {
      lines.push('', '===== folder SKILL 诊断 =====')
      run.folderDiagnostics.forEach((item, index) => {
        lines.push(`--- diagnostic-${index + 1} ---`, JSON.stringify(item, null, 2))
      })
    }
    if (run.error) lines.push('', '===== 运行错误 =====', maskSensitive(run.error))
    return lines.join('\n')
  }

  function exportRunToJson(run: RunTrace) {
    return maskSensitiveValue(JSON.parse(JSON.stringify(run)))
  }

  function maskSensitiveValue(value: unknown): unknown {
    if (typeof value === 'string') return maskSensitive(value)
    if (Array.isArray(value)) return value.map(maskSensitiveValue)
    if (value && typeof value === 'object') {
      const output: Record<string, unknown> = {}
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
        output[key] = maskSensitiveValue(item)
      })
      return output
    }
    return value
  }

  return {
    runs,
    sortedRuns,
    currentRun,
    currentRunId,
    currentApiCallId,
    maxRuns,
    getRun,
    startRun,
    addEvent,
    startApiCall,
    appendStream,
    setApiCallRequest,
    finishApiCall,
    finishRun,
    setFolderDiagnostics,
    appendFolderDiagnostics,
    removeRun,
    clearRuns,
    maskSensitive,
    exportRunToText,
    exportRunToJson
  }
})
