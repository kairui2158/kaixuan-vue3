import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseStyleBenchmark } from './styleBenchmarkImport'

const benchmarkPath = 'D:/codex/拆文库/踏星/.novel/benchmarks/踏星/文风.md'

function standardSource(overrides: Record<string, string> = {}) {
  return `# 文风档案：样品
## 定位
- **核心气质**：冷硬、快节奏。
- **风格标签**：末世高武 + 星际升级。
- **一句话定位**：用动作推进世界。
##量化特征
统计来源：tools/style_stats.ps1，覆盖 100 个章节文件。
- 对话密度：8.20 段 / 千字符
- 句长分布：短句 30.0%，中句 30.0%，长句 40.0%
- 逗号：1,000
## 声口特征
- **主角说话方式**：短句、直接。
- **对话标签**：多用道、问。
- **潜台词密度**：中高。
## 描写侧重
- **五感**：视觉和听觉为主。
- **白描 vs 渲染**：动作白描为主。
- **心理外化**：动作替代情绪标签。
## 场景写法
### 战斗
动作链短，结果明确。
### 身份揭示
逐层推进，不一次性说破。
## 标志性句式模式
1. \`{环境细节}。\`
2. \`{主角观察}。{动作}。\`
## 借鉴边界
### 值得学
- 动作推进快。
### 需警惕
- 设定解释段不要过长。
## 日更参考
1. 每章至少推进一项。
2. 主角台词保持短而硬。
${Object.entries(overrides).map(([key, value]) => `## ${key}\n${value}`).join('\n')}`
}

describe('styleBenchmarkImport', () => {
  it('parses the real benchmark archive into a complete V2 draft', () => {
    const report = parseStyleBenchmark('文风.md', readFileSync(resolve(benchmarkPath), 'utf8'))
    expect(report.ok).toBe(true)
    expect(report.draft?.positioning.coreTemperament).toContain('冷硬')
    expect(report.draft?.sentencePatterns).toHaveLength(8)
    expect(report.draft?.sceneTemplates).toHaveLength(4)
    expect(report.draft?.prohibitions).toHaveLength(4)
    expect(report.draft?.dailyRules).toHaveLength(5)
    expect(report.draft?.quantitative.dialogueDensityPerKChars).toBe(10.61)
    expect(report.draft?.styleTags).toBe('末世高武, 星际升级, 宇宙争霸')
  })

  it('fails with actionable errors when a core section is missing', () => {
    const source = standardSource().replace(/## 声口特征[\s\S]*?(?=## 描写侧重)/, '')
    const report = parseStyleBenchmark('文风.md', source)
    expect(report.ok).toBe(false)
    expect(report.errors).toContain('缺少核心段落：声口特征')
    expect(report.draft).toBeNull()
  })

  it('reports unknown sections without importing them', () => {
    const report = parseStyleBenchmark('文风.md', standardSource({ '未登记段落': '- 不进入档案' }))
    expect(report.ok).toBe(true)
    expect(report.ignoredSections).toContain('未登记段落')
    expect(report.draft?.voice.protagonistSpeech).not.toContain('不进入档案')
  })

  it('keeps section order flexible and records count truncation', () => {
    const source = standardSource()
      .replace(/## 描写侧重[\s\S]*?(?=## 场景写法)/, '')
      .replace(/## 标志性句式模式[\s\S]*?(?=## 借鉴边界)/, `## 标志性句式模式\n${Array.from({ length: 15 }, (_, i) => `${i + 1}. 句式${i}`).join('\n')}\n\n`)
    const report = parseStyleBenchmark('文风.md', source)
    expect(report.ok).toBe(true)
    expect(report.draft?.sentencePatterns).toHaveLength(12)
    expect(report.truncations).toContain('pattern超过12条，仅保留前12条')
  })
})
