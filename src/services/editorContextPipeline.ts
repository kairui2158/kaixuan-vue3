import {
  CONTEXT_BUDGET_DEFAULTS,
  estimateInputTokens,
  resolveContextWindowTokens,
} from './contextBudget'
import {
  buildPackedMainEditorContextPack,
  editorContextInjectionMode,
} from './editorContextPolicy'
import { buildOutlineContextPack, resolveModelContextWindow } from './conversationContextService'
import type { EditorTargetSnapshot } from './editorTarget'

export const EDITOR_CONTEXT_PIPELINE_STAGES = [
  'retrieve',
  'filter',
  'rank',
  'assemble',
  'validate',
] as const

export type EditorContextPipelineStage = (typeof EDITOR_CONTEXT_PIPELINE_STAGES)[number]
export type EditorContextPipelineMode = 'full' | 'packed'

export interface EditorContextPipelineValidation {
  valid: boolean
  reason:
    | 'full-mode-no-window-check'
    | 'unknown-window-skipped'
    | 'within-available-window'
    | 'downgraded-to-packed'
    | 'exceeds-available-window'
    | 'missing-editor-read-guidance'
}

export interface EditorContextPipelineResult {
  workspace: EditorTargetSnapshot['workspace']
  mode: EditorContextPipelineMode
  content: string
  stages: EditorContextPipelineStage[]
  estimatedInputTokens: number
  availableContextTokens: number | null
  windowDeclared: boolean
  downgradeReason?: 'full-context-exceeds-available-window'
  validation: EditorContextPipelineValidation
}

interface ProviderWindowLike {
  contextWindowTokens?: number | string | null
}

function resolveWindow(input: {
  provider: ProviderWindowLike | null | undefined
  model: string
}): { windowTokens: number | null; windowDeclared: boolean } {
  const providerWindow = resolveContextWindowTokens(input.provider || {})
  if (providerWindow > 0) return { windowTokens: providerWindow, windowDeclared: true }
  const modelWindow = resolveModelContextWindow(input.model)
  if (typeof modelWindow === 'number' && modelWindow > 0) {
    return { windowTokens: modelWindow, windowDeclared: true }
  }
  return { windowTokens: null, windowDeclared: false }
}

function buildPackedContent(
  target: EditorTargetSnapshot,
  mode: EditorContextPipelineMode,
): string {
  if (mode === 'full') return target.content
  if (target.workspace === 'outline') {
    return buildOutlineContextPack(target.content, target.selectedText)
  }
  return buildPackedMainEditorContextPack({
    label: target.label,
    content: target.content,
    selection: {
      selectionStart: target.selectionStart,
      selectionEnd: target.selectionEnd,
      selectedText: target.selectedText,
    },
  })
}

export function buildEditorContextPipeline(input: {
  target: EditorTargetSnapshot
  provider?: ProviderWindowLike | null
  model?: string
  maxOutputTokens?: number | null
  /** Test-only escape hatch for validating the guard itself. */
  forceInvalidPackForTest?: boolean
}): EditorContextPipelineResult {
  const { windowTokens, windowDeclared } = resolveWindow({
    provider: input.provider,
    model: input.model || '',
  })
  const contentLength = input.target.content.length
  const requestedMode = input.target.workspace === 'outline'
    ? 'packed' as const
    : editorContextInjectionMode(contentLength)
  const estimatedDocumentTokens = estimateInputTokens(input.target.content)

  let mode: EditorContextPipelineMode = requestedMode
  let downgradeReason: EditorContextPipelineResult['downgradeReason']
  if (mode === 'full' && windowTokens != null) {
    const outputReserve = input.maxOutputTokens == null || input.maxOutputTokens <= 0
      ? CONTEXT_BUDGET_DEFAULTS.defaultOutputReserveTokens
      : Math.floor(input.maxOutputTokens)
    const availableContextTokens = Math.max(
      0,
      Math.floor(windowTokens * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio) - outputReserve,
    )
    if (estimatedDocumentTokens > availableContextTokens) {
      mode = 'packed'
      downgradeReason = 'full-context-exceeds-available-window'
    }
  }

  // assemble: only the target itself is currently a first-class context source.
  // Future sources enter here, keeping mode selection and validation unchanged.
  const content = input.forceInvalidPackForTest
    ? ''
    : buildPackedContent(input.target, mode)
  const estimatedInputTokens = estimateInputTokens(content)
  const availableContextTokens = (() => {
    if (windowTokens == null) return null
    const outputReserve = input.maxOutputTokens == null || input.maxOutputTokens <= 0
      ? CONTEXT_BUDGET_DEFAULTS.defaultOutputReserveTokens
      : Math.floor(input.maxOutputTokens)
    return Math.max(
      0,
      Math.floor(windowTokens * CONTEXT_BUDGET_DEFAULTS.windowSafetyRatio) - outputReserve,
    )
  })()

  const validation = (() => {
    if (input.forceInvalidPackForTest) {
      return { valid: false, reason: 'missing-editor-read-guidance' } as const
    }
    if (mode === 'full') {
      return { valid: true, reason: 'full-mode-no-window-check' } as const
    }
    if (input.target.workspace === 'outline') {
      if (!content.includes('[大纲结构地图]') || !content.includes('[当前焦点全文]')) {
        return { valid: false, reason: 'missing-editor-read-guidance' } as const
      }
    } else if (!content.includes('editor.document_map') || !content.includes('editor.read_range')) {
      return { valid: false, reason: 'missing-editor-read-guidance' } as const
    }
    if (availableContextTokens == null) {
      return { valid: true, reason: 'unknown-window-skipped' } as const
    }
    if (estimatedInputTokens > availableContextTokens) {
      return { valid: false, reason: 'exceeds-available-window' } as const
    }
    return { valid: true, reason: 'within-available-window' } as const
  })()

  return {
    workspace: input.target.workspace,
    mode,
    content,
    stages: [...EDITOR_CONTEXT_PIPELINE_STAGES],
    estimatedInputTokens,
    availableContextTokens,
    windowDeclared,
    downgradeReason,
    validation,
  }
}
