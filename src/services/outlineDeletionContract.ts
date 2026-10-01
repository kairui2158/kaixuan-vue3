import type { EditorEditCommand } from './editorEditProtocol'
import type { OutlineIntegrityReport } from './outlineIntegrity'

export interface OutlineDeletionConfirmation {
  status: 'requested' | 'granted' | 'consumed' | 'dismissed' | 'superseded'
  turnId: string
  targetSignature: string
  commandHash: string
  originalHash: string
  expectedNextHash: string
  expectedDeletedLength: number
  reason: string
}

export interface OutlineDeletionContractState {
  confirmations: OutlineDeletionConfirmation[]
}

export type OutlineDeletionGateDecision =
  | {
      action: 'request_confirmation'
      code: 'heading_deletion_requires_user_confirmation'
      targetSignature: string
      message: string
    }
  | {
      action: 'block'
      code: 'integrity_failed'
      message: string
    }

function describeDeletionTargets(commands: EditorEditCommand[]): string {
  return commands
    .filter(command => command.operation === 'delete')
    .map(command => command.target || command.sectionTitle || command.chapterTitle || command.volumeTitle || '未命名目标')
    .slice(0, 3)
    .map(target => target.split('\n')[0].slice(0, 80))
    .join('；')
}

export function isHeadingDeletionConfirmationRequired(input: {
  commands: EditorEditCommand[]
  integrity: OutlineIntegrityReport
}): boolean {
  if (!input.commands.length || !input.commands.every(command => command.operation === 'delete')) return false
  const criticals = input.integrity.issues.filter(issue => issue.level === 'critical')
  return criticals.length > 0 && criticals.every(issue =>
    issue.type === 'heading_count_reduced'
    || issue.type === 'content_loss'
    || issue.type === 'structure_broken' && issue.message.includes('标题数量从'))
}

export function buildOutlineDeletionTargetSignature(commands: EditorEditCommand[]): string {
  return commands
    .filter(command => command.operation === 'delete')
    .map(command => [
      command.target || '',
      command.volumeTitle || '',
      command.chapterTitle || '',
      command.sectionTitle || '',
    ].join('\u0000'))
    .join('\u0001')
}

export function buildOutlineDeletionCommandHash(commands: EditorEditCommand[]): string {
  const canonical = commands.map(command => JSON.stringify({
    type: command.type,
    version: command.version,
    operation: command.operation,
    content: command.content,
    target: command.target,
    destination: command.destination,
    destinationPosition: command.destinationPosition,
    volumeTitle: command.volumeTitle,
    chapterTitle: command.chapterTitle,
    sectionTitle: command.sectionTitle,
    position: command.position,
    reason: command.reason,
  })).join('\u0002')
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index++) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return 'fnv1a32_' + hash.toString(16).padStart(8, '0')
}

export function buildOutlineDeletionFingerprint(input: {
  commands: EditorEditCommand[]
  original: string
  next: string
}): {
  commandHash: string
  originalHash: string
  expectedNextHash: string
  expectedDeletedLength: number
} {
  const originalLength = input.original.length
  const nextLength = input.next.length
  return {
    commandHash: buildOutlineDeletionCommandHash(input.commands),
    originalHash: hashDeletionText(input.original),
    expectedNextHash: hashDeletionText(input.next),
    expectedDeletedLength: Math.max(0, originalLength - nextLength),
  }
}

function hashDeletionText(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return 'fnv1a32_' + hash.toString(16).padStart(8, '0')
}

const AFFIRMATIVE_COMMANDS = new Set([
  '确认', '确认了', '确认执行', '确认删除', '确认写入',
  '可以', '可以了', '可以执行', '可以删除', '可以写入',
  '同意', '同意了', '同意执行', '同意删除', '同意写入',
  '执行', '执行了', '执行吧',
  '删除', '删除了', '删除吧',
  '写入', '写入了', '写入吧',
  '就这样执行', '就这样删除', '就这样写入',
  '可以执行吧', '可以删除吧', '可以写入吧',
])

export function isOutlineDeletionAffirmativeInput(text: string): boolean {
  const normalized = String(text || '')
    .trim()
    .replace(/[。.!！?？，,\s]/g, '')
  if (!normalized || normalized.length > 24) return false
  return AFFIRMATIVE_COMMANDS.has(normalized)
}

