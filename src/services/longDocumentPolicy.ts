export type LongDocumentDecisionReason =
  | 'whole-document-request'
  | 'structural-move-request'
  | 'large-document-request'
  | 'char-threshold'
  | 'byte-threshold'
  | 'short-document'

export interface LongDocumentDecision {
  longDocument: boolean
  reason: LongDocumentDecisionReason
  requestText: string
  outlineChars: number
  outlineBytes: number | null
  editTaskExecution: boolean
  finalDraftCandidate: boolean
  executionModeReason: string
}

export const LONG_DOCUMENT_CHAR_THRESHOLD = 10_000
export const LONG_DOCUMENT_BYTE_THRESHOLD = 10_000

export type LongDocumentOperationType =
  | 'whole-document-restructure'
  | 'whole-document-replacement'
  | 'large-scope-edit'
  | 'targeted-edit'
  | 'discussion'

export interface LongDocumentAutoRouteResult {
  editTask: boolean
  finalDraft: boolean
  reason: string
}

const WHOLE_DOCUMENT_REQUEST_PATTERN = /(整理|重排|统一|全文|整篇|整份|全文替换|全篇|全部内容)/
const STRUCTURAL_MOVE_REQUEST_PATTERN = /(移动|调换|交换|调整)[^。\n]{0,24}(第\s*[0-9一二三四五六七八九十百千]+\s*[节章卷]|某[节章卷]|[节章卷]的顺序|顺序)/
const WHOLE_DOCUMENT_REPLACEMENT_PATTERN = /(全文替换|全部替换|整篇重写|全文重写|重写整篇|重写全文)/
const WHOLE_DOCUMENT_RESTRUCTURE_PATTERN = /(整理|重排|排序|统一编号|统一格式|规整|全文|整篇|全篇)/
const TARGETED_EDIT_PATTERN = /(修改|删除|插入|替换|增加|添加|改写|微调|润色)/

const defaultEncode = (text: string): number | null => {
  if (typeof TextEncoder === 'undefined') return null
  return new TextEncoder().encode(text).length
}

export function analyzeLongDocumentRequest(
  requestText: string,
  outlineText: string,
  encode: (text: string) => number | null = defaultEncode,
): LongDocumentDecision {
  const outlineChars = outlineText.length
  const outlineBytes = encode(outlineText)
  const base = { requestText, outlineChars, outlineBytes }
  const buildDecision = (input: {
    longDocument: boolean
    reason: LongDocumentDecisionReason
    editTaskExecution: boolean
    finalDraftCandidate: boolean
    executionModeReason: string
  }): LongDocumentDecision => ({ ...base, ...input })
  if (WHOLE_DOCUMENT_REQUEST_PATTERN.test(requestText)) {
    return buildDecision({
      longDocument: true,
      reason: 'whole-document-request',
      editTaskExecution: false,
      finalDraftCandidate: true,
      executionModeReason: 'whole-document-request-final-draft',
    })
  }
  if (STRUCTURAL_MOVE_REQUEST_PATTERN.test(requestText)) {
    return buildDecision({
      longDocument: true,
      reason: 'structural-move-request',
      editTaskExecution: false,
      finalDraftCandidate: false,
      executionModeReason: 'structural-move-targeted-commands',
    })
  }
  if (outlineChars >= LONG_DOCUMENT_CHAR_THRESHOLD) {
    return buildDecision({
      longDocument: true,
      reason: 'char-threshold',
      editTaskExecution: false,
      finalDraftCandidate: false,
      executionModeReason: 'char-threshold-no-whole-document-request',
    })
  }
  if (outlineBytes !== null && outlineBytes >= LONG_DOCUMENT_BYTE_THRESHOLD) {
    return buildDecision({
      longDocument: true,
      reason: 'byte-threshold',
      editTaskExecution: false,
      finalDraftCandidate: false,
      executionModeReason: 'byte-threshold-no-whole-document-request',
    })
  }
  return buildDecision({
    longDocument: false,
    reason: 'short-document',
    editTaskExecution: false,
    finalDraftCandidate: false,
    executionModeReason: 'short-document-direct-loop',
  })
}

export function classifyLongDocumentOperation(
  requestText: string,
): LongDocumentOperationType {
  if (WHOLE_DOCUMENT_REPLACEMENT_PATTERN.test(requestText)) {
    return 'whole-document-replacement'
  }
  if (WHOLE_DOCUMENT_RESTRUCTURE_PATTERN.test(requestText)) {
    return 'whole-document-restructure'
  }
  if (STRUCTURAL_MOVE_REQUEST_PATTERN.test(requestText)) {
    return 'targeted-edit'
  }
  if (TARGETED_EDIT_PATTERN.test(requestText)) {
    return 'targeted-edit'
  }
  return 'discussion'
}

export function shouldAutoRouteToEditTask(input: {
  length: number
  operationType: LongDocumentOperationType
  availableContextTokens?: number | null
  estimatedDocumentTokens?: number | null
}): LongDocumentAutoRouteResult {
  if (isFinalDraftOperation(input.operationType)) {
    return {
      editTask: false,
      finalDraft: true,
      reason: 'whole-document-operation-final-draft',
    }
  }

  return {
      editTask: false,
      finalDraft: false,
      reason: input.availableContextTokens != null
        && input.estimatedDocumentTokens != null
        && input.estimatedDocumentTokens > input.availableContextTokens
        ? 'targeted-edit-window-gap-packed-tools'
        : 'targeted-edit-direct-tool-loop',
  }
}

export function isFinalDraftOperation(
  operationType: LongDocumentOperationType,
): boolean {
  return operationType === 'whole-document-restructure'
    || operationType === 'whole-document-replacement'
    || operationType === 'large-scope-edit'
}
