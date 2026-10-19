import { buildVolumePlanIntegrity } from './volumePlanIntegrity'
export type VolumeGenerateMode = 'auto' | 'single' | 'continue'
export const VOLUME_OUTLINE_SCAFFOLD_HEADER = '[大纲结构地图（S2+默认精简视图）]'

export interface ExistingVolumeRef {
  name?: string
  outline?: string
  summary?: string
  allocatedWords?: unknown
  suggestedWords?: unknown
}

export interface VolumePromptInput {
  mode: VolumeGenerateMode
  outlineText: string
  settingsText: string
  boundText?: string
  effectiveVolumes: number
  totalWords: number
  allocatedSum: number
  existingVolumes: ExistingVolumeRef[]
  styleContext?: string
  outputProtocol?: 'direct-json' | 'folder-chain'
}

export function hasVolumeContent(volume: ExistingVolumeRef): boolean {
  return Boolean(String(volume?.outline || '').trim() || String(volume?.summary || '').trim())
}

function volumeRefText(vol: ExistingVolumeRef): string {
  const name = String(vol.name || '').trim() || '未命名卷'
  const summary = String(vol.summary || '').trim()
  if (summary) return name + ' - ' + summary
  const outline = String(vol.outline || '').replace(/\s+/g, ' ').trim()
  if (outline) return name + ' - ' + (outline.length > 240 ? outline.slice(0, 240) + '……' : outline)
  return name
}

export function buildVolumeOutlineScaffold(outlineText: string): string {
  const outline = String(outlineText || '').trim()
  if (!outline) return ''
  const headings = outline
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^(第[一二三四五六七八九十百千0-9]+[卷章节部]|序章|楔子|终章|尾声)/.test(line))
  const head = headings.slice(0, 300)
  const omitted = headings.length - head.length
  const body = head.length
    ? head.map((line) => `- ${line.slice(0, 160)}`).join('\n')
    : `- ${outline.slice(0, 160)}`
  return [
    VOLUME_OUTLINE_SCAFFOLD_HEADER,
    `原文长度：${outline.length}字；此视图仅保留结构标题，完整大纲由S1消费。`,
    omitted > 0 ? `结构标题省略：后${omitted}项。` : null,
    body,
  ].filter(Boolean).join('\n')
}

function promptHeader(input: VolumePromptInput): string {
  const plan = buildVolumePlanIntegrity({
    plannedVolumeCount: input.effectiveVolumes,
    totalWords: input.totalWords,
    existingVolumes: input.existingVolumes
  })
  return (
    '[大纲]\n' + input.outlineText +
    '\n\n[设定]\n' + input.settingsText +
    (input.boundText ? '\n\n[绑定设定]\n' + input.boundText : '') +
    (input.styleContext ? '\n\n[风格与节奏]\n' + input.styleContext : '') +
    '\n\n[卷数]\n' + input.effectiveVolumes +
    '\n\n[已生成卷数]\n' + plan.generatedVolumeCount +
    '\n\n[全书总字数]\n' + input.totalWords + '字' +
    (input.mode === 'auto' ? '' : '\n\n[剩余待分配字数]\n' + plan.remainingWords + '字') +
    (plan.conflicts.length > 0
      ? '\n\n[卷纲计划冲突]\n' + plan.conflicts.join('\n')
      : '')
  )
}

export function buildVolumePrompt(input: VolumePromptInput): string {
  const existingCount = input.existingVolumes.length
  const header = promptHeader(input)
  const isFolderChain = input.outputProtocol === 'folder-chain'
  const directJsonProtocol = '输出JSON数组（正好1项），每项含name/outline/summary/allocatedWords字段，allocatedWords为该卷分配字数（整数）'
  const folderChainProtocol = '输出协议由当前 SKILL 模板决定，应用侧仅提供任务边界与事实约束'
  if (input.mode === 'single') {
    if (existingCount === 0) {
      return header + '\n\n当前还没有任何卷纲。请只生成第1卷的卷纲。' + (isFolderChain ? folderChainProtocol : directJsonProtocol + '，不得生成其他卷。')
    }
    const lastVol = input.existingVolumes[existingCount - 1]
    return header + '\n\n已生成' + existingCount + '卷，上一卷锚点为：' + volumeRefText(lastVol) + '。请只生成第' + (existingCount + 1) + '卷的卷纲。' + (isFolderChain ? folderChainProtocol : directJsonProtocol + '。')
  }
  if (input.mode === 'continue') {
    if (existingCount === 0) {
      return header + '\n\n当前还没有任何卷纲。请只生成第1卷的卷纲。' + (isFolderChain ? folderChainProtocol : directJsonProtocol + '，不得生成其他卷。')
    }
    const lastVol = input.existingVolumes[existingCount - 1]
    return header + '\n\n已生成' + existingCount + '卷，上一卷锚点为：' + volumeRefText(lastVol) + '。请只生成第' + (existingCount + 1) + '卷的卷纲。' + (isFolderChain ? folderChainProtocol : directJsonProtocol + '，不得生成其他卷。')
  }
  return header + '\n\n请生成' + input.effectiveVolumes + '卷的卷纲。' + (isFolderChain
    ? folderChainProtocol
    : '输出JSON数组，每项含name/outline/summary/allocatedWords字段，allocatedWords为该卷分配字数（整数），各卷allocatedWords之和应等于全书总字数。')
}

export function clampGeneratedVolumes(
  mode: VolumeGenerateMode,
  volumes: any[],
  existingCount: number,
  effectiveVolumes: number
): { volumes: any[]; truncated: boolean } {
  if (!Array.isArray(volumes) || volumes.length === 0) return { volumes: [], truncated: false }
  if (mode === 'single') {
    return { volumes: volumes.slice(0, 1), truncated: volumes.length > 1 }
  }
  if (mode === 'continue') {
    const remaining = 1
    return { volumes: volumes.slice(0, remaining), truncated: volumes.length > remaining }
  }
  return { volumes, truncated: false }
}
