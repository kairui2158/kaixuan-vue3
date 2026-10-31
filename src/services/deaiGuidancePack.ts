import { BODY_LAYER_STEP } from './skillDeaiContractValidation'

export type DeaiGuidanceRole =
  | 'methodology'
  | 'methodology-compose'
  | 'creative'
  | 'polish'

export interface DeaiGuidanceItem {
  readonly id: string
  readonly role: DeaiGuidanceRole
  readonly title: string
  readonly text: string
}

export interface DeaiVoiceProfileLike {
  readonly text: string
  readonly injectedChars: number
}

export interface DeaiGuidancePack {
  readonly role: DeaiGuidanceRole
  readonly items: readonly DeaiGuidanceItem[]
  readonly text: string
  readonly guidanceChars: number
  readonly voiceProfileChars: number
  readonly totalInjectionChars: number
  readonly truncated: boolean
  readonly droppedItemIds: readonly string[]
  readonly constructionMs: number
  readonly slowConstruction: boolean
  readonly hash: string
}

export interface BuildDeaiGuidancePackInput {
  readonly role: DeaiGuidanceRole
  readonly voiceProfile: DeaiVoiceProfileLike | null
  readonly charBudget?: number
  readonly now?: () => number
}

export interface DeaiGuidancePackTraceEventContext {
  readonly step: number
  readonly skillIndex?: number
  readonly totalSkillCount?: number
}

export const DEAI_GUIDANCE_MAX_ITEMS = 6
export const DEAI_GUIDANCE_CHAR_BUDGET = 1200
export const DEAI_VOICE_PROFILE_CHAR_BUDGET = 700
export const DEAI_GUIDANCE_TOTAL_CHAR_BUDGET =
  DEAI_GUIDANCE_CHAR_BUDGET + DEAI_VOICE_PROFILE_CHAR_BUDGET
export const DEAI_GUIDANCE_CONSTRUCTION_WARNING_MS = 5
export const DEAI_GUIDANCE_SCHEMA_VERSION = 1

interface MethodItem {
  readonly id: string
  readonly title: string
  readonly text: string
  readonly roles: readonly DeaiGuidanceRole[]
}

const METHODS: readonly MethodItem[] = [
  {
    id: 'event-density',
    title: '事件密度',
    text: '每场至少一个可核验的状态改变；确认、求证、判断不算推进。写前先说出进入状态和退出状态。',
    roles: ['methodology', 'methodology-compose'],
  },
  {
    id: 'causal-chain',
    title: '因果骨架',
    text: '先定行动、阻碍、代价、结果，再决定描写。因果不清楚时不补设定，按 SKILL 契约上报缺口。',
    roles: ['methodology', 'methodology-compose'],
  },
  {
    id: 'scene-purpose',
    title: '场景作用',
    text: '场景按戏剧价值分配轻重，结尾允许留张力；不同场景的进入信息、退出信息和感官通道不重复。',
    roles: ['methodology', 'methodology-compose'],
  },
  {
    id: 'method-boundary',
    title: '方法边界',
    text: '短句只用于关键转折，连续碎片不是风格。判断标准是读起来更像活人叙事，不是命中更少检测词。',
    roles: ['methodology', 'methodology-compose', 'creative', 'polish'],
  },
  {
    id: 'event-rendering',
    title: '事件表达',
    text: '情绪、判断和关系写成可见行为。优先用动作变化、选择性和信息顺序呈现，不用评论腔解释。',
    roles: ['creative', 'methodology-compose'],
  },
  {
    id: 'narrative-perspective',
    title: '叙事用笔',
    text: '视角带判断：看什么不看什么、语气倾向和节奏轻重。同一段视角一致，紧张场景收短，舒缓场景铺长。',
    roles: ['creative', 'methodology-compose'],
  },
  {
    id: 'dialogue-weight',
    title: '对白轻重',
    text: '对白留残缺和轻重，有些回合只有动作，有些只有台词。不替读者总结因果，不写解释性从句。',
    roles: ['creative', 'methodology-compose'],
  },
  {
    id: 'minimal-repair',
    title: '最小修复',
    text: '只改表达硬处、重复处和报告腔；保留事实、场景顺序、对白含义和事实账本。不扩写、不压缩、不补设定。',
    roles: ['polish'],
  },
  {
    id: 'semantic-fidelity',
    title: '语义保真',
    text: '修改前后用事实链、人物状态、位置和因果对齐。发现叙事缺口不擅自改，按契约路由回上游。',
    roles: ['polish'],
  },
  {
    id: 'lossless-merge',
    title: '无损合并',
    text: '相邻短句合并且信息无损，或句号改逗号/分号，是合法打磨。不以降检测为目标增加新比喻或碎句。',
    roles: ['polish'],
  },
  {
    id: 'style-precedence',
    title: '风格优先',
    text: '风格卡片与声纹优先于本指导；有冲突时按风格执行。方法只补默认路径，不覆盖作者选择。',
    roles: ['methodology', 'methodology-compose', 'creative', 'polish'],
  },
]

