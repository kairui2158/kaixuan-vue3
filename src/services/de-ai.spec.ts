import { describe, expect, it } from 'vitest'
import {
  DEAI_CREATIVE_PROMPT,
  DEAI_METHODOLOGY_PROMPT,
  resolveDeaiPromptForChainStep
} from './de-ai'

describe('DEAI per-step prompts', () => {
  it('keeps the full methodology for S1/S3 and a positive creative prompt for S2', () => {
    expect(DEAI_METHODOLOGY_PROMPT).toContain('17. 禁止speculative gap-filling')
    expect(DEAI_METHODOLOGY_PROMPT).toContain('【降AI创作约束 - 生成阶段执行】')
    expect(DEAI_CREATIVE_PROMPT).toContain('【降AI创作风格 - 创作执行阶段】')
    expect(DEAI_CREATIVE_PROMPT).not.toContain('密度阈值约束')
    expect(DEAI_CREATIVE_PROMPT).not.toContain('禁止Chatbot痕迹')
    expect(DEAI_CREATIVE_PROMPT).not.toContain('speculative gap-filling')
    expect(DEAI_CREATIVE_PROMPT).toContain('只输出本步骤定稿产物。')
  })

  it('dispatches DEAI prompts by chain step without a second call site', () => {
    expect(resolveDeaiPromptForChainStep(3, 1)).toBe('')
    expect(resolveDeaiPromptForChainStep(4, 0)).toBe(DEAI_METHODOLOGY_PROMPT)
    expect(resolveDeaiPromptForChainStep(4, 1)).toBe(DEAI_CREATIVE_PROMPT)
    expect(resolveDeaiPromptForChainStep(4, 2)).toBe(DEAI_METHODOLOGY_PROMPT)
  })
})
