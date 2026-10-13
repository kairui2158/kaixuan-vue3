export type ProseHardSignalType =
  | 'truncated'
  | 'refusal'
  | 'meta_language'
  | 'near_duplicate_line'

export const HARD_SIGNAL_SCAN_PASSED = 'pass'
export const HARD_SIGNAL_SCAN_BLOCKED = 'blocked'

export interface ProseHardSignalFinding {
  type: ProseHardSignalType
  message: string
  start: number
  end: number
  excerpt: string
  /** provider findings come from wire metadata, not prose text, and cannot be repaired locally. */
  origin?: 'text' | 'provider'
}

export interface ProseHardSignalScanInput {
  /** Normalized provider finish reason; "length" means the provider itself reported truncation. */
  finishReason?: string | null
}

export interface ProseHardSignalScan {
  detected: boolean
  status: typeof HARD_SIGNAL_SCAN_PASSED | typeof HARD_SIGNAL_SCAN_BLOCKED
  findings: ProseHardSignalFinding[]
  counts: Record<ProseHardSignalType, number>
}

const REFUSAL_PATTERNS: RegExp[] = [
  /(?:很抱歉|抱歉)[^。\n]{0,30}(?:无法|不能)[^。\n]{0,40}/u,
  /我(?:无法|不能)[^。\n]{0,30}(?:完成|继续|创作|生成|提供)[^。\n]{0,30}/u,
  /(?:作为|我是)(?:一个)?(?:AI|人工智能|语言模型)[^。\n]{0,50}/iu,
  /(?:无法|不能)(?:遵守|遵循|执行)(?:本)?(?:指令|要求|规则)[^。\n]{0,30}/u
]

const META_LANGUAGE_PATTERNS: RegExp[] = [
  /(?:本(?:章|节|段|篇))(?:[^。\n]{0,20})(?:按照|根据|遵循)[^。\n]{0,30}(?:要求|指令|设定|规范|提示词)/u,
  /(?:输出|生成|字数|篇幅)(?:已|被)?(?:控制|限制|保持)(?:在|为)[^。\n]{0,30}/u,
  /(?:token|tokens|上下文窗口|提示词模板|系统提示词|生成协议)/iu,
  /(?:请|按)(?:求续写|继续生成|补充剩余)(?:内容|正文|章节)/u,
  /(?:内容|正文)(?:已)?(?:截断|未完成|待继续)/u,
  /(?:以下|上面)(?:是|为)(?:重写|续写|修改)(?:后)?(?:版本|结果)/u
]

const TRUNCATION_PATTERNS: RegExp[] = [
  /\[(?:内容|正文|输出)?(?:截断|未完成|待继续)[^\]]{0,40}\]?/u,
  /(?:输出|正文|内容)(?:已)?(?:在此|在此处)?(?:中断|截断|未完成)/u,
  /(?:继续生成|请继续|待续)[。！？\s]*$/u
]

const NEAR_DUPLICATE_MIN_CHARS = 7
const NEAR_DUPLICATE_MAX_REPORTS = 20

const EMPTY_COUNTS: Record<ProseHardSignalType, number> = {
  truncated: 0,
  refusal: 0,
  meta_language: 0,
  near_duplicate_line: 0
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, '').toLowerCase()
}

function excerpt(text: string, start: number, end: number): string {
  return text.slice(start, Math.min(text.length, end))
}

function pushRegexFinding(
  text: string,
  patterns: RegExp[],
  type: ProseHardSignalType,
  message: string,
  findings: ProseHardSignalFinding[]
): void {
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (!match) continue

    const start = match.index
    const end = start + match[0].length
    const overlapsExistingFinding = findings.some(
      item => item.type === type && start < item.end && end > item.start
    )
    if (!overlapsExistingFinding) {
      findings.push({
        type,
        message,
        start,
        end,
        excerpt: excerpt(text, start, end)
      })
    }
    if (findings.length >= 200) return
  }
}

function isInsideDialogue(text: string, start: number): boolean {
  const slice = text.slice(0, start)
  const openingQuotes = slice.match(/[“「『"]/g)?.length || 0
  const closingQuotes = slice.match(/[”」』"]/g)?.length || 0
  return openingQuotes > closingQuotes
}

function detectNearDuplicateLines(text: string, findings: ProseHardSignalFinding[]): void {
  const lines = text.split(/\r?\n/)
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }

  let reports = 0
  for (let index = 1; index < lines.length && reports < NEAR_DUPLICATE_MAX_REPORTS; index += 1) {
    const current = normalizeLine(lines[index])
    const previous = normalizeLine(lines[index - 1])
    if (current.length < NEAR_DUPLICATE_MIN_CHARS || previous !== current) continue
    if (isInsideDialogue(text, offsets[index])) continue

    findings.push({
      type: 'near_duplicate_line',
      message: '相邻两行完全重复，疑似模型复读',
      start: offsets[index],
      end: offsets[index] + lines[index].length,
      excerpt: lines[index]
    })
    reports += 1
  }
}

export function scanProseHardSignals(
  text: string,
  input: ProseHardSignalScanInput = {}
): ProseHardSignalScan {
  const source = String(text || '')
  const findings: ProseHardSignalFinding[] = []

  const finishReason = String(input.finishReason || '').trim().toLowerCase()
  if (finishReason === 'length' || finishReason === 'max_tokens') {
    findings.push({
      type: 'truncated',
      message: '供应商返回 length/max_tokens，正文可能在物理层被截断',
      start: 0,
      end: 0,
      excerpt: '',
      origin: 'provider'
    })
  }

  const refusalFindings: ProseHardSignalFinding[] = []
  pushRegexFinding(source, REFUSAL_PATTERNS, 'refusal', '检测到模型拒绝/身份说明语言', refusalFindings)
  findings.push(...refusalFindings.filter(item => !isInsideDialogue(source, item.start)))

  pushRegexFinding(source, META_LANGUAGE_PATTERNS, 'meta_language', '检测到工程/协议语言进入正文', findings)
  pushRegexFinding(source, TRUNCATION_PATTERNS, 'truncated', '检测到截断或未完成标记', findings)
  detectNearDuplicateLines(source, findings)

  findings.sort((left, right) => left.start - right.start || left.end - right.end)
  const counts = { ...EMPTY_COUNTS }
  for (const finding of findings) counts[finding.type] += 1

  return {
    detected: findings.length > 0,
    status: findings.length > 0 ? HARD_SIGNAL_SCAN_BLOCKED : HARD_SIGNAL_SCAN_PASSED,
    findings,
    counts
  }
}
