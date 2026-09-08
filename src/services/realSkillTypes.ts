export interface RealSkillMeta {
  agent?: RealSkillAgentContext
  apiCallLimit?: number
  sampleCount?: number
  smartSamples?: boolean
  executionMode?: string
  passes?: unknown[]
  [key: string]: unknown
}

export interface RealSkillPackage {
  id: string
  name: string
  description: string
  template: string
  meta: RealSkillMeta
  script: string
  samples: string
  schema: Record<string, unknown> | null
  folderPath: string
}

export interface RealSkillLoadResult {
  package: RealSkillPackage | null
  error: string | null
  fromCache?: boolean
}

export type RealSkillExecutionStatus =
  | 'success'
  | 'failed'
  | 'degraded'
  | 'blocked'

export interface RealSkillDiagnostic {
  type: 'info' | 'warning' | 'error'
  code: string
  message: string
  at: string
}

export interface RealSkillExecutionResult {
  status: RealSkillExecutionStatus
  output: string
  errors: string[]
  diagnostics: RealSkillDiagnostic[]
  fromCache: boolean
  apiMeta?: {
    finishReason?: string
    providerId?: string
    requestMessages: Array<{ role: string; content: string }>
  }
}

export interface RealSkillAgentContext {
  systemPrompt?: string
  model?: string
  temperature?: number
  maxTokens?: number
  id?: string
}

export interface RealSkillExecuteOptions {
  folderPath: string
  input: string
  agent?: RealSkillAgentContext | null
  /** App-level prompt appended after the folder template (for example body-layer DEAI rules). */
  systemPromptSuffix?: string
  /** Marks that `agent` is an explicit user binding, which takes priority over meta.agent. */
  agentSource?: 'user-binding' | 'step-default' | 'none'
  /** Compose-mode merged template. When present it replaces the folder's static template. */
  baseTemplateOverride?: string
  /** Variable-resolved template for this folder in pipeline chain mode. */
  resolvedTemplate?: string
  purpose?: 'rewrite' | 'verify' | 'generate'
  budget: { tryConsume: (step: string, skillLimit?: number | null) => ApiBudgetDecisionLike }
  skillId?: string
  aiService?: {
    callAi: (params: any) => Promise<{ text: string; finishReason?: string; providerId?: string }>
  }
  stream?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  onChunk?: (text: string) => void
  messageBuilder?: (systemPrompt: string, userPrompt: string) => Array<{ role: string; content: string }>
}

export interface ApiBudgetDecisionLike {
  status: 'allowed' | 'blocked'
  used: number
  limit: number
  reason?: string
  step?: string
}
