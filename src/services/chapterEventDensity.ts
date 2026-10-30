export const CHAPTER_EVENT_DENSITY_NOT_READY_CODE = 'chapter-event-density-not-ready'

const NOT_READY_PATTERN = /(?:^|\n)\s*\[?NOT-READY\]?\s*[：:]?\s*(.+)/i
const DENSITY_GAP_PATTERN = /章级事件密度不足/

export interface ChapterEventIncrementAdvisory {
  code: 'chapter-event-increment-advisory'
  severity: 'warning'
  detected: boolean
  exempted: boolean
  exemptReason: string | null
  benefitCategories: string[]
  distinctBenefitCategoryCount: number
  message: string
}

export interface ChapterEventDensityResult {
  detected: boolean
  reason: 'upstream_material_gap'
  code: typeof CHAPTER_EVENT_DENSITY_NOT_READY_CODE
  gap: string | null
  guidance: string
  rawOutput: string
}

const BENEFIT_CATEGORIES: Array<{ category: string; aliases: string[] }> = [
  { category: '新信息', aliases: ['新信息'] },
  { category: '处境改变', aliases: ['处境改变', '处境变化'] },
  { category: '关系位移', aliases: ['关系位移', '关系变化'] },
  { category: '威胁升级', aliases: ['威胁升级', '威胁加深'] },
  { category: '资产得失', aliases: ['资产得失', '资产变化'] },
  { category: '地位变化', aliases: ['地位变化', '地位升降'] },
  { category: '情绪兑现', aliases: ['情绪兑现', '情绪收获'] }
]

const EXEMPTION_LABELS: Array<{ label: string; reason: string }> = [
  { label: '静章', reason: '静章按情绪兑现豁免密度闸' },
  { label: '抒情章', reason: '抒情章按豁免标记处理' },
  { label: '关系观察章', reason: '关系观察章按豁免标记处理' }
]

export function detectChapterEventDensityNotReady(text: string): ChapterEventDensityResult {
  const rawOutput = String(text || '')
  const match = NOT_READY_PATTERN.exec(rawOutput)
  const gap = match?.[1]?.trim() || null
  const detected = Boolean(match && DENSITY_GAP_PATTERN.test(match[1]))
  return {
    detected,
    reason: 'upstream_material_gap',
    code: CHAPTER_EVENT_DENSITY_NOT_READY_CODE,
    gap: detected ? (gap || '章级事件密度不足，需上游补剧情点') : null,
    guidance: detected
      ? '上游剧情材料不足：请回到章节规划/剧情层补足事件点，正文层不重试。'
      : '',
    rawOutput
  }
}

export function findChapterEventIncrementValue(text: string): string | null {
  const raw = String(text || '')
  const patterns = [
    /(?:^|\n)\s*事件增量\s*[：:]\s*(.+)/,
    /(?:^|\n)\s*【事件增量】\s*[：:]?\s*(.+)/
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(raw)
    if (match?.[1]) {
      const value = match[1].split(/\r?\n/)[0].trim()
      if (value) return value
    }
  }
  return null
}

function findExemption(text: string): { label: string; reason: string } | null {
  const raw = String(text || '')
  return EXEMPTION_LABELS.find(entry => raw.includes(entry.label)) || null
}

export function evaluateChapterEventIncrement(
  text: string
): ChapterEventIncrementAdvisory {
  const raw = String(text || '')
  const incrementValue = findChapterEventIncrementValue(raw)
  const exemption = findExemption(raw)
  const categories = new Set<string>()
  if (incrementValue) {
    for (const entry of BENEFIT_CATEGORIES) {
      if (entry.aliases.some(alias => incrementValue.includes(alias))) {
        categories.add(entry.category)
      }
    }
  }
  if (exemption && categories.size === 0) categories.add('情绪兑现')

  const detected = !incrementValue || (!exemption && categories.size < 2)
  let message: string
  if (!incrementValue) {
    message = '【正文交接】缺少必填字段「事件增量」，属于结构失败；请按 SKILL 交接契约补全。'
  } else if (!exemption && categories.size < 2) {
    message = `事件增量收益同质（${Array.from(categories).join('、') || '未识别'}）：非豁免推进章至少需要两类不可归一收益。`
  } else {
    message = `事件增量验收通过：${Array.from(categories).join('、')}。`
  }

  return {
    code: 'chapter-event-increment-advisory',
    severity: 'warning',
    detected,
    exempted: Boolean(exemption),
    exemptReason: exemption?.reason || null,
    benefitCategories: Array.from(categories),
    distinctBenefitCategoryCount: categories.size,
    message
  }
}
