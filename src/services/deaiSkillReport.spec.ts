import { describe, expect, it } from 'vitest'
import { buildDeaiSkillReportMarkdown, exportDeaiSkillReport, type DeaiSkillReportInput } from './deaiSkillReport'

const reportInput: DeaiSkillReportInput = {
  runId: 'run-1',
  chapterTitle: '第一章 风暴信标',
  generatedAt: 1770000000000,
  provider: 'provider-a',
  model: 'model-a',
  methodology: {
    ownership: 'skill',
    injectedItemCount: 0,
    injectedChars: 0,
    variants: ['methodology', 'creative', 'polish'],
  },
  diagnosis: {
    findingCount: 3,
    droppedFindingCount: 0,
    guidanceChars: 420,
    findings: [
      { id: 'deai-banned-vocab', type: '高频禁用词', positionPercent: 12 },
      { id: 'deai-style-drift', type: '风格漂移', positionPercent: 54 },
      { id: 'deai-short-sentence', type: '短句碎片', positionPercent: 78 },
    ],
  },
  finalDiagnosis: {
    findingCount: 1,
    droppedFindingCount: 0,
    guidanceChars: 160,
    findings: [
      { id: 'deai-style-drift', type: '风格漂移', positionPercent: 52 },
    ],
  },
  falsePositives: [
    'deai-short-sentence：S3 打磨职责内的短句节奏被诊断为命中',
  ],
}

describe('deaiSkillReport', () => {
  it('builds a bounded SKILL iteration report with before/after diff', () => {
    const markdown = buildDeaiSkillReportMarkdown(reportInput)

    expect(markdown).toContain('# 正文层降AI协同 SKILL 迭代报告')
    expect(markdown).toContain('runId: run-1')
    expect(markdown).toContain('provider/model: provider-a / model-a')
    expect(markdown).toContain('方法论：SKILL接管，0条/0字符')
    expect(markdown).toContain('S2诊断：3条')
    expect(markdown).toContain('终稿诊断：1条')
    expect(markdown).toContain('前后差分：-2条')
    expect(markdown).toContain('误伤候选')
    expect(markdown).toContain('deai-short-sentence')
    expect(markdown).not.toContain('自动修改')
    expect(markdown).not.toContain('规则改写')
  })

  it('renders explicit empty markers for empty diagnosis and feedback collections', () => {
    const emptyInput: DeaiSkillReportInput = {
      ...reportInput,
      methodology: { ...reportInput.methodology, variants: [] },
      diagnosis: {
        findingCount: 0,
        droppedFindingCount: 0,
        guidanceChars: 0,
        findings: [],
      },
      falsePositives: [],
    }
    const markdown = buildDeaiSkillReportMarkdown(emptyInput)

    expect(markdown).toContain('- 变体: 无')
    expect(markdown).toContain('- S2诊断：0条')
    expect(markdown).toContain('## S2 诊断\n\n- 无')
    expect(markdown).toContain('## 终稿诊断\n\n- deai-style-drift')
    expect(markdown).toContain('## 误伤候选\n\n- 无')
    expect(markdown).toContain('- 误伤候选需要 SKILL 作者反馈回传后登记；应用不代判误伤。')
  })

  it('exports through the existing dialog API without inventing a new IPC surface', async () => {
    const calls: Array<{ name: string, args: unknown[] }> = []
    const api = {
      dialogSaveFileAsync: async (defaultName?: string) => {
        calls.push({ name: 'dialogSaveFileAsync', args: [defaultName] })
        return 'D:/reports/report.md'
      },
      dialogWriteFile: async (filePath: string, content: string) => {
        calls.push({ name: 'dialogWriteFile', args: [filePath, content] })
        return true
      },
    }
    const result = await exportDeaiSkillReport(api, reportInput, {
      defaultName: 'deai-skill-report.md',
    })

    expect(result).toEqual({ ok: true, path: 'D:/reports/report.md' })
    expect(calls).toEqual([
      { name: 'dialogSaveFileAsync', args: ['deai-skill-report.md'] },
      { name: 'dialogWriteFile', args: ['D:/reports/report.md', expect.stringContaining('# 正文层降AI协同 SKILL 迭代报告')] },
    ])
  })

  it('reports failure instead of pretending a canceled export succeeded', async () => {
    const api = {
      dialogSaveFileAsync: async () => null,
      dialogWriteFile: async () => true,
    }
    const result = await exportDeaiSkillReport(api, reportInput, {})

    expect(result).toEqual({ ok: false, path: null, reason: 'canceled' })
  })
})
