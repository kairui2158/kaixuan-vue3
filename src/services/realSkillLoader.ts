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

function fingerprintsMatch(
  expected: RealSkillFileFingerprint[],
  actual: RealSkillFileFingerprint[]
): boolean {
  if (expected.length !== actual.length) return false
  const actualByFile = new Map(actual.map(item => [item.file, item]))
  return expected.every(item => {
    const counterpart = actualByFile.get(item.file)
    if (!counterpart) return false
    return item.hash === counterpart.hash
      && item.mtime === counterpart.mtime
      && item.bytes === counterpart.bytes
  })
}

/**
 * Loads a folder SKILL through the Electron IPC bridge.
 * Returns null instead of throwing: callers decide whether to fall back to the text path.
 */
export async function loadRealSkill(
  folderPath: string,
  options: {
    pinnedFingerprint?: RealSkillFileFingerprint[]
    /** Used only to establish a run baseline; avoids adopting a stale TTL entry. */
    forceRefresh?: boolean
  } = {}
): Promise<RealSkillLoadResult> {
  const api = bridge()
  if (!folderPath || !api?.skillLoadFolder) {
    return {
      package: null,
      error: 'skill-bridge-unavailable',
      failure: {
        code: 'skill-bridge-unavailable',
        message: !folderPath ? 'SKILL 未绑定文件夹路径' : 'Electron SKILL 桥不可用，无法读取技能目录',
        folderPath: folderPath || '',
        action: !folderPath ? '请重新选择技能文件夹' : '请重启应用后重试'
      }
    }
  }

  const pinnedFingerprint = options.pinnedFingerprint
  // Pin verification bypasses the TTL cache: a cached package predates the
  // pin and cannot prove the current disk state matches the run baseline.
  if (!pinnedFingerprint && !options.forceRefresh) {
    const cached = cache.get(folderPath)
    if (cached && cached.expiresAt > Date.now()) {
      return {
        package: cached.package,
        error: null,
        folderPackageCache: true,
        warnings: cached.package.warnings || []
      }
    }
  }

  try {
    const response = await api.skillLoadFolder(folderPath)
    if (!response || response.ok !== true || !response.skill) {
      const code = String(response?.code || 'skill-load-failed')
      const message = String(response?.message || 'SKILL 文件夹加载失败')
      return {
        package: null,
        error: code,
        failure: {
          code,
          message,
          folderPath,
          action: code === 'folder-not-found'
            ? '请到技能设置中重新选择该技能的文件夹'
            : '请检查技能目录内容后重试'
        }
      }
    }

    const skill = response.skill
    const warnings = normalizeWarnings(response.skill?.warnings)
    const fingerprint = normalizeFingerprint(skill.fingerprint)
    if (pinnedFingerprint && (!fingerprint || !fingerprintsMatch(pinnedFingerprint, fingerprint))) {
      return {
        package: null,
        error: 'skill_version_mismatch',
        pinMismatch: {
          folderPath,
          expected: pinnedFingerprint,
          actual: fingerprint || []
        },
        failure: {
          code: 'skill_version_mismatch',
          message: 'SKILL 目录内容与运行基准不一致，禁止中途换闸',
          folderPath,
          action: '请结束本次运行后重新启动，或将 SKILL 目录恢复到运行开始时的内容'
        }
      }
    }
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
      fingerprint,
      warnings
    }
    if (!pinnedFingerprint) {
      cache.set(folderPath, { package: pkg, expiresAt: Date.now() + CACHE_TTL_MS })
    }
    return { package: pkg, error: null, folderPackageCache: false, warnings }
  } catch (error: any) {
    const code = String(error?.code || 'skill-load-exception')
    return {
      package: null,
      error: code,
      failure: {
        code,
        message: String(error?.message || 'SKILL 文件夹加载异常'),
        folderPath,
        action: '请检查技能目录内容后重试'
      }
    }
  }
}

/**
 * Single runtime source for folder SKILL metadata. Components may use the
 * store snapshot for initial rendering, but execution must re-read this value
 * so an updated folder is effective without re-importing it.
 */
export async function loadRuntimeFolderSkillMetadata(folderPath: string): Promise<{
  package: RealSkillPackage | null
  error: string | null
  meta: Record<string, unknown>
  intents: string[] | undefined
  contextPolicy: Record<string, unknown> | undefined
  template: string
  fingerprint: RealSkillFileFingerprint[] | undefined
  warnings: RealSkillLoadWarning[]
}> {
  const loaded = await loadRealSkill(folderPath)
  if (!loaded.package) {
    return {
      package: null,
      error: loaded.error,
      meta: {},
      intents: undefined,
      contextPolicy: undefined,
      template: '',
      fingerprint: undefined,
      warnings: []
    }
  }
  const pkg = loaded.package
  const meta = (pkg.meta && typeof pkg.meta === 'object') ? pkg.meta : {}
  const intents = Array.isArray((meta as { intents?: unknown }).intents)
    ? ((meta as { intents?: unknown[] }).intents ?? []).filter((item): item is string => typeof item === 'string')
    : undefined
  const rawPolicy = (meta as { contextPolicy?: unknown }).contextPolicy
  const contextPolicy = rawPolicy && typeof rawPolicy === 'object' && !Array.isArray(rawPolicy)
    ? rawPolicy as Record<string, unknown>
    : undefined
  return {
    package: pkg,
    error: null,
    meta,
    intents,
    contextPolicy,
    template: String(pkg.template || ''),
    fingerprint: pkg.fingerprint,
    warnings: pkg.warnings || []
  }
}

export function clearRealSkillCache(folderPath?: string) {
  if (folderPath) cache.delete(folderPath)
  else cache.clear()
}