export function resolveOutlineDeletionGate(input: {
  commands: EditorEditCommand[]
  integrity: OutlineIntegrityReport
}): OutlineDeletionGateDecision {
  const issueDetails = input.integrity.issues
    .map(issue => `[${issue.level}] ${issue.type}: ${issue.message}`)
    .join('；')
  if (!isHeadingDeletionConfirmationRequired(input)) {
    return {
      action: 'block',
      code: 'integrity_failed',
      message: `结构完整性校验未通过：${input.integrity.summary}${issueDetails ? `；具体问题：${issueDetails}` : ''}。请按具体问题调整后整批重试；原文未修改，预演通过条目也未写入，禁止重复提交原批次，移动整节请使用 move 操作。`,
    }
  }
  return {
    action: 'request_confirmation',
    code: 'heading_deletion_requires_user_confirmation',
    targetSignature: buildOutlineDeletionTargetSignature(input.commands),
    message: `本次删除会减少大纲标题，需要用户授权后才能执行。请停止调用工具并说明“等待用户授权删除”；用户授权后应用会重放本批次。删除目标：${describeDeletionTargets(input.commands) || '未识别到目标'}。授权前原文不会被修改。`,
  }
}

export function createOutlineDeletionContract(): OutlineDeletionContractState & {
  request(input: {
    turnId: string
    commands: EditorEditCommand[]
    original: string
    next: string
    reason?: string
  }): OutlineDeletionConfirmation
  grant(turnId: string): OutlineDeletionConfirmation | null
  consume(turnId: string, input: {
    commands: EditorEditCommand[]
    original: string
    next: string
  }): boolean
  dismiss(turnId: string): OutlineDeletionConfirmation | null
  supersede(turnId: string): OutlineDeletionConfirmation | null
  getPending(turnId: string): OutlineDeletionConfirmation | null
  list(): OutlineDeletionConfirmation[]
} {
  const state: OutlineDeletionContractState = { confirmations: [] }
  const findByTurn = (turnId: string) =>
    [...state.confirmations].reverse().find(item => item.turnId === turnId) || null
  return {
    ...state,
    request(input) {
      const fingerprint = buildOutlineDeletionFingerprint(input)
      const confirmation: OutlineDeletionConfirmation = {
        status: 'requested',
        turnId: input.turnId,
        targetSignature: buildOutlineDeletionTargetSignature(input.commands),
        commandHash: fingerprint.commandHash,
        originalHash: fingerprint.originalHash,
        expectedNextHash: fingerprint.expectedNextHash,
        expectedDeletedLength: fingerprint.expectedDeletedLength,
        reason: input.reason || '模型请求删除大纲标题，需要用户确认',
      }
      state.confirmations.push(confirmation)
      return confirmation
    },
    grant(turnId) {
      const confirmation = findByTurn(turnId)
      if (!confirmation || confirmation.status !== 'requested') return null
      confirmation.status = 'granted'
      return confirmation
    },
    consume(turnId, input) {
      const confirmation = findByTurn(turnId)
      if (!confirmation || confirmation.status !== 'granted') return false
      const fingerprint = buildOutlineDeletionFingerprint(input)
      if (
        confirmation.targetSignature !== buildOutlineDeletionTargetSignature(input.commands)
        || confirmation.commandHash !== fingerprint.commandHash
        || confirmation.originalHash !== fingerprint.originalHash
        || confirmation.expectedNextHash !== fingerprint.expectedNextHash
        || confirmation.expectedDeletedLength !== fingerprint.expectedDeletedLength
      ) return false
      confirmation.status = 'consumed'
      return true
    },
    dismiss(turnId) {
      const confirmation = findByTurn(turnId)
      if (!confirmation || confirmation.status === 'consumed') return null
      confirmation.status = 'dismissed'
      return confirmation
    },
    supersede(turnId) {
      const confirmation = findByTurn(turnId)
      if (!confirmation || confirmation.status === 'consumed') return null
      confirmation.status = 'superseded'
      return confirmation
    },
    getPending: findByTurn,
    list: () => state.confirmations,
  }
}
