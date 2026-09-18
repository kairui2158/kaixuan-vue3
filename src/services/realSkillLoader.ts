import type {
  RealSkillFileFingerprint,
  RealSkillLoadWarning,
  RealSkillPackage,
  RealSkillLoadResult,
  RealSkillResource,
} from './realSkillTypes'

export type FolderSkillStatus = {
  valid: boolean
  message: string
  capabilities?: Array<'multi-pass' | 'retry' | 'dynamic template' | 'smart samples'>
  templatePreview?: string
}

interface CacheEntry {
  package: RealSkillPackage
  expiresAt: number
}

const CACHE_TTL_MS = 5000
const cache = new Map<string, CacheEntry>()

function normalizeResources(value: unknown): RealSkillResource[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      path: String(item.path || ''),
      content: String(item.content || '')
    }))
    .filter(item => item.path.length > 0)
}

function normalizeFingerprint(value: unknown): RealSkillFileFingerprint[] | undefined {
  if (!Array.isArray(value)) return undefined
  const fingerprint = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      file: String(item.file || ''),
      hash: String(item.hash || ''),
      mtime: typeof item.mtime === 'number' && Number.isFinite(item.mtime) ? item.mtime : 0,
      bytes: typeof item.bytes === 'number' && Number.isFinite(item.bytes) ? item.bytes : 0
    }))
    .filter(item => item.file.length > 0 && item.hash.length > 0)
  return fingerprint.length ? fingerprint : undefined
}

function normalizeWarnings(value: unknown): RealSkillLoadWarning[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map(item => ({
      code: String(item.code || 'unknown-warning'),
      message: String(item.message || '')
    }))
    .filter(item => item.message.length > 0)
}

function bridge(): {
  skillLoadFolder?: (folderPath: string) => Promise<any>
} | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as any).electronAPI
}

/**
 * Loads a folder SKILL through the Electron IPC bridge.
 * Returns null instead of throwing: callers decide whether to fall back to the text path.
 */
export async function loadRealSkill(folderPath: string): Promise<RealSkillLoadResult> {
  const api = bridge()
  if (!folderPath || !api?.skillLoadFolder) {
    return { package: null, error: 'skill-bridge-unavailable' }
  }

  const cached = cache.get(folderPath)
  if (cached && cached.expiresAt > Date.now()) {
    return {
      package: cached.package,
      error: null,
      folderPackageCache: true,
      warnings: cached.package.warnings || []
    }
  }

  try {
    const response = await api.skillLoadFolder(folderPath)
    if (!response || response.ok !== true || !response.skill) {
      return { package: null, error: response?.code || 'skill-load-failed' }
    }

    const skill = response.skill
    const warnings = normalizeWarnings(response.skill?.warnings)
    const pkg: RealSkillPackage = {
      id: String(skill.id || ''),
      name: String(skill.name || skill.id || ''),
      description: String(skill.description || ''),
      body: typeof skill.body === 'string' ? skill.body : '',
      template: String(skill.template || ''),
      meta: (skill.meta && typeof skill.meta === 'object') ? skill.meta : {},
      script: String(skill.script || ''),
      samples: String(skill.samples || ''),
      schema: (skill.schema && typeof skill.schema === 'object') ? skill.schema : null,
      evals: (skill.evals && typeof skill.evals === 'object' && !Array.isArray(skill.evals)) ? skill.evals : null,
      folderPath: String(response.folderPath || folderPath),
      resources: normalizeResources(skill.resources),
      fingerprint: normalizeFingerprint(skill.fingerprint),
      warnings
    }
    cache.set(folderPath, { package: pkg, expiresAt: Date.now() + CACHE_TTL_MS })
    return { package: pkg, error: null, folderPackageCache: false, warnings }
  } catch (error: any) {
    return { package: null, error: error?.code || error?.message || 'skill-load-exception' }
  }
}

export function clearRealSkillCache(folderPath?: string) {
  if (folderPath) cache.delete(folderPath)
  else cache.clear()
}
