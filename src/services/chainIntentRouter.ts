export type ChainIntent = 'analyze' | 'edit' | 'generate' | 'discuss' | 'auto'

export type ChainRoutingContext = {
  projectId?: string
  workspace?: 'outline-workbench' | 'home-editor' | 'pipeline'
  purpose?: string
  recentUserMessages?: string[]
  recentHistory?: readonly ChainIntentHistoryMessage[]
  recentAssistantSummaries?: string[]
  activeSkillIds?: string[]
  activeEditTaskStatus?: 'awaiting_batch'
  llmClassifier?: LlmIntentClassifier
}

export type LlmIntentClassifier = (
  input: string,
  options?: { signal?: AbortSignal },
) => Promise<{
  intent?: unknown
  confidence?: unknown
  reason?: unknown
} | null>

export type LlmIntentFallbackConfig = {
  enabled: boolean
  timeoutMs: number
  minConfidence: number
}

export const LLM_INTENT_FALLBACK_CONFIG: LlmIntentFallbackConfig = {
  enabled: true,
  timeoutMs: 6000,
  minConfidence: 0.6,
}

export type ChainRoutingResult =
  | {
      kind: 'matched'
      intent: Exclude<ChainIntent, 'auto'>
      confidence: number
      reason: string
      decisionLayer?: 'rule' | 'keyword'
    }
  | {
      kind: 'no_match'
      confidence: number
      reason:
        | 'low-confidence'
        | 'out-of-scope'
        | 'no-keyword-overlap'
        | 'empty-input'
        | 'router-degraded'
      fallbackMode: RoutingFallbackMode
      decisionLayer?: 'rule' | 'keyword'
    }
  | {
      kind: 'ambiguous'
      candidates: Exclude<ChainIntent, 'auto'>[]
      confidence: number
      reason: string
      fallbackMode: RoutingFallbackMode
      decisionLayer?: 'rule' | 'keyword'
    }

export type RoutingFallbackMode = 'readonly-discuss' | 'await-user'

export type ChainRoutingDiagnostics = {
  router: {
    version: 'v6.1'
    layers: Array<'rule' | 'keyword' | 'embedding' | 'llm-fallback'>
    decisionLayer: 'rule' | 'keyword' | 'embedding' | 'llm-fallback' | 'fallback'
    embeddingModel: string | null
    embeddingState?: 'idle' | 'loading' | 'ready' | 'unavailable'
    scores: Partial<Record<Exclude<ChainIntent, 'auto'>, number>>
    thresholds: Record<Exclude<ChainIntent, 'auto'>, number>
    ambiguityThreshold: number
    ambiguityThresholds: Record<Exclude<ChainIntent, 'auto'>, number>
    oosThreshold: number
    thresholdSource: string
    failure?: {
      stage: 'embedding' | 'llm-fallback'
      message: string
    }
  }
}

export type DetailedChainRoutingResult = ChainRoutingResult & {
  diagnostics: ChainRoutingDiagnostics
}

export function isIntentRouterDegraded(): boolean {
  return jiebaLoadFailed
}

export interface ChainIntentRouteResult {
  intent: ChainIntent
  matchedKeywords: string[]
  confidence: number
}

export const CHAIN_ROUTING_CONFIDENCE_THRESHOLD = 0.45
export const CHAIN_ROUTING_AMBIGUITY_THRESHOLD = 0.08

export const ROUTE_THRESHOLDS: Record<ChainIntent, number> = {
  analyze: 0.42,
  edit: 0.4,
  generate: 0.38,
  discuss: 0.36,
  auto: 0.45,
}

import {
  findSaturatedPhrases,
  type PhraseCorpusCategory,
} from './chainIntentPhraseCorpus.ts'

type PhraseHit = {
  phrase: string
  category: PhraseCorpusCategory
  group: string
}

function findPhrases(
  input: string,
  categories: readonly PhraseCorpusCategory[],
): PhraseHit[] {
  return findSaturatedPhrases(input, categories)
}

const STATUS_PERMISSION_CATEGORIES: readonly PhraseCorpusCategory[] = [
  'readOnlyPermissionQuestion',
  'readOnlyStatusQuestion',
]
const PROHIBITION_CATEGORIES: readonly PhraseCorpusCategory[] = [
  'readOnlyProhibition',
]
const LOCATION_CATEGORIES: readonly PhraseCorpusCategory[] = [
  'readOnlyLocationQuestion',
  'readOnlyLocationRequest',
]
const REFERENCE_CATEGORIES: readonly PhraseCorpusCategory[] = [
  'readOnlyReference',
]
const CONTEXTUAL_CATEGORIES: readonly PhraseCorpusCategory[] = [
  'contextualReplies',
  'clarificationRequests',
]
const STRONG_WRITE_CATEGORIES: readonly PhraseCorpusCategory[] = [
  'strongWriteActions',
  'writeIntensifiers',
]
const WEAK_WRITE_CATEGORIES: readonly PhraseCorpusCategory[] = [
  'weakWriteActions',
]
const WRITE_TARGET_CATEGORIES: readonly PhraseCorpusCategory[] = [
  'writeTargets',
]
const INTENT_KEYWORD_CATEGORIES: Array<{
  intent: Exclude<ChainIntent, 'auto'>
  category: PhraseCorpusCategory
}> = [
  { intent: 'analyze', category: 'analyzeKeywords' },
  { intent: 'generate', category: 'generateKeywords' },
  { intent: 'discuss', category: 'discussKeywords' },
]

export const EMBEDDING_INTENT_MODEL_ID = 'Xenova/bge-small-zh-v1.5'
export const EMBEDDING_ROUTING_THRESHOLD_SOURCE =
  'calibrated:v6.1-phase6:79-samples:151-examples:train-dev-test:oos-audited'

const EMBEDDING_ROUTE_THRESHOLDS: Record<
  Exclude<ChainIntent, 'auto'>,
  number
> = {
  analyze: 0.3,
  edit: 0.34,
  generate: 0.34,
  discuss: 0.3,
}

export const EMBEDDING_ROUTING_THRESHOLDS = Object.freeze({
  ...EMBEDDING_ROUTE_THRESHOLDS,
})

export const EMBEDDING_ROUTING_AMBIGUITY_THRESHOLDS: Record<
  Exclude<ChainIntent, 'auto'>,
  number
> = {
  analyze: 0.06,
  edit: 0.08,
  generate: 0.08,
  discuss: 0.06,
}

export const EMBEDDING_ROUTING_OOS_THRESHOLD = 0.24

type EmbeddingApi = {
  intentEmbed?: (texts: string[]) => Promise<{
    vectors?: number[][]
    dims?: number
    error?: string
  }>
  intentEmbeddingStatus?: () => Promise<{
    state?: 'idle' | 'loading' | 'ready'
    model?: string
  }>
  intentEmbeddingWarmup?: () => Promise<{
    state?: 'idle' | 'loading' | 'ready'
    model?: string
    error?: string
  }>
}

function getEmbeddingApi(): EmbeddingApi | null {
  const electronAPI = (globalThis as { window?: { electronAPI?: EmbeddingApi } })
    .window?.electronAPI
  if (
    electronAPI &&
    typeof electronAPI.intentEmbed === 'function' &&
    typeof electronAPI.intentEmbeddingStatus === 'function'
  ) {
    return electronAPI
  }
  return null
}

type IntentVectorCache = {
  model: string | null
  vectors: Record<Exclude<ChainIntent, 'auto'>, number[][]>
  failure?: string
}

let intentVectorCache: IntentVectorCache | null = null
let pendingIntentVectorCache: { model: string | null; promise: Promise<IntentVectorCache> } | null = null

export function resetIntentRoutingEmbeddingCacheForTests(): void {
  intentVectorCache = null
  pendingIntentVectorCache = null
}

export async function warmupIntentRoutingEmbedding(): Promise<unknown> {
  const api = getEmbeddingApi()
  if (!api?.intentEmbeddingWarmup) return Promise.resolve(null)
  try {
    await api.intentEmbeddingWarmup()
    const status = await api.intentEmbeddingStatus?.()
    const model = status?.model || EMBEDDING_INTENT_MODEL_ID
    // Prebuild the static intent-example cache so the first low-confidence
    // request only pays for its own input vector, not the whole corpus.
    await getIntentVectorCache(api, model)
    return null
  } catch {
    return null
  }
}

async function embedTexts(
  embeddingApi: EmbeddingApi,
  texts: string[],
): Promise<{ vectors: number[][]; error?: string }> {
  const response = await embeddingApi.intentEmbed?.(texts)
  if (!response || response.error || response.vectors?.length !== texts.length) {
    return {
      vectors: [],
      error:
        response?.error ||
        `embedding returned ${response?.vectors?.length ?? 0}/${texts.length} vectors`,
    }
  }
  return { vectors: response.vectors }
}

