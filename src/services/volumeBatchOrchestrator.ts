import { extractJsonArray } from './jsonExtraction'
import {
  clampGeneratedVolumes,
  type ExistingVolumeRef,
  type VolumeGenerateMode
} from './volumeGeneration'
import {
  buildVolumeHistoryFacts,
  renderVolumeHistoryContext,
  validateVolumeBatch,
  type VolumeGenerationContract
} from './volumeGenerationContract'

export interface VolumeBatchAttempt {
  repairAttempt: number
  status: 'short' | 'complete' | 'error'
  requestedCount: number
  acceptedCount: number
  missingStart: number
  missingCount: number
  errors: string[]
  /** Observability only; validation timing never changes retry decisions. */
  validationMs?: number
}

export interface VolumeBatchPromptAudit {
  duplicateHistoryContextSuppressed: boolean
  legacyJsonProtocolStripped: boolean
  progressFactsSynced: boolean
  progressFactsCount: number
}

export interface GenerateVolumeBatchInput {
  contract: VolumeGenerationContract
  historyVolumes: ExistingVolumeRef[]
  basePrompt: string
  historyContext?: string
  callVolumeApi: (prompt: string) => Promise<string>
  requestPolicy?: 'batch' | 'single-volume'
  outputProtocol?: 'folder-chain' | 'direct-json'
  shouldContinue?: () => boolean
  maxRepairAttempts?: number
  onAttempt?: (attempt: VolumeBatchAttempt) => void
  onPromptBuilt?: (prompt: string, audit: VolumeBatchPromptAudit) => void
}

export interface VolumeBatchResult {
  status: 'complete' | 'incomplete'
  volumes: any[]
  attempts: VolumeBatchAttempt[]
  errors: string[]
}

const VOLUME_OUTPUT_PROTOCOL = [
  '输出JSON数组，每项含name/outline/summary/allocatedWords/readerExpectations/mainPlotLine/unlockMilestone/forbiddenFinalCards/contractRisk字段。',
  'readerExpectations=读者期待，mainPlotLine=主推线，unlockMilestone=本卷解锁里程碑。',
  'forbiddenFinalCards=禁碰终局底牌（字符串数组，没有则输出[]）。',
  'contractRisk必须是contract_safe / contract_needs_reinforcement / contract_broken / [待补充]。',
  '语义字段允许输出[待补充]，但字段必须在场。'
].join('\n')

const FOLDER_CHAIN_TASK_BOUNDARY_NOTE = '本步骤只处理当前卷任务；输出协议由当前 SKILL 模板决定，本段内容仅提供任务边界与事实约束。'

/**
 * Folder chain skills execute with a marker-text protocol and explicitly forbid
 * JSON output. The direct-channel volume prompt is still the source of factual
 * input, so remove only its stale output-protocol sentences before reuse.
 */
function stripLegacyVolumeJsonProtocol(prompt: string): { prompt: string; stripped: boolean } {
  const directProtocolPatterns = [
    /(?:当前还没有任何卷纲。)?请只生成第\d+卷的卷纲。输出JSON数组（正好1项），每项含name\/outline\/summary\/allocatedWords字段，allocatedWords为该卷分配字数（整数），(?:不得生成其他卷。)?/g,
    /已生成\d+卷，上一卷为：[^\n]*。请只生成第\d+卷的卷纲。输出JSON数组（正好1项），每项含name\/outline\/summary\/allocatedWords字段，allocatedWords为该卷分配字数（整数）。/g,
    /请生成\d+卷的卷纲。输出JSON数组，每项含name\/outline\/summary\/allocatedWords字段，allocatedWords为该卷分配字数（整数），各卷allocatedWords之和应等于全书总字数。/g
  ]
  let next = prompt
  for (const pattern of directProtocolPatterns) {
    next = next.replace(pattern, '')
  }
  next = next.replace(/[ \t]*\n{3,}/g, '\n\n').trim()
  return { prompt: next, stripped: next !== prompt }
}

