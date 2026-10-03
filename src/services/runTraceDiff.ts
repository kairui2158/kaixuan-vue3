import type {
  RunTrace,
  RunTraceApiCall,
  RunTraceEvent,
  RunTracePhysicalCall,
  RunTracePromptSnapshot,
  RunTraceProcessingReport,
  RunTraceToolCall
} from '../stores/runTrace'
import { lcsDiff } from './diff-utils'

export const RUN_TRACE_DIFF_SCHEMA_VERSION = 1
const DIFF_LINE_LIMIT = 30000
const DIFF_CELL_LIMIT = 4000000

export type DiffSide = 'A' | 'B'

export interface TextDiffStats {
  aLines: number
  bLines: number
  unchanged: number
  added: number
  removed: number
  aChars: number
  bChars: number
}

export interface TextDiff {
  same: boolean
  mode: 'lines' | 'stats'
  stats: TextDiffStats
  changes?: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }>
  reason?: string
}

export interface FieldDiff {
  key: string
  a: unknown
  b: unknown
  changed: boolean
}

export interface PairedItem<T> {
  key: string
  rule: string
  a: T | null
  b: T | null
  onlyIn?: DiffSide
}

export interface ApiCallDiff extends PairedItem<RunTraceApiCall> {
  fields: FieldDiff[]
  requestDiffs: Array<{ role: string; diff: TextDiff }>
  responseDiff: TextDiff
  streamDiff: TextDiff
  reasoningDiff: TextDiff
}

export interface PromptSnapshotDiff extends PairedItem<RunTracePromptSnapshot> {
  fields: FieldDiff[]
  variableDiff: TextDiff
  contextDiff: TextDiff
  fingerprintDiff: TextDiff
  systemDiff: TextDiff
  userDiff: TextDiff
}

export interface PhysicalCallDiff extends PairedItem<RunTracePhysicalCall> {
  fields: FieldDiff[]
  requestDiff: TextDiff
  responseDiff: TextDiff
}

export interface ToolCallDiff extends PairedItem<RunTraceToolCall> {
  fields: FieldDiff[]
  inputDiff: TextDiff
  resultDiff: TextDiff
}

export interface ProcessingReportDiff extends PairedItem<RunTraceProcessingReport> {
  fields: FieldDiff[]
  ruleHitsDiff: TextDiff
  issuesDiff: TextDiff
}

export interface TemplateVersionEntry {
  key: string
  skillId?: string
  skillName?: string
  aVersion?: string
  bVersion?: string
  aFingerprint?: string
  bFingerprint?: string
  changed: boolean
}

export interface ToolSequenceStep {
  index: number
  apiSeqA?: number
  apiSeqB?: number
  nameA?: string
  nameB?: string
  statusA?: string
  statusB?: string
  changed: boolean
  onlyIn?: DiffSide
}

export interface ToolSequenceDiff {
  steps: ToolSequenceStep[]
  firstDivergence?: ToolSequenceStep
}

export interface SkillDebugSummary {
  templateVersionChanged: number
  toolSequenceChanged: boolean
  firstDifferentApiCall?: {
    index: number
    seqA?: number
    seqB?: number
    idA?: string
    idB?: string
    reason: string
  }
}

export interface RunTraceDiffResult {
  schema: 'shenyi.run-trace-diff'
  schemaVersion: number
  generatedAt: number
  runs: {
    a: RunTrace
    b: RunTrace
  }
  warnings: string[]
  overview: FieldDiff[]
  apiCalls: ApiCallDiff[]
  promptSnapshots: PromptSnapshotDiff[]
  physicalCalls: PhysicalCallDiff[]
  toolCalls: ToolCallDiff[]
  toolSurfaces: Array<{
    name: string
    policyA?: string
    policyB?: string
    onlyIn?: DiffSide
  }>
  actualToolSurfaces: Array<{
    name: string
    policyA?: string
    policyB?: string
    onlyIn?: DiffSide
  }>
  processingReports: ProcessingReportDiff[]
  templateVersions: TemplateVersionEntry[]
  toolSequence: ToolSequenceDiff
  skillDebugSummary: SkillDebugSummary
  folderDiagnostics: Array<{ index: number; onlyIn?: DiffSide; diff: TextDiff }>
  events: {
    pairs: PairedItem<RunTraceEvent>[]
    countDiffs: Array<{ type: string; countA: number; countB: number }>
  }
  stateHistory: {
    a: RunTrace['stateHistory']
    b: RunTrace['stateHistory']
    firstDivergence?: { index: number; reason: string }
  }
}

function countLines(value: string) {
  if (!value) return 0
  return value.split('\n').length
}

