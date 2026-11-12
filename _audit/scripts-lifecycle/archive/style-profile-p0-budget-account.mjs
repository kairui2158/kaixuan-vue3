import fs from 'node:fs'
import path from 'node:path'

import { buildVolumePrompt } from '../src/services/volumeGeneration.ts'
import { buildChapterExecutionPrompt, createChapterExecutionPackage } from '../src/services/chapterExecutionPackage.ts'
import { compileStyleContext } from '../src/services/styleContextCompiler.ts'

const samplePath = 'D:/codex/拆文库/踏星/.novel/benchmarks/踏星/文风.md'
const outputPath = '_audit/STYLE_PROFILE_P0_BUDGET_ACCOUNT.json'

const taxingProfile = {
  profileVersion: 2,
  locked: true,
  injected: true,
  styleTags: '末世高武, 星际升级, 宇宙争霸',
  pacingParams: '速度:快节奏, 紧张度:4, 密度:密集, 视角:第三人称限知, 基调:暗黑',
  positioning: {
    coreTemperament: ['冷硬', '务实', '快节奏', '危机感强', '信息差明显'],
    genreTags: ['末世高武', '星际升级', '宇宙争霸'],
    oneLinePositioning: '用干净的动作和不断重估的身份，把读者推进更大的世界。',
  },
  quantitative: {
    sampleSource: '5597章',
    dialogueDensityPerKChars: 10.61,
    sentenceMix: { short: 31.0, medium: 31.7, long: 37.3 },
    punctuation: { comma: 1250796, period: 454844, exclamation: 1112, question: 98001, ellipsis: 4120, dash: 8885 },
  },
  voice: {
    protagonistSpeech: '短句、直接、少修饰；常用极短回答。',
    dialogueTags: '多用道、问、喊、叹道，情绪标签少而准。',
    subtextDensity: '中高；试探提问获取信息，模糊回答保护身份。',
  },
  descriptionFocus: {
    senses: '视觉和听觉为主，末世期有血腥、气味、咀嚼声等生理刺激。',
    sketch: '动作白描为主，环境渲染服务危机和尺度。',
    psychology: '常用目光一凛、眯起眼、握紧铁棍等动作替代情绪标签。',
  },
  sceneTemplates: [
    { id: 'scene-1', text: '末世危机：先给生存压力，再给主角处理方式，最后用旁人反应确认主角特殊性。', enabled: true },
    { id: 'scene-2', text: '战斗：动作链短，结果明确；战斗后留下资源、尸体、线索或旁观者震惊。', enabled: true },
    { id: 'scene-3', text: '身份揭示：不一次性说破，通过旁人提问、主角回避、行为异常逐层推进。', enabled: true },
    { id: 'scene-4', text: '世界观说明：用事件后果、旁人讨论、主角判断承载设定，少用百科式旁白。', enabled: true },
  ],
  sentencePatterns: [
    { id: 'pattern-1', text: '{环境破坏细节}。{人群反应}。', enabled: true },
    { id: 'pattern-2', text: '{主角观察}。{动作}。{直接结果}。', enabled: true },
    { id: 'pattern-3', text: '“{短命令}。” {对方迟疑或震惊}。', enabled: true },
    { id: 'pattern-4', text: '这不是{普通现象}，而是{更高层规则}。', enabled: true },
    { id: 'pattern-5', text: '{强者出手}。所有人意识到，{旧标准失效}。', enabled: true },
    { id: 'pattern-6', text: '他看着{目标}，没有说话。', enabled: true },
    { id: 'pattern-7', text: '{配角问关键问题}。主角没有回答。', enabled: true },
    { id: 'pattern-8', text: '{胜利后的短暂平静}。但{新问题}还没有结束。', enabled: true },
  ],
  positiveRules: [
    { id: 'positive-1', text: '动作推进快，极少情绪空喊。', enabled: true },
    { id: 'positive-2', text: '身份信息差持续供能。', enabled: true },
    { id: 'positive-3', text: '世界观通过事件打开。', enabled: true },
    { id: 'positive-4', text: '强者出场靠旁人反应和实际破坏力定价。', enabled: true },
  ],
  prohibitions: [
    { id: 'warn-1', text: '设定解释段不要过长。', enabled: true },
    { id: 'warn-2', text: '后期不要只靠地图变大续命。', enabled: true },
    { id: 'warn-3', text: '命名角色数量要控制，核心配角必须可辨认。', enabled: true },
    { id: 'warn-4', text: '战力数值不要无限膨胀，后期应转向规则与代价。', enabled: true },
  ],
  dailyRules: [
    { id: 'daily-1', text: '每章至少推进一项：信息、关系、实力、危机。', enabled: true },
    { id: 'daily-2', text: '主角台词保持短而硬，不写长篇自我解释。', enabled: true },
    { id: 'daily-3', text: '情绪用动作和旁人反应外化。', enabled: true },
    { id: 'daily-4', text: '世界观说明不超过三段，必须挂在冲突或行动上。', enabled: true },
    { id: 'daily-5', text: '章尾留未解问题或新规则出现，不靠感叹号制造高潮。', enabled: true },
  ],
}