export function buildVolumeBatchPromptWithAudit(input: {
  contract: VolumeGenerationContract
  repair: boolean
  missingStart?: number
  missingCount?: number
  basePrompt: string
  historyContext: string
  requestPolicy?: 'batch' | 'single-volume'
  outputProtocol?: 'folder-chain' | 'direct-json'
  repairErrors?: string[]
  forbiddenVolumeNames?: string[]
}): { prompt: string; audit: VolumeBatchPromptAudit } {
  const { contract } = input
  const legacy = stripLegacyVolumeJsonProtocol(input.basePrompt)
  const basePrompt = legacy.prompt
  const historyContext = input.historyContext.trim()
  const duplicateHistoryContextSuppressed = Boolean(historyContext && input.basePrompt.includes(historyContext))
  const historyLines = duplicateHistoryContextSuppressed ? [] : ['', input.historyContext, '']
  const outputProtocol = input.outputProtocol ?? (input.requestPolicy === 'single-volume' ? 'folder-chain' : 'direct-json')
  const protocolLines = outputProtocol === 'folder-chain'
    ? [FOLDER_CHAIN_TASK_BOUNDARY_NOTE]
    : [VOLUME_OUTPUT_PROTOCOL]

  if (input.requestPolicy === 'single-volume') {
    const missingStart = input.missingStart ?? contract.existingCount + 1
    const missingEnd = contract.existingCount + contract.expectedCount
    return {
      audit: {
        duplicateHistoryContextSuppressed,
        legacyJsonProtocolStripped: legacy.stripped,
        progressFactsSynced: false,
        progressFactsCount: 0
      },
      prompt: [
        basePrompt,
        ...historyLines,
        `本次只生成第${missingStart}卷，不生成其他卷。全书计划到第${missingEnd}卷。`,
        ...protocolLines,
        ...(outputProtocol === 'direct-json' ? ['数组长度必须为1。'] : [])
      ].join('\n')
    }
  }
  if (input.repair) {
    const missingStart = input.missingStart ?? contract.existingCount + 1
    const missingCount = input.missingCount ?? contract.expectedCount
    const missingEnd = missingStart + missingCount - 1
    return {
      audit: {
        duplicateHistoryContextSuppressed,
        legacyJsonProtocolStripped: legacy.stripped,
        progressFactsSynced: false,
        progressFactsCount: 0
      },
      prompt: [
        basePrompt,
        ...historyLines,
        `补充生成第${missingStart}卷到第${missingEnd}卷，共${missingCount}卷。只输出缺失卷，不要重复任何已有卷名。`,
        ...protocolLines,
        ...(outputProtocol === 'direct-json' ? ['数组长度必须为' + missingCount + '。'] : [])
      ].concat(input.repairErrors?.length ? [
        '',
        '【上一次验收失败原因】',
        ...input.repairErrors
      ] : []).concat(input.forbiddenVolumeNames?.length ? [
        '',
        '【禁止重复的已有卷名】',
        input.forbiddenVolumeNames.join('、')
      ] : []).join('\n')
    }
  }
  return {
    audit: {
      duplicateHistoryContextSuppressed,
      legacyJsonProtocolStripped: legacy.stripped,
      progressFactsSynced: false,
      progressFactsCount: 0
    },
      prompt: [
        basePrompt,
        ...historyLines,
        `生成${contract.expectedCount}卷的卷纲。不要重复任何已有卷名。`,
        ...protocolLines,
        ...(outputProtocol === 'direct-json' ? ['数组长度必须为' + contract.expectedCount + '。'] : [])
    ].join('\n')
  }
}

export function buildVolumeBatchPrompt(input: Parameters<typeof buildVolumeBatchPromptWithAudit>[0]): string {
  return buildVolumeBatchPromptWithAudit(input).prompt
}

function volumeName(value: unknown): string {
  return (typeof value === 'string' ? value : String(value || '')).trim()
}

function syncVolumePromptProgress(prompt: string, generatedCount: number): { prompt: string; synced: boolean } {
  if (!/\[已生成卷数\]/.test(prompt)) return { prompt, synced: false }
  const next = prompt.replace(/\[已生成卷数\]\s*\d+/g, `[已生成卷数]\n${generatedCount}`)
  return { prompt: next, synced: next !== prompt && new RegExp(`\\[已生成卷数\\]\\s*${generatedCount}`).test(next) }
}

function hasVolumeArtifact(value: any): boolean {
  return Boolean(volumeName(value?.name).length > 0)
}