export function buildTextDiff(a?: string, b?: string): TextDiff {
  const textA = a ?? ''
  const textB = b ?? ''
  const aLines = textA.split('\n')
  const bLines = textB.split('\n')
  if (textA === textB) {
    return {
      same: true,
      mode: 'lines',
      stats: {
        aLines: aLines.length,
        bLines: bLines.length,
        unchanged: aLines.length,
        added: 0,
        removed: 0,
        aChars: textA.length,
        bChars: textB.length
      },
      changes: aLines.map(text => ({ type: 'unchanged' as const, text }))
    }
  }

  if (
    aLines.length > DIFF_LINE_LIMIT
    || bLines.length > DIFF_LINE_LIMIT
    || aLines.length * bLines.length > DIFF_CELL_LIMIT
  ) {
    const countsA = new Map<string, number>()
    const countsB = new Map<string, number>()
    aLines.forEach(line => countsA.set(line, (countsA.get(line) || 0) + 1))
    bLines.forEach(line => countsB.set(line, (countsB.get(line) || 0) + 1))
    let unchanged = 0
    countsA.forEach((count, line) => {
      unchanged += Math.min(count, countsB.get(line) || 0)
    })
    return {
      same: false,
      mode: 'stats',
      stats: {
        aLines: aLines.length,
        bLines: bLines.length,
        unchanged,
        added: Math.max(0, bLines.length - unchanged),
        removed: Math.max(0, aLines.length - unchanged),
        aChars: textA.length,
        bChars: textB.length
      },
      reason: '文本规模超过行级 diff 安全线，已进入统计模式；导出仍包含双方全文。'
    }
  }

  const changes = lcsDiff(textA, textB)
  const stats = {
    aLines: aLines.length,
    bLines: bLines.length,
    unchanged: changes.filter(item => item.type === 'unchanged').length,
    added: changes.filter(item => item.type === 'added').length,
    removed: changes.filter(item => item.type === 'removed').length,
    aChars: textA.length,
    bChars: textB.length
  }
  return { same: false, mode: 'lines', stats, changes }
}

function fieldDiff(key: string, a: unknown, b: unknown): FieldDiff {
  return {
    key,
    a,
    b,
    changed: !valuesEqual(a, b)
  }
}

function valuesEqual(a: unknown, b: unknown) {
  if (a === b) return true
  if (a === undefined && b === undefined) return true
  if (a === null && b === null) return true
  if (typeof a !== typeof b) return false
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(normalizeUndefined(a)) === JSON.stringify(normalizeUndefined(b))
  }
  return false
}

function normalizeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeUndefined)
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      output[key] = normalizeUndefined(item)
    })
    return output
  }
  return value === undefined ? null : value
}

function apiCallAlignmentKey(call: RunTraceApiCall, level: number) {
  switch (level) {
    case 1:
      return [call.turnId, call.step, call.skillId, call.seq].join('|')
    case 2:
      return [call.turnId, call.skillId, call.seq].join('|')
    case 3:
      return [call.turnId, call.seq].join('|')
    default:
      return String(call.seq)
  }
}

function alignApiCalls(a: RunTraceApiCall[], b: RunTraceApiCall[]): PairedItem<RunTraceApiCall>[] {
  const pairs: PairedItem<RunTraceApiCall>[] = []
  const usedA = new Set<string>()
  const usedB = new Set<string>()
  for (let level = 1; level <= 4; level++) {
    const mapB = new Map<string, RunTraceApiCall[]>()
    b.forEach(call => {
      if (usedB.has(call.id)) return
      const key = apiCallAlignmentKey(call, level)
      mapB.set(key, [...(mapB.get(key) || []), call])
    })
    a.forEach(callA => {
      if (usedA.has(callA.id)) return
      const candidates = mapB.get(apiCallAlignmentKey(callA, level)) || []
      const callB = candidates.shift()
      if (!callB || usedB.has(callB.id)) return
      const ambiguous = candidates.length > 0
      usedA.add(callA.id)
      usedB.add(callB.id)
      pairs.push({
        key: `${apiCallAlignmentKey(callA, level)}|${callA.id}|${callB.id}`,
        rule: ambiguous ? `规则 ${level}（存在歧义候选，按 seq 拆分）` : `规则 ${level}`,
        a: callA,
        b: callB
      })
    })
  }
  a.filter(call => !usedA.has(call.id)).forEach(call => {
    pairs.push({ key: call.id, rule: '未匹配', a: call, b: null, onlyIn: 'A' })
  })
  b.filter(call => !usedB.has(call.id)).forEach(call => {
    pairs.push({ key: call.id, rule: '未匹配', a: null, b: call, onlyIn: 'B' })
  })
  return pairs.sort((x, y) => {
    const seqX = x.a?.seq ?? x.b?.seq ?? 0
    const seqY = y.a?.seq ?? y.b?.seq ?? 0
    return seqX - seqY
  })
}

function requestDiffs(a?: RunTraceApiCall | null, b?: RunTraceApiCall | null) {
  const roles = [...new Set([...(a?.requestMessages || []), ...(b?.requestMessages || [])].map(item => item.role))]
  return roles.map(role => ({
    role,
    diff: buildTextDiff(
      (a?.requestMessages || []).filter(item => item.role === role).map(item => item.content).join('\n\n'),
      (b?.requestMessages || []).filter(item => item.role === role).map(item => item.content).join('\n\n')
    )
  }))
}

