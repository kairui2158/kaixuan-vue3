import { beforeEach, describe, expect, it, vi } from 'vitest'

const skillLoadFolder = vi.fn()

vi.stubGlobal('window', {
  electronAPI: { skillLoadFolder }
})

import { loadRealSkill } from './realSkillLoader'
import type { RealSkillFileFingerprint } from './realSkillTypes'

function fingerprint(file: string, hash: string, mtime = 1, bytes = 10): RealSkillFileFingerprint {
  return { file, hash, mtime, bytes }
}

function skillPayload(items: RealSkillFileFingerprint[]) {
  return {
    ok: true,
    folderPath: 'D:/skill',
    skill: {
      id: 'skill-a',
      name: 'skill-a',
      description: '',
      body: '',
      template: '模板',
      meta: {},
      script: '',
      samples: '',
      schema: null,
      fingerprint: items,
      warnings: []
    }
  }
}

describe('loadRealSkill run pinning', () => {
  beforeEach(() => {
    skillLoadFolder.mockReset()
  })

  it('uses a fresh disk read to establish the run baseline instead of a stale TTL entry', async () => {
    skillLoadFolder.mockResolvedValueOnce(skillPayload([fingerprint('template.md', 'old')]))
    const first = await loadRealSkill('D:/skill')
    skillLoadFolder.mockResolvedValueOnce(skillPayload([fingerprint('template.md', 'new')]))

    const pinned = await loadRealSkill('D:/skill', { forceRefresh: true })

    expect(first.package?.fingerprint?.[0]?.hash).toBe('old')
    expect(first.folderPackageCache).toBe(false)
    expect(skillLoadFolder).toHaveBeenCalledTimes(2)
    expect(pinned.package?.fingerprint?.[0]?.hash).toBe('new')
  })

  it('returns structured mismatch metadata without putting a drifted package into cache', async () => {
    const expected = [fingerprint('template.md', 'old')]
    skillLoadFolder.mockResolvedValueOnce(skillPayload([fingerprint('template.md', 'new', 2, 20)]))

    const loaded = await loadRealSkill('D:/skill', { pinnedFingerprint: expected })

    expect(loaded.package).toBeNull()
    expect(loaded.error).toBe('skill_version_mismatch')
    expect(loaded.pinMismatch).toEqual({
      folderPath: 'D:/skill',
      expected,
      actual: [fingerprint('template.md', 'new', 2, 20)]
    })
    expect(loaded.failure?.code).toBe('skill_version_mismatch')
  })

  it('requires file identity as well as content identity when comparing pins', async () => {
    const expected = [fingerprint('template.md', 'same')]
    skillLoadFolder.mockResolvedValueOnce(skillPayload([fingerprint('script.js', 'same')]))

    const loaded = await loadRealSkill('D:/skill', { pinnedFingerprint: expected })

    expect(loaded.error).toBe('skill_version_mismatch')
    expect(loaded.pinMismatch?.actual[0]?.file).toBe('script.js')
  })
})
