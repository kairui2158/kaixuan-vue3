import { describe, expect, it } from 'vitest'
import { compareInstalledSkill, validateSkillPackageManifest } from './skillPackageManager'

describe('skill package install plan', () => {
  it('classifies a package against the installed version', () => {
    expect(compareInstalledSkill('1.1.0', '1.0.0')).toBe('upgrade')
    expect(compareInstalledSkill('1.0.0', '1.1.0')).toBe('downgrade')
    expect(compareInstalledSkill('1.0.0', '1.0.0')).toBe('same')
    expect(compareInstalledSkill('1.0.0', '')).toBe('unknown')
  })

  it('allows compatible packages without a minimum app version', () => {
    const result = validateSkillPackageManifest({
      schema: 'shenyi.skill-package/1',
      id: 'demo',
      name: '示例技能',
      version: '0.0.0',
      files: ['SKILL.md', 'template.md'],
    }, '3.28.0')

    expect(result.valid).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('blocks packages that require a newer app', () => {
    const result = validateSkillPackageManifest({
      schema: 'shenyi.skill-package/1',
      id: 'demo',
      name: '示例技能',
      version: '1.0.0',
      minAppVersion: '3.29.0',
      files: ['SKILL.md'],
    }, '3.28.0')

    expect(result.valid).toBe(false)
    expect(result.issues[0].field).toBe('minAppVersion')
  })
})