const PACK_TITLES: Record<DeaiGuidanceRole, string> = {
  methodology: '骨架与因果',
  'methodology-compose': '复合步骤方法',
  creative: '创作执行',
  polish: '语言收敛',
}

function renderItems(items: readonly DeaiGuidanceItem[]): string {
  return items.map(item => `${item.title}：${item.text}`).join('\n')
}

function renderPack(
  role: DeaiGuidanceRole,
  guidanceItems: readonly DeaiGuidanceItem[],
  budget: number,
): { text: string; droppedItemIds: readonly string[]; truncated: boolean } {
  const title = `【降AI方法指导 - ${PACK_TITLES[role]}】`
  const header = [
    '执行角色：生成前方法指导；不修改请求产物，不做裁判，不输出总分。',
    '风格卡片是唯一风格 owner；本指导只是默认方法，不覆盖风格选择。',
    '叙事缺口按 SKILL 契约上报，不擅自补设因果。',
  ].join('\n')
  const fixedPrefix = `${title}\n${header}\n`

  const kept: DeaiGuidanceItem[] = []
  const dropped: string[] = []
  for (const item of guidanceItems) {
    const line = `${item.title}：${item.text}`
    const candidate = kept.length === 0
      ? `${fixedPrefix}${line}`
      : `${fixedPrefix}${renderItems(kept)}\n${line}`
    if (candidate.length <= budget) kept.push(item)
    else dropped.push(item.id)
  }

  const rendered = renderItems(kept)
  let text = rendered ? `${fixedPrefix}${rendered}` : fixedPrefix
  const truncated = dropped.length > 0
  if (text.length > budget) {
    text = text.slice(0, budget)
  }
  return { text, droppedItemIds: dropped, truncated }
}

function hashText(text: string, seed: string): string {
  let hash = 0x811c9dc5
  const input = `${seed}\u0000${text}`
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function buildDeaiGuidancePack(
  input: BuildDeaiGuidancePackInput,
): DeaiGuidancePack {
  const role = input.role
  const voiceProfile = input.voiceProfile && input.voiceProfile.text.trim()
    ? input.voiceProfile
    : null
  const budget = Math.max(
    0,
    Math.min(
      input.charBudget ?? DEAI_GUIDANCE_CHAR_BUDGET,
      DEAI_GUIDANCE_TOTAL_CHAR_BUDGET,
    ),
  )
  const startedAt = input.now?.() ?? performance.now()

  const candidates = METHODS
    .filter(method => method.roles.includes(role))
    .map(method => ({
      id: method.id,
      role,
      title: method.title,
      text: method.text,
    }))
  const guidanceItems = candidates.slice(0, DEAI_GUIDANCE_MAX_ITEMS)
  const { text, droppedItemIds, truncated } = renderPack(role, guidanceItems, budget)

  const finishedAt = input.now?.() ?? performance.now()
  const constructionMs = Math.max(0, finishedAt - startedAt)
  const voiceProfileChars = voiceProfile
    ? Math.min(voiceProfile.injectedChars, DEAI_VOICE_PROFILE_CHAR_BUDGET)
    : 0

  return Object.freeze({
    role,
    items: Object.freeze(guidanceItems.map(item => Object.freeze(item))),
    text,
    guidanceChars: text.length,
    voiceProfileChars,
    totalInjectionChars: text.length + voiceProfileChars,
    truncated,
    droppedItemIds: Object.freeze([...droppedItemIds]),
    constructionMs,
    slowConstruction: constructionMs >= DEAI_GUIDANCE_CONSTRUCTION_WARNING_MS,
    hash: hashText(text, role),
  })
}

export function buildDeaiGuidancePackTraceEvent(
  pack: DeaiGuidancePack,
  context: DeaiGuidancePackTraceEventContext,
): {
  type: string
  level: 'info' | 'warn'
  label: string
  detail: string
} {
  const itemCount = pack.items.length - pack.droppedItemIds.length
  return {
    type: 'deai-guidance-pack',
    level: pack.slowConstruction ? 'warn' : 'info',
    label: pack.slowConstruction
      ? `降AI方法指导包构造超过预算：${pack.constructionMs}ms`
      : `降AI方法指导包已构造：${itemCount}条 / ${pack.guidanceChars}字符`,
    detail: JSON.stringify({
      schemaVersion: DEAI_GUIDANCE_SCHEMA_VERSION,
      step: context.step,
      bodyLayerStep: BODY_LAYER_STEP,
      skillIndex: context.skillIndex,
      totalSkillCount: context.totalSkillCount,
      role: pack.role,
      itemCount,
      droppedItemIds: pack.droppedItemIds,
      guidanceChars: pack.guidanceChars,
      voiceProfileChars: pack.voiceProfileChars,
      totalInjectionChars: pack.totalInjectionChars,
      truncated: pack.truncated,
      constructionMs: pack.constructionMs,
      slowConstruction: pack.slowConstruction,
      hash: pack.hash,
    }),
  }
}