function buildApiCallDiff(pair: PairedItem<RunTraceApiCall>): ApiCallDiff {
  const a = pair.a
  const b = pair.b
  return {
    ...pair,
    fields: [
      fieldDiff('status', a?.status, b?.status),
      fieldDiff('skillId', a?.skillId, b?.skillId),
      fieldDiff('skillName', a?.skillName, b?.skillName),
      fieldDiff('agentName', a?.agentName, b?.agentName),
      fieldDiff('model', a?.model, b?.model),
      fieldDiff('temperature', a?.temperature, b?.temperature),
      fieldDiff('maxTokens', a?.maxTokens, b?.maxTokens),
      fieldDiff('intent', a?.intent, b?.intent),
      fieldDiff('permissionDecision', a?.permissionDecision, b?.permissionDecision),
      fieldDiff('finishReason', a?.finishReason, b?.finishReason),
      fieldDiff('usage', a?.usage, b?.usage),
      fieldDiff('durationMs', a?.durationMs, b?.durationMs),
      fieldDiff('timeToFirstChunkMs', a?.semantic?.timeToFirstChunkMs, b?.semantic?.timeToFirstChunkMs),
      fieldDiff('compatibilityMode', a?.compatibilityMode, b?.compatibilityMode),
      fieldDiff('compatibilityWrite', a?.compatibilityWrite, b?.compatibilityWrite),
      fieldDiff('toolsDowngraded', a?.toolsDowngraded, b?.toolsDowngraded),
      fieldDiff('downgradeReason', a?.downgradeReason, b?.downgradeReason),
      fieldDiff('error', a?.error, b?.error),
      fieldDiff('integrity', a?.integrity, b?.integrity)
    ],
    requestDiffs: requestDiffs(a, b),
    responseDiff: buildTextDiff(a?.responseText, b?.responseText),
    streamDiff: buildTextDiff(a?.streamText, b?.streamText),
    reasoningDiff: buildTextDiff(a?.reasoningText, b?.reasoningText)
  }
}

function snapshotsFor(run: RunTrace | null | undefined, callA?: RunTraceApiCall | null, callB?: RunTraceApiCall | null) {
  if (!run) return []
  const ids = [...(callA?.promptSnapshotIds || []), ...(callB?.promptSnapshotIds || [])]
  const byId = new Set(ids)
  return (run.promptSnapshots || []).filter(snapshot =>
    byId.has(snapshot.id) || snapshot.apiCallId === callA?.id || snapshot.apiCallId === callB?.id
  )
}

function buildPromptSnapshotDiffs(pairs: ApiCallDiff[], runA: RunTrace, runB: RunTrace): PromptSnapshotDiff[] {
  const result: PromptSnapshotDiff[] = []
  pairs.forEach(pair => {
    const aItems = snapshotsFor(runA, pair.a, pair.b)
    const bItems = snapshotsFor(runB, pair.a, pair.b)
    const length = Math.max(aItems.length, bItems.length)
    for (let index = 0; index < length; index++) {
      const a = aItems[index] || null
      const b = bItems[index] || null
      result.push({
        key: `${pair.key}|snapshot-${index + 1}`,
        rule: pair.rule,
        a,
        b,
        onlyIn: !a ? 'B' : (!b ? 'A' : undefined),
        fields: [
          fieldDiff('skillName', a?.skillName, b?.skillName),
          fieldDiff('skillVersion', a?.skillVersion, b?.skillVersion),
          fieldDiff('mode', a?.mode, b?.mode),
          fieldDiff('promptName', a?.promptName, b?.promptName)
        ],
        variableDiff: buildTextDiff(JSON.stringify(a?.variables || null, null, 2), JSON.stringify(b?.variables || null, null, 2)),
        contextDiff: buildTextDiff(JSON.stringify(a?.contextBlocks || null, null, 2), JSON.stringify(b?.contextBlocks || null, null, 2)),
        fingerprintDiff: buildTextDiff(JSON.stringify(a?.folderFingerprint || null, null, 2), JSON.stringify(b?.folderFingerprint || null, null, 2)),
        systemDiff: buildTextDiff(a?.systemPrompt, b?.systemPrompt),
        userDiff: buildTextDiff(a?.userPrompt, b?.userPrompt)
      })
    }
  })
  return result
}

function buildPhysicalCallDiffs(pairs: ApiCallDiff[]): PhysicalCallDiff[] {
  const result: PhysicalCallDiff[] = []
  pairs.forEach(pair => {
    const aItems = pair.a?.physicalCalls || []
    const bItems = pair.b?.physicalCalls || []
    const length = Math.max(aItems.length, bItems.length)
    for (let index = 0; index < length; index++) {
      const a = aItems[index] || null
      const b = bItems[index] || null
      result.push({
        key: `${pair.key}|physical-${index + 1}`,
        rule: `${pair.rule} / apiCall 内 seq 顺序`,
        a,
        b,
        onlyIn: !a ? 'B' : (!b ? 'A' : undefined),
        fields: [
          fieldDiff('seq', a?.seq, b?.seq),
          fieldDiff('phase', a?.phase, b?.phase),
          fieldDiff('status', a?.status, b?.status),
          fieldDiff('finishReason', a?.finishReason, b?.finishReason),
          fieldDiff('usage', a?.usage, b?.usage),
          fieldDiff('durationMs', a?.durationMs, b?.durationMs),
          fieldDiff('toolsEnabled', a?.toolsEnabled, b?.toolsEnabled),
          fieldDiff('toolsDowngraded', a?.toolsDowngraded, b?.toolsDowngraded),
          fieldDiff('downgradeReason', a?.downgradeReason, b?.downgradeReason),
          fieldDiff('error', a?.error, b?.error)
        ],
        requestDiff: buildTextDiff(
          (a?.requestMessages || []).map(item => `[${item.role}]\n${item.content}`).join('\n\n'),
          (b?.requestMessages || []).map(item => `[${item.role}]\n${item.content}`).join('\n\n')
        ),
        responseDiff: buildTextDiff(a?.responseText, b?.responseText)
      })
    }
  })
  return result
}

