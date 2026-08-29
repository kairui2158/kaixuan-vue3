export const CONFIG_PROTOCOL = {
  agent: { schema: 'shenyi.agent', version: 1 },
  skill: { schema: 'shenyi.skill', version: 2 },
  skillMd: { schema: 'shenyi.skill', version: 1 },
  binding: { schema: 'shenyi.binding', version: 1 },
  bundle: { schema: 'shenyi.bundle', version: 1 },
} as const

export const AGENT_JSON_VERSION = 1
export const SKILL_JSON_VERSION = 2
export const SKILL_MD_VERSION = 1
export const BINDING_JSON_VERSION = 1
export const BUNDLE_JSON_VERSION = 1

export type ExchangeExecutionMode =
  | 'chain'
  | 'compose'
  | 'split-merge'
  | 'multi-step'

/** The two supported Markdown input shapes share the same normalized records. */
export type ConfigSourceFormat = 'json' | 'markdown'
export type MarkdownInputKind = 'front-matter' | 'plain-markdown'
export type ConfigItemKind = 'agent' | 'skill'
export type ConfigFieldOrigin = 'source' | 'mapped' | 'inferred' | 'defaulted'

export interface ConfigFieldTrace {
  field: string
  origin: ConfigFieldOrigin
  sourceField?: string
  value?: unknown
}

export interface ConfigSourceInfo {
  format: ConfigSourceFormat
  markdownKind?: MarkdownInputKind
  fileName?: string
  extension?: string
}

export interface ConfigDiagnostic {
  level: 'info' | 'warning' | 'error'
  code: ConfigIssueCode | 'encoding' | 'front-matter' | 'mapping' | 'inference'
  message: string
  field?: string
  sourceField?: string
  itemId?: string
}

export interface AgentRecord {
  id: string
  name: string
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  description?: string
  provider?: string
  tools?: string[]
  createdAt?: string
  updatedAt?: string
}

export interface SkillRecord {
  id: string
  name: string
  template: string
  category: string
  description?: string
  executionMode: ExchangeExecutionMode
  outputFormat: 'json' | 'text'
  validationRules: string[]
  splitSize: number
  injectMode?: string
  bindTarget?: unknown
  linkedSkillIds?: string[]
  createdAt?: string
  updatedAt?: string
  injectFrequency?: string
  injectDepth?: number
  customVars?: Record<string, string>
  inputSchema?: unknown
  outputSchema?: unknown
  retryPolicy?: unknown
}

export interface PipelineBindingRecord {
  agents: Record<string, string>
  skills: Record<string, string[]>
  modes: Record<string, string>
  skillAgents: Record<string, string>
}

export interface AgentJsonPayload {
  agents: AgentRecord[]
  unknownFields: string[]
}

export interface ParsedConfigItem<T> {
  item: T
  kind: ConfigItemKind
  source: ConfigSourceInfo
  fields: ConfigFieldTrace[]
  unknownFields: string[]
  diagnostics: ConfigDiagnostic[]
}

export interface SkillJsonPayload {
  skills: SkillRecord[]
  pipelineSkills: string[]
  deAiSkills: string[]
  unknownFields: string[]
}

export interface BundleJsonPayload {
  agents: AgentRecord[]
  skills: SkillRecord[]
  pipelineSkills: string[]
  deAiSkills: string[]
  bindings: PipelineBindingRecord
  unknownFields: string[]
}

export type ConfigIssueCode =
  | 'schema'
  | 'version'
  | 'json'
  | 'field'
  | 'item'
  | 'warning'

export interface ConfigIssue {
  code: ConfigIssueCode
  field: string
  message: string
}

export interface ConfigParseResult<T> {
  ok: boolean
  value?: T
  issues: ConfigIssue[]
  source?: ConfigSourceInfo
  fieldTrace?: ConfigFieldTrace[]
  diagnostics?: ConfigDiagnostic[]
  addedCount?: number
  skippedCount?: number
}

export type ImportStrategy = 'skip' | 'overwrite'

export interface ImportPlanItem {
  id: string
  name: string
  action: 'add' | 'update' | 'skip'
  reason: string
}
