import { describe, expect, it } from 'vitest'
import {
  compareSemver,
  compareInstalledSkill,
  parseSemver,
  satisfiesMinAppVersion,
  validateSkillPackageManifest,
} from './skillPackageManager'

describe('skillPackageManager semver subset', () => {
  it('parses and compares normal versions', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: '' })
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1)
    expect(compareSemver('1.2.3', '1.10.0')).toBe(-1)
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1)
  })

  it('treats prerelease as lower than release', () => {
    expect(compareSemver('1.0.0', '1.0.0-beta.1')).toBe(1)
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1)
  })

  it('checks minimum app version', () => {
    expect(satisfiesMinAppVersion('3.28.0', '3.28.0')).toBe(true)
    expect(satisfiesMinAppVersion('3.28.0', '3.27.0')).toBe(false)
    expect(satisfiesMinAppVersion('3.28.0', '3.29.0')).toBe(true)
  })

  it('classifies installed skill changes', () => {
    expect(compareInstalledSkill('1.1.0', '1.0.0')).toBe('upgrade')
    expect(compareInstalledSkill('1.0.0', '1.1.0')).toBe('downgrade')
    expect(compareInstalledSkill('1.0.0', '1.0.0')).toBe('same')
    expect(compareInstalledSkill('abc', '1.0.0')).toBe('unknown')
  })
})

describe('skillPackageManager manifest validation', () => {
  const validManifest = {
    schema: 'shenyi.skill-package/1',
    id: 'xuanwu-volume',
    name: '玄武卷纲解析',
    version: '1.0.0',
    files: ['SKILL.md', 'template.md'],
  }

  it('accepts a valid manifest', () => {
    const result = validateSkillPackageManifest(validManifest, '3.28.0')
    expect(result.valid).toBe(true)
    expect(result.manifest?.entry).toBe('SKILL.md')
  })

  it('rejects missing required fields', () => {
    const result = validateSkillPackageManifest({ id: 'demo' }, '3.28.0')
    expect(result.valid).toBe(false)
    expect(result.issues.map(issue => issue.field)).toContain('schema')
    expect(result.issues.map(issue => issue.field)).toContain('name')
    expect(result.issues.map(issue => issue.field)).toContain('version')
    expect(result.issues.map(issue => issue.field)).toContain('files')
  })

  it('rejects malformed versions', () => {
    const result = validateSkillPackageManifest({ ...validManifest, version: 'v1.0' }, '3.28.0')
    expect(result.valid).toBe(false)
    expect(result.issues[0].field).toBe('version')
  })

  it('rejects skills newer than the app', () => {
    const result = validateSkillPackageManifest(
      { ...validManifest, minAppVersion: '3.29.0' },
      '3.28.0',
    )
    expect(result.valid).toBe(false)
    expect(result.issues[0].message).toContain('低于技能要求版本')
  })

  it('rejects unsafe file paths', () => {
    const result = validateSkillPackageManifest(
      { ...validManifest, files: ['../outside.txt', 'C:/evil.txt'] },
      '3.28.0',
    )
    expect(result.valid).toBe(false)
    expect(result.issues.length).toBe(2)
  })

  it('rejects execution protocol fields owned by the app', () => {
    const result = validateSkillPackageManifest({
      ...validManifest,
      tools: [],
      toolPolicy: { scenario: 'folder-chain' },
      toolSurface: { tools: [] },
      writeAuthorization: { source: 'skill' },
      executionPlan: { mode: 'final-draft' },
      permissionDecision: { decision: 'write-authorized' },
      defaultToolPolicy: 'allowedWithPermission',
      riskLevel: 'low',
    }, '3.71.0')

    expect(result.valid).toBe(false)
    expect(result.issues.map(issue => issue.field)).toEqual([
      'tools',
      'toolPolicy',
      'toolSurface',
      'writeAuthorization',
      'executionPlan',
      'permissionDecision',
      'defaultToolPolicy',
      'riskLevel',
    ])
  })

  it('warns that meta.agent is deprecated without blocking the package', () => {
    const result = validateSkillPackageManifest({
      ...validManifest,
      meta: { agent: { model: 'other-model' } },
    }, '3.71.0')

    expect(result.valid).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings?.[0].field).toBe('meta.agent')
  })
})
