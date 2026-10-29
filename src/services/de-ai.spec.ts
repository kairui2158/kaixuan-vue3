import { describe, expect, it } from 'vitest'
import {
  DEAI_CREATIVE_PROMPT,
  DEAI_METHODOLOGY_PROMPT,
  DEAI_POLISH_PROMPT,
  resolveDeaiPromptForChainStep
} from './de-ai'

describe('DEAI per-step prompts', () => {
  it('keeps the full methodology for S1/S3 and a positive creative prompt for S2', () => {
    expect(DEAI_METHODOLOGY_PROMPT).toContain('12. 禁止Chatbot痕迹和模糊填充')
    expect(DEAI_METHODOLOGY_PROMPT).toContain('【降AI创作约束 - 生成阶段执行】')
    expect(DEAI_METHODOLOGY_PROMPT).not.toContain('13. 叙事视角保持一致')
    expect(DEAI_CREATIVE_PROMPT).toContain('【降AI创作风格 - 创作执行阶段】')
    expect(DEAI_CREATIVE_PROMPT).not.toContain('密度阈值约束')
    expect(DEAI_CREATIVE_PROMPT).not.toContain('禁止Chatbot痕迹')
    expect(DEAI_CREATIVE_PROMPT).not.toContain('speculative gap-filling')
    expect(DEAI_CREATIVE_PROMPT.match(/^[0-9]+\. /gm)?.length).toBe(5)
    expect(DEAI_CREATIVE_PROMPT).toContain('只输出本步骤定稿产物。')
    expect(DEAI_CREATIVE_PROMPT).toContain('短句仅用于关键转折')
    expect(DEAI_CREATIVE_PROMPT).toContain('章节号密度参考上限35/千字')
    expect(DEAI_CREATIVE_PROMPT).toContain('过度纠错和过度碎片化本身也是AI信号')
  })

  it('keeps polish-side information-lossless merging as a legal language pass', () => {
    expect(DEAI_POLISH_PROMPT).toContain('信息无损的相邻短句合并、句号改逗号或分号')
    expect(DEAI_POLISH_PROMPT).toContain('属于合法语言打磨，不算结构变更')
    expect(DEAI_POLISH_PROMPT).toContain('只输出本步骤定稿产物。')
  })

  it('dispatches DEAI prompts by chain step without a second call site', () => {
    expect(resolveDeaiPromptForChainStep(3, 1)).toBe('')
    expect(resolveDeaiPromptForChainStep(4, 0)).toBe(DEAI_METHODOLOGY_PROMPT)
    expect(resolveDeaiPromptForChainStep(4, 1)).toBe(DEAI_CREATIVE_PROMPT)
    expect(resolveDeaiPromptForChainStep(4, 2)).toBe(DEAI_POLISH_PROMPT)
  })

  it('dispatches DEAI prompts by chain role for variable chain lengths', () => {
    expect(resolveDeaiPromptForChainStep(4, 0, 1)).toBe(DEAI_METHODOLOGY_PROMPT)
    expect(resolveDeaiPromptForChainStep(4, 2, 4)).toBe(DEAI_CREATIVE_PROMPT)
    expect(resolveDeaiPromptForChainStep(4, 3, 4)).toBe(DEAI_POLISH_PROMPT)
    expect(resolveDeaiPromptForChainStep(4, undefined, 3)).toBe(DEAI_METHODOLOGY_PROMPT)
  })
})
