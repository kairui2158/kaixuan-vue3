export interface RealSkillMeta {
  agent?: RealSkillAgentContext
  apiCallLimit?: number
  sampleCount?: number
  smartSamples?: boolean
  executionMode?: string
  passes?: unknown[]
  intents?: string[]
  [key: string]: unknown
}

export interface RealSkillPackage {
  id: string
  name: string
  description: string
  /** Parsed SKILL.md body. The activation request always keeps it alongside template.md. */
  body?: string
  template: string
  meta: RealSkillMeta
  script: string
  samples: string
  schema: Record<string, unknown> | null
  /** Optional evals.json payload carried from the skill folder. */
  evals?: Record<string, unknown> | null
  /** Optional explicit package declaration from skill.json. */
  manifest?: RealSkillManifest | null
  folderPath: string
  /** Folder resources outside the six legacy entry files; fully loaded on activation. */
  resources?: RealSkillResource[]
  /** Loader warnings such as template fallback or ignored invalid optional JSON. */
  warnings?: RealSkillLoadWarning[]
  /** Content fingerprints for the entry files that were actually loaded. */
  fingerprint?: RealSkillFileFingerprint[]
}

export interface RealSkillPostProcessReport {
  applied: boolean
  changedOutput: boolean
  output: string
  issues: Array<{
    severity: 'blocking' | 'warning' | 'info'
    code: string
    message: string
  }>
  durationMs: number
}

export interface WorkspaceSkillRunMetaPostProcess {
  applied: boolean
  changedOutput: boolean
  issues: Array<{
    severity: 'blocking' | 'warning' | 'info'
    code: string
    message: string
  }>
  durationMs: number
}

export interface RealSkillFileFingerprint {
  file: string
  hash: string
  mtime: number
  bytes: number
}

export interface RealSkillManifest {
  id?: string
  name?: string
  version?: string
  compatibility?: Record<string, string>
  [key: string]: unknown
}

export interface RealSkillResource {
  path: string
  content: string
}

/** Loader-level diagnostics carried on the package for import preview and run traces. */
export type RealSkillPackageWarnings = RealSkillLoadWarning[]

export interface RealSkillLoadWarning {
  code: string
  message: string
}

export interface RealSkillLoadResult {
  package: RealSkillPackage | null
  error: string | null
  folderPackageCache?: boolean
  warnings?: RealSkillLoadWarning[]
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
  folderPackageCache: boolean
  /** Structured summary of the final postProcess hook execution. */
  postProcessReport?: RealSkillPostProcessReport
  apiMeta?: {
    finishReason?: string
    providerId?: string
    usage?: Record<string, unknown>
    /** Final effective output token limit for the physical API request. */
    maxTokens?: number
    /** Full reasoning text from the final physical API request. */
    reasoningText?: string
    requestMessages: Array<{ role: string; content: string }>
    toolCalls?: Array<{ name: string; input: unknown }>
    toolResults?: Array<{ call: { name: string; input: unknown }; result: unknown }>
    toolRequestDeltas?: Array<{ role: string; content: string }>
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
  /** Editor target identity for tool execution; must match the active write target. */
  toolContext?: {
    projectId?: string
    workspace?: 'main' | 'outline'
    targetId?: string
    readableTargets?: string[]
  }
  agent?: RealSkillAgentContext | null
  /** App-level prompt appended after the folder template (for example body-layer DEAI rules). */
  systemPromptSuffix?: string
  /** Marks that `agent` is an explicit user binding, which takes priority over meta.agent. */
  agentSource?: 'user-binding' | 'step-default' | 'none'
  /** Compose-mode merged template. When present it replaces the folder's static template. */
  baseTemplateOverride?: string
  /** Variable-resolved template for this folder in pipeline chain mode. */
  resolvedTemplate?: string
  /** Live pipeline variables injected into folder template.md placeholders. */
  templateVariables?: Record<string, unknown>
  purpose?: 'rewrite' | 'verify' | 'generate'
  budget: { tryConsume: (step: string, skillLimit?: number | null) => ApiBudgetDecisionLike }
  skillId?: string
  aiService?: {
    callAi: (params: any) => Promise<{ text: string; finishReason?: string; providerId?: string; usage?: Record<string, unknown> }>
  }
  /** Retry strategy for reasoning models whose thinking consumes the output budget. */
  reasoningRetry?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
  stream?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  onChunk?: (text: string) => void
    /** Reasoning stream, delta-only; callers accumulate it for progress UI. */
    onReasoning?: (text: string) => void
  onPhysicalCall?: (event: import('./aiService').PhysicalCallEvent) => void
  /** Fires when an API response is classified unusable and before/after direct-output retry. */
  onGenerationEvent?: (event: {
    type: 'generation-invalid' | 'direct-retry-start' | 'direct-retry-finished'
    kind?: string
    message?: string
    reasoningLength?: number
    textLength?: number
    durationMs?: number
    success?: boolean
    retryStrategy?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
    maxTokens?: number
  }) => void
  /** Fires once when the real request messages have been built, before the API call. */
  onRequestBuilt?: (messages: Array<{ role: string; content: string }>) => void
  /** When true, schema.json is enforced even for a non-final chain step; failures are warnings, not retries. */
  validateOutputSchema?: boolean
  messageBuilder?: (systemPrompt: string, userPrompt: string) => Array<{ role: string; content: string }>
  /** Optional agent tools. Callers keep write access intent-scoped; folder scripts never gain direct writes. */
  tools?: import('./editorTools').AgentToolDefinition[]
  toolPolicy?: {
    maxToolIterations?: number
    intent?: import('./dialogueFoundation').DialogueIntent
    onCompatibilityMode?: (reason: string) => void
    onToolStart?: (event: {
      toolName: string
      policy: 'read' | 'write'
      iteration: number
      input: unknown
    }) => void
    onToolCall?: (event: {
      toolName: string
      policy: 'read' | 'write'
      iteration: number
      input: unknown
      result: import('./editorTools').ToolResult
      durationMs: number
    }) => void
  }
}

export interface ApiBudgetDecisionLike {
  status: 'allowed' | 'blocked'
  used: number
  limit: number
  reason?: string
  step?: string
}