const outlineSizes = ['short', 'medium', 'long']
const outlineText = (size) => {
  const lines = [
    '第一卷 星潮觉醒',
    '- 主角在末世护送队伍中暴露异常能力。',
    '- 旁人怀疑与试探升级，主角以模糊回答保护身份。',
  ]
  const target = size === 'short' ? 1200 : size === 'medium' ? 12000 : 90000
  while (lines.join('\n').length < target) {
    lines.push(`- 冲突推进：${lines.length}。地点转移后，队伍遭遇更强敌人，资源与新规则同时出现。`)
  }
  return lines.join('\n').slice(0, target)
}

function outlineSystemPrompt(styleText) {
  const toolSurface = '用户可通过大纲工作台进行讨论、局部修改和结构重排。'
  return '你是小说大纲创作助手。用户正在编辑大纲，请给出建议和修改意见。'
    + (styleText ? '\n\n[创作风格约束（应用级，优先级高于普通建议）]\n' + styleText + '\n要求：所有大纲创作、扩写、修改建议必须符合上述风格。' : '')
    + '\n\n' + toolSurface
}

function settingsPrompt(styleText) {
  return '[已确认大纲]\n' + outlineText('medium')
    + (styleText ? '\n\n[创作风格]\n' + styleText : '')
    + '\n\n请基于这份已确认的大纲，提取并生成设定项。输出JSON数组，每项含name/category/attrsText字段。'
}

function chapterBatchPrompt(styleText) {
  return '[全书大纲]\n' + outlineText('medium')
    + '\n\n[设定]\n人物 - {"身份":"觉醒者","立场":"队友"}'
    + (styleText ? '\n\n[风格与节奏]\n' + styleText : '')
    + '\n\n[卷纲]\n第一卷 星潮觉醒 - 主角暴露异常能力，队伍遭遇危机。'
    + '\n\n[本卷总章数]\n20\n\n[单章字数]\n3500'
}

function volumePrompt(styleText, mode) {
  return buildVolumePrompt({
    mode,
    outlineText: outlineText('medium'),
    settingsText: '人物 - {"身份":"觉醒者"}',
    effectiveVolumes: 3,
    totalWords: 600000,
    allocatedSum: 0,
    existingVolumes: mode === 'single' ? [] : [{ name: '第一卷', outline: '主角暴露异常能力。' }],
    styleContext: styleText,
  })
}