function buildToolCallDiffs(pairs: ApiCallDiff[]): ToolCallDiff[] {
  const result: ToolCallDiff[] = []
  pairs.forEach(pair => {
    const aItems = pair.a?.toolCalls || []
    const bItems = pair.b?.toolCalls || []
    const length = Math.max(aItems.length, bItems.length)
    for (let index = 0; index < length; index++) {
      const a = aItems[index] || null
      const b = bItems[index] || null
      result.push({
        key: `${pair.key}|tool-${index + 1}`,
        rule: `${pair.rule} / API 调用内出现顺序`,
        a,
        b,
        onlyIn: !a ? 'B' : (!b ? 'A' : undefined),
        fields: [
          fieldDiff('name', a?.name, b?.name),
          fieldDiff('status', a?.status, b?.status),
          fieldDiff('defaultToolPolicy', a?.defaultToolPolicy, b?.defaultToolPolicy),
          fieldDiff('riskLevel', a?.riskLevel, b?.riskLevel),
          fieldDiff('durationMs', a?.durationMs, b?.durationMs),
          fieldDiff('error', a?.error, b?.error)
        ],
        inputDiff: buildTextDiff(JSON.stringify(a?.input ?? null, null, 2), JSON.stringify(b?.input ?? null, null, 2)),
        resultDiff: buildTextDiff(JSON.stringify(a?.result ?? null, null, 2), JSON.stringify(b?.result ?? null, null, 2))
      })
    }
  })
  return result
}

function buildProcessingReportDiffs(pairs: ApiCallDiff[], runA: RunTrace, runB: RunTrace): ProcessingReportDiff[] {
  const result: ProcessingReportDiff[] = []
  pairs.forEach(pair => {
    const ids = [...(pair.a?.processingReportIds || []), ...(pair.b?.processingReportIds || [])]
    const byId = new Set(ids)
    const aItems = (runA.processingReports || []).filter(report =>
      byId.has(report.id) || report.apiCallId === pair.a?.id || report.apiCallId === pair.b?.id
    )
    const bItems = (runB.processingReports || []).filter(report =>
      byId.has(report.id) || report.apiCallId === pair.a?.id || report.apiCallId === pair.b?.id
    )
    const length = Math.max(aItems.length, bItems.length)
    for (let index = 0; index < length; index++) {
      const a = aItems[index] || null
      const b = bItems[index] || null
      result.push({
        key: `${pair.key}|processing-${index + 1}`,
        rule: `${pair.rule} / apiCallId + stage + processor + 顺序`,
        a,
        b,
        onlyIn: !a ? 'B' : (!b ? 'A' : undefined),
        fields: [
          fieldDiff('stage', a?.stage, b?.stage),
          fieldDiff('processor', a?.processor, b?.processor),
          fieldDiff('status', a?.status, b?.status),
          fieldDiff('integrity', a?.integrity, b?.integrity),
          fieldDiff('durationMs', a?.durationMs, b?.durationMs)
        ],
        ruleHitsDiff: buildTextDiff(JSON.stringify(a?.ruleHits || null, null, 2), JSON.stringify(b?.ruleHits || null, null, 2)),
        issuesDiff: buildTextDiff(JSON.stringify(a?.issues || null, null, 2), JSON.stringify(b?.issues || null, null, 2))
      })
    }
  })
  return result
}

function buildToolSurfaces(pairs: ApiCallDiff[], surfaceKey: 'toolSurface' | 'actualToolSurface' = 'toolSurface') {
  type ToolSurfaceEntry = { policyA?: string; policyB?: string; onlyIn?: DiffSide }
  const map = new Map<string, ToolSurfaceEntry>()
  const add = (side: DiffSide, surface?: Array<{ name: string; policy: 'read' | 'write' }>) => {
    (surface || []).forEach(item => {
      const existing = map.get(item.name) || {}
      if (side === 'A') existing.policyA = item.policy
      else existing.policyB = item.policy
      map.set(item.name, existing)
    })
  }
  pairs.forEach(pair => {
    add('A', pair.a?.[surfaceKey])
    add('B', pair.b?.[surfaceKey])
  })
  return [...map.entries()].map(([name, value]): ToolSurfaceEntry & { name: string } => ({
    name,
    policyA: value.policyA,
    policyB: value.policyB,
    onlyIn: value.policyA && !value.policyB ? 'A' : (!value.policyA && value.policyB ? 'B' : undefined)
  }))
}