async function getIntentVectorCache(
  embeddingApi: EmbeddingApi,
  model: string | null,
): Promise<IntentVectorCache> {
  if (
    intentVectorCache &&
    intentVectorCache.model === model &&
    !intentVectorCache.failure
  ) {
    return intentVectorCache
  }
  if (
    pendingIntentVectorCache &&
    pendingIntentVectorCache.model === model &&
    !intentVectorCache
  ) {
    return pendingIntentVectorCache.promise
  }

  const buildCache = async (): Promise<IntentVectorCache> => {
    const cache: IntentVectorCache = {
      model,
      vectors: {
        analyze: [],
        edit: [],
        generate: [],
        discuss: [],
      },
    }
    for (const intent of Object.keys(INTENT_EXAMPLES) as Array<
      Exclude<ChainIntent, 'auto'>
    >) {
      const examples = INTENT_EXAMPLES[intent]
      // IPC enforces a hard batch limit; examples stay static and are embedded
      // once per model lifecycle, then reused for every user request.
      for (let start = 0; start < examples.length; start += 16) {
        const batch = examples.slice(start, start + 16)
        const result = await embedTexts(embeddingApi, batch)
        if (result.error) {
          cache.failure = `intent:${intent} batch ${Math.floor(start / 16) + 1}: ${result.error}`
          return cache
        }
        cache.vectors[intent].push(...result.vectors)
      }
    }
    return cache
  }

  const pendingCache = { model, promise: buildCache() }
  let cacheResult: IntentVectorCache
  pendingIntentVectorCache = pendingCache
  try {
    cacheResult = await pendingCache.promise
    intentVectorCache = cacheResult
    if (intentVectorCache.failure) {
      // Keep a failed cache out of the process-global slot; otherwise a later
      // call with a working bridge can never recover because the guard sees a
      // non-null intentVectorCache.
      intentVectorCache = null
    }
    return intentVectorCache || cacheResult
  } finally {
    if (pendingIntentVectorCache === pendingCache) {
      pendingIntentVectorCache = null
    }
  }
}

function hasIntentKeywordSignal(input: string): boolean {
  return (
    findPhrases(input, [
      ...INTENT_KEYWORD_CATEGORIES.map((entry) => entry.category),
    ]).length > 0
  )
}

const CONTINUATION_INPUTS = new Set([
  '继续',
  '接着来',
  '接着写',
  '按刚才说的改',
  '按刚才说的做',
  '就这样生成',
  '就按这个来',
  '照这个继续',
])
const EDIT_TASK_CONTINUATION_PATTERN =
  /^(?:请|麻烦|帮我|先)?(?:继续|接着|恢复)(?:执行|重试|运行|完成)?(?:刚才的|当前的|这个|该)?(?:编辑)?任务[吧呗。！？!，,.~～\s]*$/
const WORKSPACE_DOMAIN_PATTERN =
  /(大纲|卷纲|章节|正文|设定|人物|角色|伏笔|钩子|时间线|叙事|故事|情节|主线|支线|世界观|编辑器|文本|文案|开篇|结尾|节奏|弧光|场景|对话|标题|书名|简介|命名|前史|反转|反派|背景|悬念|下一章|结构|断层|顺便问一下|过渡|番外|梗概|关系图|体系|三幕|描写|节点|稿子|文稿|文档)/
const WORKSPACE_GENERATIVE_ACTION_PATTERN =
  /^(?:扩写|续写|展开写|写细|细化|丰富|充实|起草|撰写|构思|创作)/

const TYPO_NORMALIZATION_MAP: ReadonlyArray<[RegExp, string]> = [
  [/勾子/g, '钩子'],
  [/设订/g, '设定'],
  [/脚裸/g, '脚踝'],
  [/时间现/g, '时间线'],
  [/副笔/g, '伏笔'],
  [/大刚/g, '大纲'],
  [/卷冈/g, '卷纲'],
  [/捡查/g, '检查'],
]

function normalizeTypoInput(input: string): string {
  return TYPO_NORMALIZATION_MAP.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    input,
  )
}

function isExplicitEditTaskContinuationInput(input: string): boolean {
  return EDIT_TASK_CONTINUATION_PATTERN.test(input.trim())
}

const KEEP_UNCHANGED_QUALIFIER_PATTERN =
  /(?:其他|其余|剩余|别的|其他内容|其余内容|剩余内容|别的内容|其他部分|其余部分)[^。！？!?,，]{0,8}(?:保持不变|保持原样|保持原文不变|不要动|不要改|不要修改)/
const BARE_KEEP_UNCHANGED_QUALIFIER_PATTERN =
  /(?:^|[，,。；;])\s*(?:保持不变|保持原样|保持原文不变)/
const NON_ACTIONABLE_PROHIBITION_PATTERN =
  /先别|先不|不要|请勿|别动|不用|无需|等.{0,4}(?:再|确认)|暂时/
const SCOPED_WRITE_TARGET_PATTERN =
  /(?:第\s*[0-9一二三四五六七八九十百两]+\s*(?:到|至|-|—|~)\s*[0-9一二三四五六七八九十百两]+\s*(?:节|段|章|卷)|第\s*[0-9一二三四五六七八九十百两]+\s*(?:节|段|章|卷)|(?:首尾|开头|结尾)\s*(?:两|二|三|几)?\s*(?:节|段|章|卷)|全文|整篇|全篇)/

export type ResolvedPermissionIntent =
  | 'status-permission-question'
  | 'prohibition-rollback'
  | 'location-consult'
  | 'reference-request'
  | 'explicit-write'
  | 'contextual-discussion'
  | null

