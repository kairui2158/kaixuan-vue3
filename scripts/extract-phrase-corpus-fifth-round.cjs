const fs = require('fs')
const path = require('path')

const corpusFile = path.join(__dirname, '..', '_audit', 'phrase-corpus-saturated.json')
const crosswozFile = path.join(
  __dirname,
  '..',
  '_audit',
  'research-cache',
  'crosswoz',
  'extracted',
  'train.json',
)
const zhihuFile = path.join(
  __dirname,
  '..',
  '_audit',
  'research-cache',
  'coig-cqia',
  'zhihu',
  'zhihu_score9.0-10_clean_v10.jsonl',
)
const outputFile = path.join(
  __dirname,
  '..',
  '_audit',
  'research-cache',
  'phrase-corpus-fifth-round-summary.json',
)

const MARKERS = [
  '帮我', '帮我看看', '帮我确认', '帮我对比', '帮我选', '麻烦你', '麻烦再', '麻烦给我',
  '能不能', '可不可以', '可否', '有没有', '是不是', '要不要', '需不需要', '用不用',
  '我希望', '我想要', '我需要', '我要', '我想', '我希望', '我倾向', '我更喜欢',
  '哪里', '哪儿', '哪个', '哪种', '哪一', '什么位置', '第几',
  '先不', '先别', '暂时不', '不用了', '不要动', '保持', '回到', '恢复', '撤回',
  '告诉我', '解释一下', '说明一下', '给我一个', '给我几个', '给我一份',
  '直接写', '直接改', '直接应用', '写进去', '改完', '保存', '落盘',
]

function extractSkeletons(lines, sourceName) {
  const result = new Map()
  for (const line of lines) {
    for (const marker of MARKERS) {
      const at = line.indexOf(marker)
      if (at < 0) continue
      const before = line.slice(Math.max(0, at - 10), at)
      const after = line.slice(at + marker.length, at + marker.length + 14)
      const entry = result.get(marker) || { source: sourceName, patterns: new Map(), examples: [] }
      const normalizedAfter = after.replace(/[。！？!?\s]+$/u, '')
      if (normalizedAfter) {
        entry.patterns.set(normalizedAfter, (entry.patterns.get(normalizedAfter) || 0) + 1)
      }
      if (entry.examples.length < 20) entry.examples.push(line.slice(0, 120))
      result.set(marker, entry)
    }
  }
  for (const entry of result.values()) {
    entry.patterns = [...entry.patterns.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([pattern, count]) => ({ pattern, count }))
  }
  return Object.fromEntries(result)
}

function loadZhihuInstructions() {
  const lines = []
  const content = fs.readFileSync(zhihuFile, 'utf8')
  let count = 0
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    try {
      const item = JSON.parse(line)
      if (typeof item.instruction === 'string' && item.instruction.trim()) {
        lines.push(item.instruction.trim())
        count += 1
      }
    } catch {
      // Ignore malformed lines.
    }
  }
  return { lines, count }
}

function loadCrosswozUserTurns() {
  const raw = JSON.parse(fs.readFileSync(crosswozFile, 'utf8'))
  const lines = []
  for (const dialogue of Object.values(raw)) {
    for (const message of dialogue.messages || []) {
      if (message.role !== 'usr') continue
      const text = typeof message.content === 'string' ? message.content.trim() : ''
      if (text) lines.push(text)
    }
  }
  return { lines, dialogues: Object.keys(raw).length }
}

const crosswoz = loadCrosswozUserTurns()
const zhihu = loadZhihuInstructions()
const saturatedCorpus = JSON.parse(fs.readFileSync(corpusFile, 'utf8'))
const corpusTotals = saturatedCorpus.categories
  ? Object.values(saturatedCorpus.categories).reduce(
      (totals, category) => {
        totals.phrases += category.groups.reduce((sum, group) => sum + group.phrases.length, 0)
        totals.groups += category.groups.length
        return totals
      },
      { phrases: 0, groups: 0 },
    )
  : { phrases: 0, groups: 0 }
const sampleCount = (saturatedCorpus.sampleGroups || []).reduce(
  (sum, group) => sum + (group.samples || []).length,
  0,
)

const output = {
  version: '2026-09-17-fifth-round',
  sourceStats: {
    crosswoz: {
      file: 'research-cache/crosswoz/extracted/train.json',
      dialogues: crosswoz.dialogues,
      userTurns: crosswoz.lines.length,
    },
    coigCqiaZhihu: {
      file: 'research-cache/coig-cqia/zhihu/zhihu_score9.0-10_clean_v10.jsonl',
      instructions: zhihu.count,
    },
  },
  markerSummaries: {
    crosswoz: extractSkeletons(crosswoz.lines, 'CrossWOZ train.json'),
    zhihu: extractSkeletons(zhihu.lines, 'COIG-CQIA zhihu instructions'),
  },
  corpusSnapshot: {
    version: saturatedCorpus.version,
    totals: {
      phrases: corpusTotals.phrases,
      groups: corpusTotals.groups,
      samples: sampleCount,
    },
  },
}

fs.writeFileSync(outputFile, JSON.stringify(output, null, 2))
console.log(
  JSON.stringify(
    {
      outputFile,
      crosswozUserTurns: crosswoz.lines.length,
      zhihuInstructions: zhihu.count,
      markers: MARKERS.length,
    },
    null,
    2,
  ),
)