function buildTemplateVersionDiff(pairs: ApiCallDiff[], runA: RunTrace, runB: RunTrace): TemplateVersionEntry[] {
  const snapshotsFor = (run: RunTrace, callA?: RunTraceApiCall | null, callB?: RunTraceApiCall | null) => {
    if (!run) return []
    const ids = new Set([...(callA?.promptSnapshotIds || []), ...(callB?.promptSnapshotIds || [])])
    return (run.promptSnapshots || []).filter(snapshot =>
      ids.has(snapshot.id) || snapshot.apiCallId === callA?.id || snapshot.apiCallId === callB?.id
    )
  }

  const entries = new Map<string, TemplateVersionEntry>()
  pairs.forEach((pair, pairIndex) => {
    const aItems = snapshotsFor(runA, pair.a, pair.b)
    const bItems = snapshotsFor(runB, pair.a, pair.b)
    const length = Math.max(aItems.length, bItems.length)
    for (let index = 0; index < length; index++) {
      const a = aItems[index] || null
      const b = bItems[index] || null
      const fingerprint = (item?: typeof a) =>
        (item?.folderFingerprint || [])
          .map(file => `${file.file}:${file.hash}`)
          .join(',')
      const key = `${pairIndex}|${a?.skillId || b?.skillId || 'skill'}|${index}`
      entries.set(key, {
        key,
        skillId: a?.skillId || b?.skillId,
        skillName: a?.skillName || b?.skillName,
        aVersion: a?.skillVersion,
        bVersion: b?.skillVersion,
        aFingerprint: a ? fingerprint(a) : undefined,
        bFingerprint: b ? fingerprint(b) : undefined,
        changed: valuesEqual(a?.skillVersion, b?.skillVersion)
          && valuesEqual(a ? fingerprint(a) : undefined, b ? fingerprint(b) : undefined)
          ? false
          : true
      })
    }
  })
  return [...entries.values()]
}

function buildToolSequenceDiff(pairs: ApiCallDiff[]): ToolSequenceDiff {
  const aCalls = pairs.map(pair => pair.a).filter(Boolean) as RunTraceApiCall[]
  const bCalls = pairs.map(pair => pair.b).filter(Boolean) as RunTraceApiCall[]
  const aSequence = aCalls.flatMap((call, callIndex) =>
    (call.toolCalls || []).map((tool, index) => ({ call, callIndex, tool }))
  )
  const bSequence = bCalls.flatMap((call, callIndex) =>
    (call.toolCalls || []).map((tool, index) => ({ call, callIndex, tool }))
  )
  const length = Math.max(aSequence.length, bSequence.length)
  const steps: ToolSequenceStep[] = []
  for (let index = 0; index < length; index++) {
    const a = aSequence[index]
    const b = bSequence[index]
    const changed = Boolean(
      (!a || !b)
      || a.tool.name !== b.tool.name
      || a.tool.status !== b.tool.status
      || a.call.seq !== b.call.seq
    )
    steps.push({
      index,
      apiSeqA: a?.call.seq,
      apiSeqB: b?.call.seq,
      nameA: a?.tool.name,
      nameB: b?.tool.name,
      statusA: a?.tool.status,
      statusB: b?.tool.status,
      changed,
      onlyIn: !a ? 'B' : (!b ? 'A' : undefined)
    })
  }
  return {
    steps,
    firstDivergence: steps.find(step => step.changed)
  }
}

function buildSkillDebugSummary(
  apiCalls: ApiCallDiff[],
  templateVersions: TemplateVersionEntry[],
  toolSequence: ToolSequenceDiff
): SkillDebugSummary {
  const firstDifferentPair = apiCalls.find(pair =>
    pair.onlyIn
    || (pair.a?.toolCalls?.length || 0) !== (pair.b?.toolCalls?.length || 0)
    || pair.a?.toolCalls?.some((tool, index) =>
      tool.name !== pair.b?.toolCalls?.[index]?.name
      || tool.status !== pair.b?.toolCalls?.[index]?.status
    )
    || pair.fields.some(field => field.changed)
    || !pair.requestDiffs.every(request => request.diff.same)
    || !pair.responseDiff.same
    || !pair.streamDiff.same
    || !pair.reasoningDiff.same
  )
  return {
    templateVersionChanged: templateVersions.filter(entry => entry.changed).length,
    toolSequenceChanged: toolSequence.steps.some(step => step.changed),
    firstDifferentApiCall: firstDifferentPair
      ? {
        index: apiCalls.indexOf(firstDifferentPair),
        seqA: firstDifferentPair.a?.seq,
        seqB: firstDifferentPair.b?.seq,
        idA: firstDifferentPair.a?.id,
        idB: firstDifferentPair.b?.id,
        reason: firstDifferentPair.onlyIn
          ? `API 调用仅存在于 ${firstDifferentPair.onlyIn} 侧`
          : '字段、请求消息或输出全文开始出现差异'
      }
      : undefined
  }
}

