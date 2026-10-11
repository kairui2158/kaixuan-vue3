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
}

export interface GenerateVolumeBatchInput {
  contract: VolumeGenerationContract
  historyVolumes: ExistingVolumeRef[]
  basePrompt: string
  historyContext?: string
  callVolumeApi: (prompt: string) => Promise<string>
  requestPolicy?: 'batch' | 'single-volume'
  shouldContinue?: () => boolean
  maxRepairAttempts?: number
  onAttempt?: (attempt: VolumeBatchAttempt) => void
}

export interface VolumeBatchResult {
  status: 'complete' | 'incomplete'
  volumes: any[]
  attempts: VolumeBatchAttempt[]
  errors: string[]
}

export function buildVolumeBatchPrompt(input: {
  contract: VolumeGenerationContract
  repair: boolean
  missingStart?: number
  missingCount?: number
  basePrompt: string
  historyContext: string
  requestPolicy?: 'batch' | 'single-volume'
  repairErrors?: string[]
  forbiddenVolumeNames?: string[]
}): string {
  const { contract } = input
  if (input.requestPolicy === 'single-volume') {
    const missingStart = input.missingStart ?? contract.existingCount + 1
    const missingEnd = contract.existingCount + contract.expectedCount
    return [
      input.basePrompt,
      '',
      input.historyContext,
      '',
      `本次只生成第${missingStart}卷，不生成其他卷。全书计划到第${missingEnd}卷。`,
      '输出JSON数组，每项含name/outline/summary/allocatedWords字段。数组长度必须为1。'
    ].join('\n')
  }
  if (input.repair) {
    const missingStart = input.missingStart ?? contract.existingCount + 1
    const missingCount = input.missingCount ?? contract.expectedCount
    const missingEnd = missingStart + missingCount - 1
    return [
      input.basePrompt,
      '',
      input.historyContext,
      '',
      `补充生成第${missingStart}卷到第${missingEnd}卷，共${missingCount}卷。只输出缺失卷，不要重复任何已有卷名。`,
      '输出JSON数组，每项含name/outline/summary/allocatedWords字段。数组长度必须为' + missingCount + '。'
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
  return [
    input.basePrompt,
    '',
    input.historyContext,
    '',
    `生成${contract.expectedCount}卷的卷纲。不要重复任何已有卷名。`,
    '输出JSON数组，每项含name/outline/summary/allocatedWords字段。数组长度必须为' + contract.expectedCount + '。'
  ].join('\n')
}

function volumeName(value: unknown): string {
  return (typeof value === 'string' ? value : String(value || '')).trim()
}

function hasVolumeArtifact(value: any): boolean {
  return Boolean(volumeName(value?.name).length > 0)
}

export async function generateVolumeBatch(input: GenerateVolumeBatchInput): Promise<VolumeBatchResult> {
  const attempts: VolumeBatchAttempt[] = []
  const maxRepairs = Math.max(0, Math.round(Number(input.maxRepairAttempts ?? 3)))
  const requestPolicy = input.requestPolicy ?? 'batch'
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
    const prompt = buildVolumeBatchPrompt({
      contract: input.contract,
      repair: repairAttempt > 0,
      missingStart,
      missingCount,
      basePrompt: input.basePrompt,
      historyContext: progressContext,
      requestPolicy,
      repairErrors: previousErrors,
      forbiddenVolumeNames
    })

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
      const validation = validateVolumeBatch(accepted, input.contract, input.historyVolumes)
      const attempt: VolumeBatchAttempt = {
        repairAttempt,
        status: 'complete',
        requestedCount: expectedCount,
        acceptedCount: accepted.length,
        missingStart,
        missingCount,
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