function resolvePermissionIntent(input: string): {
  reason: ResolvedPermissionIntent
  hits: PhraseHit[]
} {
  input = normalizeTypoInput(input)
  // Punctuation-stripped affirmations such as "好的按你的方案..." are
  // discussion responses, even when the sentence is no longer a question.
  if (AFFIRMATIVE_DISCUSSION_PATTERN.test(input.trim())) {
    return { reason: 'contextual-discussion', hits: [] }
  }
  const statusHits = findPhrases(input, STATUS_PERMISSION_CATEGORIES)
  const hasStatusQuestion = statusHits.length > 0 || isQuestionInput(input)
  const isGenericAnalysisQuestion =
    GENERIC_ANALYSIS_QUESTION_PATTERN.test(input.trim())
  const prohibitionHits = findPhrases(input, PROHIBITION_CATEGORIES)
  const hasAnalysisDirective = findPhrases(input, ['analyzeKeywords']).some(
    hit =>
      hit.phrase !== '时间线' &&
      hit.phrase !== '逻辑' &&
      hit.phrase !== '有什么问题' &&
      hit.phrase !== '哪里有问题' &&
      hit.phrase !== '哪里不对' &&
      hit.phrase !== '哪里怪' &&
      hit.phrase !== '合理吗' &&
      hit.phrase !== '合理不' &&
      hit.phrase !== '可信吗' &&
      hit.phrase !== '成立吗' &&
      hit.phrase !== '站得住吗',
  ) && !isGenericAnalysisQuestion
  if (hasStatusQuestion) {
    // A permission question is context, not an override. An imperative such as
    // "try editing this to verify your permission" is still a write request.
    if (hasWriteDirective(input)) {
      return {
        reason: 'explicit-write',
        hits: findPhrases(input, [
          ...STRONG_WRITE_CATEGORIES,
          ...WEAK_WRITE_CATEGORIES,
          ...WRITE_TARGET_CATEGORIES,
        ]),
      }
    }
    if (AFFIRMATIVE_DISCUSSION_PATTERN.test(input.trim())) {
      return { reason: 'contextual-discussion', hits: [] }
    }
    if (NON_WORKSPACE_GREETING_PATTERN.test(input.trim())) {
      return { reason: null, hits: [] }
    }
    if (hasAnalysisDirective) {
      return { reason: null, hits: [] }
    }
    // A leading "有没有/是不是" alone is not an analysis request when the
    // matched phrase is itself a permission question. Letting it fall through
    // would let the write keyword layer promote the question to edit.
    if (
      statusHits.length === 0 &&
      GENERIC_ANALYSIS_QUESTION_PATTERN.test(input.trim())
    ) {
      return { reason: null, hits: [] }
    }
    if (statusHits.length > 0) {
      return { reason: 'status-permission-question', hits: statusHits }
    }
    return { reason: 'contextual-discussion', hits: [] }
  }
  const hasKeepUnchangedQualifier =
    KEEP_UNCHANGED_QUALIFIER_PATTERN.test(input) ||
    BARE_KEEP_UNCHANGED_QUALIFIER_PATTERN.test(input)
  if (
    hasKeepUnchangedQualifier &&
    !NON_ACTIONABLE_PROHIBITION_PATTERN.test(input) &&
    (hasWriteDirective(input) || hasScopedWeakWriteDirective(input))
  ) {
    return { reason: 'explicit-write', hits: findPhrases(input, [
      ...STRONG_WRITE_CATEGORIES,
      ...WEAK_WRITE_CATEGORIES,
      ...WRITE_TARGET_CATEGORIES,
    ]) }
  }
  if (prohibitionHits.length > 0) {
    return { reason: 'prohibition-rollback', hits: prohibitionHits }
  }
  const locationHits = findPhrases(input, LOCATION_CATEGORIES)
  const strongWriteHits = findPhrases(input, STRONG_WRITE_CATEGORIES)
  const weakWriteHits = findPhrases(input, WEAK_WRITE_CATEGORIES)
  const writeTargetHits = findPhrases(input, WRITE_TARGET_CATEGORIES)
  const hasInterrogativeLocation = locationHits.some(
    hit => hit.group === 'interrogative-location',
  )
  const hasLocationRequestSignal = locationHits.some(
    hit => hit.category === 'readOnlyLocationRequest',
  )
  const hasStructuralAnchor = locationHits.some(
    hit => hit.group === 'structural-anchors',
  )
  const hasWriteAction = strongWriteHits.length > 0 || weakWriteHits.length > 0
  const hasLocationSignal =
    hasInterrogativeLocation ||
    hasLocationRequestSignal ||
    (hasStructuralAnchor && PLACEMENT_PATTERN.test(input) && !hasWriteAction)
  const hasImperativeWriteMarker = /把|将/.test(input)
  const referenceHits = findPhrases(input, REFERENCE_CATEGORIES)
  const contextualHits = findPhrases(input, CONTEXTUAL_CATEGORIES)
  const hasStructuredReplaceDirective =
    (STRUCTURED_REPLACE_IMPERATIVE_PATTERN.test(input) ||
      STRUCTURED_REPLACE_TOPIC_PATTERN.test(input)) &&
    !STRUCTURED_REPLACE_PREVIEW_PATTERN.test(input)
  const hasReplacePreviewQuestion =
    STRUCTURED_REPLACE_ACTION_PATTERN.test(input) &&
    STRUCTURED_REPLACE_PREVIEW_PATTERN.test(input)
  const hasWriteQualifier =
    writeTargetHits.length > 0 ||
    hasImperativeWriteMarker ||
    findPhrases(input, ['writeIntensifiers']).length > 0
  const hasDiscussionRequest = DISCUSSION_REQUEST_PATTERN.test(input)
  const hasGenerateAction = findPhrases(input, ['generateKeywords']).length > 0
  // Some generate words are nouns when attached to a preview verb: "看看成稿"
  // reads an existing deliverable instead of requesting a new one.
  const hasReadonlyGeneratePreview =
    READONLY_GENERATE_PREVIEW_PATTERN.test(input) &&
    findPhrases(input, ['generateKeywords']).length > 0
  const hasFinalGenerateDeliverable =
    FINAL_GENERATE_DELIVERABLE_PATTERNS.some(pattern => pattern.test(input))
  const hasNewContentComposition =
    NEW_CONTENT_COMPOSITION_PATTERN.test(input) &&
    !NEW_CONTENT_COMPOSITION_EXCLUSION_PATTERN.test(input)
  const hasEditorWriteAction = strongWriteHits.some(hit =>
    EDITOR_WRITE_ACTION_PATTERN.test(hit.phrase),
  )
  // "替换方案" is a noun here, not an editor action: "给我看看第 3 个替换方案"
  // asks for a read-only preview and must never trigger a write route.
  const hasReadonlyReplacePlanRequest =
    /替换方案/.test(input) &&
    /(给我看看|给我看一眼|看看|看一眼|预览|先看)/.test(input)
  const hasDomainWriteAction =
    strongWriteHits.some(hit => !EDITOR_WRITE_ACTION_PATTERN.test(hit.phrase)) &&
    (writeTargetHits.length > 0 || WORKSPACE_DOMAIN_PATTERN.test(input))
  const hasDirectEditorWriteContext = EDITOR_WRITE_CONTEXT_PATTERN.test(input)
  const hasDiscussionIntent =
    hasDiscussionRequest &&
    !hasGenerateAction &&
    !hasAnalysisDirective &&
    !hasFinalGenerateDeliverable
  const hasExplicitWrite =
    !hasLocationSignal &&
    !isQuestionInput(input) &&
    !LEADING_MODAL_WRITE_QUESTION_PATTERN.test(input.trim()) &&
    !hasReplacePreviewQuestion &&
    !hasDiscussionIntent &&
    !hasFinalGenerateDeliverable &&
    !hasNewContentComposition &&
    (hasEditorWriteAction && !hasReadonlyReplacePlanRequest ||
      (hasDirectEditorWriteContext && strongWriteHits.length > 0) ||
      (strongWriteHits.length > 0 &&
        (hasDomainWriteAction || hasImperativeWriteMarker)) ||
      EXPLORATORY_WRITE_PATTERN.test(input) ||
      hasStructuredReplaceDirective ||
      (weakWriteHits.length > 0 &&
        (writeTargetHits.length > 0 || hasImperativeWriteMarker)))
  if (hasLocationSignal) {
    return { reason: 'location-consult', hits: locationHits }
  }
  if (
    referenceHits.length > 0 &&
    !hasWriteQualifier &&
    (!hasGenerateAction || hasReadonlyGeneratePreview) &&
    !hasFinalGenerateDeliverable
  ) {
    return { reason: 'reference-request', hits: referenceHits }
  }
  if (hasExplicitWrite && !hasDiscussionIntent) {
    return {
      reason: 'explicit-write',
      hits: [...strongWriteHits, ...weakWriteHits, ...writeTargetHits],
    }
  }
  if (hasDiscussionIntent) {
    return { reason: 'contextual-discussion', hits: findPhrases(input, ['discussKeywords']) }
  }
  if (
    LEADING_MODAL_QUESTION_PATTERN.test(input) ||
    (isQuestionInput(input) &&
      !/^(看看|看一眼|检查|分析|评估|诊断|审查|审视|复核|排查|找找|找一找|挑一挑|列出|列出来|通读)/.test(
        input,
      ))
  ) {
    return { reason: 'contextual-discussion', hits: contextualHits }
  }
  if (
    referenceHits.length > 0 ||
    (contextualHits.length > 0 &&
      !hasIntentKeywordSignal(input) &&
      contextualHits.every(hit => hit.category === 'contextualReplies'))
  ) {
    // The late reference branch must obey the same generate guards as the
    // early branch. Otherwise "先审一遍，再给我一版修改后的钩子" falls back
    // to reference-request after the final-deliverable guard already passed.
    if (
      (hasGenerateAction && !hasReadonlyGeneratePreview) ||
      hasFinalGenerateDeliverable
    ) {
      return { reason: null, hits: [...weakWriteHits, ...writeTargetHits] }
    }
    return { reason: 'reference-request', hits: referenceHits }
  }
  const hasPreferenceConstraint = contextualHits.some(
    hit => hit.group === 'desire-and-preference',
  )
  const hasModalClarification = contextualHits.some(
    hit => hit.group === 'interrogative-modal',
  )
  if (
    contextualHits.length > 0 &&
    ((hasPreferenceConstraint && !hasGenerateAction) ||
      (hasModalClarification && !DIRECTIVE_VERB_PATTERN.test(input)) ||
      (!hasIntentKeywordSignal(input) && !DIRECTIVE_VERB_PATTERN.test(input)))
  ) {
    return { reason: 'contextual-discussion', hits: contextualHits }
  }
  return { reason: null, hits: [...weakWriteHits, ...writeTargetHits] }
}

export const DEFAULT_INTENT_ROUTES: Record<
  Exclude<ChainIntent, 'auto'>,
  string[]
> = {
  analyze: ['诊断', '审查', '分析', '体检', '评审'],
  edit: ['编辑', '修改', '润色', '重写', '修正'],
  generate: ['生成', '创作', '扩写', '骨架', '正文'],
  discuss: ['讨论', '构思', '共创', '问答', '聊'],
}

const VALID_CHAIN_INTENTS = new Set<Exclude<ChainIntent, 'auto'>>([
  'analyze',
  'edit',
  'generate',
  'discuss',
])

export type ChainIntentHistoryRole = 'user' | 'assistant' | 'system'

export interface ChainIntentHistoryMessage {
  role: ChainIntentHistoryRole
  content: string
}

const CONTEXTUAL_REPLY_MAX_LENGTH = 20
const PLACEMENT_PATTERN =
  /(放在|放到|插在|插到|摆在|摆到|归到|归在|挂在|挂到|写在|写到|加在|加到|接在|接到|排在|排到|缀在)/
const EXPLICIT_INTENT_PATTERN =
  /(生成|写|创作|修改|改|调整|分析|检查|诊断|评估|讨论|聊聊|你觉得|商量|探讨)/
const QUESTION_MARKER_PATTERN = /(?:[?？]|[么吗呢])[。！？!?]*$/
const AFFIRMATIVE_DISCUSSION_PATTERN =
  /^(好的|好呀|可以|行|明白|明白了|嗯|哦|对|同意).{0,12}(按你说的|按你的方案|照你说的|听你的)/
const READONLY_GENERATE_PREVIEW_PATTERN =
  /(给我看|给我看看|看看|看一眼|展示|预览|先看|(?:写出来|输出|成稿|正文|定稿)[^。！？]{0,8}(?:什么样|什么样子|什么效果|怎么样))/
const NON_WORKSPACE_GREETING_PATTERN =
  /^(在吗|在么|你好|您好|嗨|哈喽|hello|hi)(?![^。！？!?]{0,12}(大纲|卷纲|章节|正文|设定|人物|角色|伏笔|钩子|时间线|故事|情节|开篇|结尾))$/i
const STRUCTURED_REPLACE_ACTION_PATTERN = /(?:换成|改成|改为|替换成|替换为)/
const STRUCTURED_REPLACE_IMPERATIVE_PATTERN = new RegExp(
  `(?:把|将)[^。！？!?]{1,80}?${STRUCTURED_REPLACE_ACTION_PATTERN.source}[^。！？!?]{1,80}$`,
)
const STRUCTURED_REPLACE_TOPIC_PATTERN = new RegExp(
  `(?:这几个字|这几个词|这个词|这些字|这句话)[^。！？!?]{0,30}${STRUCTURED_REPLACE_ACTION_PATTERN.source}`,
)
const STRUCTURED_REPLACE_PREVIEW_PATTERN =
  /[?？]$|(?:什么样|什么样子|什么效果|怎么样|如何|什么)/
