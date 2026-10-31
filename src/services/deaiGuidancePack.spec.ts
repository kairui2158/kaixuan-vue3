import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEAI_GUIDANCE_CHAR_BUDGET,
  DEAI_GUIDANCE_CONSTRUCTION_WARNING_MS,
  DEAI_GUIDANCE_MAX_ITEMS,
  DEAI_GUIDANCE_TOTAL_CHAR_BUDGET,
  buildDeaiGuidancePack,
  buildDeaiGuidancePackTraceEvent,
  type DeaiGuidanceRole,
} from './deaiGuidancePack'

const voiceProfile = {
  text: '[声纹]\n主角声口：狠、短、少解释',
  injectedChars: 18,
}

const roles: DeaiGuidanceRole[] = ['methodology', 'methodology-compose', 'creative', 'polish']

describe('DEAI guidance packs', () => {
  it('renders every role pack inside the hard budgets', () => {
    for (const role of roles) {
      const pack = buildDeaiGuidancePack({ role, voiceProfile })

      expect(pack.items.length).toBeLessThanOrEqual(DEAI_GUIDANCE_MAX_ITEMS)
      expect(pack.guidanceChars).toBeLessThanOrEqual(DEAI_GUIDANCE_CHAR_BUDGET)
      expect(pack.guidanceChars).toBe(pack.text.length)
      expect(pack.voiceProfileChars).toBe(voiceProfile.injectedChars)
      expect(pack.totalInjectionChars).toBe(pack.guidanceChars + pack.voiceProfileChars)
      expect(pack.totalInjectionChars).toBeLessThanOrEqual(DEAI_GUIDANCE_TOTAL_CHAR_BUDGET)
      expect(pack.text).toContain('风格卡片是唯一风格 owner')
      expect(pack.text).toContain('叙事缺口按 SKILL 契约上报')
      expect(pack.truncated).toBe(false)
      expect(Object.isFrozen(pack)).toBe(true)
    }
  })

  it('truncates deterministically when a tighter budget is supplied', () => {
    const first = buildDeaiGuidancePack({
      role: 'methodology',
      voiceProfile: null,
      charBudget: 190,
    })
    const second = buildDeaiGuidancePack({
      role: 'methodology',
      voiceProfile: null,
      charBudget: 190,
    })

    expect(first.truncated).toBe(true)
    expect(first.droppedItemIds.length).toBeGreaterThan(0)
    expect(first.text.length).toBeLessThanOrEqual(190)
    expect(first.text.startsWith('【降AI方法指导')).toBe(true)
    expect(first.text).toBe(second.text)
    expect(first.hash).toBe(second.hash)
    expect(first.items.length).toBeLessThan(6)
  })

  it('keeps two concurrent run packs independent and deterministic', () => {
    const runA = buildDeaiGuidancePack({
      role: 'creative',
      voiceProfile: { text: '[声纹]\nA声口', injectedChars: 10 },
    })
    const runAClone = buildDeaiGuidancePack({
      role: 'creative',
      voiceProfile: { text: '[声纹]\nA声口', injectedChars: 10 },
    })
    const runB = buildDeaiGuidancePack({
      role: 'polish',
      voiceProfile: { text: '[声纹]\nB声口', injectedChars: 10 },
    })

    expect(runA.hash).toBe(runAClone.hash)
    expect(runA.totalInjectionChars).toBe(runAClone.totalInjectionChars)
    expect(runA.hash).not.toBe(runB.hash)
    expect(runA.items.map(item => item.id)).not.toEqual(runB.items.map(item => item.id))

    const runAAfterB = buildDeaiGuidancePack({
      role: 'creative',
      voiceProfile: { text: '[声纹]\nA声口', injectedChars: 10 },
    })
    expect(runAAfterB.text).toBe(runA.text)
    expect(runAAfterB.hash).toBe(runA.hash)
  })

  it('marks construction timing against the warning line', () => {
    let clock = 100
    const fast = buildDeaiGuidancePack({
      role: 'creative',
      voiceProfile: null,
      now: () => (clock += 2),
    })
    clock = 100
    const slow = buildDeaiGuidancePack({
      role: 'creative',
      voiceProfile: null,
      now: () => (clock += DEAI_GUIDANCE_CONSTRUCTION_WARNING_MS + 1),
    })

    expect(fast.constructionMs).toBe(2)
    expect(fast.slowConstruction).toBe(false)
    expect(slow.constructionMs).toBe(DEAI_GUIDANCE_CONSTRUCTION_WARNING_MS + 1)
    expect(slow.slowConstruction).toBe(true)
  })

  it('keeps real construction under the warning line', () => {
    for (let index = 0; index < 100; index += 1) {
      const pack = buildDeaiGuidancePack({
        role: roles[index % roles.length],
        voiceProfile,
      })
      expect(pack.constructionMs).toBeLessThan(DEAI_GUIDANCE_CONSTRUCTION_WARNING_MS)
      expect(pack.slowConstruction).toBe(false)
    }
  })

  it('emits bounded trace summaries without the full prompt text', () => {
    const pack = buildDeaiGuidancePack({ role: 'creative', voiceProfile })
    const event = buildDeaiGuidancePackTraceEvent(pack, {
      step: 4,
      skillIndex: 1,
      totalSkillCount: 3,
    })

    expect(event).not.toBeNull()
    expect(event?.type).toBe('deai-guidance-pack')
    expect(event?.level).toBe('info')
    const detail = JSON.parse(event?.detail || '{}') as Record<string, unknown>
    expect(detail.step).toBe(4)
    expect(detail.skillIndex).toBe(1)
    expect(detail.totalSkillCount).toBe(3)
    expect(detail.role).toBe('creative')
    expect(detail.itemCount).toBe(pack.items.length)
    expect(detail.guidanceChars).toBe(pack.guidanceChars)
    expect(detail.voiceProfileChars).toBe(pack.voiceProfileChars)
    expect(detail.totalInjectionChars).toBe(pack.totalInjectionChars)
    expect(detail.constructionMs).toBe(pack.constructionMs)
    expect(detail.hash).toBe(pack.hash)
    expect(event?.detail.length).toBeLessThan(2000)
    expect(event?.detail.includes(pack.text)).toBe(false)
    expect(event?.detail.includes(voiceProfile.text)).toBe(false)
  })

  it('keeps the guidance pack builder free of store and IO dependencies', () => {
    const source = readFileSync(fileURLToPath(new URL('./deaiGuidancePack.ts', import.meta.url)), 'utf8')

    expect(source).not.toContain("from '../stores")
    expect(source).not.toContain('useDeAiStore')
    expect(source).not.toContain('pinia')
    expect(source).not.toContain('localStorage')
    expect(source).not.toContain('fetch(')
  })
})
