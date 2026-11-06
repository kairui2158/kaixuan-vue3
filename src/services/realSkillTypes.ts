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

export interface RealSkillBodyCandidateLedgerEntry {
  attempt: number
  rawChars: number
  netWords: number
  handoffCount: number
  contractDistance: number
  missingHandoff: boolean
  valid: boolean
  errorCount: number
}

export interface RealSkillCandidateLedgerEntry {
  passIndex: number
  attempt: number
  rawChars: number
  /** Retained candidate output for trace response extraction. */
  output?: string
  /** Stable FNV-1a hash of the physical model response before postProcess. */
  sourceResponseHash: string
  /** Candidate validity used by the retention decision. */
  valid: boolean
  /** Actual output-schema validation result, even when degraded to valid. */
  schemaValidationValid?: boolean
  errorCount: number
  errors: string[]
  postProcessIssueCodes: string[]
  retained: boolean
}

export interface RealSkillBodyCandidateRetention {
  retainedCandidateIndex: number
  retainedAttempt: number
  retainedReason: string
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
  /** FNV-1a fingerprint of the script text that produced this report. */
  ruleFingerprint?: string
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
  /** Structured detail for pin mismatches; present when error is skill_version_mismatch. */
  pinMismatch?: {
    folderPath: string
    expected: RealSkillFileFingerprint[]
    actual: RealSkillFileFingerprint[]
  }
  /** Structured load failure with enough context for UI, trace, and repair guidance. */
  failure?: {
    code: string
    message: string
    folderPath: string
    action?: string
  }
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
  /** True when folder postProcess blocked every retained candidate. */
  blockingGateFailed?: boolean
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
    /** null means the request intentionally omitted the output limit. */
    maxTokens?: number | null
    /** Full reasoning text from the final physical API request. */
    reasoningText?: string
    /** Context budget evidence from the final accepted physical API request. */
    contextBudget?: {
      providerContextWindowTokens: number
      estimatedInputTokens: number
      decision: 'fits' | 'needs_segmentation' | 'exceeds_provider'
      reason: string
    }
    usageReconciliation?: unknown
    /** Marks locally composed terminal text from the AI service, not model prose. */
    textOrigin?: 'application' | 'model'
    requestMessages: Array<{ role: string; content: string }>
    /** Every top-level attempt request, keyed by pass and retry attempt. */
    attemptRequestMessages?: Array<{
      passIndex: number
      attempt: number
      messages: Array<{ role: string; content: string }>
    }>
    toolCalls?: Array<{ name: string; input?: unknown }>
    toolResults?: Array<{ call: { id?: string; name: string; input?: unknown }; result: unknown }>
    toolRequestDeltas?: Array<{ role: string; content: string }>
    /** Compact cross-turn tool audit for the next request's system context. */
    toolAudit?: unknown
    /** Observability-only local timing; never changes execution behavior. */
    timingLedger?: {
      requestBuildMs?: number
      schemaValidateMs?: number
      retryMs?: number
      postProcessMs?: number
      /** Number of schema-validation retries consumed before this terminal attempt. */
      schemaRetryCount?: number
      /** Marker-block occurrence counts in the final user prompt; observability only. */
      repeatedPromptBlocks?: Record<string, number>
    }
    /** Candidate ledger position retained by the executor when schema retries are exhausted. */
    retainedCandidateIndex?: number
    /** Per-attempt candidate audit for every folder skill, not only body contracts. */
    candidateLedger?: RealSkillCandidateLedgerEntry[]
    /** Per-attempt protected-body metrics for schema retry diagnosis. */
    bodyCandidateLedger?: RealSkillBodyCandidateLedgerEntry[]
    /** Structured explanation of which retry candidate was retained and why. */
    bodyCandidateRetention?: RealSkillBodyCandidateRetention
  }
}

export interface RealSkillAgentContext {
  systemPrompt?: string
  model?: string
  /** Explicit provider binding; routed through callAi without silent fallback. */
  providerId?: string
  temperature?: number
  /** null means the request intentionally omitted the output limit. */
  maxTokens?: number | null
  id?: string
}

export interface RealSkillProviderModelFallback {
  reason: 'agent-model-without-provider'
  configuredModel: string
}

