import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  classifyChainIntent,
  CHAIN_ROUTING_AMBIGUITY_THRESHOLD,
  CHAIN_ROUTING_CONFIDENCE_THRESHOLD,
  type ChainIntentHistoryMessage,
  initIntentRouter,
  resetIntentRoutingEmbeddingCacheForTests,
  routeChainIntent,
  routeChainIntentDetailed,
  warmupIntentRoutingEmbedding,
} from './chainIntentRouter'
import { evaluateIntentCorpus, INTENT_CORPUS_SAMPLES } from './chainIntentCorpus'
import { SATURATED_INTENT_SAMPLES } from './chainIntentPhraseCorpus'
import {
  ADVERSARIAL_INTENT_SAMPLES,
  CHAIN_INTENT_EVAL_SPLITS,
  HOLDOUT_REAL_TRACE_SAMPLES,
  NEGATIVE_INTENT_SAMPLES,
} from './chainIntentEvalData'
import { classifyPlainDialogueIntent } from './plainDialogueIntent'

describe('chain intent router electron jieba bridge', () => {
  it('uses the main-process bridge without loading the browser bundle', async () => {
    const cutCalls: string[] = []
    const electronAPI = {
      jiebaCut: vi.fn((text: string) => {
        cutCalls.push(text)
        return { ok: true, words: ['生成', '大纲'] }
      }),
    }
    vi.stubGlobal('window', { electronAPI })
    try {
      expect(await initIntentRouter()).toBeUndefined()
      expect(routeChainIntent('生成一个完整大纲')).toMatchObject({
        kind: 'matched',
        intent: 'generate',
      })
      expect(cutCalls).toContain('生成一个完整大纲')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('chain intent router v3', () => {
  beforeAll(async () => {
    await initIntentRouter()
  })

  it('treats empty input as no match', () => {
    const result = routeChainIntent('')
    expect(result).toEqual({
      kind: 'no_match',
      confidence: 0,
      reason: 'empty-input',
      fallbackMode: 'readonly-discuss',
    })
  })

  it('keeps continuation inputs ambiguous without prior context', () => {
    const result = routeChainIntent('继续')
    expect(result.kind).toBe('ambiguous')
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toEqual(['analyze', 'edit', 'generate', 'discuss'])
      expect(result.reason).toBe('continuation-without-context')
    }
  })

  it('resolves continuation inputs from recent user messages', () => {
    const result = routeChainIntent('继续', {
      recentUserMessages: ['生成第一卷卷纲'],
    })
    expect(result).toMatchObject({
      kind: 'matched',
      intent: 'generate',
      reason: 'continuation-resolved:generate',
    })
  })

  it('restores write routing only for an explicit active edit-task continuation', () => {
    const result = routeChainIntent('继续执行刚才的任务', {
      activeEditTaskStatus: 'awaiting_batch',
    })
    expect(result).toEqual({
      kind: 'matched',
      intent: 'edit',
      confidence: 0.96,
      reason: 'active-edit-task-continuation',
      decisionLayer: 'rule',
    })
  })

  it('keeps a qualified active edit-task continuation writable', () => {
    const result = routeChainIntent('继续执行刚才的任务，改成安全的新增内容', {
      activeEditTaskStatus: 'awaiting_batch',
    })
    expect(result.kind).toBe('matched')
    expect(result.kind === 'matched' && result.intent).toBe('edit')
  })

  it('does not turn generic task mentions into write routing', () => {
    for (const input of [
      '这个任务现在卡住了，你先解释一下',
      '继续讨论这个任务',
      '继续执行刚才的任务吗',
    ]) {
      const result = routeChainIntent(input, {
        activeEditTaskStatus: 'awaiting_batch',
      })
      expect(result.kind === 'matched'
        && result.intent === 'edit'
        && result.reason === 'active-edit-task-continuation').toBe(false)
    }
  })

  it('keeps edit-task continuation readonly before the task is resumable', () => {
    const result = routeChainIntent('继续执行刚才的任务')
    expect(result.reason).not.toBe('active-edit-task-continuation')
    expect(result.kind === 'matched'
      && result.intent === 'edit'
      && result.reason === 'active-edit-task-continuation').toBe(false)
  })

  it('returns no match for low-confidence chit-chat', () => {
    const result = routeChainIntent('今天天气不错呀')
    expect(result.kind).toBe('no_match')
    expect(result.confidence).toBeLessThan(CHAIN_ROUTING_CONFIDENCE_THRESHOLD)
    expect(result.decisionLayer).toBe('rule')
  })

  it('attributes low-confidence workspace input to the keyword layer', () => {
    const result = routeChainIntent('开篇那个吸引点我不太满意', {
      workspace: 'outline-workbench',
    })
    expect(result).toMatchObject({
      kind: 'no_match',
      reason: 'no-keyword-overlap',
      decisionLayer: 'keyword',
    })
  })

  it('returns ambiguous when keyword scores tie', () => {
    const result = routeChainIntent('生成后讨论一下')
    expect(result.kind).toBe('ambiguous')
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toEqual(['generate', 'discuss'])
      expect(result.confidence).toBeGreaterThan(CHAIN_ROUTING_AMBIGUITY_THRESHOLD)
      expect(result.decisionLayer).toBe('keyword')
    }
  })

  it('matches explicit generation commands', () => {
    const result = routeChainIntent('生成一个完整大纲')
    expect(result).toMatchObject({ kind: 'matched', intent: 'generate' })
  })

  it('treats a readonly replacement-plan request as discussion', () => {
    expect(routeChainIntent('给我看看第 3 个替换方案')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
  })

  it('routes direct write imperative to edit', () => {
    expect(routeChainIntent('请用兼容供应商直写')).toMatchObject({
      kind: 'matched',
      intent: 'edit',
      reason: 'explicit-write-directive',
    })
    expect(routeChainIntent('直接写入这段设定')).toMatchObject({
      kind: 'matched',
      intent: 'edit',
    })
    expect(classifyChainIntent('请用兼容供应商直写')).toMatchObject({
      intent: 'edit',
      matchedKeywords: ['explicit-write-directive'],
      confidence: 0.95,
    })
  })

  it('routes permission questions combined with write directives to edit', () => {
    const writeDirectives = [
      '那你试着把修改一下大纲编辑器里的内容来验证你有没有写入权限， 你现在在第一行大纲总纲后面随意加几个字',
      '那你试着改一下来验证你有没有写入权限',
      '在第一行后面随意加几个字',
    ]

    for (const input of writeDirectives) {
      expect(routeChainIntent(input)).toMatchObject({
        kind: 'matched',
        intent: 'edit',
        reason: 'explicit-write-directive',
      })
      expect(classifyChainIntent(input)).toMatchObject({
        intent: 'edit',
        matchedKeywords: ['explicit-write-directive'],
        confidence: 0.95,
      })
      expect(classifyPlainDialogueIntent(input)).toBe('edit')
    }
  })

  it('routes trace regression phrases without blocking discussion', () => {
    expect(routeChainIntent('把钩子改强一点')).toMatchObject({
      kind: 'matched',
      intent: 'edit',
    })
    expect(routeChainIntent('第一卷的钩子需要重新设定')).toMatchObject({
      kind: 'matched',
      intent: 'edit',
    })
    expect(routeChainIntent('解释一下第一卷钩子的设计目的')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
    expect(routeChainIntent('大纲里的第一卷钩子需要重新设定吗')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
  })

  it('keeps whole-document rewrite constraints from canceling the write intent', () => {
    expect(routeChainIntent(
      '请对当前编辑器全文进行整理排序，并统一格式。不要改写正文含义，输出完整终稿。',
      { workspace: 'home-editor' },
    )).toMatchObject({
      kind: 'matched',
      intent: 'edit',
      reason: 'explicit-write-directive',
    })
    expect(routeChainIntent('不要改写正文含义')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
      reason: 'prohibition-rollback',
    })
  })

  it('routes factory round-6 silver regressions without reference swallowing', () => {
    expect(routeChainIntent('先审一遍，再给我一版修改后的钩子')).toMatchObject({
      kind: 'matched',
      intent: 'generate',
    })
    expect(routeChainIntent('再给我一版修改后的钩子，先审一遍')).toMatchObject({
      kind: 'matched',
      intent: 'generate',
    })
    expect(routeChainIntent('你先审一遍，这份大纲缺什么')).toMatchObject({
      kind: 'matched',
      intent: 'analyze',
    })
    expect(routeChainIntent('审一遍一下伏笔有没有断')).toMatchObject({
      kind: 'matched',
      intent: 'analyze',
    })
    expect(routeChainIntent('好的按你的方案来出修改文案')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
  })

  it('routes inventory questions with write targets as analysis', () => {
    expect(routeChainIntent('盘点第一卷还有哪些伏笔没有回收')).toMatchObject({
      kind: 'matched',
      intent: 'analyze',
    })
    expect(routeChainIntent('盘点一下大纲里还没有回收的伏笔')).toMatchObject({
      kind: 'matched',
      intent: 'analyze',
    })
  })

  it('routes final deliverable composition as generate before keyword scoring', () => {
    expect(classifyChainIntent('先审一遍，再给我一版修改后的钩子')).toMatchObject({
      intent: 'generate',
    })
    expect(classifyChainIntent('再给我一版修改后的钩子，先审一遍')).toMatchObject({
      intent: 'generate',
    })
  })

  it('routes natural-language append requests to edit without target keywords', () => {
    const naturalAppendRequests = [
      '随便帮我在后面补一句 潮声压过礁石。',
      '帮我补一段就行',
      '在后面加一句：夜潮退去。',
    ]

    for (const input of naturalAppendRequests) {
      expect(routeChainIntent(input)).toMatchObject({
        kind: 'matched',
        intent: 'edit',
        reason: 'explicit-write-directive',
      })
      expect(classifyChainIntent(input)).toMatchObject({
        intent: 'edit',
        matchedKeywords: ['explicit-write-directive'],
      })
    }
  })

  it('keeps pure permission questions and write prohibitions as discussion', () => {
    expect(routeChainIntent('有没有写入权限')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
      reason: 'status-permission-question',
    })
    expect(routeChainIntent('有没有写入权限', { workspace: 'home-editor' })).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
      reason: 'status-permission-question',
    })
    expect(routeChainIntent('你现在有写入权限么？')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
    expect(routeChainIntent('只讨论，不要写')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
    expect(routeChainIntent('你有写入权限啊，为什么说没有呢？')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
  })

  it('routes structured replacement commands as writes without exposing preview questions', () => {
    const writes = [
      '把第三章那个“灯塔顶端”换成“塔尖”',
      '旧信来源这几个字 改成 信的出处',
      '把第二章标题换成风暴之眼',
      '将这一段的旧称改成现在的名称',
    ]

    for (const input of writes) {
      expect(routeChainIntent(input)).toMatchObject({
        kind: 'matched',
        intent: 'edit',
        reason: 'explicit-write-directive',
      })
      expect(classifyChainIntent(input)).toMatchObject({
        intent: 'edit',
        matchedKeywords: ['explicit-write-directive'],
      })
    }

    expect(routeChainIntent('改成什么样')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
    expect(routeChainIntent('把这句改成什么样')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
    expect(routeChainIntent('替换后的效果怎么样')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
  })

  it('routes scoped edits with keep-unchanged qualifiers as writes', () => {
    const writes = [
      '把第 8、9、10 三节按倒序重排，其他内容保持不变。',
      '把第 3 段改成 X，其他内容保持不变。',
      '帮我重排第 2 到第 5 节，剩余内容保持不变。',
      '只重排第 2 节，保持不变。',
      '把第 3 段改成 X，保持原文不变。',
    ]

    for (const input of writes) {
      expect(routeChainIntent(input, { workspace: 'outline-workbench' })).toMatchObject({
        kind: 'matched',
        intent: 'edit',
        reason: 'explicit-write-directive',
      })
      expect(classifyChainIntent(input)).toMatchObject({
        intent: 'edit',
        matchedKeywords: ['explicit-write-directive'],
      })
    }

    const readonlyInputs = [
      '其他内容保持不变，先别动。',
      '保持不变，等我看清再改。',
      '保持不变，先别动第 3 节。',
      '不要修改，保持不变。',
      '先不动第 3 节，其他内容保持不变。',
    ]

    for (const input of readonlyInputs) {
      expect(routeChainIntent(input, { workspace: 'outline-workbench' })).toMatchObject({
        kind: 'matched',
        intent: 'discuss',
        reason: 'prohibition-rollback',
      })
    }
  })

  it('routes structural scoped write requests without generic target nouns', () => {
    const writes = [
      '修改第1节',
      '修改第三章',
      '修改首尾两节',
      '请整理全文，并分两批修改首尾两节',
    ]

    for (const input of writes) {
      expect(routeChainIntent(input, { workspace: 'outline-workbench' })).toMatchObject({
        kind: 'matched',
        intent: 'edit',
      })
    }

    const readonlyInputs = [
      '帮我整理一下',
      '第3节写了什么',
      '修改什么样',
      '改成什么样',
      '第1节写了什么',
      '第三章讲了什么',
    ]

    for (const input of readonlyInputs) {
      const routed = routeChainIntent(input, { workspace: 'outline-workbench' })
      expect({
        input,
        intent: routed.kind === 'matched' ? routed.intent : routed.kind,
      }).toMatchObject({ intent: expect.not.arrayContaining(['edit']) })
    }
  })

  it('passes the saturated positive and negative intent matrix', () => {
    for (const sample of SATURATED_INTENT_SAMPLES) {
      const routed = routeChainIntent(sample.input)
      expect({
        input: sample.input,
        groupName: sample.groupName,
        kind: routed.kind,
        intent: routed.kind === 'matched' ? routed.intent : null,
      }).toEqual({
        input: sample.input,
        groupName: sample.groupName,
        kind: 'matched',
        intent: sample.expectedIntent,
      })
    }
  })

  it('prioritizes explicit intent commands over contextual qualifiers', () => {
    expect(routeChainIntent('审核一下这份大纲还缺什么')).toMatchObject({
      kind: 'matched',
      intent: 'analyze',
      reason: 'keyword-top1',
    })
    expect(routeChainIntent('分析一下时间线是否自洽')).toMatchObject({
      kind: 'matched',
      intent: 'analyze',
    })
    expect(routeChainIntent('上一段说了什么')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
    expect(routeChainIntent('写出第一章正文')).toMatchObject({
      kind: 'matched',
      intent: 'generate',
    })
    expect(routeChainIntent('你出#3的替换给我参考')).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
    })
    expect(routeChainIntent('可以了，把新设定追加到角色档案')).toMatchObject({
      kind: 'matched',
      intent: 'edit',
    })
  })

  it('passes the single-source corpus through both routing entry points', () => {
    const classified = evaluateIntentCorpus(
      input => classifyPlainDialogueIntent(input),
      INTENT_CORPUS_SAMPLES,
    )
    expect(classified.failures).toEqual([])
    expect(classified.accuracy).toBe(1)

    for (const sample of INTENT_CORPUS_SAMPLES) {
      const routed = routeChainIntent(sample.input)
      if (sample.expectedIntent === 'edit') {
        expect(routed).toMatchObject({
          kind: 'matched',
          intent: 'edit',
          reason: 'explicit-write-directive',
        })
      } else {
        expect([routed.kind === 'matched' ? routed.intent : 'discuss', classifyPlainDialogueIntent(sample.input)])
          .toEqual([sample.expectedIntent, sample.expectedIntent])
      }
    }
  })

  it('does not resurrect removed pending-preview confirmation routing', () => {
    const recentHistory: ChainIntentHistoryMessage[] = [
      {
        role: 'user',
        content: '生成大纲补充指令，把以上内容写入大纲。',
      },
      {
        role: 'assistant',
        content: '【修改预览】\n两条 append 指令\nstatus: pending\n等待作者批准。',
      },
    ]

    expect(routeChainIntent('确认', { recentHistory })).toMatchObject({
      kind: 'no_match',
      reason: 'no-keyword-overlap',
    })
  })

  it('does not resurrect removed pending long-document confirmation routing', () => {
    const recentHistory: ChainIntentHistoryMessage[] = [
      {
        role: 'assistant',
        content: 'await_user: true',
      },
    ]

    for (const input of ['A', '确认', '同意', '写入', '把上一轮预览写入大纲']) {
      expect(routeChainIntent(input, { recentHistory })).not.toMatchObject({
        reason: 'pending-long-document-continuation',
      })
    }
  })

  it('keeps the v6 phase 1 evaluation datasets structurally isolated and nonempty', () => {
    expect(HOLDOUT_REAL_TRACE_SAMPLES.length).toBeGreaterThanOrEqual(25)
    expect(ADVERSARIAL_INTENT_SAMPLES.length).toBeGreaterThanOrEqual(35)
    expect(NEGATIVE_INTENT_SAMPLES.length).toBeGreaterThanOrEqual(10)

    for (const sample of [
      ...HOLDOUT_REAL_TRACE_SAMPLES,
      ...ADVERSARIAL_INTENT_SAMPLES,
      ...NEGATIVE_INTENT_SAMPLES,
    ]) {
      expect(typeof sample.input).toBe('string')
      expect(sample.source).toBeTruthy()
      expect([
        'analyze',
        'edit',
        'generate',
        'discuss',
        'no_match',
        'ambiguous',
      ]).toContain(sample.expected)
    }

    // The holdout set must preserve known production failures instead of
    // being silently repaired whenever the phrase table changes.
    const knownFailures = [
      '大纲里的第一卷钩子需要重新设定',
      '钩子二沈萤的脚踝我设计的是一次性伤害，不是永久残疾，这点要先说清楚',
      '你把大纲内编辑器叙事里第一卷的补充钩子和我讨论一下',
    ]
    for (const input of knownFailures) {
      expect(
        HOLDOUT_REAL_TRACE_SAMPLES.some(sample => sample.input === input),
      ).toBe(true)
    }
  })

  it('keeps train/dev/test splits exhaustive, mutually exclusive, and stable', () => {
    const splitEntries = Object.values(CHAIN_INTENT_EVAL_SPLITS).flat()
    expect(new Set(splitEntries).size).toBe(splitEntries.length)
    expect(splitEntries).toHaveLength(HOLDOUT_REAL_TRACE_SAMPLES.length)

    for (const sample of HOLDOUT_REAL_TRACE_SAMPLES) {
      expect(splitEntries).toContain(sample)
    }

    const splitInputs = (split: keyof typeof CHAIN_INTENT_EVAL_SPLITS) =>
      new Set(CHAIN_INTENT_EVAL_SPLITS[split].map(sample => sample.input))
    for (const [left, right] of [
      ['train', 'dev'],
      ['train', 'test'],
      ['dev', 'test'],
    ] as const) {
      for (const input of splitInputs(left)) {
        expect(splitInputs(right).has(input)).toBe(false)
      }
    }

    // The index-based split is deliberately deterministic: changing it silently
    // makes old calibration evidence incomparable with new runs.
    expect(CHAIN_INTENT_EVAL_SPLITS.train).toHaveLength(10)
    expect(CHAIN_INTENT_EVAL_SPLITS.dev).toHaveLength(9)
    expect(CHAIN_INTENT_EVAL_SPLITS.test).toHaveLength(9)
    expect(CHAIN_INTENT_EVAL_SPLITS.train[0]?.input).toBe(
      '大纲里的第一卷钩子需要重新设定',
    )
    expect(CHAIN_INTENT_EVAL_SPLITS.dev[0]?.input).toBe(
      '钩子二沈萤的脚踝我设计的是一次性伤害，不是永久残疾，这点要先说清楚',
    )
    expect(CHAIN_INTENT_EVAL_SPLITS.test[0]?.input).toBe(
      '你把大纲内编辑器叙事里第一卷的补充钩子和我讨论一下',
    )
  })
})

describe('chain intent router v6 embedding layer', () => {
  beforeAll(async () => {
    await initIntentRouter()
  })

  afterEach(() => {
    resetIntentRoutingEmbeddingCacheForTests()
    vi.unstubAllGlobals()
  })

  it('keeps high-confidence keyword results on L2 without embedding calls', async () => {
    const electronAPI = {
      intentEmbed: vi.fn(),
      intentEmbeddingStatus: vi.fn(),
    }
    vi.stubGlobal('window', { electronAPI })
    try {
      const result = await routeChainIntentDetailed('生成一个完整大纲')
      expect(result).toMatchObject({ kind: 'matched', intent: 'generate' })
      expect(result.diagnostics.router.decisionLayer).toBe('keyword')
      expect(electronAPI.intentEmbed).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('degrades safely when the embedding bridge is unavailable', async () => {
    vi.stubGlobal('window', {})
    try {
      const result = await routeChainIntentDetailed('开篇那个吸引点我不太满意')
      expect(result).toMatchObject({ kind: 'no_match' })
      expect(result.diagnostics.router).toMatchObject({
        decisionLayer: 'rule',
        embeddingState: 'unavailable',
      })
      expect(result.diagnostics.router.failure).toMatchObject({
        stage: 'embedding',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('warmup prebuilds the intent vector cache', async () => {
    const electronAPI = {
      intentEmbed: vi.fn(async (texts: string[]) => ({
        vectors: texts.map(text => [
          text.includes('闲聊天气') ? 1 : 0,
          text.includes('闲聊天气') ? 0 : 1,
          0,
          0,
        ]),
        dims: 4,
      })),
      intentEmbeddingStatus: vi.fn(async () => ({
        state: 'ready',
        model: 'warmup-test-model',
      })),
      intentEmbeddingWarmup: vi.fn(async () => ({ state: 'ready' })),
    }
    vi.stubGlobal('window', { electronAPI })
    try {
      await warmupIntentRoutingEmbedding()

      expect(electronAPI.intentEmbeddingWarmup).toHaveBeenCalledTimes(1)
      expect(electronAPI.intentEmbed).toHaveBeenCalled()
      expect(
        electronAPI.intentEmbed.mock.calls
          .map(([texts]) => texts.length)
          .every(count => count > 0 && count <= 16),
      ).toBe(true)

      const batchesBefore = electronAPI.intentEmbed.mock.calls.length
      await routeChainIntentDetailed('开篇那个吸引点我不太满意')
      expect(electronAPI.intentEmbed.mock.calls.length).toBe(batchesBefore + 1)
      expect(electronAPI.intentEmbed.mock.calls.at(-1)).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('embeds intent examples in max-16 batches and caches them', async () => {
    const batches: string[][] = []
    const dims = 4
    const vector = (seed: number) => Array.from({ length: dims }, (_, i) => (seed + i) % 2 || 1)
    const electronAPI = {
      intentEmbed: vi.fn(async (texts: string[]) => {
        batches.push([...texts])
        expect(texts.length).toBeLessThanOrEqual(16)
        return { vectors: texts.map((_, index) => vector(index)), dims }
      }),
      intentEmbeddingStatus: vi.fn(async () => ({
        state: 'ready',
        model: 'test-embedding-model',
      })),
    }
    vi.stubGlobal('window', { electronAPI })
    try {
      const first = await routeChainIntentDetailed('开篇那个吸引点我不太满意')
      const exampleBatchCount = batches.filter(batch => batch.length > 1).length
      expect(exampleBatchCount).toBeGreaterThan(0)
      expect(first.diagnostics.router.embeddingModel).toBe('test-embedding-model')
      expect(first.diagnostics.router.embeddingState).toBe('ready')

      const batchCountBefore = batches.length
      await routeChainIntentDetailed('开篇氛围和第一卷节奏的取舍还不确定')
      expect(batches.length).toBe(batchCountBefore + 1)
      expect(batches.at(-1)).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('builds the intent vector cache once during concurrent cold-start requests', async () => {
    resetIntentRoutingEmbeddingCacheForTests()
    const dims = 4
    const exampleBatchTexts = new Set<string>()
    const electronAPI = {
      intentEmbed: vi.fn(async (texts: string[]) => {
        if (texts.length > 1) {
          exampleBatchTexts.add(texts.join('\u0000'))
        }
        return {
          vectors: texts.map((_text, index) => {
            const vector = Array.from({ length: dims }, () => 0)
            vector[index % dims] = 1
            return vector
          }),
          dims,
        }
      }),
      intentEmbeddingStatus: vi.fn(async () => ({
        state: 'ready',
        model: 'concurrent-cache-model',
      })),
    }
    vi.stubGlobal('window', { electronAPI })
    try {
      const results = await Promise.all([
        routeChainIntentDetailed('开篇那个吸引点我不太满意'),
        routeChainIntentDetailed('开篇氛围和第一卷节奏的取舍还不确定'),
        routeChainIntentDetailed('开篇氛围和第一卷节奏的取舍还不确定'),
      ])

      for (const result of results) {
        expect(['matched', 'ambiguous', 'no_match']).toContain(result.kind)
        expect(result.diagnostics.router.embeddingModel).toBe('concurrent-cache-model')
        expect(result.diagnostics.router.embeddingState).not.toBe('unavailable')
      }
      expect(exampleBatchTexts.size).toBeGreaterThanOrEqual(1)

      const exampleBatchCalls = electronAPI.intentEmbed.mock.calls.filter(
        ([texts]) => texts.length > 1,
      )
      const uniqueExampleBatches = new Set(
        exampleBatchCalls.map(([texts]) => texts.join('\u0000')),
      )
      expect(uniqueExampleBatches.size).toBe(exampleBatchCalls.length)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('never promotes embedding write candidates to automatic fallback', async () => {
    const dims = 4
    const electronAPI = {
      intentEmbed: vi.fn(async (texts: string[]) => ({
        vectors: texts.map((_, index) => {
          const vector = Array.from({ length: dims }, () => 0)
          vector[index % dims] = 1
          return vector
        }),
        dims,
      })),
      intentEmbeddingStatus: vi.fn(async () => ({
        state: 'ready',
        model: 'test-embedding-model',
      })),
    }
    vi.stubGlobal('window', { electronAPI })
    try {
      const result = await routeChainIntentDetailed('第一卷钩子得重新弄')
      expect(['matched', 'ambiguous', 'no_match']).toContain(result.kind)
      if (result.kind === 'ambiguous') {
        expect(['analyze', 'edit', 'generate', 'discuss']).toEqual(
          expect.arrayContaining(result.candidates),
        )
        expect(result.fallbackMode).toBe('await-user')
      }
      expect(result.diagnostics.router.layers).toContain('embedding')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('marks extremely low-confidence embedding results as out-of-scope without write fallback', async () => {
    resetIntentRoutingEmbeddingCacheForTests()
    const electronAPI = {
      intentEmbed: vi.fn(async (texts: string[]) => ({
        vectors: texts.map(text => [
          text.includes('闲聊天气') ? 1 : 0,
          text.includes('闲聊天气') ? 0 : 1,
          0,
          0,
        ]),
        dims: 4,
      })),
      intentEmbeddingStatus: vi.fn(async () => ({
        state: 'ready',
        model: 'test-embedding-model',
      })),
    }
    vi.stubGlobal('window', { electronAPI })
    try {
      const result = await routeChainIntentDetailed('随便说一句完全不在工作区范围内的闲聊天气', {
        workspace: 'outline-workbench',
      })
      expect(result.kind).toBe('no_match')
      if (result.kind === 'no_match') {
        expect(result.reason).toBe('out-of-scope')
        expect(result.fallbackMode).toBe('readonly-discuss')
      }
      expect(result.diagnostics.router.decisionLayer).toBe('embedding')
      expect(result.diagnostics.router.oosThreshold).toBe(0.24)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('exposes per-intent ambiguity and OOS thresholds in diagnostics', async () => {
    const electronAPI = {
      intentEmbed: vi.fn(async (texts: string[]) => ({
        vectors: texts.map(() => [1, 0, 0, 0]),
        dims: 4,
      })),
      intentEmbeddingStatus: vi.fn(async () => ({
        state: 'ready',
        model: 'test-embedding-model',
      })),
    }
    vi.stubGlobal('window', { electronAPI })
    try {
      const result = await routeChainIntentDetailed('开篇那个吸引点我不太满意')
      expect(result.diagnostics.router.ambiguityThresholds).toEqual({
        analyze: 0.06,
        edit: 0.08,
        generate: 0.08,
        discuss: 0.06,
      })
      expect(result.diagnostics.router.oosThreshold).toBe(0.24)
      expect(result.diagnostics.router.thresholdSource).toContain('oos-audited')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('chain intent router v6 llm fallback', () => {
  const lowConfidenceInput = '开篇那个吸引点我不太满意'

  function stubNoEmbeddingBridge() {
    vi.stubGlobal('window', {})
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies a valid high-confidence LLM classification', async () => {
    stubNoEmbeddingBridge()
    const result = await routeChainIntentDetailed(lowConfidenceInput, {
      workspace: 'home-editor',
      llmClassifier: async () => ({
        intent: 'discuss',
        confidence: 0.91,
        reason: '测试分类',
      }),
    })
    expect(result).toMatchObject({
      kind: 'matched',
      intent: 'discuss',
      confidence: 0.91,
    })
    expect(result.diagnostics.router.decisionLayer).toBe('llm-fallback')
  })

  it('falls back safely when the classifier request fails', async () => {
    stubNoEmbeddingBridge()
    const result = await routeChainIntentDetailed(lowConfidenceInput, {
      workspace: 'home-editor',
      llmClassifier: async () => {
        throw new Error('network unavailable')
      },
    })
    expect(result.kind).toBe('no_match')
    expect('fallbackMode' in result && result.fallbackMode).toBe('readonly-discuss')
    expect(result.diagnostics.router.decisionLayer).toBe('llm-fallback')
    expect(result.diagnostics.router.failure).toMatchObject({
      stage: 'llm-fallback',
      message: 'network unavailable',
    })
  })

  it('falls back safely when the classifier times out', async () => {
    stubNoEmbeddingBridge()
    const result = await routeChainIntentDetailed(lowConfidenceInput, {
      workspace: 'home-editor',
      llmClassifier: (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted', 'AbortError')),
            { once: true },
          )
        }),
    })
    expect(result.kind).toBe('no_match')
    expect('fallbackMode' in result && result.fallbackMode).toBe('readonly-discuss')
    expect(result.diagnostics.router.decisionLayer).toBe('llm-fallback')
    expect(result.diagnostics.router.failure).toMatchObject({
      stage: 'llm-fallback',
      message: 'The operation was aborted',
    })
  }, 8000)

  it('falls back safely on invalid JSON output', async () => {
    stubNoEmbeddingBridge()
    const result = await routeChainIntentDetailed(lowConfidenceInput, {
      workspace: 'home-editor',
      llmClassifier: async () => null,
    })
    expect(result.kind).toBe('no_match')
    expect('fallbackMode' in result && result.fallbackMode).toBe('readonly-discuss')
    expect(result.diagnostics.router.decisionLayer).toBe('llm-fallback')
    expect(result.diagnostics.router.failure).toMatchObject({
      stage: 'llm-fallback',
      message: 'invalid-intent-json',
    })
  })

  it('keeps ambiguous input awaiting the user when LLM fallback fails', async () => {
    stubNoEmbeddingBridge()
    const result = await routeChainIntentDetailed('生成后讨论一下', {
      workspace: 'home-editor',
      llmClassifier: async () => {
        throw new Error('network unavailable')
      },
    })
    expect(result).toMatchObject({
      kind: 'ambiguous',
      fallbackMode: 'await-user',
    })
    expect(result.diagnostics.router.decisionLayer).toBe('llm-fallback')
  })

  it('keeps synchronous write-safety gates ahead of the LLM classifier', async () => {
    stubNoEmbeddingBridge()
    const llmClassifier = vi.fn(async () => ({
      intent: 'edit',
      confidence: 1,
      reason: 'must not run',
    }))
    const result = await routeChainIntentDetailed('能不能只讨论，不写入', {
      workspace: 'home-editor',
      llmClassifier,
    })
    expect(result).toMatchObject({ kind: 'matched', intent: 'discuss' })
    expect(result.diagnostics.router.decisionLayer).not.toBe('llm-fallback')
    expect(llmClassifier).not.toHaveBeenCalled()
  })
})
