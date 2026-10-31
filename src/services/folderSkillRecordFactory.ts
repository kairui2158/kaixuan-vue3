import type { Skill } from '../stores/skill'
import {
  buildFolderSkillId,
  normalizeContextPolicy,
  parseFolderSkillId,
} from './skillIdentity'

export { FOLDER_SKILL_ID_PREFIX, buildFolderSkillId, parseFolderSkillId } from './skillIdentity'

function normalizeWarnings(warnings: unknown): number {
  return Array.isArray(warnings) ? warnings.length : 0
}

function normalizeIntents(skill: Record<string, any>): string[] | undefined {
  const intents = skill?.meta?.intents
  if (!Array.isArray(intents)) return undefined
  const normalized = intents.filter(item => typeof item === 'string')
  return normalized.length > 0 ? normalized : undefined
}

function normalizeSkillContextPolicy(skill: Record<string, any>): Skill['contextPolicy'] | undefined {
  const policy = skill?.meta?.contextPolicy
  return normalizeContextPolicy(policy).policy
}

function normalizeMeta(skill: Record<string, any>): Record<string, unknown> | undefined {
  if (!skill?.meta || typeof skill.meta !== 'object' || Array.isArray(skill.meta)) return undefined
  return skill.meta as Record<string, unknown>
}

export interface BuildFolderSkillRecordInput {
  /** Raw loader response from Electron `skill:loadFolder`. */
  loaded: any
  /** Requested path; used when Electron did not resolve an absolute path. */
  folderPath?: string
  source?: Skill['source']
  packageHash?: string
  now?: string
}

/**
 * Single constructor for every folder import entry (single folder, batch
 * import, package install, rollback, and rebind). Store ids are always
 * namespaced so text/folder records cannot collide.
 */
export function buildFolderSkillRecord({
  loaded,
  folderPath = '',
  source = 'external',
  packageHash = '',
  now,
}: BuildFolderSkillRecordInput): Skill {
  const skill = loaded?.skill || {}
  const sourceId = parseFolderSkillId(String(skill.id || ''))
  const timestamp = now || new Date().toISOString()
  return {
    id: buildFolderSkillId(sourceId),
    sourceId,
    name: String(skill.name || sourceId),
    version: typeof skill.manifest?.version === 'string' ? skill.manifest.version : '',
    format: 'folder',
    folderPath: String(loaded?.folderPath || folderPath),
    source,
    packageHash,
    template: String(skill.template || ''),
    category: 'folder',
    description: String(skill.description || ''),
    resourceSummary: {
      resourceCount: Array.isArray(skill.resources) ? skill.resources.length : 0,
      warningCount: normalizeWarnings(skill.warnings)
    },
    executionMode: 'chain',
    outputFormat: 'text',
    validationRules: [],
    splitSize: 1000,
    injectMode: 'system_prefix',
    bindTarget: 'project',
    linkedSkillIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    customVars: {},
    inputSchema: '',
    outputSchema: '',
    retryPolicy: '',
    meta: normalizeMeta(skill),
    intents: normalizeIntents(skill),
    contextPolicy: normalizeSkillContextPolicy(skill)
  }
}