const EDITOR_WRITE_ACTION_PATTERN =
  /(写入|写进|写回去|写回|回填|回写|直写|直接写|录入|填入|填进|保存到|存进|存到|存入|同步到|同步进|落实到|落盘|落进|在后面补|在后面加|帮我补|帮我加|补一句|补一段|新增|新增一句|新增一段|加一句|加一段|添一句|添一段|添上|增加|补全|定稿|敲定|确认修改|确认写入|重新排版|重新整理格式|统一标点|统一格式|格式排版|替换|重写|删除|删掉|移除|去掉|清除掉)/
const EDITOR_WRITE_CONTEXT_PATTERN =
  /直接|编辑器|第\s*[一二三四五六七八九十\d]+\s*(?:段|节|章|卷|行)|当前段落|目标段落/
const FINAL_GENERATE_DELIVERABLE_PATTERNS: readonly RegExp[] = [
  /先[^，。！？]{0,8}(?:审一遍|审查|检查|分析|评估|诊断)[^，。！？]{0,20}[，,]?\s*(?:再|然后)[^，。！？]{0,24}(?:给我一版|给我一版修改后的|写出来|输出一版)/,
  /(?:再|然后)[^，。！？]{0,24}(?:给我一版|给我一版修改后的|写出来|输出一版)[^，。！？]{0,20}[，,]?\s*先[^，。！？]{0,8}(?:审一遍|审查|检查|分析|评估|诊断)/,
]
const NEW_CONTENT_COMPOSITION_PATTERN =
  /^(?:为|给|帮)(?:我)?[^，。！？]{0,12}(?:补一段|补个|写一段|写个|加一段|想一个|想几个)(?![^。！？]{0,6}(?:就行|就好))/
const NEW_CONTENT_COMPOSITION_EXCLUSION_PATTERN =
  /(在后面|当前段落|目标段落|第[一二三四五六七八九十\d]+段|编辑器)/
const GENERIC_ANALYSIS_QUESTION_PATTERN =
  /^(?:有什么|有没有|需不需要|要不要|是不是|会不会)/
const DISCUSSION_REQUEST_PATTERN =
  /(讨论一下|商量一下|商量怎么|聊聊|聊一聊|谈一谈|探讨一下|给我看看|给我参考|不要按|不要按照|先不动|暂不动|暂不)/
const LEADING_MODAL_QUESTION_PATTERN = /^(要不要|能不能|会不会|有没有|是不是)/
const MODAL_QUESTION_PATTERN = /(要不要|能不能|会不会|有没有|是不是)/
const LEADING_MODAL_WRITE_QUESTION_PATTERN =
  /^(?:要不要|能不能|能否|是不是|需不需要|用不用|该不该)[^。！？!?]{0,30}(?:新增|加一句|加一段|添加|修改|写入|编辑|删除|移除)/
const DIRECTIVE_VERB_PATTERN =
  /(看看|看一眼|检查|分析|评估|诊断|审查|审一遍|审核|审视|复核|排查|找找|找一找|挑一挑|列出|列出来|通读|写|生成|起草|创作|编写|续写|扩写|输出|起名|命名|整理成|归纳成|总结成)/
const AUTHOR_PREFERENCE_PATTERN =
  /^(?:我|我们|这个|这|那|它|他|她)?(?:设计的是|设计意图是|不是要|不是这个意思|不同意|比较倾向|倾向于)/
const EXPLORATORY_WRITE_PATTERN =
  /(试着|尝试|测试|验证)[^。！？!?]*(修改|改|写入|编辑)|随意加几个字|随便加几个字|加几个字/
const AWAIT_USER_MARKERS = [
  'await_user: true',
  '【讨论回复】',
  '【讨论状态】',
  '【下一问】',
]
function isLikelyContextualReply(userInput: string): boolean {
  const text = userInput.trim()
  if (!text || text.length > CONTEXTUAL_REPLY_MAX_LENGTH) return false
  return !EXPLICIT_INTENT_PATTERN.test(text)
}

function findAwaitingUserMessage(
  recentHistory: readonly ChainIntentHistoryMessage[] | undefined,
): ChainIntentHistoryMessage | null {
  if (!recentHistory?.length) return null
  for (let i = recentHistory.length - 1; i >= 0; i--) {
    const message = recentHistory[i]
    if (message.role !== 'assistant' || typeof message.content !== 'string')
      continue
    if (AWAIT_USER_MARKERS.some((marker) => message.content.includes(marker)))
      return message
  }
  return null
}

function isQuestionInput(text: string): boolean {
  return QUESTION_MARKER_PATTERN.test(text.trim())
}

function hasWriteDirective(input: string): boolean {
  // Permission/status questions naturally contain write words ("写入编辑器了
  // 么"). Only an imperative marker or an exploratory-write phrase may promote
  // such a sentence from discussion to a real write directive.
  const writeActionHits = [
    ...findPhrases(input, STRONG_WRITE_CATEGORIES),
    ...findPhrases(input, WEAK_WRITE_CATEGORIES),
  ]
  const hasImperativeWriteMarker = /把|将/.test(input)
  return (
    (hasImperativeWriteMarker &&
      writeActionHits.length > 0 &&
      !DISCUSSION_REQUEST_PATTERN.test(input) &&
      !isQuestionInput(input) &&
      !MODAL_QUESTION_PATTERN.test(input)) ||
    EXPLORATORY_WRITE_PATTERN.test(input)
  )
}

function hasScopedWeakWriteDirective(input: string): boolean {
  const weakWriteHits = findPhrases(input, WEAK_WRITE_CATEGORIES)
  if (weakWriteHits.length === 0) return false
  return (
    SCOPED_WRITE_TARGET_PATTERN.test(input) &&
    !DISCUSSION_REQUEST_PATTERN.test(input) &&
    !isQuestionInput(input) &&
    !MODAL_QUESTION_PATTERN.test(input)
  )
}

// --- 示例语句库（每意图30条）---
export const INTENT_EXAMPLES: Record<Exclude<ChainIntent, 'auto'>, string[]> = {
  analyze: [
    '审核大纲看看缺什么',
    '从长篇小说角度检查这个大纲',
    '诊断一下当前设定有没有漏洞',
    '帮我评估一下角色弧光完整不完整',
    '审视一下这个故事引擎能不能撑住长篇',
    '找找这个大纲的问题',
    '看看我的伏笔有没有回收方向',
    '评价一下我的叙事框架',
    '这个设定有没有硬伤',
    '帮我体检一下世界观设定',
    '审查一下大纲的逻辑结构',
    '分析一下主角的动机是否合理',
    '检查伏笔的埋设和回收',
    '评估故事引擎的驱动力',
    '看看节奏控制有没有问题',
    '诊断世界观设定是否自洽',
    '找一下大纲中的逻辑漏洞',
    '帮我看一下人物关系图',
    '评判一下这个开篇够不够抓人',
    '审查角色弧光的设计',
    '分析一下核心张力的可持续性',
    '检查一下每卷的钩子设计',
    '评估一下篇幅分配是否合理',
    '看看有没有没交代清楚的设定',
    '帮我把大纲的结构性问题列出来',
    '体检一下整个故事的骨架',
    '审视一下反派设计的合理性',
    '检查主线是否有偏离风险',
    '分析一下信息揭示节奏',
    '评估读者会不会觉得无聊',
  ],
  edit: [
    '修改大纲的第三卷结构',
    '把主角的幽灵创伤补上',
    '调整一下催化事件',
    '重写角色弧光的内在需求部分',
    '帮我把叙事框架改一下',
    '补充圣萌会的道德模糊性设计',
    '精简一下第一卷的低能段',
    '修订核心张力的描述',
    '把钩子系统改强一点',
    '去掉那个多余的设定',
    '替换第二卷的开场方式',
    '增加一个反转节点',
    '删掉这个冗余角色',
    '优化一下开篇的节奏',
    '改写第一章的叙事视角',
    '调整卷与卷之间的过渡',
    '把世界观的某部分重新设定',
    '修正角色动机的逻辑',
    '重构第三幕的结构',
    '把这段描写压缩一下',
    '扩充角色背景的深度',
    '修订一下时间线',
    '把对话部分改得更自然',
    '调整一下叙事密度',
    '改一下主角的性格设定',
    '把伏笔的位置调整一下',
    '补充一下反派的动机',
    '精简过长的设定描述',
    '把叙事节奏改快一点',
    '修改角色关系的描述方式',
    '第一卷钩子要重新弄一下',
    '开篇抓人的地方再强化一点',
    '开头吸引点不够，直接改强',
    '把开篇亮点再打磨一下',
    '第一卷新引子重做',
    '开篇勾子不行，改一下',
    '钩子需要重新设订',
    '脚裸伏笔补到第二卷',
    '人物弧光衔接断了，修一下',
    '第二卷节奏点重新排',
    '这个方案我不满意，直接改',
    '把不够吸引的开场改抓人',
    '把这条伏笔补进后续',
    '把这个断点接上',
    '把节奏点重新排一遍',
  ],
  generate: [
    '生成一个完整大纲',
    '写一个新的大纲',
    '创作一个废土末日故事的大纲',
    '帮我起草卷纲',
    '新建一个大纲',
    '输出一份完整的叙事框架',
    '编写第一卷的详细纲要',
    '生成全书的角色设定',
    '给我写一个新的故事引擎',
    '构思一个全新的核心张力',
    '帮我写一个故事梗概',
    '生成一份卷纲结构',
    '创作一个角色关系图',
    '编写世界观的框架',
    '起草一个开篇方案',
    '输出完整的角色档案',
    '帮我生成一个故事大纲',
    '写一份章节规划',
    '新建一个叙事框架',
    '编一个故事梗概',
    '生成第一卷的详细规划',
    '创作一个完整的设定体系',
    '帮我起草角色弧光',
    '写出整个故事的骨架',
    '生成一个三幕结构',
    '编写故事的核心冲突',
    '给我写一个主角的背景故事',
    '生成一个反派的设计方案',
    '创作一个完整的情节链',
    '帮我起草一个世界观设定',
    '帮我想一个更抓人的开篇',
    '帮我想三个可选钩子',
    '麻烦你起草第二卷的三个节点',
  ],
  discuss: [
    '讨论一下主角应该用什么视角',
    '你觉得这个设定合理吗',
    '聊聊圣萌会作为反派的动机',
    '探讨一下叙事节奏怎么安排',
    '我对核心张力有个想法',
    '你觉得方案二好不好',
    '有什么建议可以改进这个大纲',
    '我们商量一下第二卷的走向',
    '怎么看这个角色的动机',
    '交流一下世界观的设定逻辑',
    '你觉得第一卷的开场怎么样',
    '聊聊这个故事的受众定位',
    '讨论一下这个题材的市场前景',
    '你觉得这个角色有没有魅力',
    '探讨一下叙事视角的选择',
    '我对角色弧光有不同的想法',
    '你觉得这个设定会不会太复杂',
    '聊聊故事的情感基调',
    '讨论一下主角的成长曲线',
    '你觉得反派的智商够不够',
    '探讨一下世界观的复杂度',
    '你觉得叙事节奏会不会太快',
    '聊聊伏笔的密度问题',
    '讨论一下读者会不会喜欢这个设定',
    '你觉得这个开篇够不够吸引人',
    '聊聊角色之间的关系设计',
    '探讨一下故事的悬念设置',
    '你觉得这个核心冲突有没有张力',
    '讨论一下信息揭示的策略',
    '聊聊这个故事的主题深度',
    '商量一下第二卷该怎么写',
    '商量一下角色弧光怎么设计',
    '商量一下反派怎么处理',
    '构思一下主角的成长方向',
    '共创一个合理的角色弧光',
    '构思反派的行为逻辑',
    '钩子二我设计的是一次性伤害，先说明一下',
    '这个伏笔不是永久性的，先澄清',
    '我不同意这个判断，理由后面说',
    '我觉得这个开篇有问题，想听你的看法',
    '我对这个方案有意见',
    '这个设定我想解释一下设计意图',
    '我说明一下这段的设计意图',
    '这里我不是要改，只是想澄清',
    '这个设定我不是这个意思',
    '这条线的设计目的我说一下',
  ],
}
// --- 停用词表 ---
const STOP_WORDS = new Set([
  '的',
  '了',
  '是',
  '在',
  '我',
  '你',
  '他',
  '她',
  '它',
  '们',
  '一',
  '个',
  '这',
  '那',
  '有',
  '和',
  '与',
  '或',
  '也',
  '都',
  '不',
  '没',
  '就',
  '把',
  '到',
  '对',
  '为',
  '以',
  '于',
  '帮',
  '让',
  '给',
  '请',
  '下',
  '上',
  '中',
  '里',
  '来',
  '去',
  '要',
  '会',
  '能',
  '可',
  '及',
  '等',
  '之',
  '其',
  '此',
])

