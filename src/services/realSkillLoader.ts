import type { RealSkillPackage, RealSkillLoadResult } from './realSkillTypes'

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
    return { package: cached.package, error: null, fromCache: true }
  }

  try {
    const response = await api.skillLoadFolder(folderPath)
    if (!response || response.ok !== true || !response.skill) {
      return { package: null, error: response?.code || 'skill-load-failed' }
    }

    const skill = response.skill
    const pkg: RealSkillPackage = {
      id: String(skill.id || ''),
      name: String(skill.name || skill.id || ''),
      description: String(skill.description || ''),
      template: String(skill.template || ''),
      meta: (skill.meta && typeof skill.meta === 'object') ? skill.meta : {},
      script: String(skill.script || ''),
      samples: String(skill.samples || ''),
      schema: (skill.schema && typeof skill.schema === 'object') ? skill.schema : null,
      folderPath: String(response.folderPath || folderPath)
    }
    cache.set(folderPath, { package: pkg, expiresAt: Date.now() + CACHE_TTL_MS })
    return { package: pkg, error: null, fromCache: false }
  } catch (error: any) {
    return { package: null, error: error?.code || error?.message || 'skill-load-exception' }
  }
}

export function clearRealSkillCache(folderPath?: string) {
  if (folderPath) cache.delete(folderPath)
  else cache.clear()
}