function bodyPrompt(styleText, size) {
  const closure = outlineText(size)
  const pkg = createChapterExecutionPackage({
    projectId: 'p0',
    volume: { id: 'v1', name: '第一卷 星潮觉醒', outline: '主角暴露异常能力，队伍遭遇危机。', summary: '身份信息差升级。' },
    chapter: { id: 'c1', title: '第1章', plot: '护送队伍遭遇变异兽袭击。', summary: '主角第一次出手。', wordCount: 3500 },
    chapterIndex: 0,
    contextScope: { closure, closureBytes: closure.length, targetBytes: 90000, maxBytes: 120000, permanentCount: 1, unitCount: 2, undeclaredCount: 0, trimmed: [], warnings: [] },
    settings: ['人物 - {"身份":"觉醒者"}'],
    styleContext: styleText,
    pacingContext: '',
    memoryContext: '',
    prevChapterSummary: '',
  })
  return buildChapterExecutionPrompt(pkg, 3500)
}

function finalDraftPrompt(styleText, size) {
  return '请以 Word 文档格式整理以下大纲，清除错误标点并重排：\n\n' + outlineText(size)
    + (styleText ? '\n\n[终稿风格约束]\n' + styleText : '')
}

function samplePrompt(layer, styleText, size, variant) {
  if (layer === 'outline') return outlineSystemPrompt(styleText)
  if (layer === 'settings') return settingsPrompt(styleText)
  if (layer === 'volume') return volumePrompt(styleText, variant)
  if (layer === 'chapter') return chapterBatchPrompt(styleText)
  if (layer === 'body') return bodyPrompt(styleText, size)
  return finalDraftPrompt(styleText, size)
}

const report = []
for (const layer of ['outline', 'settings', 'volume', 'chapter', 'body', 'final-draft']) {
  const variants = layer === 'volume' ? ['single', 'continue', 'auto'] : outlineSizes
  for (const [index, variant] of variants.entries()) {
    const size = layer === 'outline' || layer === 'settings' || layer === 'chapter' ? 'medium' : variant
    const before = samplePrompt(layer, '', size, variant)
    const compilation = compileStyleContext(layer, taxingProfile)
    const after = samplePrompt(layer, compilation.text, size, variant)
    report.push({
      layer,
      sample: index + 1,
      variant: layer === 'volume' ? variant : size,
      beforeChars: before.length,
      afterChars: after.length,
      injectedChars: compilation.injectedChars,
      truncated: compilation.truncated,
      truncationReason: compilation.truncationReason,
      sections: compilation.sections,
      beforeEstimatedTokens: estimateTokens(before),
      afterEstimatedTokens: estimateTokens(after),
    })
  }
}

function estimateTokens(value) {
  return Math.ceil(value.length * 0.6)
}

const summary = Object.fromEntries(
  Object.entries(
    report.reduce((acc, item) => {
      acc[item.layer] = acc[item.layer] || { samples: 0, beforeMin: Infinity, beforeMax: 0, afterMax: 0, injectedChars: 0, truncated: false }
      const entry = acc[item.layer]
      entry.samples += 1
      entry.beforeMin = Math.min(entry.beforeMin, item.beforeChars)
      entry.beforeMax = Math.max(entry.beforeMax, item.beforeChars)
      entry.afterMax = Math.max(entry.afterMax, item.afterChars)
      entry.injectedChars = item.injectedChars
      entry.truncated = entry.truncated || item.truncated
      return acc
    }, {}),
  ).map(([layer, entry]) => [layer, { ...entry, beforeMin: Number(entry.beforeMin) }]),
)

const payload = {
  generatedAt: new Date().toISOString(),
  sampleSource: samplePath,
  sampleExists: fs.existsSync(samplePath),
  sampleChars: fs.existsSync(samplePath) ? fs.readFileSync(samplePath, 'utf8').length : null,
  contextBudgetGuard: 'token估算为字符*0.6，仅用于路由不变性粗检；正式路由仍以 contextBudget 服务为准。',
  summary,
  samples: report,
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2))
console.log(JSON.stringify(summary, null, 2))
console.log(`written: ${outputPath}`)
