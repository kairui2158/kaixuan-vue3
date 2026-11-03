export interface DeaiSkillReportFinding {
  id: string
  type: string
  positionPercent?: number
}

export interface DeaiSkillReportInput {
  runId: string
  chapterTitle: string
  generatedAt: number
  provider: string
  model: string
  methodology: {
    ownership: 'app' | 'skill' | 'off'
    injectedItemCount: number
    injectedChars: number
    variants: string[]
  }
  diagnosis: {
    findingCount: number
    droppedFindingCount: number
    guidanceChars: number
    findings: DeaiSkillReportFinding[]
  }
  finalDiagnosis: {
    findingCount: number
    droppedFindingCount: number
    guidanceChars: number
    findings: DeaiSkillReportFinding[]
  }
  falsePositives: string[]
}

export interface DeaiSkillReportDialogApi {
  dialogSaveFileAsync: (defaultName?: string) => Promise<string | null>
  dialogWriteFile: (filePath: string, content: string) => Promise<boolean>
}

export type DeaiSkillReportExportResult =
  | { ok: true, path: string }
  | { ok: false, path: null, reason: 'canceled' | 'write-failed' }

function formatDateTime(ts: number): string {
  const date = new Date(ts)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function buildDeaiSkillReportMarkdown(input: DeaiSkillReportInput): string {
  const ownershipLabel = input.methodology.ownership === 'skill'
    ? 'SKILL接管'
    : input.methodology.ownership === 'app'
    ? '应用注入'
    : '关闭'
  const diffCount = input.finalDiagnosis.findingCount - input.diagnosis.findingCount

  return [
    '# 正文层降AI协同 SKILL 迭代报告',
    '',
    `runId: ${input.runId}`,
    `章节: ${input.chapterTitle}`,
    `生成时间: ${formatDateTime(input.generatedAt)}`,
    `provider/model: ${input.provider} / ${input.model}`,
    '',
    '## 概览',
    '',
    `- 方法论：${ownershipLabel}，${input.methodology.injectedItemCount}条/${input.methodology.injectedChars}字符`,
    `- 变体: ${input.methodology.variants.join(', ') || '无'}`,
    `- S2诊断：${input.diagnosis.findingCount}条`,
    `- 终稿诊断：${input.finalDiagnosis.findingCount}条`,
    `- 前后差分：${diffCount > 0 ? '+' : ''}${diffCount}条`,
    '',
    '## S2 诊断',
    '',
    ...(input.diagnosis.findings.length ? input.diagnosis.findings.map(finding =>
      `- ${finding.id} / ${finding.type}${finding.positionPercent !== undefined ? ` / ${finding.positionPercent}%` : ''}`) : ['- 无']),
    ...(input.diagnosis.droppedFindingCount > 0 ? [`- 因预算省略：${input.diagnosis.droppedFindingCount}条`] : []),
    '',
    '## 终稿诊断',
    '',
    ...(input.finalDiagnosis.findings.length ? input.finalDiagnosis.findings.map(finding =>
      `- ${finding.id} / ${finding.type}${finding.positionPercent !== undefined ? ` / ${finding.positionPercent}%` : ''}`) : ['- 无']),
    '',
    '## 误伤候选',
    '',
    ...(input.falsePositives.length ? input.falsePositives.map(item => `- ${item}`) : ['- 无']),
    '',
    '## 边界声明',
    '',
    '- 本报告只供 folder SKILL 作者迭代模板使用。',
    '- 应用不自动调整 SKILL 规则，不改写正文，不影响终态。',
    '- 误伤候选需要 SKILL 作者反馈回传后登记；应用不代判误伤。',
    '',
  ].join('\n')
}

export async function exportDeaiSkillReport(
  api: DeaiSkillReportDialogApi,
  input: DeaiSkillReportInput,
  options: { defaultName?: string } = {},
): Promise<DeaiSkillReportExportResult> {
  const targetPath = await api.dialogSaveFileAsync(options.defaultName || 'deai-skill-report.md')
  if (!targetPath) return { ok: false, path: null, reason: 'canceled' }
  const written = await api.dialogWriteFile(targetPath, buildDeaiSkillReportMarkdown(input))
  if (!written) return { ok: false, path: null, reason: 'write-failed' }
  return { ok: true, path: targetPath }
}
