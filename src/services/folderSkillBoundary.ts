export type FolderSkillBoundaryMode =
  | 'chain'
  | 'compose-single'
  | 'compose-multi'
  | 'split-merge'
  | 'multi-step'
  | 'composite'

export interface FolderSkillBoundary {
  label: string
  executesScript: boolean
  usesSchema: boolean
  usesBudget: boolean
  perSkillAgent: boolean
  notes: string[]
}

const FULL_BOUNDARY: FolderSkillBoundary = {
  label: '',
  executesScript: true,
  usesSchema: true,
  usesBudget: true,
  perSkillAgent: true,
  notes: []
}

export function getFolderSkillBoundary(mode: FolderSkillBoundaryMode): FolderSkillBoundary {
  switch (mode) {
    case 'chain':
      return { ...FULL_BOUNDARY, label: '串行' }
    case 'compose-single':
      return { ...FULL_BOUNDARY, perSkillAgent: false, label: '并行（单个文件夹技能）' }
    case 'compose-multi':
      return {
        ...FULL_BOUNDARY,
        perSkillAgent: false,
        label: '并行（多个文件夹技能）',
        notes: [
          '多个文件夹技能合并时，仅第一个的 script/schema 会执行，其余按模板文本合并',
          '多个文件夹技能合并时，技能级智能体不会生效，将使用本层智能体'
        ]
      }
    case 'split-merge':
      return { ...FULL_BOUNDARY, label: '分段并行' }
    case 'multi-step':
      return { ...FULL_BOUNDARY, label: '多步重构' }
    case 'composite':
      return {
        ...FULL_BOUNDARY,
        perSkillAgent: false,
        label: '组合技能',
        notes: ['子技能会按顺序执行；应用内技能级智能体绑定不生效，但子技能 meta.agent 默认值会生效']
      }
  }
}

export function formatFolderSkillBoundary(mode: FolderSkillBoundaryMode): string {
  const boundary = getFolderSkillBoundary(mode)
  const capabilities = [
    boundary.executesScript ? '执行 script' : '不执行 script',
    boundary.usesSchema ? '启用 schema 校验' : '不启用 schema 校验',
    boundary.usesBudget ? '消耗 API 预算' : '不消耗 API 预算',
    boundary.perSkillAgent ? '支持技能级智能体' : '使用本层/全局智能体'
  ]
  return [`${boundary.label}：${capabilities.join('；')}`, ...boundary.notes].join('\n')
}