// --- jieba 分词（懒加载，浏览器环境降级到字符分割）---
let jiebaCut: ((text: string, hmm?: boolean) => string[]) | null = null
let jiebaLoadFailed = false

async function ensureJieba(): Promise<boolean> {
  if (jiebaCut) return true
  jiebaLoadFailed = false

  // Electron renderer must use the main-process native binding. The bundled
  // browser build cannot read dict.txt and must never be treated as available.
  const electronJieba = (globalThis as { window?: { electronAPI?: { jiebaCut?: (text: string, hmm?: boolean) => { ok: boolean; words?: string[]; error?: string } } } })
    .window?.electronAPI?.jiebaCut
  if (typeof electronJieba === 'function') {
    try {
      const probe = electronJieba('初始化', false)
      if (!probe?.ok || !Array.isArray(probe.words)) {
        jiebaLoadFailed = true
        return false
      }
      jiebaCut = (text: string, hmm?: boolean) => {
        const result = electronJieba(text, hmm ?? false)
        return result?.ok && Array.isArray(result.words) ? result.words : []
      }
      return true
    } catch {
      jiebaLoadFailed = true
      return false
    }
  }

  try {
    const { Jieba } = await import('@node-rs/jieba')
    let dict: Uint8Array
    try {
      ;({ dict } = await import('@node-rs/jieba/dict'))
    } catch {
      ;({ dict } = await import('@node-rs/jieba/dict.js'))
    }
    const jieba = Jieba.withDict(dict)
    jiebaCut = (text: string, hmm?: boolean) => jieba.cut(text, hmm ?? false)
    return true
  } catch {
    jiebaLoadFailed = true
    return false
  }
}

function tokenize(text: string): string[] {
  if (jiebaCut) {
    const words = jiebaCut(text, false)
    return words.filter((w) => w.length > 1 && !STOP_WORDS.has(w))
  }
  // 降级：字符级分割（无 jieba 时）
  const chars = [...text]
  const result: string[] = []
  for (let i = 0; i < chars.length - 1; i++) {
    const pair = chars[i] + chars[i + 1]
    if (!STOP_WORDS.has(chars[i]) && !STOP_WORDS.has(chars[i + 1])) {
      result.push(pair)
    }
  }
  return result
}

function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1)
  }
  const max = tokens.length || 1
  for (const [key, val] of tf) {
    tf.set(key, val / max)
  }
  return tf
}

// --- 预计算的意图向量 ---
interface IntentDoc {
  intent: ChainIntent
  tokens: string[]
  tf: Map<string, number>
}

let intentDocs: IntentDoc[] = []
const idfCache: Map<string, number> = new Map()
let intentTfidfVectors: Array<{
  intent: ChainIntent
  vec: Map<string, number>
}> = []
let initialized = false

function awaitUserIfWriteCandidate(
  candidates: readonly Exclude<ChainIntent, 'auto'>[],
): RoutingFallbackMode {
  return candidates.some(
    (intent) => intent === 'edit' || intent === 'generate',
  )
    ? 'await-user'
    : 'readonly-discuss'
}

export async function initIntentRouter(): Promise<void> {
  if (initialized) return
  const retryDelays = [0, 100, 200]
  let jiebaReady = false
  for (const delay of retryDelays) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    jiebaReady = await ensureJieba()
    if (jiebaReady) break
  }
  if (!jiebaReady) jiebaLoadFailed = true

  intentDocs = []
  const allDocs: string[][] = []

  for (const [intent, examples] of Object.entries(INTENT_EXAMPLES)) {
    const allTokens: string[] = []
    for (const ex of examples) {
      allTokens.push(...tokenize(ex))
    }
    intentDocs.push({
      intent: intent as ChainIntent,
      tokens: allTokens,
      tf: computeTF(allTokens),
    })
    allDocs.push(allTokens)
  }

  const totalDocs = allDocs.length
  const docFreq = new Map<string, number>()
  for (const tokens of allDocs) {
    const unique = new Set(tokens)
    for (const t of unique) {
      docFreq.set(t, (docFreq.get(t) || 0) + 1)
    }
  }
  for (const [term, df] of docFreq) {
    idfCache.set(term, Math.log((totalDocs + 1) / (df + 1)) + 1)
  }

  intentTfidfVectors = intentDocs.map((doc) => {
    const vec = new Map<string, number>()
    for (const [term, tf] of doc.tf) {
      const idf = idfCache.get(term) || 1
      vec.set(term, tf * idf)
    }
    let norm = 0
    for (const v of vec.values()) norm += v * v
    norm = Math.sqrt(norm) || 1
    for (const [k, v] of vec) vec.set(k, v / norm)
    return { intent: doc.intent, vec }
  })

  initialized = true
}

function textToTfidfVector(text: string): Map<string, number> {
  const tokens = tokenize(text)
  if (tokens.length === 0) return new Map()
  const tf = computeTF(tokens)
  const vec = new Map<string, number>()
  for (const [term, t] of tf) {
    const idf = idfCache.get(term)
    if (idf !== undefined) {
      vec.set(term, t * idf)
    }
  }
  let norm = 0
  for (const v of vec.values()) norm += v * v
  norm = Math.sqrt(norm) || 1
  for (const [k, v] of vec) vec.set(k, v / norm)
  return vec
}

function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dot = 0
  const [small, large] = a.size < b.size ? [a, b] : [b, a]
  for (const [k, v] of small) {
    const w = large.get(k)
    if (w !== undefined) dot += v * w
  }
  return dot
}