export interface RealSkillExecuteOptions {
  folderPath: string
  input: string
  /**
   * Run-level SKILL package pin. When present, the executor reloads the
   * package from disk for every attempt and fails closed on any drift,
   * instead of silently adopting a mid-run SKILL file swap.
   */
  pinnedFingerprint?: RealSkillFileFingerprint[]
  onSkillVersionMismatch?: (detail: {
    folderPath: string
    expected: RealSkillFileFingerprint[]
    actual: RealSkillFileFingerprint[]
  }) => void
  /** Explicit trace ownership for observability events; never resolved from global current pointers. */
  traceRunId?: string | null
  /** Current API call identity for pass-input measurements; set by the pipeline caller. */
  traceCallId?: string | null
  /** Declared upstream chain context; used only when SKILL meta declares requiresFullUpstreamContext. */
  chainUpstreamContext?: string
  /** Editor target identity for tool execution; must match the active write target. */
  toolContext?: {
    projectId?: string
    workspace?: 'main' | 'outline'
    targetId?: string
    readableTargets?: string[]
  }
  agent?: RealSkillAgentContext | null
  /** Caller-resolved request profile model; the executor must not recombine provider and model. */
  providerModel?: string
  providerModelSource?: 'caller-profile'
  providerModelFallback?: RealSkillProviderModelFallback
  providerModelMissing?: boolean
  /** App-level prompt appended after the folder template (for example body-layer DEAI rules). */
  systemPromptSuffix?: string
  /** App-owned retry feedback appended to the user prompt, never authored by SKILL guidance. */
  userPromptSuffix?: string
  /** App-owned contract appended after folder preProcess, outside SKILL control. */
  protectedContract?: import('./protectedSkillContract').ProtectedSkillContract
  /** Actual authorized tool surface for this step; declared in the system prompt. */
  toolSurface?: Array<{ name: string; policy: 'read' | 'write' }>
  /** Active edit-task state used to declare restored write permission consistently. */
  activeEditTask?: import('./editTaskService').EditTask | null
  /** App-owned plan used to declare direct-write authorization consistently. */
  executionPlan?: import('./longDocumentExecutionPlanner').LongDocumentExecutionPlan | null
  /** Marks that `agent` is an explicit user binding, which takes priority over meta.agent. */
  agentSource?: 'user-binding' | 'step-default' | 'none'
  /** Compose-mode merged template. When present it replaces the folder's static template. */
  baseTemplateOverride?: string
  /** Variable-resolved template for this folder in pipeline chain mode. */
  resolvedTemplate?: string
  /** Live pipeline variables injected into folder template.md placeholders. */
  templateVariables?: Record<string, unknown>
  purpose?: 'rewrite' | 'verify' | 'generate'
  /** Layer-level provider channel resolved by the pipeline caller. */
  providerId?: string
  /** Observability-only request context identity; never changes request bytes. */
  contextLayer?: 'settings' | 'volumes' | 'chapters' | 'body'
  /** Source of the effective provider binding; kept for request-level diagnostics. */
  providerSource?: 'agent' | 'layer' | 'global'
  budget: { tryConsume: (step: string, skillLimit?: number | null) => ApiBudgetDecisionLike }
  skillId?: string
  aiService?: {
    callAi: (params: any) => Promise<{ text: string; finishReason?: string; providerId?: string; usage?: Record<string, unknown> }>
  }
  /** Retry strategy for reasoning models whose thinking consumes the output budget. */
  reasoningRetry?: 'thinking_disabled' | 'max_tokens_raised' | 'prompt_only'
  /** Final polish-step retry contract; disables candidate-full-text injection. */
  finalStepRetry?: {
    role: 'generator' | 'polish'
    deaiDetection?: 'on' | 'off'
    upstreamAnchors?: string[]
    deaiFindings?: Array<{ code?: string; label?: string; message?: string }>
  }
  onFinalStepFeedbackComposed?: (result: import('./finalStepFeedback').FinalStepFeedbackResult) => void
  onSchemaRetryFeedbackComposed?: (result: import('./schemaRetryFeedback').SchemaRetryFeedbackResult) => void
  stream?: boolean
  signal?: AbortSignal
  timeoutMs?: number
  onChunk?: (text: string) => void
    /** Reasoning stream, delta-only; callers accumulate it for progress UI. */
    onReasoning?: (text: string) => void
  onPhysicalCall?: (event: import('./aiService').PhysicalCallEvent) => void
  /** Provider-slot queue events; observability only, never execution authority. */
  onProviderQueue?: (event: import('./providerScheduler').ProviderQueueEvent) => void
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
    /** null means the request intentionally omitted the output limit. */
    maxTokens?: number | null
  }) => void
  /** Fires for every top-level attempt request, before the API call. */
  onRequestBuilt?: (messages: Array<{ role: string; content: string }>) => void
  /** When true, schema.json is enforced even for a non-final chain step; failures are warnings, not retries. */
  validateOutputSchema?: boolean
  messageBuilder?: (systemPrompt: string, userPrompt: string) => Array<{ role: string; content: string }>
  /** Optional agent tools. Callers keep write access intent-scoped; folder scripts never gain direct writes. */
  tools?: import('./editorTools').AgentToolDefinition[]
  toolPolicy?: {
    scenario?: 'direct' | 'direct-tool-intensive' | 'folder-chain' | 'compatibility-json'
    maxToolIterations?: number
    intent?: import('./dialogueFoundation').DialogueIntent
    /** Single-source permission decision; SKILL declarations never become execution authority. */
    permissionDecision?: import('./dialogueToolSurface').DialoguePermissionDecision
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
