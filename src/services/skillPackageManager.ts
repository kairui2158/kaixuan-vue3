import skillPackageProtocol from './skillPackageProtocol.json'
import { validateSkillDeaiMeta } from './skillDeaiContract'

export const SKILL_PACKAGE_SCHEMA = 'shenyi.skill-package/1'

export interface SkillPackageManifest {
  schema: string
  id: string
  name: string
  version: string
  minAppVersion?: string
  author?: string
  description?: string
  entry?: string
  files: string[]
  capabilities?: string[]
  dependencies?: string[]
}

export interface SkillPackageValidationResult {
  valid: boolean
  issues: Array<{ field: string; message: string }>
  warnings?: Array<{ field: string; message: string }>
  manifest?: SkillPackageManifest
}

export interface SemverParts {
  major: number
  minor: number
  patch: number
  prerelease: string
}

const MANIFEST_REQUIRED_KEYS = new Set(['schema', 'id', 'name', 'version', 'files'])
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/
export const SKILL_PACKAGE_FORBIDDEN_FIELDS = skillPackageProtocol.forbiddenFields
export const SKILL_PACKAGE_DEPRECATED_FIELDS = skillPackageProtocol.deprecatedFields
export const skillPackageProtocolMessages = () => skillPackageProtocol.messages

export function inspectSkillPackageManifestProtocol(raw: unknown): {
  issues: Array<{ field: string; message: string }>
  warnings: Array<{ field: string; message: string }>
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { issues: [], warnings: [] }
  }
  const source = raw as Record<string, unknown>
  const issues: Array<{ field: string; message: string }> = []
  const warnings: Array<{ field: string; message: string }> = []
  const messages = skillPackageProtocolMessages()
  for (const field of SKILL_PACKAGE_FORBIDDEN_FIELDS) {
    if (source[field] !== undefined) {
      issues.push({
        field,
        message: messages.forbiddenField.replace('{field}', field),
      })
    }
  }
  if (
    source.meta !== undefined
    && source.meta !== null
    && typeof source.meta === 'object'
    && !Array.isArray(source.meta)
    && (source.meta as Record<string, unknown>).agent !== undefined
  ) {
    warnings.push({
      field: 'meta.agent',
      message: messages.deprecatedMetaAgent,
    })
  }

  if (
    source.meta !== undefined
    && source.meta !== null
    && typeof source.meta === 'object'
    && !Array.isArray(source.meta)
    && (source.meta as Record<string, unknown>).deai !== undefined
  ) {
    const deaiValidation = validateSkillDeaiMeta((source.meta as Record<string, unknown>).deai)
    if (!deaiValidation.valid) {
      issues.push(...deaiValidation.errors.map(message => ({
        field: 'meta.deai',
        message,
      })))
    }
    warnings.push(...deaiValidation.warnings.map(message => ({
      field: 'meta.deai',
      message,
    })))
  }
  return { issues, warnings }
}

export function parseSemver(value: string): SemverParts | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(SEMVER_PATTERN)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  }
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left)
  const b = parseSemver(right)
  if (!a || !b) return 0
  if (a.major !== b.major) return a.major > b.major ? 1 : -1
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1
  if (!a.prerelease && !b.prerelease) return 0
  if (!a.prerelease) return 1
  if (!b.prerelease) return -1
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true })
}

export function satisfiesMinAppVersion(manifestVersion: string, appVersion: string): boolean {
  const required = parseSemver(manifestVersion)
  const current = parseSemver(appVersion)
  if (!required || !current) return false
  return compareSemver(appVersion, manifestVersion) >= 0
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result: string[] = []
  for (const item of value) {
    if (typeof item === 'string') result.push(item)
  }
  return result
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value
}