export function classifyChainIntent(
  userInput: string,
  recentHistory?: readonly ChainIntentHistoryMessage[],
): ChainIntentRouteResult {
  if (!userInput || !userInput.trim()) {
    return { intent: 'auto', matchedKeywords: [], confidence: 0 }
  }

  const normalizedInput = userInput.trim()
  const permissionIntent = resolvePermissionIntent(normalizedInput)
  if (permissionIntent.reason) {
    if (permissionIntent.reason === 'explicit-write') {
      return {
        intent: 'edit',
        matchedKeywords: ['explicit-write-directive'],
        confidence: 0.95,
      }
    }
    return {
      intent: 'discuss',
      matchedKeywords: [permissionIntent.reason],
      confidence: 0.9,
    }
  }

  // Final deliverable phrasing has a clear generation target and must not be
  // dragged back to edit by words such as "修改后的".
  if (FINAL_GENERATE_DELIVERABLE_PATTERNS.some(pattern => pattern.test(normalizedInput))) {
    return {
      intent: 'generate',
      matchedKeywords: ['final-deliverable-generation'],
      confidence: 0.9,
    }
  }

  // 短答复是在回答上一轮问题，不是新的创作指令；避免重启完整生成链。
  if (
    isLikelyContextualReply(userInput) &&
    findAwaitingUserMessage(recentHistory)
  ) {
    return {
      intent: 'discuss',
      matchedKeywords: ['await_user'],
      confidence: 0.8,
    }
  }

  const keywordScores = scoreIntentsByKeywords(normalizedInput)
  if (keywordScores.length > 0) {
    const top = keywordScores[0]
    const total = keywordScores.reduce((sum, entry) => sum + entry.score, 0)
    if (isQuestionOnlyIntent(normalizedInput, top.intent)) {
      return {
        intent: 'discuss',
        matchedKeywords: [`question-only:${top.intent}`],
        confidence: top.score / total,
      }
    }
    if (top.score / total >= ROUTE_THRESHOLDS[top.intent]) {
      return {
        intent: top.intent,
        matchedKeywords: [top.intent],
        confidence: top.score / total,
      }
    }
  }

  if (!initialized || intentTfidfVectors.length === 0) {
    return { intent: 'auto', matchedKeywords: [], confidence: 0 }
  }

  const inputVec = textToTfidfVector(userInput)
  if (inputVec.size === 0) {
    return { intent: 'auto', matchedKeywords: [], confidence: 0 }
  }

  const scores: Array<{ intent: ChainIntent; score: number }> = []
  for (const { intent, vec } of intentTfidfVectors) {
    const score = cosineSimilarity(inputVec, vec)
    scores.push({ intent, score })
  }
  scores.sort((a, b) => b.score - a.score)

  const best = scores[0]
  const second = scores[1]
  const confidence = best.score / (best.score + (second?.score || 0.001))

  if (best.score < ROUTE_THRESHOLDS[best.intent]) {
    return { intent: 'auto', matchedKeywords: [], confidence: 0 }
  }

  const matchedKeywords: string[] = []
  for (const [k, v] of inputVec) {
    if (v > 0.05) matchedKeywords.push(k)
  }

  return { intent: best.intent, matchedKeywords, confidence }
}

function scoreIntentsByKeywords(
  text: string,
): Array<{ intent: Exclude<ChainIntent, 'auto'>; score: number }> {
  const intentActionHits = findPhrases(text, [
    ...INTENT_KEYWORD_CATEGORIES.map((entry) => entry.category),
  ]).filter(
    hit =>
      hit.category === 'generateKeywords' ||
      (hit.category === 'analyzeKeywords' &&
        hit.phrase !== '时间线' &&
        hit.phrase !== '逻辑' &&
        hit.phrase !== '有什么问题' &&
        hit.phrase !== '哪里有问题' &&
        hit.phrase !== '哪里不对' &&
        hit.phrase !== '哪里怪' &&
        hit.phrase !== '合理吗' &&
        hit.phrase !== '合理不' &&
        hit.phrase !== '可信吗' &&
        hit.phrase !== '成立吗' &&
        hit.phrase !== '站得住吗'),
  )
  const hasDiscussionRequest =
    DISCUSSION_REQUEST_PATTERN.test(text) &&
    intentActionHits.length === 0
  const hasGenerateDeliverable =
    findPhrases(text, ['generateKeywords']).some(hit => hit.group === 'generate')
  const keywordHits = INTENT_KEYWORD_CATEGORIES.map(
    ({ intent, category }) => ({
      intent,
      score: findPhrases(text, [category]).reduce(
        (sum, hit) => sum + hit.phrase.length,
        0,
      ),
    }),
  )
  if (hasDiscussionRequest) {
    const hasAggregatedGenerate =
      findPhrases(text, ['generateKeywords']).some(hit =>
        hit.group === 'generate' && hit.phrase === '给我一版',
      ) && /再来一版|再出一版|第\s*\d+\s*版|第\s*[一二三四五六七八九十]+\s*版/.test(text)
    if (!hasAggregatedGenerate) {
      keywordHits.push({ intent: 'discuss', score: 1000 })
    }
  }
  const strongWriteHits = findPhrases(text, [
    'strongWriteActions',
    'writeIntensifiers',
  ])
  const weakWriteHits = findPhrases(text, ['weakWriteActions'])
  const writeTargetHits = findPhrases(text, ['writeTargets'])
  const hasScopedWriteTarget = SCOPED_WRITE_TARGET_PATTERN.test(text)
  const hasStrongWriteAction = strongWriteHits.length > 0
  const editHitLength =
    strongWriteHits.reduce((sum, hit) => sum + hit.phrase.length, 0) +
    (hasStrongWriteAction ||
    writeTargetHits.length > 0 ||
    hasScopedWriteTarget ||
    /把|将/.test(text)
      ? weakWriteHits.reduce((sum, hit) => sum + hit.phrase.length, 0)
      : 0)
  if (
    editHitLength > 0 &&
    !hasDiscussionRequest &&
    !hasGenerateDeliverable
  ) {
    keywordHits.push({ intent: 'edit', score: editHitLength })
  }
  return keywordHits
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
}

function isQuestionOnlyIntent(
  text: string,
  intent: Exclude<ChainIntent, 'auto'>,
): boolean {
  const trimmed = text.trim()
  const hasDirective = DIRECTIVE_VERB_PATTERN.test(trimmed)
  return (
    /[?？]$/.test(trimmed) ||
    /[吗呢][。！？!?]*$/.test(trimmed) ||
    (/什么[。！？!?]*$/.test(trimmed) && !hasDirective) ||
    (LEADING_MODAL_QUESTION_PATTERN.test(trimmed) && !hasDirective)
  )
}

function hasWriteDirectiveSignal(text: string): boolean {
  const strongHits = findPhrases(text, STRONG_WRITE_CATEGORIES)
  const weakHits = findPhrases(text, WEAK_WRITE_CATEGORIES)
  const targetHits = findPhrases(text, WRITE_TARGET_CATEGORIES)
  const contextualHits = findPhrases(text, CONTEXTUAL_CATEGORIES)
  if (DISCUSSION_REQUEST_PATTERN.test(text)) return false
  if (strongHits.length > 0 && contextualHits.length === 0) return true
  if (weakHits.length > 0 && targetHits.length > 0) return true
  return (
    strongHits.length > 0 &&
    weakHits.length > 0 &&
    (targetHits.length > 0 || contextualHits.length === 0)
  )
}

