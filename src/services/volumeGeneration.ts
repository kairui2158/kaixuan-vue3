export type VolumeGenerateMode = 'auto' | 'single' | 'continue'

export interface ExistingVolumeRef {
  name?: string
  outline?: string
  summary?: string
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
}

export function hasVolumeContent(volume: ExistingVolumeRef): boolean {
  return Boolean(String(volume?.outline || '').trim() || String(volume?.summary || '').trim())
}

function volumeRefText(vol: ExistingVolumeRef): string {
  return (vol.name || '未命名卷') + ' - ' + (vol.outline || vol.summary || '')
}

function promptHeader(input: VolumePromptInput): string {
  const remainingWords = Math.max(0, input.totalWords - input.allocatedSum)
  return (
    '[大纲]\n' + input.outlineText +
    '\n\n[设定]\n' + input.settingsText +
    (input.boundText ? '\n\n[绑定设定]\n' + input.boundText : '') +
    '\n\n[卷数]\n' + input.effectiveVolumes +
    '\n\n[全书总字数]\n' + input.totalWords + '字' +
    (input.mode === 'auto' ? '' : '\n\n[剩余待分配字数]\n' + remainingWords + '字')
  )
}

export function buildVolumePrompt(input: VolumePromptInput): string {
  const existingCount = input.existingVolumes.length
  const header = promptHeader(input)
  if (input.mode === 'single') {
    if (existingCount === 0) {
      return header + '\n\n当前还没有任何卷纲。请只生成第1卷的卷纲。输出JSON数组（正好1项），每项含name/outline/summary/allocatedWords字段，allocatedWords为该卷分配字数（整数）。'
    }
    const lastVol = input.existingVolumes[existingCount - 1]
    return header + '\n\n已生成' + existingCount + '卷，上一卷为：' + volumeRefText(lastVol) + '。请只生成第' + (existingCount + 1) + '卷的卷纲。输出JSON数组（正好1项），每项含name/outline/summary/allocatedWords字段，allocatedWords为该卷分配字数（整数）。'
  }
  if (input.mode === 'continue') {
    if (existingCount === 0) {
      return header + '\n\n当前还没有任何卷纲。请生成第1卷到第' + input.effectiveVolumes + '卷的卷纲。输出JSON数组，每项含name/outline/summary/allocatedWords字段，allocatedWords为该卷分配字数（整数），本次生成各卷的allocatedWords之和应约等于剩余待分配字数。'
    }
    const lastVol = input.existingVolumes[existingCount - 1]
    return header + '\n\n已生成' + existingCount + '卷，上一卷为：' + volumeRefText(lastVol) + '。请继续生成第' + (existingCount + 1) + '卷到第' + input.effectiveVolumes + '卷的卷纲。输出JSON数组，每项含name/outline/summary/allocatedWords字段，allocatedWords为该卷分配字数（整数），本次生成各卷的allocatedWords之和应约等于剩余待分配字数。'
  }
  return header + '\n\n请生成' + input.effectiveVolumes + '卷的卷纲。输出JSON数组，每项含name/outline/summary/allocatedWords字段，allocatedWords为该卷分配字数（整数），各卷allocatedWords之和应等于全书总字数。'
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
  if (mode === 'continue' && existingCount > 0) {
    const remaining = Math.max(0, effectiveVolumes - existingCount)
    return { volumes: volumes.slice(0, remaining), truncated: volumes.length > remaining }
  }
  return { volumes, truncated: false }
}