function isValidRelativeFilePath(value: string): boolean {
  if (!value || value.length > 200) return false
  if (value.includes('\\') || value.includes(':')) return false
  if (value.startsWith('/') || value.includes('..')) return false
  return !/[<>:"|?*\u0000-\u001f]/.test(value)
}

export function validateSkillPackageManifest(
  raw: unknown,
  appVersion: string,
): SkillPackageValidationResult {
  const issues: Array<{ field: string; message: string }> = []
  const protocol = inspectSkillPackageManifestProtocol(raw)
  issues.push(...protocol.issues)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, issues: [{ field: '$', message: 'skill-package.json 必须是对象' }] }
  }

  const source = raw as Record<string, unknown>
  for (const key of MANIFEST_REQUIRED_KEYS) {
    if (source[key] === undefined || source[key] === null || source[key] === '') {
      issues.push({ field: key, message: `缺少必填字段 ${key}` })
    }
  }

  const schema = toOptionalString(source.schema)
  if (schema && schema !== SKILL_PACKAGE_SCHEMA) {
    issues.push({ field: 'schema', message: `不支持的 schema，当前仅支持 ${SKILL_PACKAGE_SCHEMA}` })
  }

  const id = toOptionalString(source.id)
  if (id && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id)) {
    issues.push({ field: 'id', message: 'id 仅支持字母、数字、下划线和短横线，且不超过 100 字符' })
  }

  const name = toOptionalString(source.name)
  if (name && !name.trim()) {
    issues.push({ field: 'name', message: 'name 不能为空白' })
  }

  const version = toOptionalString(source.version)
  if (version && !parseSemver(version)) {
    issues.push({ field: 'version', message: 'version 必须是 x.y.z 语义化版本' })
  }

  const files = toStringArray(source.files)
  if (source.files !== undefined && !files) {
    issues.push({ field: 'files', message: 'files 必须是字符串数组' })
  }
  if (files) {
    for (const file of files) {
      if (!isValidRelativeFilePath(file)) {
        issues.push({ field: 'files', message: `非法文件路径：${file}` })
      }
    }
  }

  const minAppVersion = toOptionalString(source.minAppVersion)
  if (minAppVersion && !parseSemver(minAppVersion)) {
    issues.push({ field: 'minAppVersion', message: 'minAppVersion 必须是 x.y.z 语义化版本' })
  }
  if (minAppVersion && parseSemver(minAppVersion) && !satisfiesMinAppVersion(minAppVersion, appVersion)) {
    issues.push({
      field: 'minAppVersion',
      message: `当前应用版本 ${appVersion} 低于技能要求版本 ${minAppVersion}`,
    })
  }

  const entry = toOptionalString(source.entry)
  if (entry && !isValidRelativeFilePath(entry)) {
    issues.push({ field: 'entry', message: `非法 entry 路径：${entry}` })
  }

  const capabilities = toStringArray(source.capabilities)
  if (source.capabilities !== undefined && !capabilities) {
    issues.push({ field: 'capabilities', message: 'capabilities 必须是字符串数组' })
  }

  const dependencies = toStringArray(source.dependencies)
  if (source.dependencies !== undefined && !dependencies) {
    issues.push({ field: 'dependencies', message: 'dependencies 必须是字符串数组' })
  }

  if (issues.length > 0) return { valid: false, issues, warnings: protocol.warnings }

  return {
    valid: true,
    issues: [],
    warnings: protocol.warnings,
    manifest: {
      schema: schema || SKILL_PACKAGE_SCHEMA,
      id: (id || '').trim(),
      name: (name || '').trim(),
      version: version || '0.0.0',
      minAppVersion,
      author: toOptionalString(source.author),
      description: toOptionalString(source.description),
      entry: entry || 'SKILL.md',
      files: files || [],
      capabilities: capabilities || [],
      dependencies: dependencies || [],
    },
  }
}

export function compareInstalledSkill(
  incomingVersion: string,
  currentVersion: string,
): 'upgrade' | 'downgrade' | 'same' | 'unknown' {
  const incoming = parseSemver(incomingVersion)
  const current = parseSemver(currentVersion)
  if (!incoming || !current) return 'unknown'
  const result = compareSemver(incomingVersion, currentVersion)
  if (result > 0) return 'upgrade'
  if (result < 0) return 'downgrade'
  return 'same'
}