export function routeChainIntent(
  userInput: string,
  context?: ChainRoutingContext,
): ChainRoutingResult {
  const normalizedInput = normalizeTypoInput((userInput || '').trim())
  if (!normalizedInput) {
    return {
      kind: 'no_match',
      confidence: 0,
      reason: 'empty-input',
      fallbackMode: 'readonly-discuss',
    }
  }

  if (jiebaLoadFailed) {
    return {
      kind: 'no_match',
      confidence: 0,
      reason: 'router-degraded',
      fallbackMode: 'readonly-discuss',
    }
  }

  if (
    context?.activeEditTaskStatus === 'awaiting_batch' &&
    isExplicitEditTaskContinuationInput(normalizedInput)
  ) {
    return {
      kind: 'matched',
      intent: 'edit',
      confidence: 0.96,
      reason: 'active-edit-task-continuation',
      decisionLayer: 'rule',
    }
  }

  if (
    isLikelyContextualReply(normalizedInput) &&
    findAwaitingUserMessage(context?.recentHistory)
  ) {
    return {
      kind: 'matched',
      intent: 'discuss',
      confidence: 0.8,
      reason: 'await-user-contextual-reply',
      decisionLayer: 'rule',
    }
  }

  if (CONTINUATION_INPUTS.has(normalizedInput)) {
    const recentText = (context?.recentUserMessages || [])
      .filter(Boolean)
      .slice(-3)
      .join('\n')
    const recent = recentText ? classifyChainIntent(recentText) : null
    if (
      recent &&
      recent.intent !== 'auto' &&
      recent.confidence >= CHAIN_ROUTING_CONFIDENCE_THRESHOLD
    ) {
      return {
        kind: 'matched',
        intent: recent.intent,
        confidence: CHAIN_ROUTING_CONFIDENCE_THRESHOLD,
        reason: `continuation-resolved:${recent.intent}`,
        decisionLayer: 'rule',
      }
    }
    return {
      kind: 'ambiguous',
      candidates: ['analyze', 'edit', 'generate', 'discuss'],
      confidence: 0,
      reason: 'continuation-without-context',
      fallbackMode: 'await-user',
    }
  }

  const permissionIntent = resolvePermissionIntent(normalizedInput)
  if (permissionIntent.reason) {
    if (permissionIntent.reason === 'explicit-write') {
      return {
        kind: 'matched',
        intent: 'edit',
        confidence: 0.95,
        reason: 'explicit-write-directive',
        decisionLayer: 'rule',
      }
    }
    if (permissionIntent.reason === 'status-permission-question') {
      return {
        kind: 'matched',
        intent: 'discuss',
        confidence: 0.9,
        reason:
          permissionIntent.hits.length > 0
            ? 'status-permission-question'
            : 'question-marker-only',
        decisionLayer: 'rule',
      }
    }
    return {
      kind: 'matched',
      intent: 'discuss',
      confidence: 0.9,
      reason: permissionIntent.reason,
      decisionLayer: 'rule',
    }
  }

  if (FINAL_GENERATE_DELIVERABLE_PATTERNS.some(pattern => pattern.test(normalizedInput))) {
    return {
      kind: 'matched',
      intent: 'generate',
      confidence: 0.9,
      reason: 'final-deliverable-generation',
      decisionLayer: 'rule',
    }
  }

  const readonlyReplacePlanRequest =
    /替换方案/.test(normalizedInput) &&
    /(给我看看|给我看一眼|看看|看一眼|预览|先看)/.test(normalizedInput)
  if (readonlyReplacePlanRequest) {
    return {
      kind: 'matched',
      intent: 'discuss',
      confidence: 0.9,
      reason: 'readonly-replace-plan-request',
      decisionLayer: 'rule',
    }
  }

  const keywordScores = scoreIntentsByKeywords(normalizedInput)
  const top = keywordScores[0]
  const second = keywordScores[1]
  const keywordConfidence = top
    ? top.score / keywordScores.reduce((sum, entry) => sum + entry.score, 0)
    : 0
  // Callers that provide a workspace context are already inside a document
  // editing surface, so the request text itself does not need to repeat a
  // domain keyword for write intents to be considered in scope.
  const inWorkspace =
    context?.workspace === 'outline-workbench' ||
    context?.workspace === 'home-editor' ||
    WORKSPACE_DOMAIN_PATTERN.test(normalizedInput) ||
    (top?.intent === 'generate' &&
      WORKSPACE_GENERATIVE_ACTION_PATTERN.test(normalizedInput))
  const topIsWrite = top?.intent === 'edit' || top?.intent === 'generate'
  const hasDiscussAlternative =
    second?.intent === 'discuss' &&
    top.score - second.score < CHAIN_ROUTING_AMBIGUITY_THRESHOLD
  if (!inWorkspace && (!top || (topIsWrite && !hasDiscussAlternative))) {
    if (!top) {
    return {
      kind: 'no_match',
      confidence: keywordConfidence,
      reason: 'no-keyword-overlap',
      fallbackMode: 'readonly-discuss',
      decisionLayer: 'rule',
    }
    }
    return {
      kind: 'no_match',
      confidence: keywordConfidence,
      reason: 'out-of-scope',
      fallbackMode: 'readonly-discuss',
      decisionLayer: 'rule',
    }
  }
  const authorPreferenceDiscussion =
    AUTHOR_PREFERENCE_PATTERN.test(normalizedInput) &&
    top?.intent !== 'analyze' &&
    !hasWriteDirectiveSignal(normalizedInput)
  if (authorPreferenceDiscussion) {
    return {
      kind: 'matched',
      intent: 'discuss',
      confidence: 0.9,
      reason: 'author-preference-discussion',
      decisionLayer: 'rule',
    }
  }
  if (!top || keywordConfidence < ROUTE_THRESHOLDS[top.intent]) {
    return {
      kind: 'no_match',
      confidence: keywordConfidence,
      reason: top ? 'low-confidence' : 'no-keyword-overlap',
      fallbackMode:
        top && hasWriteDirectiveSignal(normalizedInput)
          ? 'await-user'
          : 'readonly-discuss',
      decisionLayer: 'keyword',
    }
  }
  if (second && top.score - second.score < CHAIN_ROUTING_AMBIGUITY_THRESHOLD) {
    return {
      kind: 'ambiguous',
      candidates: [top.intent, second.intent],
      confidence: keywordConfidence,
      reason: 'ambiguous-top2',
      fallbackMode: awaitUserIfWriteCandidate([top.intent, second.intent]),
      decisionLayer: 'keyword',
    }
  }

  if (isQuestionOnlyIntent(normalizedInput, top.intent)) {
    return {
      kind: 'matched',
      intent: 'discuss',
      confidence: keywordConfidence,
      reason: `question-only:${top.intent}`,
      decisionLayer: 'keyword',
    }
  }

  if (
    top.intent === 'analyze' &&
    hasWriteDirectiveSignal(normalizedInput) &&
    second?.intent !== 'edit' &&
    top.score > 0
  ) {
    return {
      kind: 'matched',
      intent: 'edit',
      confidence: keywordConfidence,
      reason: 'write-directive-with-analysis-context',
      decisionLayer: 'keyword',
    }
  }

  return {
    kind: 'matched',
    intent: top.intent,
    confidence: keywordConfidence,
    reason: 'keyword-top1',
    decisionLayer: 'keyword',
  }
}

function buildRoutingDiagnostics(input: {
  decisionLayer: ChainRoutingDiagnostics['router']['decisionLayer']
  scores?: Partial<Record<Exclude<ChainIntent, 'auto'>, number>>
  embeddingModel?: string | null
  embeddingState?: ChainRoutingDiagnostics['router']['embeddingState']
  failure?: ChainRoutingDiagnostics['router']['failure']
}): ChainRoutingDiagnostics {
  return {
    router: {
      version: 'v6.1',
      layers: ['rule', 'keyword', 'embedding', 'llm-fallback'],
      decisionLayer: input.decisionLayer,
      embeddingModel: input.embeddingModel ?? null,
      embeddingState: input.embeddingState,
      scores: input.scores || {},
      thresholds: { ...EMBEDDING_ROUTE_THRESHOLDS },
      ambiguityThreshold: CHAIN_ROUTING_AMBIGUITY_THRESHOLD,
      ambiguityThresholds: { ...EMBEDDING_ROUTING_AMBIGUITY_THRESHOLDS },
      oosThreshold: EMBEDDING_ROUTING_OOS_THRESHOLD,
      thresholdSource:
        input.decisionLayer === 'keyword'
          ? 'cold-start'
          : EMBEDDING_ROUTING_THRESHOLD_SOURCE,
      failure: input.failure,
    },
  }
}

function parseLlmIntentFallbackResult(
  raw: Awaited<ReturnType<LlmIntentClassifier>>,
): {
  ok: boolean
  intent: Exclude<ChainIntent, 'auto'> | null
  confidence: number
  reason: string
} {
  if (
    !raw ||
    typeof raw.intent !== 'string' ||
    !VALID_CHAIN_INTENTS.has(raw.intent as Exclude<ChainIntent, 'auto'>)
  ) {
    return {
      ok: false,
      intent: null,
      confidence: 0,
      reason: 'invalid-intent-json',
    }
  }
  const confidence =
    typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? Math.min(Math.max(raw.confidence, 0), 1)
      : 0
  return {
    ok: true,
    intent: raw.intent as Exclude<ChainIntent, 'auto'>,
    confidence,
    reason:
      typeof raw.reason === 'string' && raw.reason.trim()
        ? raw.reason.trim().slice(0, 160)
        : `llm-fallback:${raw.intent}`,
  }
}

async function runLlmIntentFallback(
  normalizedInput: string,
  syncResult: ChainRoutingResult,
  context?: ChainRoutingContext,
): Promise<DetailedChainRoutingResult> {
  if (
    !LLM_INTENT_FALLBACK_CONFIG.enabled ||
    typeof context?.llmClassifier !== 'function' ||
    (syncResult.kind !== 'no_match' && syncResult.kind !== 'ambiguous')
  ) {
    return syncResult as DetailedChainRoutingResult
  }

  let raw: Awaited<ReturnType<LlmIntentClassifier>>
  try {
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      LLM_INTENT_FALLBACK_CONFIG.timeoutMs,
    )
    const classifier = context.llmClassifier
    raw = await classifier(normalizedInput, { signal: controller.signal })
    clearTimeout(timer)
  } catch (error) {
    return {
      ...syncResult,
      diagnostics: buildRoutingDiagnostics({
        decisionLayer: 'llm-fallback',
        failure: {
          stage: 'llm-fallback',
          message: error instanceof Error ? error.message : String(error),
        },
      }),
    }
  }

  const parsed = parseLlmIntentFallbackResult(raw)
  if (
    !parsed.ok ||
    !parsed.intent ||
    parsed.confidence < LLM_INTENT_FALLBACK_CONFIG.minConfidence
  ) {
    return {
      ...syncResult,
      diagnostics: buildRoutingDiagnostics({
        decisionLayer: 'llm-fallback',
        failure: {
          stage: 'llm-fallback',
          message: parsed.ok
            ? `low-confidence:${parsed.confidence}`
            : parsed.reason,
        },
      }),
    }
  }

  // The LLM fallback can only classify low-confidence input. It can never
  // bypass the synchronous write-safety gates that already rejected a write.
  return {
    kind: 'matched',
    intent: parsed.intent,
    confidence: parsed.confidence,
    reason: parsed.reason,
    diagnostics: buildRoutingDiagnostics({
      decisionLayer: 'llm-fallback',
    }),
  }
}

