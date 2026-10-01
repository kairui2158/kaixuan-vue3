import type { ChainIntent } from './chainIntentRouter.ts'
import type { ChainIntentEvalExpectation, ChainIntentEvalSample } from './chainIntentEvalData.ts'

export type IntentMutationType =
  | 'typo'
  | 'synonym'
  | 'colloquial'
  | 'truncation'
  | 'punctuation'
  | 'word-order'
  | 'mixed-intent'

export type IntentMutationTrust = 'silver' | 'bronze'

export type IntentMutationSample = {
  id: string
  seedId: string
  mutationType: IntentMutationType
  mutationRule: string
  input: string
  expectedIntent: ChainIntentEvalExpectation
  trust: IntentMutationTrust
  note: string
}

export type MutationSeed = {
  seedId: string
  input: string
  expected: ChainIntentEvalExpectation
}

type MutationRule = {
  rule: string
  transform: (input: string) => string
  trust?: IntentMutationTrust
}

const TYPO_MAP: ReadonlyArray<[RegExp, string]> = [
  [/钩子/g, '勾子'],
  [/设定/g, '设订'],
  [/脚踝/g, '脚裸'],
  [/时间线/g, '时间现'],
  [/伏笔/g, '副笔'],
  [/大纲/g, '大刚'],
  [/卷纲/g, '卷冈'],
  [/检查/g, '捡查'],
]

const SYNONYM_MAP: ReadonlyArray<[RegExp, string]> = [
  [/修改/g, '调整'],
  [/调整/g, '改一下'],
  [/分析/g, '看看'],
  [/检查/g, '审一遍'],
  [/讨论/g, '商量'],
  [/生成/g, '起草'],
  [/重新/g, '重新'],
]

const COLLOQUIAL_PREFIXES = [
  '麻烦你',
  '帮我',
  '麻烦',
  '拜托',
  '你先',
  '我们先',
] as const

const NO_WRITE_PATTERN = /不(要|用|能|得)?(写入|修改|编辑|同步)|暂不(写入|修改|编辑)|先不要动/

function isSeedCompatibleWithColloquialPrefix(seed: MutationSeed): boolean {
  // Prefixing a statement does not turn it into a request. Only seeds that
  // already read like a user directive may receive an imperative prefix.
  return /^(把|将|帮我|麻烦|请|你|我们|先|统一|插入|删除|同步|录入|分析|检查|审核|生成|起草|给|聊聊|讨论|商量)/.test(seed.input)
}

const MUTATION_RULES: Record<Exclude<IntentMutationType, 'mixed-intent'>, MutationRule[]> = {
  typo: TYPO_MAP.map(([pattern, replacement]) => ({
    rule: `typo:${pattern.source}->${replacement}`,
    transform: input => input.replace(pattern, replacement),
  })),
  synonym: SYNONYM_MAP.map(([pattern, replacement]) => ({
    rule: `synonym:${pattern.source}->${replacement}`,
    transform: input => input.replace(pattern, replacement),
  })),
  colloquial: COLLOQUIAL_PREFIXES.map(prefix => ({
    rule: `colloquial:${prefix}`,
    transform: input => `${prefix}${input}`,
  })),
  truncation: [
    {
      rule: 'truncation:strip-domain-nouns',
      transform: input => input
        .replace(/(大纲|设定|卷纲|正文|编辑器|第一卷|第二卷|第三卷|这段|这个)的?/g, '')
        .replace(/\s+/g, '')
        .trim(),
    },
  ],
  punctuation: [
    { rule: 'punctuation:strip-all', transform: input => input.replace(/[，。？！、；：,.?!;:]/g, '') },
    { rule: 'punctuation:halfwidth-comma', transform: input => input.replace(/，/g, ',') },
    { rule: 'punctuation:fullwidth-question', transform: input => input.replace(/\?/g, '？') },
  ],
  'word-order': [
    {
      rule: 'word-order:tail-to-head',
      transform: input => {
        const index = input.lastIndexOf('，')
        if (index <= 0 || index === input.length - 1) return input
        return `${input.slice(index + 1)}，${input.slice(0, index)}`
      },
    },
  ],
}

function seedFromSample(sample: ChainIntentEvalSample, index: number): MutationSeed {
  return {
    seedId: `${sample.source || 'seed'}:${index}`,
    input: sample.input,
    expected: sample.expected,
  }
}

export function createIntentMutationSeeds(
  samples: readonly ChainIntentEvalSample[],
): MutationSeed[] {
  return samples
    .filter(sample => sample.input.trim().length > 0 && sample.input.trim().length <= 120)
    .map(seedFromSample)
}