function eventKey(event: RunTraceEvent) {
  return [event.turnId || '-', event.seq ?? '-', event.type].join('|')
}

function buildEventDiff(runA: RunTrace, runB: RunTrace) {
  const usedB = new Set<string>()
  const pairs: PairedItem<RunTraceEvent>[] = []
  const mapB = new Map<string, RunTraceEvent[]>()
  ;(runB.events || []).forEach(event => {
    const key = eventKey(event)
    mapB.set(key, [...(mapB.get(key) || []), event])
  })
  ;(runA.events || []).forEach(eventA => {
    const candidates = mapB.get(eventKey(eventA)) || []
    const eventB = candidates.find(item => !usedB.has(item.id))
    if (!eventB) {
      pairs.push({ key: eventA.id, rule: 'turnId + seq + type', a: eventA, b: null, onlyIn: 'A' })
      return
    }
    usedB.add(eventB.id)
    pairs.push({ key: `${eventA.id}|${eventB.id}`, rule: 'turnId + seq + type', a: eventA, b: eventB })
  })
  ;(runB.events || []).filter(event => !usedB.has(event.id)).forEach(event => {
    pairs.push({ key: event.id, rule: 'turnId + seq + type', a: null, b: event, onlyIn: 'B' })
  })

  const types = [...new Set([...(runA.events || []), ...(runB.events || [])].map(event => event.type))].sort()
  return {
    pairs: pairs.sort((a, b) => (a.a?.ts ?? a.b?.ts ?? 0) - (b.a?.ts ?? b.b?.ts ?? 0)),
    countDiffs: types.map(type => ({
      type,
      countA: (runA.events || []).filter(event => event.type === type).length,
      countB: (runB.events || []).filter(event => event.type === type).length
    }))
  }
}

function buildStateHistoryDiff(runA: RunTrace, runB: RunTrace) {
  const a = runA.stateHistory || []
  const b = runB.stateHistory || []
  let firstDivergence: RunTraceDiffResult['stateHistory']['firstDivergence']
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index++) {
    if (!valuesEqual(a[index], b[index])) {
      firstDivergence = {
        index,
        reason: `第 ${index + 1} 条状态转换开始不一致`
      }
      break
    }
  }
  return { a, b, firstDivergence }
}

export function buildRunTraceDiff(runA: RunTrace, runB: RunTrace): RunTraceDiffResult {
  const warnings: string[] = []
  if (runA.source !== runB.source) warnings.push('两次运行来源不同，对齐结果仅供参考。')
  if (runA.status === 'running' || runB.status === 'running') warnings.push('有运行仍在进行中，对比结果是临时快照。')
  if ((runA.payloadIntegrityWarnings?.length || 0) + (runB.payloadIntegrityWarnings?.length || 0) > 0) {
    warnings.push('存在 payload 完整性警告，导出前请先查看单次运行详情。')
  }

  const apiPairs = alignApiCalls(runA.apiCalls || [], runB.apiCalls || [])
  const apiCalls = apiPairs.map(buildApiCallDiff)
  const templateVersions = buildTemplateVersionDiff(apiCalls, runA, runB)
  const toolSequence = buildToolSequenceDiff(apiCalls)
  const skillDebugSummary = buildSkillDebugSummary(apiCalls, templateVersions, toolSequence)
  return {
    schema: 'shenyi.run-trace-diff',
    schemaVersion: RUN_TRACE_DIFF_SCHEMA_VERSION,
    generatedAt: Date.now(),
    runs: { a: runA, b: runB },
    warnings,
    overview: [
      fieldDiff('source', runA.source, runB.source),
      fieldDiff('sourceName', runA.sourceName, runB.sourceName),
      fieldDiff('stepName', runA.stepName, runB.stepName),
      fieldDiff('mode', runA.mode, runB.mode),
      fieldDiff('status', runA.status, runB.status),
      fieldDiff('projectName', runA.projectName, runB.projectName),
      fieldDiff('providerName', runA.providerName, runB.providerName),
      fieldDiff('model', runA.model, runB.model),
      fieldDiff('skillNames', runA.skillNames, runB.skillNames),
      fieldDiff('skillMode', runA.skillMode, runB.skillMode),
      fieldDiff('sessionKind', runA.sessionKind, runB.sessionKind),
      fieldDiff('turnCount', runA.turns?.length || 0, runB.turns?.length || 0),
      fieldDiff('apiCallCount', runA.apiCalls?.length || 0, runB.apiCalls?.length || 0),
      fieldDiff('toolCallCount', (runA.apiCalls || []).reduce((sum, call) => sum + (call.toolCalls?.length || 0), 0), (runB.apiCalls || []).reduce((sum, call) => sum + (call.toolCalls?.length || 0), 0)),
      fieldDiff('durationMs', runA.durationMs, runB.durationMs),
      fieldDiff('payloadCount', runA.payloads?.length || 0, runB.payloads?.length || 0),
      fieldDiff('payloadIntegrityWarningCount', runA.payloadIntegrityWarnings?.length || 0, runB.payloadIntegrityWarnings?.length || 0)
    ],
    apiCalls,
    promptSnapshots: buildPromptSnapshotDiffs(apiCalls, runA, runB),
    physicalCalls: buildPhysicalCallDiffs(apiCalls),
    toolCalls: buildToolCallDiffs(apiCalls),
    toolSurfaces: buildToolSurfaces(apiCalls),
    actualToolSurfaces: buildToolSurfaces(apiCalls, 'actualToolSurface'),
    processingReports: buildProcessingReportDiffs(apiCalls, runA, runB),
    templateVersions,
    toolSequence,
    skillDebugSummary,
    folderDiagnostics: (() => {
      const a = runA.folderDiagnostics || []
      const b = runB.folderDiagnostics || []
      const length = Math.max(a.length, b.length)
      return Array.from({ length }, (_, index) => ({
        index,
        onlyIn: !a[index] ? ('B' as const) : (!b[index] ? ('A' as const) : undefined),
        diff: buildTextDiff(JSON.stringify(a[index] ?? null, null, 2), JSON.stringify(b[index] ?? null, null, 2))
      }))
    })(),
    events: buildEventDiff(runA, runB),
    stateHistory: buildStateHistoryDiff(runA, runB)
  }
}

