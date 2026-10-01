import { describe, expect, it } from 'vitest'
import {
  ADVERSARIAL_INTENT_SAMPLES,
  HOLDOUT_REAL_TRACE_SAMPLES,
} from './chainIntentEvalData.ts'
import {
  createIntentMutationSeeds,
  createMixedIntentMutation,
  generateIntentMutations,
  groupMutationsByType,
  mutateIntentSample,
} from './intentMutationEngine.ts'
import {
  buildIntentTestManuscriptContext,
  getIntentTestManuscriptSummary,
  INTENT_TEST_MANUSCRIPT,
  INTENT_TEST_MANUSCRIPT_VERSION,
} from './intentTestManuscript.ts'

describe('intentMutationEngine', () => {
  const seeds = createIntentMutationSeeds([
    ...HOLDOUT_REAL_TRACE_SAMPLES,
    ...ADVERSARIAL_INTENT_SAMPLES,
  ])

  it('creates only non-empty, bounded seeds', () => {
    expect(seeds.length).toBeGreaterThan(30)
    expect(seeds.every(seed => seed.input.length > 0 && seed.input.length <= 120)).toBe(true)
  })

  it('is deterministic for the same seed and rule', () => {
    const seed = seeds.find(item => item.input.includes('钩子')) ?? seeds[0]
    const first = mutateIntentSample(seed, 'typo', 0)
    const second = mutateIntentSample(seed, 'typo', 0)
    expect(second).toEqual(first)
  })

  it('inherits labels and marks all simple mutations silver', () => {
    const seed = seeds.find(item => item.input.includes('修改')) ?? seeds[0]
    const sample = mutateIntentSample(seed, 'synonym', 0)
    expect(sample?.trust).toBe('silver')
    expect(sample?.expectedIntent).toBe(seed.expected)
  })

  it('covers all seven mutation types', () => {
    const mutations = generateIntentMutations(seeds, { includeBronze: true, maxSamples: 2000 })
    const groups = groupMutationsByType(mutations)
    expect(Object.keys(groups)).toEqual([
      'typo',
      'synonym',
      'colloquial',
      'truncation',
      'punctuation',
      'word-order',
      'mixed-intent',
    ])
    for (const group of Object.values(groups)) expect(group.length).toBeGreaterThan(0)
  })

  it('rejects action-losing truncation and unsafe word-order mutations', () => {
    const seed = {
      seedId: 'test:edit',
      input: '先看一遍，然后把大纲时间线重新修改',
      expected: 'edit' as const,
    }
    expect(mutateIntentSample(seed, 'truncation', 0)?.input.length).toBeGreaterThan(0)
    expect(mutateIntentSample(seed, 'truncation', 0)).not.toBeNull()
    expect(mutateIntentSample(seed, 'word-order', 0)).not.toBeNull()

    const weakSeed = {
      seedId: 'test:weak',
      input: '这份东西需要处理',
      expected: 'edit' as const,
    }
    expect(mutateIntentSample(weakSeed, 'truncation', 0)).toBeNull()
  })

  it('marks mixed-intent mutations bronze and applies explicit no-write priority', () => {
    const writeSeed = {
      seedId: 'test:write',
      input: '把这段设定写入编辑器',
      expected: 'edit' as const,
    }
    const discussSeed = {
      seedId: 'test:discuss',
      input: '我们只讨论，不写入',
      expected: 'discuss' as const,
    }
    const sample = createMixedIntentMutation(writeSeed, discussSeed)
    expect(sample?.trust).toBe('bronze')
    expect(sample?.expectedIntent).toBe('discuss')
  })

  it('deduplicates identical inputs with the same label', () => {
    const seedA = { seedId: 'a', input: '分析一下大纲', expected: 'analyze' as const }
    const seedB = { seedId: 'b', input: '分析一下大纲', expected: 'analyze' as const }
    const mutations = generateIntentMutations([seedA, seedB])
    expect(mutations.filter(item => item.input === '分析一下大纲')).toHaveLength(0)
  })

  it('does not prefix declarative statements as requests', () => {
    const seed = {
      seedId: 'test:statement',
      input: '我不同意这个判断，理由是...',
      expected: 'discuss' as const,
    }
    expect(mutateIntentSample(seed, 'colloquial', 0)).toBeNull()
  })
})

describe('intentTestManuscript', () => {
  it('locks manuscript version, length, and structure', () => {
    const summary = getIntentTestManuscriptSummary()
    expect(summary.version).toBe(INTENT_TEST_MANUSCRIPT_VERSION)
    expect(summary.length).toBeGreaterThanOrEqual(900)
    expect(summary.length).toBeLessThanOrEqual(1200)
    for (const section of ['【大纲】', '【设定】', '【人物】', '【正文】']) {
      expect(INTENT_TEST_MANUSCRIPT).toContain(section)
    }
    expect(INTENT_TEST_MANUSCRIPT).not.toContain('sk-')
  })

  it('builds the same long-document request shape', () => {
    const context = buildIntentTestManuscriptContext('这段设定应该放在哪个节点？')
    expect(context.startsWith(INTENT_TEST_MANUSCRIPT)).toBe(true)
    expect(context.includes('【用户请求】\n这段设定应该放在哪个节点？')).toBe(true)
  })
})