function normalizeMutationInput(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

export function mutateIntentSample(
  seed: MutationSeed,
  mutationType: IntentMutationType,
  ruleIndex = 0,
): IntentMutationSample | null {
  if (mutationType === 'mixed-intent') {
    return null
  }
  const rules = MUTATION_RULES[mutationType]
  const rule = rules[ruleIndex]
  if (!rule) return null
  if (mutationType === 'colloquial' && !isSeedCompatibleWithColloquialPrefix(seed)) return null
  const mutated = normalizeMutationInput(rule.transform(seed.input))
  if (!mutated || mutated === seed.input) return null
  if (seed.expected === 'ambiguous' || seed.expected === 'no_match') {
    if (mutationType === 'truncation' || mutationType === 'word-order') return null
  }
  if (mutationType === 'word-order') {
    const hasStrongFinalAction = /(写入|插入|删除|同步|录入|修改|调整|生成|起草)/.test(mutated)
    const hasExplicitDiscussionOnly = /只讨论|不写入|暂不/.test(mutated)
    if (seed.expected === 'edit' || seed.expected === 'generate') {
      if (!hasStrongFinalAction || hasExplicitDiscussionOnly) return null
    }
  }
  if (mutationType === 'truncation' && seed.expected !== 'no_match') {
    const retainsAction = /(写|改|调|排|补|修|审|看|查|分析|讨论|商量|生成|起草|想|构思|扩写|聊聊|解释|说清楚)/.test(mutated)
    if (!retainsAction) return null
  }
  return {
    id: `${seed.seedId}:${mutationType}:${ruleIndex}`,
    seedId: seed.seedId,
    mutationType,
    mutationRule: rule.rule,
    input: mutated,
    expectedIntent: seed.expected,
    trust: 'silver',
    note: 'deterministic mutation; label inherited from trusted seed',
  }
}

export function createMixedIntentMutation(
  first: MutationSeed,
  second: MutationSeed,
): IntentMutationSample | null {
  if (!first.input.trim() || !second.input.trim()) return null
  if (first.expected === 'no_match' || second.expected === 'no_match') return null
  if (first.expected === 'ambiguous' || second.expected === 'ambiguous') return null
  if (first.expected === second.expected) return null

  const writeIntents = ['edit', 'generate']
  const readIntents = ['analyze', 'discuss']
  const explicitDiscuss = (seed: MutationSeed) => /只讨论|不写入|暂不|参考/.test(seed.input)

  let expectedIntent: ChainIntentEvalExpectation
  let note: string
  if (
    explicitDiscuss(first) ||
    explicitDiscuss(second) ||
    NO_WRITE_PATTERN.test(first.input) ||
    NO_WRITE_PATTERN.test(second.input)
  ) {
    expectedIntent = 'discuss'
    note = 'explicit no-write/discussion clause dominates'
  } else if (writeIntents.includes(first.expected) || writeIntents.includes(second.expected)) {
    expectedIntent = 'edit'
    note = 'write action dominates mixed request'
  } else if (readIntents.includes(first.expected) && readIntents.includes(second.expected)) {
    expectedIntent = 'discuss'
    note = 'analyze followed by discussion request'
  } else {
    expectedIntent = 'generate'
    note = 'final deliverable is generated content'
  }

  const input = normalizeMutationInput(`${first.input}，然后${second.input}`)
  return {
    id: `mixed:${first.seedId}:${second.seedId}`,
    seedId: `${first.seedId}+${second.seedId}`,
    mutationType: 'mixed-intent',
    mutationRule: 'mixed-intent:final-action-priority',
    input,
    expectedIntent,
    trust: 'bronze',
    note,
  }
}

export function generateIntentMutations(
  seeds: readonly MutationSeed[],
  options?: {
    includeBronze?: boolean
    maxSamples?: number
  },
): IntentMutationSample[] {
  const includeBronze = options?.includeBronze ?? true
  const maxSamples = options?.maxSamples ?? 2000
  const results: IntentMutationSample[] = []
  const seen = new Set<string>()
  const append = (sample: IntentMutationSample | null) => {
    if (!sample) return
    const key = `${sample.input}::${sample.expectedIntent}`
    if (seen.has(key)) return
    if (sample.trust === 'bronze' && !includeBronze) return
    seen.add(key)
    results.push(sample)
  }

  for (const seed of seeds) {
    for (const mutationType of Object.keys(MUTATION_RULES) as Array<Exclude<IntentMutationType, 'mixed-intent'>>) {
      MUTATION_RULES[mutationType].forEach((_, index) => {
        append(mutateIntentSample(seed, mutationType, index))
      })
    }
  }

  if (includeBronze) {
    for (let left = 0; left < seeds.length; left += 1) {
      for (let right = left + 1; right < seeds.length; right += 1) {
        append(createMixedIntentMutation(seeds[left], seeds[right]))
      }
    }
  }

  return results.slice(0, maxSamples)
}

export function groupMutationsByType(
  samples: readonly IntentMutationSample[],
): Record<IntentMutationType, IntentMutationSample[]> {
  const groups = {
    typo: [],
    synonym: [],
    colloquial: [],
    truncation: [],
    punctuation: [],
    'word-order': [],
    'mixed-intent': [],
  } as Record<IntentMutationType, IntentMutationSample[]>
  for (const sample of samples) groups[sample.mutationType].push(sample)
  return groups
}

export type { ChainIntent }