async function routeChainIntentWithEmbedding(
  userInput: string,
  context?: ChainRoutingContext,
): Promise<DetailedChainRoutingResult> {
  const normalizedInput = (userInput || '').trim()
  const syncResult = routeChainIntent(normalizedInput, context)

  const needsEmbedding =
    syncResult.kind === 'no_match' &&
    (syncResult.reason === 'low-confidence' ||
      syncResult.reason === 'no-keyword-overlap') &&
    normalizedInput.length > 0

  if (!needsEmbedding) {
    const decisionLayer = syncResult.decisionLayer || (
      syncResult.kind === 'matched' ? 'keyword' : 'rule'
    )
    return {
      ...syncResult,
      diagnostics: buildRoutingDiagnostics({ decisionLayer }),
    }
  }

  const embeddingApi = getEmbeddingApi()
  if (!embeddingApi) {
    return {
      ...syncResult,
      diagnostics: buildRoutingDiagnostics({
        decisionLayer: 'rule',
        embeddingModel: null,
        embeddingState: 'unavailable',
        failure: {
          stage: 'embedding',
          message: 'embedding api unavailable',
        },
      }),
    }
  }

  let embeddingModel: string | null = null
  try {
    const status = await embeddingApi.intentEmbeddingStatus?.()
    embeddingModel = status?.model || EMBEDDING_INTENT_MODEL_ID
    const intentCache = await getIntentVectorCache(embeddingApi, embeddingModel)
    if (intentCache.failure) {
      return {
        ...syncResult,
        diagnostics: buildRoutingDiagnostics({
          decisionLayer: 'rule',
          embeddingModel,
          embeddingState: 'unavailable',
          failure: {
            stage: 'embedding',
            message: intentCache.failure,
          },
        }),
      }
    }

    const inputResponse = await embedTexts(embeddingApi, [normalizedInput])
    const inputVector = inputResponse.vectors[0]
    if (!inputVector) {
      return {
        ...syncResult,
        diagnostics: buildRoutingDiagnostics({
          decisionLayer: 'rule',
          embeddingModel,
          embeddingState: 'unavailable',
          failure: {
            stage: 'embedding',
            message: inputResponse.error || 'embedding input vector missing',
          },
        }),
      }
    }

    const scores: Array<{ intent: Exclude<ChainIntent, 'auto'>; score: number }> = []
    const intentEntries = Object.entries(intentCache.vectors) as Array<
      [Exclude<ChainIntent, 'auto'>, number[][]]
    >
    for (const [intent, exampleVectors] of intentEntries) {
      const intentScore = exampleVectors.reduce((sum, vector) => {
        return sum + cosineSimilarityNumber(inputVector, vector)
      }, 0)
      scores.push({
        intent,
        score: exampleVectors.length ? intentScore / exampleVectors.length : 0,
      })
    }
    scores.sort((a, b) => b.score - a.score)
    const best = scores[0]
    const second = scores[1]
    const scoreMap = scores.reduce<Partial<Record<Exclude<ChainIntent, 'auto'>, number>>>(
      (acc, entry) => {
        acc[entry.intent] = entry.score
        return acc
      },
      {},
    )

    if (
      syncResult.kind === 'no_match' &&
      best.score < EMBEDDING_ROUTING_OOS_THRESHOLD
    ) {
      return {
        ...syncResult,
        confidence: best.score,
        reason: 'out-of-scope',
        diagnostics: buildRoutingDiagnostics({
          decisionLayer: 'embedding',
          scores: scoreMap,
          embeddingModel,
          embeddingState: 'ready',
        }),
      }
    }

    if (best.score < EMBEDDING_ROUTE_THRESHOLDS[best.intent]) {
      return {
        ...syncResult,
        diagnostics: buildRoutingDiagnostics({
          decisionLayer: 'embedding',
          scores: scoreMap,
          embeddingModel,
          embeddingState: 'ready',
        }),
      }
    }

    const ambiguityThreshold =
      EMBEDDING_ROUTING_AMBIGUITY_THRESHOLDS[best.intent]
    if (second && best.score - second.score < ambiguityThreshold) {
      return {
        kind: 'ambiguous',
        candidates: [best.intent, second.intent],
        confidence: best.score,
        reason: 'embedding-ambiguous-top2',
        fallbackMode: awaitUserIfWriteCandidate([best.intent, second.intent]),
        diagnostics: buildRoutingDiagnostics({
          decisionLayer: 'embedding',
          scores: scoreMap,
          embeddingModel,
          embeddingState: 'ready',
        }),
      }
    }

    // The embedding layer only upgrades semantic classification. It can never
    // promote a write request past the existing user-confirmation boundary.
    const safeIntent = best.intent
    return {
      kind: 'matched',
      intent: safeIntent,
      confidence: best.score,
      reason: `embedding-top1:${best.intent}`,
      diagnostics: buildRoutingDiagnostics({
        decisionLayer: 'embedding',
        scores: scoreMap,
        embeddingModel,
        embeddingState: 'ready',
      }),
    }
  } catch (error) {
    return {
      ...syncResult,
      diagnostics: buildRoutingDiagnostics({
        decisionLayer: 'rule',
        embeddingModel,
        embeddingState: 'unavailable',
        failure: {
          stage: 'embedding',
          message: error instanceof Error ? error.message : String(error),
        },
      }),
    }
  }
}

export async function routeChainIntentDetailed(
  userInput: string,
  context?: ChainRoutingContext,
): Promise<DetailedChainRoutingResult> {
  const embeddingResult = await routeChainIntentWithEmbedding(userInput, context)
  if (
    embeddingResult.kind !== 'no_match' &&
    embeddingResult.kind !== 'ambiguous'
  ) {
    return embeddingResult
  }
  return runLlmIntentFallback((userInput || '').trim(), embeddingResult, context)
}

export async function classifyPlainDialogueIntentDetailed(
  requestText: string,
  recentHistory: readonly ChainIntentHistoryMessage[] = [],
  options?: {
    workspace?: ChainRoutingContext['workspace']
    projectId?: string
    activeSkillIds?: string[]
    activeEditTaskStatus?: ChainRoutingContext['activeEditTaskStatus']
    llmClassifier?: LlmIntentClassifier
  },
): Promise<PlainDialogueIntentDetailed> {
  const result = await routeChainIntentDetailed(requestText, {
    workspace: options?.workspace,
    projectId: options?.projectId,
    activeSkillIds: options?.activeSkillIds,
    recentHistory,
    ...(options?.llmClassifier ? { llmClassifier: options.llmClassifier } : {}),
    ...(options?.activeEditTaskStatus
      ? { activeEditTaskStatus: options.activeEditTaskStatus }
      : {}),
  })
  const intent: PlainDialogueIntentDetailed['intent'] =
    result.kind === 'matched' ? result.intent : 'discuss'
  return {
    intent,
    diagnostics: result.diagnostics,
    routing: result,
  }
}

export type PlainDialogueIntentDetailed = {
  intent: Exclude<ChainIntent, 'auto'>
  diagnostics: ChainRoutingDiagnostics
  routing: DetailedChainRoutingResult
}

function cosineSimilarityNumber(a: number[], b: number[]): number {
  let dot = 0
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) dot += a[i] * b[i]
  return dot
}

export function filterTemplatesByIntent<
  T extends { id: string; name: string; intents?: string[] },
>(
  templates: T[],
  intent: ChainIntent,
): {
  filtered: T[]
  skipped: Array<{ index: number; template: T; reason: string }>
} {
  if (intent === 'auto') {
    return {
      filtered: [],
      skipped: templates.map((template, index) => ({
        index,
        template,
        reason: 'intent-no-match:auto',
      })),
    }
  }

  const filtered: T[] = []
  const skipped: Array<{ index: number; template: T; reason: string }> = []

  templates.forEach((template, index) => {
    const effectiveIntents =
      !template.intents || template.intents.length === 0
        ? inferIntentsFromContent(template.name)
        : template.intents
    if (effectiveIntents.includes(intent)) {
      filtered.push(template)
    } else {
      const source =
        !template.intents || template.intents.length === 0
          ? 'inferred'
          : 'declared'
      skipped.push({
        index,
        template,
        reason: `intent-mismatch(${source}): ${intent}`,
      })
    }
  })

  return { filtered, skipped }
}

function inferIntentsFromContent(name: string): string[] {
  if (!initialized || intentTfidfVectors.length === 0) {
    return inferIntentsFromName(name)
  }

  const vec = textToTfidfVector(name)
  if (vec.size === 0) return ['generate']

  const scores: Array<{ intent: ChainIntent; score: number }> = []
  for (const { intent, vec: intentVec } of intentTfidfVectors) {
    const score = cosineSimilarity(vec, intentVec)
    scores.push({ intent, score })
  }
  scores.sort((a, b) => b.score - a.score)

  const result: string[] = []
  for (const { intent, score } of scores) {
    if (score > 0.05) result.push(intent)
  }
  return result.length > 0 ? result : ['generate']
}

function inferIntentsFromName(name: string): string[] {
  const text = name || ''
  const inferred: string[] = []
  const has = (kw: string) => text.includes(kw)
  if (
    has('诊断') ||
    has('审核') ||
    has('检查') ||
    has('分析') ||
    has('审查') ||
    has('体检')
  )
    inferred.push('analyze')
  if (
    has('修改') ||
    has('编辑') ||
    has('改') ||
    has('修正') ||
    has('润色') ||
    has('修订') ||
    has('指令师')
  )
    inferred.push('edit')
  if (
    has('生成') ||
    has('写') ||
    has('创作') ||
    has('产出') ||
    has('创建') ||
    has('起草') ||
    has('撰写') ||
    has('主编') ||
    has('落地')
  )
    inferred.push('generate')
  if (
    has('讨论') ||
    has('构思') ||
    has('共创') ||
    has('聊天') ||
    has('对话') ||
    has('建议') ||
    has('顾问')
  )
    inferred.push('discuss')
  if (inferred.length === 0) inferred.push('generate')
  return inferred
}