function sideLabel<T>(item: PairedItem<T>) {
  if (item.onlyIn === 'A') return '仅存在于 A'
  if (item.onlyIn === 'B') return '仅存在于 B'
  return '已对齐'
}

function renderTextDiffBlock(title: string, diff: TextDiff, lines: string[]) {
  lines.push(`--- ${title} ---`)
  lines.push(
    `模式：${diff.mode === 'lines' ? '行级 diff' : '统计模式'}`,
    `A ${diff.stats.aLines} 行 / ${diff.stats.aChars} 字符；B ${diff.stats.bLines} 行 / ${diff.stats.bChars} 字符`,
    `相同 ${diff.stats.unchanged} 行 / 新增 ${diff.stats.added} 行 / 删除 ${diff.stats.removed} 行`
  )
  if (diff.reason) lines.push(diff.reason)
  if (diff.changes) {
    diff.changes.forEach(change => {
      if (change.type === 'unchanged') lines.push(`  ${change.text}`)
      else if (change.type === 'added') lines.push(`+ ${change.text}`)
      else lines.push(`- ${change.text}`)
    })
  }
  lines.push('')
}

export function buildRunTraceDiffText(result: RunTraceDiffResult) {
  const lines: string[] = []
  const a = result.runs.a
  const b = result.runs.b
  lines.push('===== 运行记录对比 =====')
  lines.push(`A：${a.sourceName} / ${a.stepName || a.mode} / ${new Date(a.startedAt).toISOString()}`)
  lines.push(`B：${b.sourceName} / ${b.stepName || b.mode} / ${new Date(b.startedAt).toISOString()}`)
  result.warnings.forEach(warning => lines.push(`警告：${warning}`))
  lines.push('', '===== 概览 =====')
  result.overview.forEach(item => {
    lines.push(`${item.key}：A=${formatValue(item.a)} / B=${formatValue(item.b)}${item.changed ? ' [不同]' : ''}`)
  })

  lines.push('', '===== API 调用 =====')
  result.apiCalls.forEach(item => {
    lines.push(`--- ${sideLabel(item)}（${item.rule}）A=${item.a?.id || '-'} B=${item.b?.id || '-'} ---`)
    item.fields.filter(field => field.changed).forEach(field => {
      lines.push(`${field.key}: A=${formatValue(field.a)} -> B=${formatValue(field.b)}`)
    })
    item.requestDiffs.forEach(request => renderTextDiffBlock(`请求消息 ${request.role}`, request.diff, lines))
    renderTextDiffBlock('完整返回', item.responseDiff, lines)
    renderTextDiffBlock('流式全文', item.streamDiff, lines)
    renderTextDiffBlock('思考过程', item.reasoningDiff, lines)
  })

  lines.push('', '===== 提示词快照 =====')
  result.promptSnapshots.forEach(item => {
    lines.push(`--- ${sideLabel(item)}（${item.rule}） ---`)
    item.fields.filter(field => field.changed).forEach(field => {
      lines.push(`${field.key}: A=${formatValue(field.a)} -> B=${formatValue(field.b)}`)
    })
    renderTextDiffBlock('变量', item.variableDiff, lines)
    renderTextDiffBlock('上下文块', item.contextDiff, lines)
    renderTextDiffBlock('folder 指纹', item.fingerprintDiff, lines)
    renderTextDiffBlock('system prompt', item.systemDiff, lines)
    renderTextDiffBlock('user prompt', item.userDiff, lines)
  })

  lines.push('', '===== 物理请求 =====')
  result.physicalCalls.forEach(item => {
    lines.push(`--- ${sideLabel(item)}（${item.rule}） ---`)
    item.fields.filter(field => field.changed).forEach(field => {
      lines.push(`${field.key}: A=${formatValue(field.a)} -> B=${formatValue(field.b)}`)
    })
    renderTextDiffBlock('物理请求', item.requestDiff, lines)
    renderTextDiffBlock('物理响应', item.responseDiff, lines)
  })

  lines.push('', '===== 工具调用 =====')
  result.toolCalls.forEach(item => {
    lines.push(`--- ${sideLabel(item)}（${item.rule}） ---`)
    item.fields.filter(field => field.changed).forEach(field => {
      lines.push(`${field.key}: A=${formatValue(field.a)} -> B=${formatValue(field.b)}`)
    })
    renderTextDiffBlock('工具输入', item.inputDiff, lines)
    renderTextDiffBlock('工具结果', item.resultDiff, lines)
  })

  lines.push('', '===== 工具面 =====')
  result.toolSurfaces.forEach(item => {
    lines.push(`${item.name}: A=${item.policyA || '-'} / B=${item.policyB || '-'}${item.onlyIn ? ` [${item.onlyIn} 侧独有]` : ''}`)
  })
  lines.push('', '===== 实际工具面 =====')
  result.actualToolSurfaces.forEach(item => {
    lines.push(`${item.name}: A=${item.policyA || '-'} / B=${item.policyB || '-'}${item.onlyIn ? ` [${item.onlyIn} 侧独有]` : ''}`)
  })

  lines.push('', '===== 本地处理 =====')
  result.processingReports.forEach(item => {
    lines.push(`--- ${sideLabel(item)}（${item.rule}） ---`)
    item.fields.filter(field => field.changed).forEach(field => {
      lines.push(`${field.key}: A=${formatValue(field.a)} -> B=${formatValue(field.b)}`)
    })
    renderTextDiffBlock('规则命中', item.ruleHitsDiff, lines)
    renderTextDiffBlock('问题', item.issuesDiff, lines)
  })

  lines.push('', '===== 模板版本 =====')
  if (!result.templateVersions.length) lines.push('没有模板版本证据')
  result.templateVersions.forEach(item => {
    lines.push(
      `${item.skillName || item.skillId || '-'}：A=${item.aVersion || '-'} / B=${item.bVersion || '-'}`
      + `${item.changed ? ' [版本或 folder 指纹不同]' : ''}`
    )
    if (item.aFingerprint || item.bFingerprint) {
      lines.push(`folder 指纹：A=${item.aFingerprint || '-'} / B=${item.bFingerprint || '-'}`)
    }
  })

  lines.push('', '===== 工具序列 =====')
  if (!result.toolSequence.steps.length) lines.push('两次运行都没有工具调用')
  result.toolSequence.steps.forEach(item => {
    lines.push(
      `#${item.index + 1} API A=${item.apiSeqA ?? '-'} B=${item.apiSeqB ?? '-'}：`
      + `${item.nameA || '-'}(${item.statusA || '-'}) -> ${item.nameB || '-'}(${item.statusB || '-'})`
      + `${item.changed ? ' [不同]' : ''}`
    )
  })
  if (result.toolSequence.firstDivergence) {
    lines.push(`工具序列首次分叉：第 ${result.toolSequence.firstDivergence.index + 1} 个工具调用`)
  }

  lines.push('', '===== folder 诊断 =====')
  result.folderDiagnostics.forEach(item => {
    lines.push(`--- diagnostic-${item.index + 1} ${item.onlyIn ? `仅存在于 ${item.onlyIn}` : '已对齐'} ---`)
    renderTextDiffBlock('诊断内容', item.diff, lines)
  })

  lines.push('', '===== 事件与状态 =====')
  result.events.countDiffs.filter(item => item.countA !== item.countB).forEach(item => {
    lines.push(`事件 ${item.type}: A=${item.countA} / B=${item.countB}`)
  })
  if (result.stateHistory.firstDivergence) {
    lines.push(`状态历史首次分叉：${result.stateHistory.firstDivergence.reason}`)
  }
  return lines.join('\n')
}

function formatValue(value: unknown) {
  if (value === undefined) return '未记录'
  if (value === null) return '无'
  if (typeof value === 'object') return JSON.stringify(normalizeUndefined(value))
  return String(value)
}

export function buildRunTraceDiffExport(result: RunTraceDiffResult, maskValue: (value: unknown) => unknown) {
  return maskValue({
    schema: result.schema,
    schemaVersion: result.schemaVersion,
    version: RUN_TRACE_DIFF_SCHEMA_VERSION,
    generatedAt: new Date(result.generatedAt).toISOString(),
    runs: {
      a: result.runs.a,
      b: result.runs.b
    },
    warnings: result.warnings,
    overview: result.overview,
    apiCalls: result.apiCalls,
    promptSnapshots: result.promptSnapshots,
    physicalCalls: result.physicalCalls,
    toolCalls: result.toolCalls,
    toolSurfaces: result.toolSurfaces,
    processingReports: result.processingReports,
    templateVersions: result.templateVersions,
    toolSequence: result.toolSequence,
    skillDebugSummary: result.skillDebugSummary,
    folderDiagnostics: result.folderDiagnostics,
    events: result.events,
    stateHistory: result.stateHistory
  })
}