export async function generateVolumeBatch(input: GenerateVolumeBatchInput): Promise<VolumeBatchResult> {
  const attempts: VolumeBatchAttempt[] = []
  const maxRepairs = Math.max(0, Math.round(Number(input.maxRepairAttempts ?? 3)))
  const requestPolicy = input.requestPolicy ?? 'batch'
  const outputProtocol = input.outputProtocol ?? (requestPolicy === 'single-volume' ? 'folder-chain' : 'direct-json')
  const expectedCount = Math.max(0, Math.round(Number(input.contract.expectedCount) || 0))
  if (expectedCount <= 0) {
    return {
      status: 'incomplete',
      volumes: [],
      attempts: [],
      errors: ['无效卷纲契约：期望卷数必须大于 0']
    }
  }

  const accepted: any[] = []
  const existingNames = new Set(input.historyVolumes.map(item => volumeName(item?.name)))
  const forbiddenVolumeNames = Array.from(existingNames)
  const progressVolumes: ExistingVolumeRef[] = [...input.historyVolumes]
  const renderProgressContext = () => renderVolumeHistoryContext(
    buildVolumeHistoryFacts(progressVolumes)
  )
  let basePrompt = input.basePrompt
  const syncProgressFacts = (generatedCount: number) => {
    const result = syncVolumePromptProgress(basePrompt, generatedCount)
    basePrompt = result.prompt
    return result
  }
  let repairAttempt = 0
  let stalledAttempts = 0
  let previousErrors: string[] = []

  while (true) {
    if (input.shouldContinue && !input.shouldContinue()) {
      return {
        status: 'incomplete',
        volumes: [],
        attempts,
        errors: ['卷纲批次生成已被用户取消']
      }
    }

    const missingCount = expectedCount - accepted.length
    const missingStart = input.contract.existingCount + accepted.length + 1
    const progressContext = requestPolicy === 'single-volume'
      ? renderProgressContext()
      : (input.historyContext || renderProgressContext())
    const progressFacts = syncProgressFacts(input.contract.existingCount + accepted.length)
    const { prompt, audit: promptAudit } = buildVolumeBatchPromptWithAudit({
      contract: input.contract,
      repair: repairAttempt > 0,
      missingStart,
      missingCount,
      basePrompt,
      historyContext: progressContext,
      requestPolicy,
      outputProtocol,
      repairErrors: previousErrors,
      forbiddenVolumeNames
    })
    const audit: VolumeBatchPromptAudit = {
      ...promptAudit,
      progressFactsSynced: progressFacts.synced,
      progressFactsCount: input.contract.existingCount + accepted.length
    }
    input.onPromptBuilt?.(prompt, audit)

    const acceptedCountBefore = accepted.length

    let raw: string
    try {
      raw = await input.callVolumeApi(prompt)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      attempts.push({
        repairAttempt,
        status: 'error',
        requestedCount: missingCount,
        acceptedCount: accepted.length,
        missingStart,
        missingCount,
        errors: [message]
      })
      input.onAttempt?.(attempts[attempts.length - 1])
      throw error
    }

    const parsed = extractJsonArray(raw) as any[]
    const clamped = clampGeneratedVolumes(
      input.contract.mode as VolumeGenerateMode,
      parsed,
      input.contract.existingCount,
      input.contract.expectedCount
    )
    const validationErrors: string[] = []
    if (clamped.truncated) {
      validationErrors.push(`${input.contract.mode} 模式返回 ${parsed.length} 卷，已截取 ${clamped.volumes.length} 卷`)
    }

    const batchSeen = new Set<string>()
    for (const volume of clamped.volumes) {
      const name = volumeName(volume?.name)
      if (!hasVolumeArtifact(volume)) continue
      if (existingNames.has(name)) {
        validationErrors.push(`卷名与历史重复：「${name}」`)
        continue
      }
      if (batchSeen.has(name)) {
        validationErrors.push(`卷名重复：「${name}」`)
        continue
      }
      if (accepted.length >= expectedCount) continue
      batchSeen.add(name)
      accepted.push(volume)
      existingNames.add(name)
      if (!progressVolumes.some(item => volumeName(item?.name) === name)) {
        progressVolumes.push(volume)
      }
    }

    const progressed = accepted.length - acceptedCountBefore
    if (progressed > 0) {
      stalledAttempts = 0
    } else {
      stalledAttempts += 1
    }

    if (accepted.length === expectedCount) {
      const validationStartedAt = Date.now()
      const validation = validateVolumeBatch(accepted, input.contract, input.historyVolumes)
      const validationMs = Math.max(0, Date.now() - validationStartedAt)
      const attempt: VolumeBatchAttempt = {
        repairAttempt,
        status: 'complete',
        requestedCount: expectedCount,
        acceptedCount: accepted.length,
        missingStart,
        missingCount,
        validationMs,
        errors: validation.valid ? validationErrors : [...validationErrors, ...validation.errors]
      }
      attempts.push(attempt)
      input.onAttempt?.(attempt)
      if (!validation.valid) {
        return {
          status: 'incomplete',
          volumes: [],
          attempts,
          errors: validation.errors
        }
      }
      return { status: 'complete', volumes: accepted, attempts, errors: validationErrors }
    }

    const currentMissingStart = input.contract.existingCount + accepted.length + 1
    const currentMissingCount = expectedCount - accepted.length
    previousErrors = validationErrors
    attempts.push({
      repairAttempt,
      status: 'short',
      requestedCount: expectedCount,
      acceptedCount: accepted.length,
      missingStart: currentMissingStart,
      missingCount: currentMissingCount,
      errors: validationErrors
    })
    input.onAttempt?.(attempts[attempts.length - 1])

    if (requestPolicy === 'single-volume') {
      if (stalledAttempts > maxRepairs) break
    } else if (repairAttempt >= maxRepairs) break
    repairAttempt += 1
  }

  const errors = [
    ...new Set([
      `批次未能补齐：期望${expectedCount}卷；最终只有${accepted.length}卷`,
      ...attempts.flatMap(attempt => attempt.errors)
    ])
  ]
  return { status: 'incomplete', volumes: [], attempts, errors }
}
