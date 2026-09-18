export type ChainIntent = 'analyze' | 'edit' | 'generate' | 'discuss' | 'auto'

export type ChainRoutingContext = {
  projectId?: string
  workspace?: 'outline-workbench' | 'home-editor' | 'pipeline'
  purpose?: string
  recentUserMessages?: string[]
  recentHistory?: readonly ChainIntentHistoryMessage[]
  recentAssistantSummaries?: string[]
  activeSkillIds?: string[]
}

export type ChainRoutingResult =
  | {
      kind: 'matched'
      intent: Exclude<ChainIntent, 'auto'>
      confidence: number
      reason: string
    }
  | {
      kind: 'no_match'
      confidence: number
      reason:
        | 'low-confidence'
        | 'no-keyword-overlap'
        | 'empty-input'
        | 'router-degraded'
      fallbackMode: RoutingFallbackMode
    }
  | {
      kind: 'ambiguous'
      candidates: Exclude<ChainIntent, 'auto'>[]
      confidence: number
      reason: string
      fallbackMode: RoutingFallbackMode
    }

export type RoutingFallbackMode = 'readonly-discuss' | 'await-user'

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
  analyze: 0.45,
  edit: 0.45,
  generate: 0.45,
  discuss: 0.45,
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
  const statusHits = findPhrases(input, STATUS_PERMISSION_CATEGORIES)
  const hasStatusQuestion = statusHits.length > 0 || isQuestionInput(input)
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
    return { reason: 'status-permission-question', hits: statusHits }
  }
  const prohibitionHits = findPhrases(input, PROHIBITION_CATEGORIES)
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
  const hasExplicitWrite =
    !hasLocationSignal &&
    !isQuestionInput(input) &&
    (strongWriteHits.length > 0 ||
      EXPLORATORY_WRITE_PATTERN.test(input) ||
      (weakWriteHits.length > 0 &&
        (writeTargetHits.length > 0 || hasImperativeWriteMarker)))
  if (hasLocationSignal) {
    return { reason: 'location-consult', hits: locationHits }
  }
  const referenceHits = findPhrases(input, REFERENCE_CATEGORIES)
  const contextualHits = findPhrases(input, CONTEXTUAL_CATEGORIES)
  if (
    referenceHits.length > 0 ||
    (contextualHits.length > 0 &&
      contextualHits.every(hit => hit.category === 'contextualReplies'))
  ) {
    return { reason: 'reference-request', hits: referenceHits }
  }
  if (hasExplicitWrite) {
    return {
      reason: 'explicit-write',
      hits: [...strongWriteHits, ...weakWriteHits, ...writeTargetHits],
    }
  }
  if (contextualHits.length > 0) {
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
    (hasImperativeWriteMarker && writeActionHits.length > 0) ||
    EXPLORATORY_WRITE_PATTERN.test(input)
  )
}

// --- 示例语句库（每意图30条）---
const INTENT_EXAMPLES: Record<Exclude<ChainIntent, 'auto'>, string[]> = {
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
  const keywordHits = INTENT_KEYWORD_CATEGORIES.map(
    ({ intent, category }) => ({
      intent,
      score: findPhrases(text, [category]).reduce(
        (sum, hit) => sum + hit.phrase.length,
        0,
      ),
    }),
  )
  const strongWriteHits = findPhrases(text, [
    'strongWriteActions',
    'writeIntensifiers',
  ])
  const weakWriteHits = findPhrases(text, ['weakWriteActions'])
  const writeTargetHits = findPhrases(text, ['writeTargets'])
  const hasStrongWriteAction = strongWriteHits.length > 0
  const editHitLength =
    strongWriteHits.reduce((sum, hit) => sum + hit.phrase.length, 0) +
    (hasStrongWriteAction ||
    writeTargetHits.length > 0 ||
    /把|将/.test(text)
      ? weakWriteHits.reduce((sum, hit) => sum + hit.phrase.length, 0)
      : 0)
  if (editHitLength > 0) {
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
  if (intent !== 'analyze' && intent !== 'discuss') return false
  return /[?？]$/.test(text)
}

function hasWriteDirectiveSignal(text: string): boolean {
  const strongHits = findPhrases(text, STRONG_WRITE_CATEGORIES)
  const weakHits = findPhrases(text, WEAK_WRITE_CATEGORIES)
  const targetHits = findPhrases(text, WRITE_TARGET_CATEGORIES)
  const contextualHits = findPhrases(text, CONTEXTUAL_CATEGORIES)
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
  const normalizedInput = (userInput || '').trim()
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
    isLikelyContextualReply(normalizedInput) &&
    findAwaitingUserMessage(context?.recentHistory)
  ) {
    return {
      kind: 'matched',
      intent: 'discuss',
      confidence: 0.8,
      reason: 'await-user-contextual-reply',
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
      }
    }
    return {
      kind: 'matched',
      intent: 'discuss',
      confidence: 0.9,
      reason: permissionIntent.reason,
    }
  }

  const keywordScores = scoreIntentsByKeywords(normalizedInput)
  const top = keywordScores[0]
  const second = keywordScores[1]
  const keywordConfidence = top
    ? top.score / keywordScores.reduce((sum, entry) => sum + entry.score, 0)
    : 0
  if (!top || keywordConfidence < ROUTE_THRESHOLDS[top.intent]) {
    return {
      kind: 'no_match',
      confidence: keywordConfidence,
      reason: top ? 'low-confidence' : 'no-keyword-overlap',
      fallbackMode:
        top && hasWriteDirectiveSignal(normalizedInput)
          ? 'await-user'
          : 'readonly-discuss',
    }
  }
  if (second && top.score - second.score < CHAIN_ROUTING_AMBIGUITY_THRESHOLD) {
    return {
      kind: 'ambiguous',
      candidates: [top.intent, second.intent],
      confidence: keywordConfidence,
      reason: 'ambiguous-top2',
      fallbackMode: awaitUserIfWriteCandidate([top.intent, second.intent]),
    }
  }

  if (isQuestionOnlyIntent(normalizedInput, top.intent)) {
    return {
      kind: 'matched',
      intent: 'discuss',
      confidence: keywordConfidence,
      reason: `question-only:${top.intent}`,
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
    }
  }

  return {
    kind: 'matched',
    intent: top.intent,
    confidence: keywordConfidence,
    reason: 'keyword-top1',
  }
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
