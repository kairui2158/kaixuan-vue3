import {
  estimateInputTokens,
  resolveContextWindowTokens,
  resolvePlanningInputBudget,
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

interface OutlineContextPackOptions {
  maxFocusChars?: number | null
}

const OUTLINE_PACK_OVERHEAD_CHARS = 4_000

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
  maxFocusChars?: number | null,
): string {
  if (mode === 'full') {
    return target.workspace === 'outline'
      ? `[当前全文已注入]\n${target.content}`
      : target.content
  }
  if (target.workspace === 'outline') {
    return buildOutlineContextPack(target.content, target.selectedText, { maxFocusChars })
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
  const estimatedDocumentTokens = estimateInputTokens(input.target.content)
  const requestedMode = input.target.workspace === 'outline'
    ? (() => {
      if (windowTokens == null) return 'packed' as const
      const availableForOutline = resolvePlanningInputBudget({
        contextWindowTokens: windowTokens,
        maxOutputTokens: input.maxOutputTokens,
      })
      return estimatedDocumentTokens <= availableForOutline
        ? 'full' as const
        : 'packed' as const
    })()
    : editorContextInjectionMode(contentLength)

  let mode: EditorContextPipelineMode = requestedMode
  let downgradeReason: EditorContextPipelineResult['downgradeReason']
  if (mode === 'full' && windowTokens != null) {
    const availableContextTokens = resolvePlanningInputBudget({
      contextWindowTokens: windowTokens,
      maxOutputTokens: input.maxOutputTokens,
    })
    if (estimatedDocumentTokens > availableContextTokens) {
      mode = 'packed'
      downgradeReason = 'full-context-exceeds-available-window'
    }
  }

  // assemble: only the target itself is currently a first-class context source.
  // Future sources enter here, keeping mode selection and validation unchanged.
  const maxFocusChars = (() => {
    if (windowTokens == null) return null
    const availableContextTokensForPack = resolvePlanningInputBudget({
      contextWindowTokens: windowTokens,
      maxOutputTokens: input.maxOutputTokens,
    })
    if (availableContextTokensForPack <= 0) return 0
    const maxPackChars = Math.floor(availableContextTokensForPack * 1.7) - OUTLINE_PACK_OVERHEAD_CHARS
    return Math.max(0, maxPackChars)
  })()
  const content = input.forceInvalidPackForTest
    ? ''
    : buildPackedContent(input.target, mode, maxFocusChars)
  const estimatedInputTokens = estimateInputTokens(content)
  const availableContextTokens = (() => {
    if (windowTokens == null) return null
    return resolvePlanningInputBudget({
      contextWindowTokens: windowTokens,
      maxOutputTokens: input.maxOutputTokens,
    })
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
